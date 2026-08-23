CREATE TABLE IF NOT EXISTS ecosystem_daily_stackoverflow_metrics (
    metric_date DATE NOT NULL,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    stackoverflow_tag TEXT,
    tag_source VARCHAR(20)
        CHECK (tag_source IS NULL OR tag_source IN ('manual', 'inferred')),
    question_count BIGINT CHECK (question_count >= 0),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    is_partial_period BOOLEAN NOT NULL DEFAULT FALSE,
    source_file TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (metric_date, skill_id),
    CHECK (period_end >= period_start),
    CHECK (metric_date = period_start AND metric_date = period_end),
    CHECK (
        (status = 'success'
            AND stackoverflow_tag IS NOT NULL
            AND tag_source IS NOT NULL
            AND question_count IS NOT NULL
            AND error_message IS NULL)
        OR
        (status = 'failed' AND error_message IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_daily_so_skill_date
ON ecosystem_daily_stackoverflow_metrics (skill_id, metric_date);

COMMENT ON TABLE ecosystem_daily_stackoverflow_metrics IS
    'Daily Stack Overflow question counts by canonical skill.';
