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
