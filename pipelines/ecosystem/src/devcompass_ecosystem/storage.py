from .models import RunSummary, Skill


class EcosystemRepository:
    def __init__(self, connection):
        self.connection = connection

    def list_active_skills(self, limit=None):
        query = """
            SELECT skill_id, skill_code, skill_name
            FROM skill
            WHERE is_active = TRUE
            ORDER BY skill_id
        """
        params = ()
        if limit is not None:
            query += " LIMIT %s"
            params = (limit,)
        rows = self.connection.execute(query, params).fetchall()
        return [Skill(*row) for row in rows]

    def start_run(self, run_id, as_of_date, window_days, target_skills):
        with self.connection.transaction():
            self.connection.execute(
                """
                INSERT INTO ecosystem_run (
                    run_id, as_of_date, window_days, target_skills
                ) VALUES (%s, %s, %s, %s)
                ON CONFLICT (run_id) DO UPDATE SET
                    as_of_date = EXCLUDED.as_of_date,
                    window_days = EXCLUDED.window_days,
                    status = 'running',
                    finished_at = NULL,
                    target_skills = EXCLUDED.target_skills,
                    success_skills = 0,
                    failed_skills = 0
                WHERE ecosystem_run.status <> 'success'
                """,
                (run_id, as_of_date, window_days, target_skills),
            )

    def completed_sources(self, run_id):
        rows = self.connection.execute(
            """
            SELECT
                s.skill_id,
                COALESCE(g.status = 'success', FALSE) AS github_done,
                COALESCE(so.status = 'success', FALSE) AS stackoverflow_done
            FROM skill s
            LEFT JOIN github_skill_counts g
              ON g.skill_id = s.skill_id AND g.run_id = %s
            LEFT JOIN stackoverflow_skill_counts so
              ON so.skill_id = s.skill_id AND so.run_id = %s
            WHERE s.is_active = TRUE
            """,
            (run_id, run_id),
        ).fetchall()
        return {
            row[0]: {"github": row[1], "stackoverflow": row[2]}
            for row in rows
        }

    def write_github_success(self, run_id, skill, counts, from_date, to_date):
        with self.connection.transaction():
            self.connection.execute(
                """
                INSERT INTO github_skill_counts (
                    run_id, skill_id, github_repository_count,
                    github_issue_count_180d, github_pr_count_180d,
                    repository_query, activity_query, from_date, to_date,
                    status, error_message, collected_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    'success', NULL, NOW()
                )
                ON CONFLICT (run_id, skill_id) DO UPDATE SET
                    github_repository_count = EXCLUDED.github_repository_count,
                    github_issue_count_180d = EXCLUDED.github_issue_count_180d,
                    github_pr_count_180d = EXCLUDED.github_pr_count_180d,
                    repository_query = EXCLUDED.repository_query,
                    activity_query = EXCLUDED.activity_query,
                    from_date = EXCLUDED.from_date,
                    to_date = EXCLUDED.to_date,
                    status = 'success',
                    error_message = NULL,
                    collected_at = NOW()
                """,
                (
                    run_id, skill.skill_id, counts.repository_count,
                    counts.issue_count, counts.pull_request_count,
                    counts.repository_query, counts.activity_query,
                    from_date, to_date,
                ),
            )

    def write_stackoverflow_success(
        self, run_id, skill, counts, from_date, to_date
    ):
        with self.connection.transaction():
            self.connection.execute(
                """
                INSERT INTO stackoverflow_skill_counts (
                    run_id, skill_id, stackoverflow_tag, tag_source,
                    stackoverflow_question_count_180d, from_date, to_date,
                    status, error_message, collected_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, 'success', NULL, NOW()
                )
                ON CONFLICT (run_id, skill_id) DO UPDATE SET
                    stackoverflow_tag = EXCLUDED.stackoverflow_tag,
                    tag_source = EXCLUDED.tag_source,
                    stackoverflow_question_count_180d =
                        EXCLUDED.stackoverflow_question_count_180d,
                    from_date = EXCLUDED.from_date,
                    to_date = EXCLUDED.to_date,
                    status = 'success',
                    error_message = NULL,
                    collected_at = NOW()
                """,
                (
                    run_id, skill.skill_id, counts.tag, counts.tag_source,
                    counts.question_count, from_date, to_date,
                ),
            )

    def write_failure(self, source, run_id, skill, error_message, from_date, to_date):
        table = {
            "github": "github_skill_counts",
            "stackoverflow": "stackoverflow_skill_counts",
        }.get(source)
        if table is None:
            raise ValueError("Unknown ecosystem source: {}".format(source))
        with self.connection.transaction():
            self.connection.execute(
                """
                INSERT INTO {table} (
                    run_id, skill_id, from_date, to_date,
                    status, error_message, collected_at
                ) VALUES (%s, %s, %s, %s, 'failed', %s, NOW())
                ON CONFLICT (run_id, skill_id) DO UPDATE SET
                    from_date = EXCLUDED.from_date,
                    to_date = EXCLUDED.to_date,
                    status = 'failed',
                    error_message = EXCLUDED.error_message,
                    collected_at = NOW()
                WHERE {table}.status <> 'success'
                """.format(table=table),
                (run_id, skill.skill_id, from_date, to_date, error_message[:4000]),
            )

    def finalize(self, run_id, as_of_date):
        with self.connection.transaction():
            row = self.connection.execute(
                """
                SELECT
                    r.target_skills,
                    COUNT(*) FILTER (
                        WHERE g.status = 'success' AND so.status = 'success'
                    )::INTEGER
                FROM ecosystem_run r
                LEFT JOIN github_skill_counts g ON g.run_id = r.run_id
                LEFT JOIN stackoverflow_skill_counts so
                  ON so.run_id = r.run_id AND so.skill_id = g.skill_id
                WHERE r.run_id = %s
                GROUP BY r.target_skills
                """,
                (run_id,),
            ).fetchone()
            if row is None:
                raise ValueError("Unknown ecosystem run: {}".format(run_id))
            target_skills, success_skills = row
            failed_skills = target_skills - success_skills
            status = (
                "success" if failed_skills == 0
                else "partial_success" if success_skills > 0
                else "failed"
            )
            self.connection.execute(
                """
                UPDATE ecosystem_run
                SET finished_at = NOW(), status = %s,
                    success_skills = %s, failed_skills = %s
                WHERE run_id = %s
                """,
                (status, success_skills, failed_skills, run_id),
            )
        return RunSummary(
            run_id=run_id,
            as_of_date=as_of_date,
            target_skills=target_skills,
            successful_skills=success_skills,
            failed_skills=failed_skills,
            status=status,
        )
