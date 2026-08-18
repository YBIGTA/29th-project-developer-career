ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEVCOMPASS_ECOSYSTEM_DAYS=180 \
    DEVCOMPASS_ECOSYSTEM_MAX_ATTEMPTS=3 \
    DEVCOMPASS_ECOSYSTEM_RETRY_BASE_SECONDS=5 \
    DEVCOMPASS_GITHUB_REQUEST_DELAY_SECONDS=2.1 \
    DEVCOMPASS_STACKOVERFLOW_REQUEST_DELAY_SECONDS=0.25

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 devcompass

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install .

USER devcompass
ENTRYPOINT ["python", "-m", "devcompass_ecosystem.batch"]

