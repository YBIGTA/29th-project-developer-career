from datetime import datetime, timezone
from typing import Iterable, Optional

from .models import Board, NormalizedJob, WriteSummary


CURRENT_FIELDS = """
    title = %(title)s,
    description = %(description)s,
    location = %(location)s,
    department = %(department)s,
    team = %(team)s,
    employment_type = %(employment_type)s,
    published_at = %(published_at)s,
    source_updated_at = %(source_updated_at)s,
    source_url = %(source_url)s,
    apply_url = %(apply_url)s,
    last_seen_at = %(seen_at)s,
    closed_at = NULL,
    is_active = TRUE,
    content_hash = %(content_hash)s
"""


def _job_params(job, board_id, seen_at):
    return {
        "board_id": board_id,
        "source_job_id": job.source_job_id,
        "title": job.title,
        "description": job.description,
        "location": job.location,
        "department": job.department,
        "team": job.team,
        "employment_type": job.employment_type,
        "published_at": job.published_at,
        "source_updated_at": job.source_updated_at,
        "source_url": job.source_url,
        "apply_url": job.apply_url,
        "content_hash": job.content_hash,
        "seen_at": seen_at,
    }


class BoardRepository:
    def __init__(self, connection):
        self.connection = connection

    def list_enabled(self):
        rows = self.connection.execute(
            """
            SELECT board_id, company_name, ats_source, board_slug
            FROM ats_board
            WHERE is_enabled = TRUE
            ORDER BY board_id
            """
        ).fetchall()
        return [Board(*row) for row in rows]


