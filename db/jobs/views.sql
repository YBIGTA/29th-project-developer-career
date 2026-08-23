-- Backend read model: one row per active job and detected skill.
-- Use COUNT(DISTINCT job_id) when counting postings because one posting can
-- have multiple skills.

CREATE OR REPLACE VIEW public.vw_active_job_skill AS
SELECT
    jp.job_id,
    jp.board_id,
    ab.company_name,
    jp.title,
    jp.location,
    jp.published_at,
    jp.first_seen_at,
    jp.last_seen_at,
    h.history_id,
    er.enrichment_id,
    er.job_role_id,
    jr.role_code,
    jr.role_name,
    js.skill_id,
    s.skill_code,
    s.skill_name,
    js.match_type,
    js.matched_text
FROM job_posting AS jp
JOIN ats_board AS ab
  ON ab.board_id = jp.board_id
JOIN job_posting_history AS h
  ON h.job_id = jp.job_id
 AND h.valid_to IS NULL
JOIN LATERAL (
    SELECT candidate.*
    FROM job_enrichment_result AS candidate
    WHERE candidate.history_id = h.history_id
      AND candidate.processing_status = 'success'
      AND candidate.skill_status = 'success'
    ORDER BY
        candidate.processed_at DESC NULLS LAST,
        candidate.enrichment_id DESC
    LIMIT 1
) AS er
  ON TRUE
JOIN job_skill AS js
  ON js.enrichment_id = er.enrichment_id
JOIN skill AS s
  ON s.skill_id = js.skill_id
 AND s.is_active = TRUE
LEFT JOIN job_role AS jr
  ON jr.job_role_id = er.job_role_id
WHERE jp.is_active = TRUE;

COMMENT ON VIEW public.vw_active_job_skill IS
    'One row per active posting and detected skill from the latest successful enrichment.';

-- Monthly demand read model based on the latest successful skill enrichment.
-- Keep partial-month filtering in the consuming query so the view retains
-- the complete observed range.
CREATE OR REPLACE VIEW public.vw_monthly_job_skill AS
SELECT
    DATE_TRUNC('month', jp.published_at)::DATE AS metric_month,
    s.skill_id,
    s.skill_code,
    s.skill_name,
    COUNT(DISTINCT jp.job_id)::INTEGER AS posting_count
FROM job_posting AS jp
JOIN job_posting_history AS h
  ON h.job_id = jp.job_id
 AND h.valid_to IS NULL
JOIN LATERAL (
    SELECT candidate.*
    FROM job_enrichment_result AS candidate
    WHERE candidate.history_id = h.history_id
      AND candidate.processing_status = 'success'
      AND candidate.skill_status = 'success'
    ORDER BY
        candidate.processed_at DESC NULLS LAST,
        candidate.enrichment_id DESC
    LIMIT 1
) AS er
  ON TRUE
JOIN job_skill AS js
  ON js.enrichment_id = er.enrichment_id
JOIN skill AS s
  ON s.skill_id = js.skill_id
WHERE jp.published_at IS NOT NULL
GROUP BY
    DATE_TRUNC('month', jp.published_at)::DATE,
    s.skill_id,
    s.skill_code,
    s.skill_name;

COMMENT ON VIEW public.vw_monthly_job_skill IS
  'Monthly distinct published posting counts by canonical skill, including closed jobs.';

-- ---------------------------------------------------------------------------
-- 이 파일이 만들지 않는, 다른 사람이 소유한 뷰 (참고용 기록)
--
--   vw_skill_adoption_breadth
--     skill_id, skill_code, skill_name,
--     job_count, company_count, sample_company_count,
--     coverage_rate, hhi, effective_company_count
--
--     "이 기술의 수요가 몇 개 회사에 퍼져 있는가"를 재는 뷰다. vw_active_job_skill
--     의 공고 수는 한 회사가 비슷한 공고를 여럿 올려도 그대로 늘어나므로, 건수만
--     보면 회사 하나의 스택이 시장 수요처럼 보인다. hhi(허핀달 지수)와
--     effective_company_count가 그 집중도를 갈라준다 — 40건이 30개 회사에
--     흩어진 것과 한 회사에서 나온 것이 구분된다.
--
--     프론트는 아직 이 뷰를 쓰지 않는다. 지금 지도의 y축(채용 수요)은 공고 건수
--     백분위 하나뿐이다.
-- ---------------------------------------------------------------------------
