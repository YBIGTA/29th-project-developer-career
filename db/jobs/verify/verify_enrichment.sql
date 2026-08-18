\echo '=== Enrichment status ==='
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE role_status = 'matched') AS role_matched,
    COUNT(*) FILTER (WHERE role_status = 'unmatched') AS role_unmatched,
    COUNT(*) FILTER (WHERE role_status = 'failed') AS role_failed,
    COUNT(*) FILTER (WHERE skill_status = 'success') AS skill_success,
    COUNT(*) FILTER (WHERE skill_status = 'failed') AS skill_failed,
    COUNT(*) FILTER (WHERE processing_status = 'success') AS complete
FROM job_enrichment_result
WHERE role_model_version = 'job-role-svc-v1'
  AND skill_extractor_version = 'tech-dictionary-v1';

\echo '=== Remaining enrichment targets ==='
SELECT COUNT(*) AS remaining_enrichment_targets
FROM job_posting_history h
WHERE NOT EXISTS (
    SELECT 1
    FROM job_enrichment_result e
    WHERE e.history_id = h.history_id
      AND e.role_model_version = 'job-role-svc-v1'
      AND e.skill_extractor_version = 'tech-dictionary-v1'
      AND e.role_status IN ('matched', 'unmatched')
      AND e.skill_status = 'success'
      AND e.processing_status = 'success'
);

\echo '=== Role distribution ==='
SELECT r.role_name, COUNT(*) AS posting_versions
FROM job_enrichment_result e
JOIN job_role r USING (job_role_id)
GROUP BY r.role_name
ORDER BY posting_versions DESC, r.role_name;

\echo '=== Skill output ==='
SELECT
    COUNT(*) AS job_skill_rows,
    COUNT(DISTINCT enrichment_id) AS posting_versions_with_skills
FROM job_skill;

\echo '=== Successful postings with zero detected skills ==='
SELECT COUNT(*) AS posting_versions_without_skills
FROM job_enrichment_result e
WHERE e.skill_extractor_version = 'tech-dictionary-v1'
  AND e.skill_status = 'success'
  AND NOT EXISTS (
      SELECT 1
      FROM job_skill js
      WHERE js.enrichment_id = e.enrichment_id
  );

\echo '=== Top detected skills ==='
SELECT s.skill_name, COUNT(*) AS posting_versions
FROM job_skill js
JOIN skill s USING (skill_id)
GROUP BY s.skill_name
ORDER BY posting_versions DESC, s.skill_name
LIMIT 25;
