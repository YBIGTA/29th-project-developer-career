-- 군집 분석 결과. 노트북(experiment/)을 수동으로 돌려 적재하며, 자동 갱신되지
-- 않는다. as_of_date 한 벌이 한 번의 분석 실행이다.
--
-- 주의 — 이 파일은 **적재기가 아니라 참고용 정의**다. 실제 테이블은 노트북이
-- 만들어 넣었고, 이 DDL은 (1) ERD와 (2) app/api/routes.py의 CLUSTER_SQL이 읽는
-- 컬럼에서 되짚어 적은 것이다. 컬럼 이름과 대략의 타입은 맞지만 NOT NULL·CHECK
-- 같은 제약은 원본에 없을 수 있으므로, 빈 DB에 그대로 적용하지 말고 노트북이
-- 내는 형태를 먼저 확인할 것.
--
-- db/jobs/schema.sql을 먼저 적용해야 한다. 세 테이블 모두 skill을 참조한다.

-- 기술 하나가 그 분석에서 어느 군집에 어떻게 속했는지. 상세 화면의
-- /api/v1/tech/{skill_code}/cluster 가 이 테이블을 본다.
CREATE TABLE IF NOT EXISTS total_skill_cluster (
    as_of_date DATE NOT NULL,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,

    -- 이 기술이 등장한 공고/회사 규모. 군집 대상 자격의 근거가 된다.
    job_count INTEGER,
    company_count INTEGER,
    eligible_for_clustering BOOLEAN,

    -- 전체(군집 무관) 기준 가장 가까운 기술들.
    -- 이웃은 "React (score=0.412, companies=7), Vue (score=...)" 한 덩어리
    -- 문자열이다. 항목 안에도 쉼표가 있어 ", " 단순 분리로는 깨지므로,
    -- routes.py의 NEIGHBOR_RE가 정규식으로 파싱한다.
    global_strongest_neighbors TEXT,
    global_top_similarity NUMERIC,
    global_top_pair_companies INTEGER,
    global_top_company_share NUMERIC,

    -- 배정된 군집과, 그 안에서 얼마나 중심적인가.
    cluster_id INTEGER,
    distance_to_centroid NUMERIC,
    distance_percentile_in_cluster NUMERIC,
    distance_iqr_fence NUMERIC,
    distance_robust_z NUMERIC,
    centroid_margin_ratio NUMERIC,
    membership_stability NUMERIC,
    membership_quality TEXT,
    cluster_coherence NUMERIC,

    -- 같은 군집 안에서 가장 가까운 기술들. 형식은 global_* 과 같다.
    same_cluster_strongest_neighbors TEXT,
    same_cluster_top_similarity NUMERIC,
    same_cluster_top_pair_companies INTEGER,
    same_cluster_top_company_share NUMERIC,

    -- 2차원으로 눌러 놓은 좌표. 아직 어디서도 읽지 않는다.
    embedding_x NUMERIC,
    embedding_y NUMERIC,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (as_of_date, skill_id)
);

-- 군집 하나의 요약. total_skill_cluster를 cluster_id로 접은 것이다.
CREATE TABLE IF NOT EXISTS skill_cluster_snapshot (
    as_of_date DATE NOT NULL,
    cluster_id INTEGER NOT NULL,
    skill_count INTEGER,
    -- 중심/경계/이상치로 나눈 소속 분포. 합이 skill_count다.
    core_count INTEGER,
    boundary_count INTEGER,
    outlier_count INTEGER,
    mean_coherence NUMERIC,
    -- 이 군집 기술을 가장 많이 요구한 회사와 그 비중.
    dominant_company TEXT,
    top_company_share NUMERIC,
    PRIMARY KEY (as_of_date, cluster_id)
);

-- 선점 후보 판정의 근거 등급. evidence_label은 "선점 가치가 있다/없다"가
-- 아니라 "산업적 연결을 설명할 근거가 있는가"에 대한 답이다
-- (supporting_evidence / weak_evidence / insufficient_evidence — 화면 문구는
-- app/api/routes.py 옆의 EVIDENCE_LABELS 참고). membership_quality와는 다른
-- 축이라 UI에서 섞으면 안 된다 — core_member인데 weak_evidence인 경우가 있다.
CREATE TABLE IF NOT EXISTS candidate_skill_evidence (
    as_of_date DATE NOT NULL,
    skill_id BIGINT NOT NULL REFERENCES skill(skill_id) ON DELETE RESTRICT,
    evidence_label TEXT,
    job_count INTEGER,
    company_count INTEGER,
    cluster_id INTEGER,
    membership_quality TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (as_of_date, skill_id)
);

COMMENT ON TABLE total_skill_cluster IS
    'Per-skill clustering result for one manual notebook run (as_of_date).';
COMMENT ON TABLE skill_cluster_snapshot IS
    'Per-cluster summary for the same run.';
COMMENT ON TABLE candidate_skill_evidence IS
    'Evidence grade behind the early-mover call. Not the same axis as membership_quality.';
