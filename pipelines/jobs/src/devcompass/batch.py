import argparse
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

import psycopg

from .enrichment import JobRoleClassifier, SkillExtractor
from .service import collect_board
from .storage import (
    BoardRepository,
    CollectionRunRepository,
    EnrichmentRepository,
    JobPostingRepository,
)


LOGGER = logging.getLogger("devcompass.batch")
PIPELINE_LOCK_KEY = 723_382_667_001


class PipelineAlreadyRunning(RuntimeError):
    pass


@dataclass(frozen=True)
class BatchConfig:
    dsn: Optional[str]
    role_model_path: Path
    role_model_version: str = "job-role-svc-v1"
    skill_extractor_version: str = "tech-dictionary-v1"
    enrichment_batch_size: int = 250
    collection_workers: int = 4
    collection_max_attempts: int = 3
    enrichment_max_attempts: int = 2
    retry_base_seconds: float = 5.0

    @classmethod
    def from_env(cls):
        dsn = os.environ.get("DEVCOMPASS_DSN")
        if not dsn and not all(
            os.environ.get(name) for name in ("PGHOST", "PGDATABASE", "PGUSER")
        ):
            raise ValueError(
                "DEVCOMPASS_DSN or PGHOST/PGDATABASE/PGUSER is required"
            )
        config = cls(
            dsn=dsn,
            role_model_path=Path(
                os.environ.get(
                    "DEVCOMPASS_ROLE_MODEL_PATH",
                    "experiment/job_role_svc_v1.joblib",
                )
            ),
            role_model_version=os.environ.get(
                "DEVCOMPASS_ROLE_MODEL_VERSION", "job-role-svc-v1"
            ),
            skill_extractor_version=os.environ.get(
                "DEVCOMPASS_SKILL_EXTRACTOR_VERSION", "tech-dictionary-v1"
            ),
            enrichment_batch_size=int(
                os.environ.get("DEVCOMPASS_ENRICHMENT_BATCH_SIZE", "250")
            ),
            collection_workers=int(
                os.environ.get("DEVCOMPASS_COLLECTION_WORKERS", "4")
            ),
            collection_max_attempts=int(
                os.environ.get("DEVCOMPASS_COLLECTION_MAX_ATTEMPTS", "3")
            ),
            enrichment_max_attempts=int(
                os.environ.get("DEVCOMPASS_ENRICHMENT_MAX_ATTEMPTS", "2")
            ),
            retry_base_seconds=float(
                os.environ.get("DEVCOMPASS_RETRY_BASE_SECONDS", "5")
            ),
        )
        if config.enrichment_batch_size < 1:
            raise ValueError("DEVCOMPASS_ENRICHMENT_BATCH_SIZE must be positive")
        if config.collection_workers < 1:
            raise ValueError("DEVCOMPASS_COLLECTION_WORKERS must be positive")
        if config.collection_max_attempts < 1:
            raise ValueError(
                "DEVCOMPASS_COLLECTION_MAX_ATTEMPTS must be positive"
            )
        if config.enrichment_max_attempts < 1:
            raise ValueError(
                "DEVCOMPASS_ENRICHMENT_MAX_ATTEMPTS must be positive"
            )
        if config.retry_base_seconds < 0:
            raise ValueError("DEVCOMPASS_RETRY_BASE_SECONDS must not be negative")
        return config


@dataclass
class CollectionResult:
    run_id: str
    target_boards: int
    successful_boards: int
    failed_boards: int
    new_jobs: int
    changed_jobs: int
    unchanged_jobs: int
    closed_jobs: int


@dataclass
class EnrichmentResult:
    target_histories: int
    finalized_histories: int
    role_predictions: int
    skill_predictions: int
    skill_matches: int
    failed_batches: int


def _connect(config):
    return psycopg.connect(config.dsn) if config.dsn else psycopg.connect()


@contextmanager
def _pipeline_lock(config):
    connection = _connect(config)
    connection.autocommit = True
    acquired = False
    try:
        acquired = connection.execute(
            "SELECT pg_try_advisory_lock(%s)", (PIPELINE_LOCK_KEY,)
        ).fetchone()[0]
        if not acquired:
            raise PipelineAlreadyRunning(
                "Another DevCompass pipeline instance is already running"
            )
        LOGGER.info("pipeline lock acquired key=%d", PIPELINE_LOCK_KEY)
        yield
    finally:
        if acquired and not connection.closed:
            connection.execute(
                "SELECT pg_advisory_unlock(%s)", (PIPELINE_LOCK_KEY,)
            )
        if not connection.closed:
            connection.close()


