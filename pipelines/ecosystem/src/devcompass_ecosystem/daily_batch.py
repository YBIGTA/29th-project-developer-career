import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone

import psycopg

from .collectors import GitHubCollector, StackOverflowCollector
from .models import RunSummary
from .storage import EcosystemRepository


LOGGER = logging.getLogger("devcompass.ecosystem.daily")
DAILY_PIPELINE_LOCK_KEY = 723_382_667_003  # distinct from batch.py's PIPELINE_LOCK_KEY
DAILY_SOURCE_LABEL = "live_daily_pipeline"


class PipelineAlreadyRunning(RuntimeError):
    pass


@dataclass(frozen=True)
class DailyBatchConfig:
    dsn: str | None
    github_token: str
    stackexchange_key: str | None
    as_of_date: date
    max_attempts: int = 3
    retry_base_seconds: float = 5.0
    github_request_delay_seconds: float = 2.1
    stackoverflow_request_delay_seconds: float = 0.25
    request_timeout_seconds: int = 45
    skill_limit: int | None = None

    @classmethod
    def from_env(cls):
        dsn = os.environ.get("DEVCOMPASS_DSN")
        if not dsn and not all(
            os.environ.get(name) for name in ("PGHOST", "PGDATABASE", "PGUSER")
        ):
            raise ValueError("DEVCOMPASS_DSN or PGHOST/PGDATABASE/PGUSER is required")

        github_token = os.environ.get("GITHUB_TOKEN")
        if not github_token:
            raise ValueError("GITHUB_TOKEN is required")

        raw_as_of = os.environ.get("DEVCOMPASS_AS_OF_DATE")
        if raw_as_of:
            as_of_date = datetime.fromisoformat(raw_as_of.replace("Z", "+00:00")).date()
        else:
            as_of_date = datetime.now(timezone.utc).date()

        raw_limit = int(os.environ.get("DEVCOMPASS_ECOSYSTEM_SKILL_LIMIT", "0"))
        config = cls(
            dsn=dsn,
            github_token=github_token,
            stackexchange_key=os.environ.get("STACKEXCHANGE_KEY"),
            as_of_date=as_of_date,
            max_attempts=int(
                os.environ.get("DEVCOMPASS_ECOSYSTEM_MAX_ATTEMPTS", "3")
            ),
            retry_base_seconds=float(
                os.environ.get("DEVCOMPASS_ECOSYSTEM_RETRY_BASE_SECONDS", "5")
            ),
            github_request_delay_seconds=float(
                os.environ.get(
                    "DEVCOMPASS_GITHUB_REQUEST_DELAY_SECONDS", "2.1"
                )
            ),
            stackoverflow_request_delay_seconds=float(
                os.environ.get(
                    "DEVCOMPASS_STACKOVERFLOW_REQUEST_DELAY_SECONDS", "0.25"
                )
            ),
            request_timeout_seconds=int(
                os.environ.get("DEVCOMPASS_ECOSYSTEM_REQUEST_TIMEOUT_SECONDS", "45")
            ),
            skill_limit=raw_limit or None,
        )
        if config.max_attempts < 1:
            raise ValueError("DEVCOMPASS_ECOSYSTEM_MAX_ATTEMPTS must be positive")
        if config.retry_base_seconds < 0:
            raise ValueError(
                "DEVCOMPASS_ECOSYSTEM_RETRY_BASE_SECONDS must not be negative"
            )
        if config.request_timeout_seconds < 1:
            raise ValueError(
                "DEVCOMPASS_ECOSYSTEM_REQUEST_TIMEOUT_SECONDS must be positive"
            )
        return config


def _connect(config):
    return psycopg.connect(config.dsn) if config.dsn else psycopg.connect()


