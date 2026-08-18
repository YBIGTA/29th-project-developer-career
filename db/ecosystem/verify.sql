-- A successful run must have one successful row per active skill in both sources.
SELECT
    r.run_id,
    r.status,
    r.target_skills,
    r.success_skills,
    COUNT(g.skill_id) FILTER (WHERE g.status = 'success') AS github_success_rows,
    COUNT(so.skill_id) FILTER (WHERE so.status = 'success') AS stackoverflow_success_rows
FROM ecosystem_run r
LEFT JOIN github_skill_counts g ON g.run_id = r.run_id
LEFT JOIN stackoverflow_skill_counts so
  ON so.run_id = r.run_id AND so.skill_id = g.skill_id
GROUP BY r.run_id
ORDER BY r.started_at DESC;

SELECT *
FROM public.vw_latest_ecosystem_skill
ORDER BY ecosystem_score DESC, skill_name;
