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

-- ---------------------------------------------------------------------------
-- 이 파일이 만들지 않는, 다른 사람이 소유한 뷰 (참고용 기록)
--
-- 아래 둘은 DB에 이미 존재하지만 여기서 (재)생성하지 않는다. 팀원이 레거시
-- CSV 적재 테이블 위에 만들어 소유하고 있고, app/api/routes.py는 그쪽이 아니라
-- vw_latest_ecosystem_skill을 읽는다. 컬럼은 ERD에서 옮긴 것이라 정의(SQL)는
-- 원 소유자에게 확인할 것.
--
--   vw_stackoverflow_ecosystem_skill
--     skill(TEXT), github_repository_count, github_activity_count_180d,
--     stackoverflow_question_count_180d,
--     github_repo_score, github_activity_score, stackoverflow_score,
--     ecosystem_score
--
--     주의 — vw_latest_ecosystem_skill과 컬럼이 거의 같아서 헷갈리기 쉽다.
--     다른 점 두 가지: (1) 키가 skill_id가 아니라 기술명 문자열 skill이다,
--     (2) 점수 컬럼 이름이 github_repo_score(여기)와 github_repository_score
--     (vw_latest)로 다르다. 원본도 ecosystem_run 기반이 아니라 레거시 CSV라
--     최신 Task B 실행과 값이 어긋날 수 있다. API는 vw_latest를 쓴다.
--
--   stackoverflow_skill_summary
--     skill(TEXT), stackoverflow_question_count_180d, posting_count
--     생태계 한 축과 채용 건수를 기술명으로 붙여 놓은 요약.
-- ---------------------------------------------------------------------------

-- This is a demand aggregate from Task A data, not a Task B-owned physical table.
CREATE OR REPLACE VIEW public.vw_stackoverflow_job_role_skill_counts AS
SELECT
    role_name AS job_role,
    skill_name AS skill,
    COUNT(DISTINCT job_id)::INTEGER AS posting_count
FROM public.vw_active_job_skill
WHERE role_name IS NOT NULL
GROUP BY role_name, skill_name;

