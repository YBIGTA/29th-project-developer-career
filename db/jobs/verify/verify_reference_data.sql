SELECT 'job_role' AS table_name, COUNT(*) AS row_count FROM job_role
UNION ALL
SELECT 'skill_category', COUNT(*) FROM skill_category
UNION ALL
SELECT 'skill', COUNT(*) FROM skill
UNION ALL
SELECT 'skill_category_map', COUNT(*) FROM skill_category_map
UNION ALL
SELECT 'skill_alias', COUNT(*) FROM skill_alias
ORDER BY table_name;

SELECT
    COUNT(*) FILTER (WHERE primary_categories = 1) AS skills_with_one_primary_category,
    COUNT(*) FILTER (WHERE primary_categories <> 1) AS invalid_skills
FROM (
    SELECT
        s.skill_id,
        COUNT(m.skill_category_id) FILTER (WHERE m.is_primary) AS primary_categories
    FROM skill s
    LEFT JOIN skill_category_map m USING (skill_id)
    GROUP BY s.skill_id
) AS primary_category_check;

SELECT
    COUNT(*) FILTER (
        WHERE NOT EXISTS (
            SELECT 1 FROM skill_category_map m WHERE m.skill_id = s.skill_id
        )
    ) AS skills_without_categories,
    COUNT(*) FILTER (
        WHERE NOT EXISTS (
            SELECT 1 FROM skill_alias a WHERE a.skill_id = s.skill_id
        )
    ) AS skills_without_aliases
FROM skill s;

SELECT s.skill_name, c.category_code, m.is_primary
FROM skill s
JOIN skill_category_map m USING (skill_id)
JOIN skill_category c USING (skill_category_id)
WHERE s.skill_name = 'gRPC'
ORDER BY m.is_primary DESC, c.category_code;

SELECT s.skill_name, a.alias_text, a.match_policy
FROM skill_alias a
JOIN skill s USING (skill_id)
WHERE a.alias_text IN ('C', 'D', 'Go', 'R')
ORDER BY a.alias_text;
