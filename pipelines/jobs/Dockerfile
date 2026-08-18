ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEVCOMPASS_ROLE_MODEL_PATH=/app/experiment/job_role_svc_v1.joblib \
    DEVCOMPASS_ROLE_MODEL_VERSION=job-role-svc-v1 \
    DEVCOMPASS_SKILL_EXTRACTOR_VERSION=tech-dictionary-v1 \
    DEVCOMPASS_ENRICHMENT_BATCH_SIZE=250 \
    DEVCOMPASS_COLLECTION_WORKERS=4 \
    DEVCOMPASS_COLLECTION_MAX_ATTEMPTS=3 \
    DEVCOMPASS_ENRICHMENT_MAX_ATTEMPTS=2 \
    DEVCOMPASS_RETRY_BASE_SECONDS=5 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 devcompass

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install .

COPY experiment/job_role_svc_v1.joblib ./experiment/job_role_svc_v1.joblib

RUN python -c "from devcompass.enrichment import JobRoleClassifier; JobRoleClassifier('/app/experiment/job_role_svc_v1.joblib', expected_version='job-role-svc-v1')"

FROM base AS validation

COPY tests/ /tmp/devcompass-tests/
RUN python -m unittest discover -s /tmp/devcompass-tests -v \
    && touch /tmp/devcompass-validation-ok

FROM base AS runtime

COPY --from=validation /tmp/devcompass-validation-ok /app/.devcompass-validation-ok

USER devcompass
ENTRYPOINT ["python", "-m", "devcompass.batch"]
CMD ["--mode", "full"]
