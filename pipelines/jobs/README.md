# DevCompass Task A

Task A is a one-shot batch container that collects public job postings and
enriches them before exiting.

```text
ATS APIs
  -> collection
  -> RDS current/history tables
  -> role classification and skill extraction
  -> RDS enrichment tables
  -> exit
```

## Build

Run this from the repository root:

```bash
docker build -t devcompass-jobs:local pipelines/jobs
```

The runtime image contains the Python package and
`artifacts/job_role_svc_v1.joblib`. Tests are intentionally outside the image.

## Runtime configuration

Provide `DEVCOMPASS_DSN`, or the standard `PGHOST`, `PGDATABASE`, and `PGUSER`
environment variables. Step Functions supplies `DEVCOMPASS_RUN_ID` when Task A
runs in AWS.

The default command runs both phases:

```text
python -m devcompass.batch --mode full
```

The supported modes are `collection`, `enrichment`, and `full`.

## Failure behavior

Task A retries collection per board and enrichment per batch. It writes run and
board outcomes to RDS and returns a nonzero exit code when collection or
enrichment is not fully successful. A PostgreSQL advisory lock prevents two Task
A containers from updating the same database concurrently.

