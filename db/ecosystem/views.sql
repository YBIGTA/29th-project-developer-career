-- API read model from the latest completely successful Task B run.

CREATE OR REPLACE VIEW public.vw_latest_ecosystem_skill AS
WITH latest_run AS (
    SELECT run_id, as_of_date, window_days
    FROM ecosystem_run
    WHERE status = 'success'
    ORDER BY finished_at DESC, run_id DESC
    LIMIT 1
), raw AS (
    SELECT
        r.run_id,
        r.as_of_date,
        r.window_days,
        s.skill_id,
        s.skill_code,
        s.skill_name,
        g.github_repository_count,
        g.github_issue_count_180d,
        g.github_pr_count_180d,
        g.github_activity_count_180d,
        so.stackoverflow_question_count_180d
    FROM latest_run r
    JOIN ecosystem_github_metrics g
      ON g.run_id = r.run_id AND g.status = 'success'
    JOIN ecosystem_stackoverflow_metrics so
      ON so.run_id = r.run_id
     AND so.skill_id = g.skill_id
     AND so.status = 'success'
    JOIN skill s
      ON s.skill_id = g.skill_id
     AND s.is_active = TRUE
), scored AS (
    SELECT
        raw.*,
        CASE WHEN COUNT(*) OVER () = 1 THEN 100.0
             ELSE ROUND((100 * PERCENT_RANK() OVER (
                 ORDER BY github_repository_count
             ))::NUMERIC, 1)
        END AS github_repository_score,
        CASE WHEN COUNT(*) OVER () = 1 THEN 100.0
             ELSE ROUND((100 * PERCENT_RANK() OVER (
                 ORDER BY github_activity_count_180d
             ))::NUMERIC, 1)
        END AS github_activity_score,
        CASE WHEN COUNT(*) OVER () = 1 THEN 100.0
             ELSE ROUND((100 * PERCENT_RANK() OVER (
                 ORDER BY stackoverflow_question_count_180d
             ))::NUMERIC, 1)
        END AS stackoverflow_score
    FROM raw
)
SELECT
    scored.*,
    ROUND((
        github_repository_score
        + github_activity_score
        + stackoverflow_score
    ) / 3.0, 1) AS ecosystem_score
FROM scored;

COMMENT ON VIEW public.vw_latest_ecosystem_skill IS
    'Raw counts and percentile scores from the latest successful Task B run.';

-- vw_stackoverflow_ecosystem_skill is intentionally not (re)created here: a
-- teammate already owns that name against the legacy CSV-imported tables, and
-- app/api/routes.py reads vw_latest_ecosystem_skill instead, so nothing here
-- needs to touch it.

-- This is a demand aggregate from Task A data, not a Task B-owned physical table.
CREATE OR REPLACE VIEW public.vw_stackoverflow_job_role_skill_counts AS
SELECT
    role_name AS job_role,
    skill_name AS skill,
    COUNT(DISTINCT job_id)::INTEGER AS posting_count
FROM public.vw_active_job_skill
WHERE role_name IS NOT NULL
GROUP BY role_name, skill_name;

