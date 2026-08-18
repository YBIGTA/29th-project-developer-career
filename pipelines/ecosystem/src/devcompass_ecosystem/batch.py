import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import psycopg

from .collectors import GitHubCollector, StackOverflowCollector
from .storage import EcosystemRepository


LOGGER = logging.getLogger("devcompass.ecosystem")
PIPELINE_LOCK_KEY = 723_382_667_002


class PipelineAlreadyRunning(RuntimeError):
    pass


@dataclass(frozen=True)
class BatchConfig:
    dsn: str | None
    github_token: str
    stackexchange_key: str | None
    run_id: str
    as_of_date: date
    window_days: int = 180
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

        run_id = os.environ.get("DEVCOMPASS_WORKFLOW_RUN_ID") or _new_run_id()
        raw_limit = int(os.environ.get("DEVCOMPASS_ECOSYSTEM_SKILL_LIMIT", "0"))
        config = cls(
            dsn=dsn,
            github_token=github_token,
            stackexchange_key=os.environ.get("STACKEXCHANGE_KEY"),
            run_id=run_id,
            as_of_date=as_of_date,
            window_days=int(os.environ.get("DEVCOMPASS_ECOSYSTEM_DAYS", "180")),
            max_attempts=int(
                os.environ.get("DEVCOMPASS_ECOSYSTEM_MAX_ATTEMPTS", "3")
            ),
            retry_base_seconds=float(
                os.environ.get("DEVCOMPASS_ECOSYSTEM_RETRY_BASE_SECONDS", "5")
            ),
            github_request_delay_seconds=float(
                os.environ.get("DEVCOMPASS_GITHUB_REQUEST_DELAY_SECONDS", "2.1")
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
        if config.window_days != 180:
            raise ValueError("DEVCOMPASS_ECOSYSTEM_DAYS must be 180")
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


def _new_run_id():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return "ecosystem__{}__{}".format(timestamp, uuid4().hex[:8])


def _connect(config):
    return psycopg.connect(config.dsn) if config.dsn else psycopg.connect()


@contextmanager
def _pipeline_lock(connection):
    connection.autocommit = True
    acquired = connection.execute(
        "SELECT pg_try_advisory_lock(%s)", (PIPELINE_LOCK_KEY,)
    ).fetchone()[0]
    if not acquired:
        raise PipelineAlreadyRunning("Another ecosystem pipeline is already running")
    try:
        yield
    finally:
        if not connection.closed:
            connection.execute(
                "SELECT pg_advisory_unlock(%s)", (PIPELINE_LOCK_KEY,)
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
                label,
                attempt,
                config.max_attempts,
                delay,
                exc_info=True,
            )
            if delay:
                time.sleep(delay)


def run_pipeline(config, github_collector=None, stackoverflow_collector=None):
    from_date = config.as_of_date - timedelta(days=config.window_days)
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
        repository.start_run(
            config.run_id,
            config.as_of_date,
            config.window_days,
            len(skills),
        )
        completed = repository.completed_sources(config.run_id)
        fatal_error = None
        try:
            for index, skill in enumerate(skills, start=1):
                source_status = completed.get(
                    skill.skill_id,
                    {"github": False, "stackoverflow": False},
                )
                LOGGER.info(
                    "collecting skill=%s progress=%d/%d",
                    skill.skill_name,
                    index,
                    len(skills),
                )
                if not source_status["github"]:
                    try:
                        counts = _run_with_retry(
                            lambda: github_collector.collect(
                                skill, from_date, config.as_of_date
                            ),
                            config,
                            "github skill={}".format(skill.skill_name),
                        )
                        repository.write_github_success(
                            config.run_id,
                            skill,
                            counts,
                            from_date,
                            config.as_of_date,
                        )
                    except Exception as exc:
                        LOGGER.exception(
                            "GitHub collection failed skill=%s", skill.skill_name
                        )
                        repository.write_failure(
                            "github",
                            config.run_id,
                            skill,
                            str(exc),
                            from_date,
                            config.as_of_date,
                        )

                if not source_status["stackoverflow"]:
                    try:
                        counts = _run_with_retry(
                            lambda: stackoverflow_collector.collect(
                                skill, from_date, config.as_of_date
                            ),
                            config,
                            "stackoverflow skill={}".format(skill.skill_name),
                        )
                        repository.write_stackoverflow_success(
                            config.run_id,
                            skill,
                            counts,
                            from_date,
                            config.as_of_date,
                        )
                    except Exception as exc:
                        LOGGER.exception(
                            "Stack Overflow collection failed skill=%s",
                            skill.skill_name,
                        )
                        repository.write_failure(
                            "stackoverflow",
                            config.run_id,
                            skill,
                            str(exc),
                            from_date,
                            config.as_of_date,
                        )
        except Exception as exc:
            fatal_error = exc

        summary = repository.finalize(config.run_id, config.as_of_date)
        if fatal_error is not None:
            raise fatal_error
        return summary


def main():
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        summary = run_pipeline(BatchConfig.from_env())
    except Exception:
        LOGGER.exception("ecosystem pipeline failed")
        return 1
    print(json.dumps(asdict(summary), default=str, ensure_ascii=True))
    return 0 if summary.status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
