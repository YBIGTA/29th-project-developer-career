-- 학습 자료와 원본 일별 집계. 팀원이 CSV를 그대로 올린 테이블들이라,
-- 정규화된 skill_id가 아니라 **기술명 문자열 skill을 키로 쓴다.**
--
-- 주의 — 이 파일은 적재기가 아니라 참고용 정의다. 실제 테이블은 CSV 임포트로
-- 만들어졌고, 이 DDL은 2026-08-24에 ERD와 대조해 컬럼명·타입·NOT NULL을 옮긴
-- 것이다. 인덱스와 제약은 원본에 없을 수 있다.
--
-- skill 문자열이 skill.skill_name과 정확히 같아야 API가 붙일 수 있다.
-- app/api/routes.py의 DOCS_SQL / VIDEOS_SQL이 skill 테이블에 조인해서, 이름이
-- 맞는 행만 통과시킨다 — 어긋난 행은 조용히 빠진다.

-- 기술별 공식 문서 1건. note는 15건 정도에만 있고 화면에서는 툴팁으로만 쓴다.
CREATE TABLE IF NOT EXISTS tech_official_docs (
    id BIGSERIAL PRIMARY KEY,
    skill TEXT NOT NULL,
    official_docs_url TEXT NOT NULL,
    note TEXT
);

-- 기술별 입문 영상. rank가 추천 순위이고(1이 첫 카드) 화면은 3장만 그린다.
--
-- thumbnail_url은 API가 내보내지 않는다. 전부
-- https://i.ytimg.com/vi/{video_id}/hqdefault.jpg 규칙을 따르므로 화면이
-- video_id로 만든다 — 저장된 주소를 그대로 쓰면 만료된 것이 섞인다.
--
-- score / source_query / language / level 은 영상을 고른 근거이고 화면에는
-- 나가지 않는다.
CREATE TABLE IF NOT EXISTS youtube_skill_videos (
    id BIGSERIAL PRIMARY KEY,
    skill TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_title TEXT,
    published_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    view_count BIGINT,
    like_count BIGINT,
    thumbnail_url TEXT,
    language TEXT,
    level TEXT,
    score NUMERIC,
    source_query TEXT,
    rank INTEGER,
    url TEXT
);

-- Stack Overflow 일별 질문 수 원본. ecosystem_monthly_stackoverflow_metrics가
-- 이것을 월로 접은 것에 해당한다. API는 아직 이 테이블을 직접 읽지 않는다 —
-- 추이(build_trends)는 월별 테이블 쪽을 본다.
CREATE TABLE IF NOT EXISTS stackoverflow_daily_all (
    id BIGSERIAL PRIMARY KEY,
    skill TEXT NOT NULL,
    stackoverflow_tag TEXT NOT NULL,
    tag_source TEXT,
    date DATE NOT NULL,
    question_count INTEGER NOT NULL,
    note TEXT
);