class JobPostingRepository:
    def __init__(self, connection):
        self.connection = connection

    def write_success(
        self,
        run_id: str,
        board: Board,
        jobs: Iterable[NormalizedJob],
        http_status: int,
        elapsed_sec: float,
        collected_at: Optional[datetime] = None,
    ) -> WriteSummary:
        seen_at = collected_at or datetime.now(timezone.utc)
        materialized = list(jobs)
        jobs_by_id = {job.source_job_id: job for job in materialized}
        if len(jobs_by_id) != len(materialized):
            raise ValueError("Collector returned duplicate source_job_id values")

        materialized = list(jobs_by_id.values())
        source_ids = set(jobs_by_id)
        new = changed = unchanged = 0

        with self.connection.transaction():
            with self.connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT job_id, source_job_id, content_hash, is_active
                    FROM job_posting
                    WHERE board_id = %s
                    FOR UPDATE
                    """,
                    (board.board_id,),
                )
                existing = {
                    row[1]: {
                        "job_id": row[0],
                        "content_hash": row[2],
                        "is_active": row[3],
                    }
                    for row in cursor.fetchall()
                }

                for job in materialized:
                    current = existing.get(job.source_job_id)
                    params = _job_params(job, board.board_id, seen_at)
                    if current is None:
                        job_id = self._insert_current(cursor, params)
                        self._insert_history(cursor, job_id, params)
                        new += 1
                    elif current["content_hash"] == job.content_hash and current["is_active"]:
                        cursor.execute(
                            """
                            UPDATE job_posting
                            SET last_seen_at = %(seen_at)s,
                                published_at = %(published_at)s,
                                source_updated_at = %(source_updated_at)s,
                                source_url = %(source_url)s,
                                apply_url = %(apply_url)s
                            WHERE job_id = %(job_id)s
                            """,
                            dict(params, job_id=current["job_id"]),
                        )
                        unchanged += 1
                    else:
                        cursor.execute(
                            """
                            UPDATE job_posting_history
                            SET valid_to = %(seen_at)s
                            WHERE job_id = %(job_id)s AND valid_to IS NULL
                            """,
                            {"job_id": current["job_id"], "seen_at": seen_at},
                        )
                        cursor.execute(
                            "UPDATE job_posting SET {} WHERE job_id = %(job_id)s".format(
                                CURRENT_FIELDS
                            ),
                            dict(params, job_id=current["job_id"]),
                        )
                        self._insert_history(cursor, current["job_id"], params)
                        changed += 1

                closed_ids = [
                    row["job_id"]
                    for source_id, row in existing.items()
                    if row["is_active"] and source_id not in source_ids
                ]
                for job_id in closed_ids:
                    cursor.execute(
                        """
                        UPDATE job_posting
                        SET is_active = FALSE, closed_at = %s
                        WHERE job_id = %s
                        """,
                        (seen_at, job_id),
                    )
                    cursor.execute(
                        """
                        UPDATE job_posting_history
                        SET valid_to = %s
                        WHERE job_id = %s AND valid_to IS NULL
                        """,
                        (seen_at, job_id),
                    )

                self._upsert_board_status(
                    cursor,
                    run_id=run_id,
                    board_id=board.board_id,
                    status="success",
                    http_status=http_status,
                    job_count=len(materialized),
                    elapsed_sec=elapsed_sec,
                    error_message=None,
                    collected_at=seen_at,
                )

        return WriteSummary(
            new=new,
            changed=changed,
            unchanged=unchanged,
            closed=len(closed_ids),
        )

    def write_failure(
        self,
        run_id: str,
        board: Board,
        error_message: str,
        http_status: Optional[int] = None,
        elapsed_sec: Optional[float] = None,
        collected_at: Optional[datetime] = None,
    ) -> None:
        # This path deliberately never reads or updates job_posting.
        seen_at = collected_at or datetime.now(timezone.utc)
        with self.connection.transaction():
            with self.connection.cursor() as cursor:
                self._upsert_board_status(
                    cursor,
                    run_id=run_id,
                    board_id=board.board_id,
                    status="failed",
                    http_status=http_status,
                    job_count=None,
                    elapsed_sec=elapsed_sec,
                    error_message=error_message[:4000],
                    collected_at=seen_at,
                )

    @staticmethod
    def _insert_current(cursor, params):
        cursor.execute(
            """
            INSERT INTO job_posting (
                board_id, source_job_id, title, description, location,
                department, team, employment_type, published_at,
                source_updated_at, source_url, apply_url, first_seen_at,
                last_seen_at, content_hash
            ) VALUES (
                %(board_id)s, %(source_job_id)s, %(title)s, %(description)s,
                %(location)s, %(department)s, %(team)s, %(employment_type)s,
                %(published_at)s, %(source_updated_at)s, %(source_url)s,
                %(apply_url)s, %(seen_at)s, %(seen_at)s, %(content_hash)s
            )
            RETURNING job_id
            """,
            params,
        )
        return cursor.fetchone()[0]

    @staticmethod
    def _insert_history(cursor, job_id, params):
        cursor.execute(
            """
            INSERT INTO job_posting_history (
                job_id, content_hash, title, description, location,
                department, team, employment_type, valid_from, detected_at
            ) VALUES (
                %(job_id)s, %(content_hash)s, %(title)s, %(description)s,
                %(location)s, %(department)s, %(team)s, %(employment_type)s,
                %(seen_at)s, %(seen_at)s
            )
            """,
            dict(params, job_id=job_id),
        )

    @staticmethod
    def _upsert_board_status(
        cursor,
        run_id,
        board_id,
        status,
        http_status,
        job_count,
        elapsed_sec,
        error_message,
        collected_at,
    ):
        cursor.execute(
            """
            INSERT INTO collection_board_status (
                run_id, board_id, status, http_status, job_count,
                elapsed_sec, error_message, collected_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (run_id, board_id) DO UPDATE SET
                status = EXCLUDED.status,
                http_status = EXCLUDED.http_status,
                job_count = EXCLUDED.job_count,
                elapsed_sec = EXCLUDED.elapsed_sec,
                error_message = EXCLUDED.error_message,
                collected_at = EXCLUDED.collected_at
            """,
            (
                run_id,
                board_id,
                status,
                http_status,
                job_count,
                elapsed_sec,
                error_message,
                collected_at,
            ),
        )


class CollectionRunRepository:
    def __init__(self, connection):
        self.connection = connection

    def start(self, run_id, target_boards):
        with self.connection.transaction():
            self.connection.execute(
                """
                INSERT INTO collection_run (run_id, target_boards)
                VALUES (%s, %s)
                ON CONFLICT (run_id) DO NOTHING
                """,
                (run_id, target_boards),
            )

    def record_missing_failures(self, run_id, failures):
        if not failures:
            return
        with self.connection.transaction():
            with self.connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO collection_board_status (
                        run_id, board_id, status, error_message
                    )
                    VALUES (%(run_id)s, %(board_id)s, 'failed', %(error_message)s)
                    ON CONFLICT (run_id, board_id) DO NOTHING
                    """,
                    [
                        {
                            "run_id": run_id,
                            "board_id": failure["board_id"],
                            "error_message": failure["error_message"][:4000],
                        }
                        for failure in failures
                    ],
                )

    def finalize(self, run_id, finished_at=None):
        completed_at = finished_at or datetime.now(timezone.utc)
        with self.connection.transaction():
            row = self.connection.execute(
                """
                SELECT
                    r.target_boards,
                    COUNT(s.board_id) FILTER (WHERE s.status = 'success'),
                    COUNT(s.board_id) FILTER (WHERE s.status = 'failed'),
                    COALESCE(SUM(s.job_count) FILTER (WHERE s.status = 'success'), 0)
                FROM collection_run r
                LEFT JOIN collection_board_status s ON s.run_id = r.run_id
                WHERE r.run_id = %s
                GROUP BY r.target_boards
                """,
                (run_id,),
            ).fetchone()
            if row is None:
                raise ValueError("Unknown collection run: {}".format(run_id))
            target_boards, success_boards, failed_boards, total_jobs = row
            status = (
                "success"
                if success_boards == target_boards and failed_boards == 0
                else "failed"
                if success_boards == 0
                else "partial_success"
            )
            self.connection.execute(
                """
                UPDATE collection_run
                SET finished_at = %s, status = %s, success_boards = %s,
                    failed_boards = %s, total_jobs = %s
                WHERE run_id = %s
                """,
                (
                    completed_at,
                    status,
                    success_boards,
                    failed_boards,
                    total_jobs,
                    run_id,
                ),
            )


