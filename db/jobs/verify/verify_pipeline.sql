SELECT ats_source, COUNT(*) AS enabled_boards
FROM ats_board
WHERE is_enabled = TRUE
GROUP BY ats_source
ORDER BY ats_source;

SELECT run_id, status, target_boards, success_boards, failed_boards,
       total_jobs, started_at, finished_at
FROM collection_run
ORDER BY started_at DESC
LIMIT 5;

SELECT b.ats_source, s.status, COUNT(*) AS boards, SUM(s.job_count) AS jobs
FROM collection_board_status s
JOIN ats_board b USING (board_id)
WHERE s.run_id = (SELECT run_id FROM collection_run ORDER BY started_at DESC LIMIT 1)
GROUP BY b.ats_source, s.status
ORDER BY b.ats_source, s.status;

SELECT COUNT(*) AS current_rows,
       COUNT(*) FILTER (WHERE is_active) AS active_rows,
       COUNT(*) FILTER (WHERE NOT is_active) AS closed_rows
FROM job_posting;

SELECT COUNT(*) AS history_rows,
       COUNT(*) FILTER (WHERE valid_to IS NULL) AS open_versions
FROM job_posting_history;

