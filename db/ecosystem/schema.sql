-- Task B run metadata and versioned source metrics.
-- Apply db/jobs/schema.sql before this file because these tables reference skill.

CREATE TABLE IF NOT EXISTS ecosystem_run (
    run_id TEXT PRIMARY KEY,
    as_of_date DATE NOT NULL,
    window_days INTEGER NOT NULL CHECK (window_days > 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
    target_skills INTEGER NOT NULL DEFAULT 0 CHECK (target_skills >= 0),
    success_skills INTEGER NOT NULL DEFAULT 0 CHECK (success_skills >= 0),
    failed_skills INTEGER NOT NULL DEFAULT 0 CHECK (failed_skills >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (target_skills >= success_skills + failed_skills),
    CHECK (finished_at IS NULL OR finished_at >= started_at),
    CHECK (
        (status = 'running' AND finished_at IS NULL)
        OR
        (status <> 'running' AND finished_at IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_ecosystem_run_updated_at ON ecosystem_run;
CREATE TRIGGER trg_ecosystem_run_updated_at
BEFORE UPDATE ON ecosystem_run
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ecosystem_run_latest_success
ON ecosystem_run (finished_at DESC, run_id DESC)
WHERE status = 'success';

CREATE TABLE IF NOT EXISTS github_skill_counts (
    run_id TEXT NOT NULL REFERENCES ecosystem_run(run_id) ON DELETE CASCADE,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    github_repository_count BIGINT CHECK (github_repository_count >= 0),
    github_issue_count_180d BIGINT CHECK (github_issue_count_180d >= 0),
    github_pr_count_180d BIGINT CHECK (github_pr_count_180d >= 0),
    github_activity_count_180d BIGINT GENERATED ALWAYS AS (
        github_issue_count_180d + github_pr_count_180d
    ) STORED,
    repository_query TEXT,
    activity_query TEXT,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, skill_id),
    CHECK (to_date >= from_date),
    CHECK (
        (status = 'success'
            AND github_repository_count IS NOT NULL
            AND github_issue_count_180d IS NOT NULL
            AND github_pr_count_180d IS NOT NULL
            AND repository_query IS NOT NULL
            AND activity_query IS NOT NULL
            AND error_message IS NULL)
        OR
        (status = 'failed' AND error_message IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_github_skill_counts_skill_run
ON github_skill_counts (skill_id, run_id);

CREATE TABLE IF NOT EXISTS stackoverflow_skill_counts (
    run_id TEXT NOT NULL REFERENCES ecosystem_run(run_id) ON DELETE CASCADE,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    stackoverflow_tag TEXT,
    tag_source TEXT CHECK (tag_source IN ('manual', 'inferred')),
    stackoverflow_question_count_180d BIGINT
        CHECK (stackoverflow_question_count_180d >= 0),
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, skill_id),
    CHECK (to_date >= from_date),
    CHECK (
        (status = 'success'
            AND stackoverflow_tag IS NOT NULL
            AND tag_source IS NOT NULL
            AND stackoverflow_question_count_180d IS NOT NULL
            AND error_message IS NULL)
        OR
        (status = 'failed' AND error_message IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_stackoverflow_skill_counts_skill_run
ON stackoverflow_skill_counts (skill_id, run_id);

COMMENT ON TABLE ecosystem_run IS
    'One Task B snapshot. Only status=success runs are exposed to the API.';
COMMENT ON TABLE github_skill_counts IS
    'Versioned raw GitHub Search API counts per run and canonical skill.';
COMMENT ON TABLE stackoverflow_skill_counts IS
    'Versioned raw Stack Overflow question counts per run and canonical skill.';