class EnrichmentRepository:
    def __init__(self, connection):
        self.connection = connection

    def list_enrichment_target_history_ids(
        self,
        role_model_version,
        skill_extractor_version,
    ):
        rows = self.connection.execute(
            """
            SELECT h.history_id
            FROM job_posting_history h
            WHERE NOT EXISTS (
                SELECT 1
                FROM job_enrichment_result e
                WHERE e.history_id = h.history_id
                  AND e.role_model_version = %s
                  AND e.skill_extractor_version = %s
                  AND e.role_status IN ('matched', 'unmatched')
                  AND e.skill_status = 'success'
                  AND e.processing_status = 'success'
            )
            ORDER BY h.history_id
            """,
            (role_model_version, skill_extractor_version),
        ).fetchall()
        return [row[0] for row in rows]

    def prepare_enrichment_batch(
        self,
        history_ids,
        role_model_version,
        skill_extractor_version,
    ):
        if not history_ids:
            return []
        history_ids = list(history_ids)
        with self.connection.transaction():
            # Preserve completed role work from the role-only rollout.
            self.connection.execute(
                """
                UPDATE job_enrichment_result existing
                SET skill_extractor_version = %s
                WHERE existing.history_id = ANY(%s::BIGINT[])
                  AND existing.role_model_version = %s
                  AND existing.skill_extractor_version IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM job_enrichment_result exact
                      WHERE exact.history_id = existing.history_id
                        AND exact.role_model_version = %s
                        AND exact.skill_extractor_version = %s
                  )
                """,
                (
                    skill_extractor_version,
                    history_ids,
                    role_model_version,
                    role_model_version,
                    skill_extractor_version,
                ),
            )
            self.connection.execute(
                """
                INSERT INTO job_enrichment_result (
                    history_id,
                    role_model_version,
                    skill_extractor_version
                )
                SELECT history_id, %s, %s
                FROM UNNEST(%s::BIGINT[]) AS input(history_id)
                ON CONFLICT ON CONSTRAINT uq_job_enrichment_result_versions
                DO NOTHING
                """,
                (role_model_version, skill_extractor_version, history_ids),
            )
            self.connection.execute(
                """
                UPDATE job_enrichment_result
                SET job_role_id = CASE
                        WHEN role_status = 'failed' THEN NULL
                        ELSE job_role_id
                    END,
                    role_status = CASE
                        WHEN role_status = 'failed' THEN 'pending'
                        ELSE role_status
                    END,
                    role_score = CASE
                        WHEN role_status = 'failed' THEN NULL
                        ELSE role_score
                    END,
                    role_processed_at = CASE
                        WHEN role_status = 'failed' THEN NULL
                        ELSE role_processed_at
                    END,
                    role_error_message = CASE
                        WHEN role_status = 'failed' THEN NULL
                        ELSE role_error_message
                    END,
                    skill_status = CASE
                        WHEN skill_status = 'failed' THEN 'pending'
                        ELSE skill_status
                    END,
                    skill_processed_at = CASE
                        WHEN skill_status = 'failed' THEN NULL
                        ELSE skill_processed_at
                    END,
                    skill_error_message = CASE
                        WHEN skill_status = 'failed' THEN NULL
                        ELSE skill_error_message
                    END,
                    processing_status = 'pending',
                    processed_at = NULL
                WHERE history_id = ANY(%s::BIGINT[])
                  AND role_model_version = %s
                  AND skill_extractor_version = %s
                """,
                (history_ids, role_model_version, skill_extractor_version),
            )
            rows = self.connection.execute(
                """
                SELECT enrichment_id, history_id
                FROM job_enrichment_result
                WHERE history_id = ANY(%s::BIGINT[])
                  AND role_model_version = %s
                  AND skill_extractor_version = %s
                ORDER BY enrichment_id
                """,
                (history_ids, role_model_version, skill_extractor_version),
            ).fetchall()
        return [
            {"enrichment_id": row[0], "history_id": row[1]}
            for row in rows
        ]

    def get_pending_role_inputs(self, enrichment_ids):
        if not enrichment_ids:
            return []
        rows = self.connection.execute(
            """
            SELECT e.enrichment_id, e.history_id, h.title
            FROM job_enrichment_result e
            JOIN job_posting_history h USING (history_id)
            WHERE e.enrichment_id = ANY(%s::BIGINT[])
              AND e.role_status = 'pending'
            ORDER BY e.enrichment_id
            """,
            (list(enrichment_ids),),
        ).fetchall()
        return [
            {
                "enrichment_id": row[0],
                "history_id": row[1],
                "title": row[2],
            }
            for row in rows
        ]

    def get_pending_skill_inputs(self, enrichment_ids):
        if not enrichment_ids:
            return []
        rows = self.connection.execute(
            """
            SELECT e.enrichment_id, e.history_id, h.description, b.company_name
            FROM job_enrichment_result e
            JOIN job_posting_history h USING (history_id)
            JOIN job_posting p USING (job_id)
            JOIN ats_board b USING (board_id)
            WHERE e.enrichment_id = ANY(%s::BIGINT[])
              AND e.skill_status = 'pending'
            ORDER BY e.enrichment_id
            """,
            (list(enrichment_ids),),
        ).fetchall()
        return [
            {
                "enrichment_id": row[0],
                "history_id": row[1],
                "description": row[2],
                "company_name": row[3],
            }
            for row in rows
        ]

    def list_active_skill_aliases(self):
        rows = self.connection.execute(
            """
            SELECT s.skill_id, s.skill_name, a.alias_text, a.match_policy
            FROM skill_alias a
            JOIN skill s USING (skill_id)
            WHERE a.is_active = TRUE
              AND s.is_active = TRUE
            ORDER BY LENGTH(a.alias_text) DESC, a.alias_text
            """
        ).fetchall()
        return [
            {
                "skill_id": row[0],
                "skill_name": row[1],
                "alias_text": row[2],
                "match_policy": row[3],
            }
            for row in rows
        ]

    def save_role_predictions(self, predictions):
        if not predictions:
            return 0
        with self.connection.transaction():
            role_rows = self.connection.execute(
                """
                SELECT job_role_id, role_name
                FROM job_role
                WHERE is_active = TRUE
                """
            ).fetchall()
            role_ids = {role_name: role_id for role_id, role_name in role_rows}
            unknown = sorted(
                {row["role_name"] for row in predictions} - set(role_ids)
            )
            if unknown:
                raise ValueError(
                    "Model returned roles missing from job_role: {}".format(unknown)
                )
            with self.connection.cursor() as cursor:
                cursor.executemany(
                    """
                    UPDATE job_enrichment_result
                    SET job_role_id = %(job_role_id)s,
                        role_status = 'matched',
                        role_score = %(role_score)s,
                        role_processed_at = NOW(),
                        role_error_message = NULL
                    WHERE enrichment_id = %(enrichment_id)s
                      AND role_status = 'pending'
                    """,
                    [
                        {
                            "enrichment_id": row["enrichment_id"],
                            "job_role_id": role_ids[row["role_name"]],
                            "role_score": row["role_score"],
                        }
                        for row in predictions
                    ],
                )
        return len(predictions)

    def fail_role_batch(self, enrichment_ids, error_message):
        if not enrichment_ids:
            return
        with self.connection.transaction():
            self.connection.execute(
                """
                UPDATE job_enrichment_result
                SET job_role_id = NULL,
                    role_status = 'failed',
                    role_score = NULL,
                    role_processed_at = NOW(),
                    role_error_message = %s,
                    processing_status = 'failed'
                WHERE enrichment_id = ANY(%s::BIGINT[])
                  AND role_status = 'pending'
                """,
                (error_message[:4000], list(enrichment_ids)),
            )

    def save_skill_predictions(self, predictions):
        if not predictions:
            return 0
        enrichment_ids = [row["enrichment_id"] for row in predictions]
        skill_rows = [
            {
                "enrichment_id": row["enrichment_id"],
                "skill_id": match["skill_id"],
                "matched_text": match["matched_text"],
                "match_type": match["match_type"],
            }
            for row in predictions
            for match in row["matches"]
        ]
        with self.connection.transaction():
            self.connection.execute(
                """
                DELETE FROM job_skill
                WHERE enrichment_id = ANY(%s::BIGINT[])
                """,
                (enrichment_ids,),
            )
            if skill_rows:
                with self.connection.cursor() as cursor:
                    cursor.executemany(
                        """
                        INSERT INTO job_skill (
                            enrichment_id, skill_id, matched_text, match_type
                        )
                        VALUES (
                            %(enrichment_id)s,
                            %(skill_id)s,
                            %(matched_text)s,
                            %(match_type)s
                        )
                        ON CONFLICT (enrichment_id, skill_id) DO UPDATE SET
                            matched_text = EXCLUDED.matched_text,
                            match_type = EXCLUDED.match_type
                        """,
                        skill_rows,
                    )
            self.connection.execute(
                """
                UPDATE job_enrichment_result
                SET skill_status = 'success',
                    skill_processed_at = NOW(),
                    skill_error_message = NULL
                WHERE enrichment_id = ANY(%s::BIGINT[])
                  AND skill_status = 'pending'
                """,
                (enrichment_ids,),
            )
        return len(predictions)

    def fail_skill_batch(self, enrichment_ids, error_message):
        if not enrichment_ids:
            return
        with self.connection.transaction():
            self.connection.execute(
                """
                UPDATE job_enrichment_result
                SET skill_status = 'failed',
                    skill_processed_at = NOW(),
                    skill_error_message = %s,
                    processing_status = 'failed'
                WHERE enrichment_id = ANY(%s::BIGINT[])
                  AND skill_status = 'pending'
                """,
                (error_message[:4000], list(enrichment_ids)),
            )

    def finalize_enrichment_batch(self, enrichment_ids):
        if not enrichment_ids:
            return 0
        with self.connection.transaction():
            cursor = self.connection.execute(
                """
                UPDATE job_enrichment_result
                SET processing_status = CASE
                        WHEN role_status IN ('matched', 'unmatched')
                             AND skill_status = 'success'
                            THEN 'success'
                        WHEN role_status = 'failed' AND skill_status = 'failed'
                            THEN 'failed'
                        WHEN role_status = 'failed' OR skill_status = 'failed'
                            THEN 'partial_success'
                        ELSE 'pending'
                    END,
                    processed_at = CASE
                        WHEN role_status <> 'pending' AND skill_status <> 'pending'
                            THEN NOW()
                        ELSE NULL
                    END
                WHERE enrichment_id = ANY(%s::BIGINT[])
                """,
                (list(enrichment_ids),),
            )
        return cursor.rowcount