def _run_with_retry(operation, max_attempts, base_delay, label):
    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except Exception:
            if attempt == max_attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1))
            LOGGER.warning(
                "%s failed attempt=%d/%d; retrying in %.1fs",
                label,
                attempt,
                max_attempts,
                delay,
                exc_info=True,
            )
            if delay:
                time.sleep(delay)


def _new_run_id():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return "fargate__{}__{}".format(timestamp, uuid4().hex[:8])


def _chunks(items, size):
    return [items[index : index + size] for index in range(0, len(items), size)]


def run_collection(config, run_id=None):
    run_id = run_id or _new_run_id()
    with _connect(config) as connection:
        boards = BoardRepository(connection).list_enabled()
        if not boards:
            raise RuntimeError("No enabled ATS boards found")
        CollectionRunRepository(connection).start(run_id, len(boards))

    totals = {
        "new_jobs": 0,
        "changed_jobs": 0,
        "unchanged_jobs": 0,
        "closed_jobs": 0,
    }
    failures = []

    def collect_one(board):
        def attempt():
            with _connect(config) as connection:
                return collect_board(
                    run_id=run_id,
                    board=board,
                    repository=JobPostingRepository(connection),
                )

        return _run_with_retry(
            attempt,
            max_attempts=config.collection_max_attempts,
            base_delay=config.retry_base_seconds,
            label="collection company={}".format(board.company_name),
        )

    try:
        with ThreadPoolExecutor(max_workers=config.collection_workers) as executor:
            futures = {executor.submit(collect_one, board): board for board in boards}
            for future in as_completed(futures):
                board = futures[future]
                try:
                    summary = future.result()
                    totals["new_jobs"] += summary.new
                    totals["changed_jobs"] += summary.changed
                    totals["unchanged_jobs"] += summary.unchanged
                    totals["closed_jobs"] += summary.closed
                    LOGGER.info(
                        "collection board succeeded company=%s new=%d changed=%d "
                        "unchanged=%d closed=%d",
                        board.company_name,
                        summary.new,
                        summary.changed,
                        summary.unchanged,
                        summary.closed,
                    )
                except Exception as exc:
                    failures.append(
                        {
                            "board_id": board.board_id,
                            "company_name": board.company_name,
                            "error_message": str(exc),
                        }
                    )
                    LOGGER.exception(
                        "collection board failed company=%s error=%s",
                        board.company_name,
                        exc,
                    )
    finally:
        with _connect(config) as connection:
            repository = CollectionRunRepository(connection)
            repository.record_missing_failures(run_id, failures)
            repository.finalize(run_id)

    return CollectionResult(
        run_id=run_id,
        target_boards=len(boards),
        successful_boards=len(boards) - len(failures),
        failed_boards=len(failures),
        **totals,
    )


def _classify_batch(config, classifier, enrichment_ids):
    def attempt():
        with _connect(config) as connection:
            repository = EnrichmentRepository(connection)
            inputs = repository.get_pending_role_inputs(enrichment_ids)
            predictions = classifier.predict([item["title"] for item in inputs])
            rows = [
                dict(prediction, enrichment_id=item["enrichment_id"])
                for item, prediction in zip(inputs, predictions)
            ]
            return repository.save_role_predictions(rows)

    try:
        return _run_with_retry(
            attempt,
            max_attempts=config.enrichment_max_attempts,
            base_delay=config.retry_base_seconds,
            label="job-role enrichment",
        )
    except Exception as exc:
        with _connect(config) as connection:
            EnrichmentRepository(connection).fail_role_batch(
                enrichment_ids, str(exc)
            )
        raise