@contextmanager
def _pipeline_lock(connection):
    connection.autocommit = True
    acquired = connection.execute(
        "SELECT pg_try_advisory_lock(%s)", (DAILY_PIPELINE_LOCK_KEY,)
    ).fetchone()[0]
    if not acquired:
        raise PipelineAlreadyRunning(
            "Another daily ecosystem pipeline run is already in progress"
        )
    try:
        yield
    finally:
        if not connection.closed:
            connection.execute(
                "SELECT pg_advisory_unlock(%s)", (DAILY_PIPELINE_LOCK_KEY,)
            )


def _run_with_retry(operation, config, label):
    for attempt in range(1, config.max_attempts + 1):
        try:
            return operation()
        except Exception:
            if attempt == config.max_attempts:
                raise
            delay = config.retry_base_seconds * (2 ** (attempt - 1))
            LOGGER.warning(
                "%s failed attempt=%d/%d; retrying in %.1fs",
                label, attempt, config.max_attempts, delay,
                exc_info=True,
            )
            if delay:
                time.sleep(delay)


def run_daily_pipeline(config, github_collector=None, stackoverflow_collector=None):
    # metric_date is always "yesterday" relative to as_of_date, so the row
    # represents one closed UTC day, never a partial "today so far" count.
    metric_date = config.as_of_date - timedelta(days=1)
    github_to_date = metric_date  # GitHub search dates are inclusive by day
    stackoverflow_to_date = metric_date + timedelta(days=1)  # midnight boundary

    github_collector = github_collector or GitHubCollector(
        config.github_token,
        timeout=config.request_timeout_seconds,
        request_delay=config.github_request_delay_seconds,
    )
    stackoverflow_collector = stackoverflow_collector or StackOverflowCollector(
        api_key=config.stackexchange_key,
        timeout=config.request_timeout_seconds,
        request_delay=config.stackoverflow_request_delay_seconds,
    )

    with _connect(config) as connection, _pipeline_lock(connection):
        repository = EcosystemRepository(connection)
        skills = repository.list_active_skills(config.skill_limit)
        if not skills:
            raise RuntimeError("No active skills found")

        success = 0
        failed = 0
        for index, skill in enumerate(skills, start=1):
            LOGGER.info(
                "daily collecting skill=%s progress=%d/%d date=%s",
                skill.skill_name, index, len(skills), metric_date.isoformat(),
            )
            try:
                counts = _run_with_retry(
                    lambda: github_collector.collect(
                        skill, metric_date, github_to_date
                    ),
                    config, "daily github skill={}".format(skill.skill_name),
                )
                repository.upsert_daily_github(
                    metric_date, skill, counts, counts.activity_query,
                    DAILY_SOURCE_LABEL,
                )
            except Exception:
                LOGGER.exception(
                    "daily GitHub collection failed skill=%s", skill.skill_name
                )
                failed += 1
                continue

            try:
                so_counts = _run_with_retry(
                    lambda: stackoverflow_collector.collect(
                        skill, metric_date, stackoverflow_to_date
                    ),
                    config, "daily stackoverflow skill={}".format(skill.skill_name),
                )
                repository.upsert_daily_stackoverflow(
                    metric_date, skill, so_counts, DAILY_SOURCE_LABEL,
                )
            except Exception:
                LOGGER.exception(
                    "daily Stack Overflow collection failed skill=%s",
                    skill.skill_name,
                )
                failed += 1
                continue

            success += 1

        return RunSummary(
            run_id="daily__{}".format(metric_date.isoformat()),
            as_of_date=metric_date,
            target_skills=len(skills),
            successful_skills=success,
            failed_skills=failed,
            status="success" if failed == 0 else (
                "partial_success" if success > 0 else "failed"
            ),
        )


def main():
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        summary = run_daily_pipeline(DailyBatchConfig.from_env())
    except Exception:
        LOGGER.exception("daily ecosystem pipeline failed")
        return 1
    print(json.dumps(asdict(summary), default=str, ensure_ascii=True))
    return 0 if summary.status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
