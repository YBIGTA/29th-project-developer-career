-- Daily GitHub issue/PR activity, collected live (one full UTC day per row).
-- Mirrors ecosystem_daily_stackoverflow_metrics (see schema_daily_stackoverflow.sql)
-- at the same grain: metric_date instead of the 180-day window used by
-- ecosystem_github_metrics (see schema.sql). This table is intentionally
-- separate from ecosystem_github_metrics -- it does NOT feed
-- vw_latest_ecosystem_skill / ecosystem_score, so it can run daily without
-- touching the live 180-day gap-map score.
--
-- github_repository_count is deliberately not stored here: it is a
-- point-in-time "how many repos exist" total, not a day-windowed activity
-- count, so a daily grain doesn't add information over the 180-day table.
--
-- Apply after db/jobs/schema.sql (references skill).

CREATE TABLE IF NOT EXISTS ecosystem_daily_github_metrics (
    metric_date DATE NOT NULL,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    github_issue_count BIGINT NOT NULL CHECK (github_issue_count >= 0),
    github_pr_count BIGINT NOT NULL CHECK (github_pr_count >= 0),
    activity_query TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    is_partial_period BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (metric_date, skill_id),
    CHECK (period_end >= period_start),
    CHECK (metric_date = period_start AND metric_date = period_end)
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_daily_gh_skill_date
ON ecosystem_daily_github_metrics (skill_id, metric_date);

COMMENT ON TABLE ecosystem_daily_github_metrics IS
    'Daily GitHub issue+PR activity by canonical skill; raw values only -- rolling averages/indices are computed downstream, same pattern as ecosystem_daily_stackoverflow_metrics.';
