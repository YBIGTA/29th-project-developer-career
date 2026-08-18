-- DevCompass phase-1 collection layer schema.
-- Scope: ATS registry, current postings, posting history, and Airflow run metadata.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ats_board (
    board_id BIGSERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    ats_source TEXT NOT NULL CHECK (ats_source IN ('greenhouse', 'lever', 'ashby')),
    board_slug TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ats_source, board_slug),
    UNIQUE (company_name, ats_source)
);

DROP TRIGGER IF EXISTS trg_ats_board_updated_at ON ats_board;
CREATE TRIGGER trg_ats_board_updated_at
BEFORE UPDATE ON ats_board
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS job_posting (
    job_id BIGSERIAL PRIMARY KEY,
    board_id BIGINT NOT NULL REFERENCES ats_board(board_id) ON DELETE RESTRICT,
    source_job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    department TEXT,
    team TEXT,
    employment_type TEXT,
    published_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    source_url TEXT,
    apply_url TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (board_id, source_job_id),
    CHECK (last_seen_at >= first_seen_at),
    CHECK (closed_at IS NULL OR closed_at >= first_seen_at),
    CHECK (
        (is_active = TRUE AND closed_at IS NULL)
        OR
        (is_active = FALSE AND closed_at IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_job_posting_updated_at ON job_posting;
CREATE TRIGGER trg_job_posting_updated_at
BEFORE UPDATE ON job_posting
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_job_posting_board_active
ON job_posting (board_id, is_active);

CREATE INDEX IF NOT EXISTS idx_job_posting_content_hash
ON job_posting (content_hash);

CREATE TABLE IF NOT EXISTS job_posting_history (
    history_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES job_posting(job_id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    department TEXT,
    team TEXT,
    employment_type TEXT,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_job_posting_history_job_id
ON job_posting_history (job_id);

CREATE INDEX IF NOT EXISTS idx_job_posting_history_content_hash
ON job_posting_history (content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_posting_history_open_version
ON job_posting_history (job_id)
WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS collection_run (
    run_id TEXT PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
    target_boards INTEGER NOT NULL DEFAULT 0 CHECK (target_boards >= 0),
    success_boards INTEGER NOT NULL DEFAULT 0 CHECK (success_boards >= 0),
    failed_boards INTEGER NOT NULL DEFAULT 0 CHECK (failed_boards >= 0),
    total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (target_boards >= success_boards + failed_boards),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK (
        (status = 'running' AND finished_at IS NULL)
        OR
        (status <> 'running' AND finished_at IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_collection_run_updated_at ON collection_run;
CREATE TRIGGER trg_collection_run_updated_at
BEFORE UPDATE ON collection_run
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_collection_run_status_started_at
ON collection_run (status, started_at);

CREATE TABLE IF NOT EXISTS collection_board_status (
    run_id TEXT NOT NULL REFERENCES collection_run(run_id) ON DELETE CASCADE,
    board_id BIGINT NOT NULL REFERENCES ats_board(board_id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    http_status INTEGER CHECK (http_status BETWEEN 100 AND 599),
    job_count INTEGER CHECK (job_count IS NULL OR job_count >= 0),
    elapsed_sec NUMERIC(10, 3) CHECK (elapsed_sec IS NULL OR elapsed_sec >= 0),
    error_message TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, board_id),
    CHECK (
        (status = 'success' AND job_count IS NOT NULL AND error_message IS NULL)
        OR
        (status IN ('failed', 'skipped'))
    )
);

CREATE INDEX IF NOT EXISTS idx_collection_board_status_board_collected
ON collection_board_status (board_id, collected_at DESC);

-- DevCompass reference dictionaries.
-- These tables are seeded before enrichment jobs run and are not populated by Airflow.

CREATE TABLE IF NOT EXISTS job_role (
    job_role_id BIGSERIAL PRIMARY KEY,
    role_code VARCHAR(60) NOT NULL UNIQUE,
    role_name TEXT NOT NULL UNIQUE,
    is_analysis_target BOOLEAN NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order SMALLINT NOT NULL CHECK (sort_order > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (BTRIM(role_code) <> ''),
    CHECK (BTRIM(role_name) <> '')
);

DROP TRIGGER IF EXISTS trg_job_role_updated_at ON job_role;
CREATE TRIGGER trg_job_role_updated_at
BEFORE UPDATE ON job_role
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_role_sort_order
ON job_role (sort_order);

CREATE TABLE IF NOT EXISTS skill_category (
    skill_category_id SMALLSERIAL PRIMARY KEY,
    category_code VARCHAR(40) NOT NULL UNIQUE,
    category_name TEXT NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL CHECK (sort_order > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (BTRIM(category_code) <> ''),
    CHECK (BTRIM(category_name) <> '')
);

DROP TRIGGER IF EXISTS trg_skill_category_updated_at ON skill_category;
CREATE TRIGGER trg_skill_category_updated_at
BEFORE UPDATE ON skill_category
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_category_sort_order
ON skill_category (sort_order);

CREATE TABLE IF NOT EXISTS skill (
    skill_id BIGSERIAL PRIMARY KEY,
    skill_code VARCHAR(100) NOT NULL UNIQUE,
    skill_name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (BTRIM(skill_code) <> ''),
    CHECK (BTRIM(skill_name) <> '')
);

DROP TRIGGER IF EXISTS trg_skill_updated_at ON skill;
CREATE TRIGGER trg_skill_updated_at
BEFORE UPDATE ON skill
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS skill_category_map (
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    skill_category_id SMALLINT NOT NULL
        REFERENCES skill_category(skill_category_id) ON DELETE RESTRICT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (skill_id, skill_category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_category_map_primary
ON skill_category_map (skill_id)
WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_skill_category_map_category
ON skill_category_map (skill_category_id, skill_id);

CREATE TABLE IF NOT EXISTS skill_alias (
    skill_alias_id BIGSERIAL PRIMARY KEY,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    alias_text TEXT NOT NULL,
    alias_normalized TEXT NOT NULL,
    match_policy VARCHAR(30) NOT NULL DEFAULT 'normal'
        CHECK (match_policy IN ('normal', 'ambiguous_contextual')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (BTRIM(alias_text) <> ''),
    CHECK (BTRIM(alias_normalized) <> ''),
    UNIQUE (alias_normalized, match_policy)
);

CREATE INDEX IF NOT EXISTS idx_skill_alias_skill
ON skill_alias (skill_id);

-- Versioned enrichment results shared by role classification and skill extraction.

CREATE TABLE IF NOT EXISTS job_enrichment_result (
    enrichment_id BIGSERIAL PRIMARY KEY,
    history_id BIGINT NOT NULL
        REFERENCES job_posting_history(history_id) ON DELETE CASCADE,
    job_role_id BIGINT REFERENCES job_role(job_role_id) ON DELETE RESTRICT,
    role_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (role_status IN ('pending', 'matched', 'unmatched', 'failed')),
    role_score NUMERIC(12, 8),
    role_model_version TEXT NOT NULL,
    role_processed_at TIMESTAMPTZ,
    role_error_message TEXT,
    skill_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (skill_status IN ('pending', 'success', 'failed', 'skipped')),
    skill_extractor_version TEXT,
    skill_processed_at TIMESTAMPTZ,
    skill_error_message TEXT,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'partial_success', 'success', 'failed')),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_enrichment_result_versions
        UNIQUE NULLS NOT DISTINCT (
            history_id,
            role_model_version,
            skill_extractor_version
        ),
    CHECK (BTRIM(role_model_version) <> ''),
    CHECK (
        (role_status = 'matched' AND job_role_id IS NOT NULL
            AND role_processed_at IS NOT NULL AND role_error_message IS NULL)
        OR
        (role_status = 'unmatched' AND job_role_id IS NULL
            AND role_processed_at IS NOT NULL AND role_error_message IS NULL)
        OR
        (role_status = 'failed' AND job_role_id IS NULL
            AND role_processed_at IS NOT NULL AND role_error_message IS NOT NULL)
        OR
        (role_status = 'pending' AND job_role_id IS NULL
            AND role_processed_at IS NULL AND role_error_message IS NULL)
    ),
    CHECK (
        (skill_status = 'pending' AND skill_processed_at IS NULL
            AND skill_error_message IS NULL)
        OR
        (skill_status IN ('success', 'skipped') AND skill_processed_at IS NOT NULL
            AND skill_error_message IS NULL)
        OR
        (skill_status = 'failed' AND skill_processed_at IS NOT NULL
            AND skill_error_message IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_job_enrichment_result_updated_at
ON job_enrichment_result;
CREATE TRIGGER trg_job_enrichment_result_updated_at
BEFORE UPDATE ON job_enrichment_result
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_job_enrichment_result_history
ON job_enrichment_result (history_id);

CREATE INDEX IF NOT EXISTS idx_job_enrichment_result_role_work
ON job_enrichment_result (role_model_version, role_status, enrichment_id);

CREATE INDEX IF NOT EXISTS idx_job_enrichment_result_skill_work
ON job_enrichment_result (
    skill_extractor_version,
    skill_status,
    enrichment_id
);

CREATE TABLE IF NOT EXISTS job_skill (
    enrichment_id BIGINT NOT NULL
        REFERENCES job_enrichment_result(enrichment_id) ON DELETE CASCADE,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    matched_text TEXT,
    match_type VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (enrichment_id, skill_id),
    CHECK (matched_text IS NULL OR BTRIM(matched_text) <> ''),
    CHECK (match_type IS NULL OR BTRIM(match_type) <> '')
);

CREATE INDEX IF NOT EXISTS idx_job_skill_skill
ON job_skill (skill_id, enrichment_id);

COMMENT ON TABLE ats_board IS 'Registry of companies and public ATS boards to collect.';
COMMENT ON TABLE job_posting IS 'Current latest observed state for each source job posting.';
COMMENT ON TABLE job_posting_history IS 'Version history inserted only when a posting content_hash changes.';
COMMENT ON TABLE collection_run IS 'One Airflow DAG collection run and aggregate outcome.';
COMMENT ON TABLE collection_board_status IS 'Per-run, per-board API result. Downstream closed detection must use only status = success rows.';
COMMENT ON TABLE job_role IS 'Predefined LinearSVC output taxonomy. UNMATCHED is represented by a null role foreign key, not a row here.';
COMMENT ON TABLE skill_category IS 'Predefined categories from TECH_DICTIONARY.';
COMMENT ON TABLE skill IS 'Canonical technology dictionary entries.';
COMMENT ON TABLE skill_category_map IS 'Many-to-many mapping because one canonical skill may belong to multiple categories.';
COMMENT ON TABLE skill_alias IS 'Approved extraction aliases and their matching policy; candidate mining never inserts here automatically.';
COMMENT ON TABLE job_enrichment_result IS 'Versioned role and skill enrichment result for one immutable posting history row.';
COMMENT ON TABLE job_skill IS 'Canonical skills detected for one enrichment result; populated after the skill extractor is implemented.';