def _extract_skill_batch(config, extractor, enrichment_ids):
    def attempt():
        with _connect(config) as connection:
            repository = EnrichmentRepository(connection)
            inputs = repository.get_pending_skill_inputs(enrichment_ids)
            predictions = [
                {
                    "enrichment_id": item["enrichment_id"],
                    "matches": extractor.extract(
                        item["description"], item["company_name"]
                    ),
                }
                for item in inputs
            ]
            processed = repository.save_skill_predictions(predictions)
            return processed, sum(len(row["matches"]) for row in predictions)

    try:
        return _run_with_retry(
            attempt,
            max_attempts=config.enrichment_max_attempts,
            base_delay=config.retry_base_seconds,
            label="skill enrichment",
        )
    except Exception as exc:
        with _connect(config) as connection:
            EnrichmentRepository(connection).fail_skill_batch(
                enrichment_ids, str(exc)
            )
        raise


def run_enrichment(config):
    with _connect(config) as connection:
        repository = EnrichmentRepository(connection)
        history_ids = repository.list_enrichment_target_history_ids(
            config.role_model_version,
            config.skill_extractor_version,
        )
        aliases = repository.list_active_skill_aliases() if history_ids else []

    if not history_ids:
        return EnrichmentResult(0, 0, 0, 0, 0, 0)

    classifier = JobRoleClassifier(
        config.role_model_path,
        expected_version=config.role_model_version,
    )
    extractor = SkillExtractor(aliases)
    totals = {
        "finalized_histories": 0,
        "role_predictions": 0,
        "skill_predictions": 0,
        "skill_matches": 0,
        "failed_batches": 0,
    }

    for history_batch in _chunks(history_ids, config.enrichment_batch_size):
        with _connect(config) as connection:
            prepared = EnrichmentRepository(connection).prepare_enrichment_batch(
                history_ids=history_batch,
                role_model_version=config.role_model_version,
                skill_extractor_version=config.skill_extractor_version,
            )
        enrichment_ids = [item["enrichment_id"] for item in prepared]

        branch_errors = []
        with ThreadPoolExecutor(max_workers=2) as executor:
            role_future = executor.submit(
                _classify_batch, config, classifier, enrichment_ids
            )
            skill_future = executor.submit(
                _extract_skill_batch, config, extractor, enrichment_ids
            )
            try:
                totals["role_predictions"] += role_future.result()
            except Exception as exc:
                branch_errors.append(exc)
                LOGGER.exception("job-role enrichment batch failed: %s", exc)
            try:
                processed, matches = skill_future.result()
                totals["skill_predictions"] += processed
                totals["skill_matches"] += matches
            except Exception as exc:
                branch_errors.append(exc)
                LOGGER.exception("skill enrichment batch failed: %s", exc)

        with _connect(config) as connection:
            totals["finalized_histories"] += EnrichmentRepository(
                connection
            ).finalize_enrichment_batch(enrichment_ids)
        if branch_errors:
            totals["failed_batches"] += 1

    return EnrichmentResult(target_histories=len(history_ids), **totals)


def run_pipeline(config, mode="full", run_id=None):
    with _pipeline_lock(config):
        result = {"mode": mode}
        has_errors = False
        if mode in {"full", "collection"}:
            collection = run_collection(config, run_id=run_id)
            result["collection"] = asdict(collection)
            has_errors = collection.failed_boards > 0
        if mode in {"full", "enrichment"}:
            enrichment = run_enrichment(config)
            result["enrichment"] = asdict(enrichment)
            has_errors = has_errors or enrichment.failed_batches > 0
        result["status"] = "failed" if has_errors else "success"
        return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the DevCompass batch pipeline")
    parser.add_argument(
        "--mode",
        choices=("full", "collection", "enrichment"),
        default=os.environ.get("DEVCOMPASS_PIPELINE_MODE", "full"),
    )
    parser.add_argument("--run-id", default=os.environ.get("DEVCOMPASS_RUN_ID"))
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        result = run_pipeline(
            BatchConfig.from_env(),
            mode=args.mode,
            run_id=args.run_id,
        )
        print(json.dumps(result, ensure_ascii=True, sort_keys=True))
        return 0 if result["status"] == "success" else 1
    except PipelineAlreadyRunning as exc:
        print(
            json.dumps(
                {
                    "mode": args.mode,
                    "status": "skipped",
                    "reason": str(exc),
                },
                ensure_ascii=True,
                sort_keys=True,
            )
        )
        return 1
    except Exception:
        LOGGER.exception("pipeline failed with an unrecoverable error")
        return 1


if __name__ == "__main__":
    sys.exit(main())
