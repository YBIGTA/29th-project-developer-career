import re
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.schemas import (
    ClusterResponse,
    GapMapResponse,
    PostingsResponse,
    SkillsResponse,
    TimeSeriesDailyResponse,
    TimeSeriesResponse,
)
from app.db.database import get_db

router = APIRouter(prefix="/api/v1")

MAP_LIMIT = 60

SKILLS_SQL = text("""
    WITH posting_counts AS (
        SELECT skill_id, count(DISTINCT job_id)::int AS postings
        FROM vw_active_job_skill
        GROUP BY skill_id
    ), aliases AS (
        SELECT skill_id, array_agg(alias_text ORDER BY alias_text) AS aliases
        FROM skill_alias
        WHERE is_active = true
        GROUP BY skill_id
    )
    SELECT s.skill_id, s.skill_code, s.skill_name,
           coalesce(sc.category_name, '기타') AS category,
           coalesce(pc.postings, 0) AS postings,
           coalesce(a.aliases, ARRAY[]::text[]) AS aliases
    FROM skill s
    LEFT JOIN skill_category_map scm
      ON scm.skill_id = s.skill_id AND scm.is_primary = true
    LEFT JOIN skill_category sc ON sc.skill_category_id = scm.skill_category_id
    LEFT JOIN posting_counts pc ON pc.skill_id = s.skill_id
    LEFT JOIN aliases a ON a.skill_id = s.skill_id
    WHERE s.is_active = true
    ORDER BY s.skill_name
""")

ROLE_COUNTS_SQL = text("""
    SELECT skill_id, role_name, count(DISTINCT job_id)::int AS postings
    FROM vw_active_job_skill
    WHERE role_name IS NOT NULL
    GROUP BY skill_id, role_name
""")

ECOSYSTEM_SQL = text("""
    SELECT skill_id, skill_name,
           github_repository_count,
           github_activity_count_180d,
           stackoverflow_question_count_180d,
           github_repository_score,
           github_activity_score,
           stackoverflow_score,
           ecosystem_score
    FROM vw_latest_ecosystem_skill
""")

PERIOD_SQL = text("""
    SELECT min(published_at)::date AS from_date, max(published_at)::date AS to_date,
           count(DISTINCT job_id)::int AS total_postings
    FROM vw_active_job_skill
""")

POSTINGS_SQL = text("""
    SELECT DISTINCT ON (v.job_id)
           v.company_name AS company,
           v.title,
           v.location,
           jp.employment_type AS "employmentType",
           v.published_at AS "publishedAt",
           jp.apply_url AS "applyUrl"
    FROM vw_active_job_skill v
    JOIN job_posting jp ON jp.job_id = v.job_id
    WHERE v.skill_code = :skill_code
    ORDER BY v.job_id, v.published_at DESC NULLS LAST
    LIMIT :limit
""")

CLUSTER_SQL = text("""
    WITH latest AS (SELECT max(as_of_date) AS as_of_date FROM total_skill_cluster)
    SELECT t.as_of_date,
           t.cluster_id, t.membership_quality, t.eligible_for_clustering,
           t.job_count, t.company_count,
           t.cluster_coherence, t.membership_stability, t.centroid_margin_ratio,
           t.same_cluster_top_company_share,
           t.same_cluster_strongest_neighbors, t.global_strongest_neighbors,
           snap.skill_count, snap.dominant_company, snap.top_company_share,
           ev.evidence_label
    FROM latest
    JOIN total_skill_cluster t ON t.as_of_date = latest.as_of_date
    JOIN skill s ON s.skill_id = t.skill_id
    LEFT JOIN skill_cluster_snapshot snap
      ON snap.as_of_date = t.as_of_date AND snap.cluster_id = t.cluster_id
    LEFT JOIN candidate_skill_evidence ev
      ON ev.as_of_date = t.as_of_date AND ev.skill_id = t.skill_id
    WHERE s.skill_code = :skill_code
""")

# 선점 후보 판정에 쓰는 두 근거. 둘 다 지도의 "선점 후보" 사분면에서만 쓰인다.
#
# vw_skill_adoption_breadth는 이 저장소가 만들지 않는 뷰다(db/jobs/views.sql 주석).
# 한 회사가 비슷한 공고를 여럿 올리면 공고 건수만으로는 시장 수요처럼 보이는데,
# 그 착시를 company_count와 effective_company_count(=1/HHI)가 갈라준다.
ADOPTION_BREADTH_SQL = text("""
    SELECT skill_id, company_count, sample_company_count,
           coverage_rate, hhi, effective_company_count
    FROM vw_skill_adoption_breadth
""")

# 군집 분석이 붙인 근거 등급. as_of_date 한 벌이 한 번의 수동 실행이라
# 가장 최근 것만 본다 (CLUSTER_SQL과 같은 규칙).
EVIDENCE_SQL = text("""
    WITH latest AS (SELECT max(as_of_date) AS as_of_date FROM candidate_skill_evidence)
    SELECT ev.skill_id, ev.evidence_label
    FROM latest
    JOIN candidate_skill_evidence ev ON ev.as_of_date = latest.as_of_date
""")

NEIGHBOR_RE = re.compile(r"(.+?) \(score=([\d.]+), companies=(\d+)\)(?:, |$)")


def neighbors(blob: str | None) -> list[dict]:
    return [
        {"tech": tech, "score": float(score), "companies": int(companies)}
        for tech, score, companies in NEIGHBOR_RE.findall(blob or "")
    ]


# 함께 요구되는 기술. 손으로 27개만 채워져 있던 값을 군집 분석으로 대체한다.
#
# 군집 결과는 as_of_date 한 벌이 한 번의 수동 실행이라, 항상 가장 최근 것만
# 본다. cluster_id가 없는 기술(군집 대상 미달)은 애초에 이웃이 없다.
CLUSTER_STACK_SQL = text("""
    WITH latest AS (SELECT max(as_of_date) AS as_of_date FROM total_skill_cluster)
    SELECT s.skill_name, t.same_cluster_strongest_neighbors
    FROM latest
    JOIN total_skill_cluster t ON t.as_of_date = latest.as_of_date
    JOIN skill s ON s.skill_id = t.skill_id AND s.is_active = true
    WHERE t.cluster_id IS NOT NULL
""")

STACK_LIMIT = 5


def build_stacks(db: Session, known: set[str]) -> dict[str, list[str]]:
    """기술별 "함께 요구되는 기술".

    same_cluster_strongest_neighbors는 같은 군집 안에서 유사도가 높은 순으로
    이미 정렬돼 있다. 군집 전체를 그냥 나열하지 않는 이유: 그러면 같은 군집에
    속한 기술들이 전부 똑같은 목록을 보여주게 된다. 이 컬럼은 기술마다 다르다.

    `known`으로 한 번 거른다. 이웃 이름은 노트북이 찍어둔 문자열이라 그 뒤로
    이름이 바뀌었거나 비활성화된 기술이 섞일 수 있는데, 화면에서 이 값은
    누르면 검색이 걸리는 칩이라 결과가 0건이 되면 막다른 길이 된다.
    """
    stacks: dict[str, list[str]] = {}
    for row in db.execute(CLUSTER_STACK_SQL).mappings():
        names = [
            neighbor["tech"]
            for neighbor in neighbors(row["same_cluster_strongest_neighbors"])
            if neighbor["tech"] in known and neighbor["tech"] != row["skill_name"]
        ]
        if names:
            stacks[row["skill_name"]] = names[:STACK_LIMIT]
    return stacks


TIMESERIES_SQL = text("""
        SELECT
                j.metric_month AS month,
                s.skill_code AS "skillCode",
                s.skill_name AS "skillName",
                j.posting_count AS "postingCount",
                COALESCE(g.issue_count, 0)::INTEGER AS "githubIssueCount",
                COALESCE(g.pull_request_count, 0)::INTEGER AS "githubPullRequestCount",
                COALESCE(so.question_count, 0)::INTEGER AS "stackoverflowQuestionCount"
        FROM vw_monthly_job_skill AS j
        JOIN skill AS s
            ON s.skill_id = j.skill_id
        LEFT JOIN ecosystem_monthly_github_metrics AS g
            ON g.metric_month = j.metric_month
         AND g.skill_id = j.skill_id
         AND g.is_partial_period = FALSE
        LEFT JOIN ecosystem_monthly_stackoverflow_metrics AS so
            ON so.metric_month = j.metric_month
         AND so.skill_id = j.skill_id
         AND so.is_partial_period = FALSE
        WHERE j.metric_month >= :from_month
            AND j.metric_month < :to_month
        ORDER BY j.metric_month, s.skill_name
""")

# 일별 Stack Overflow 활동.
#
# 원본은 stackoverflow_daily_all이다. 이름이 ecosystem_* 규칙을 따르지 않는데,
# 팀원이 수집 CSV를 그대로 올린 테이블이라 그렇다. 정규화된 skill_id가 아니라
# **기술명 문자열 skill로 조인한다** — 학습 자료 테이블들과 같은 사정이다
# (DOCS_SQL 주석 참고). 200개 기술 x 180일이 빠짐없이 들어 있다.
#
# GitHub 쪽 일별 테이블은 없고, 쓰지 않는다. 이 엔드포인트는 SO 하나만 본다.
TIMESERIES_DAILY_SQL = text("""
    WITH so AS (
        SELECT
            d.date AS metric_date,
            d.skill,
            d.question_count,
            AVG(d.question_count) OVER (
                PARTITION BY d.skill ORDER BY d.date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) AS rolling_avg_30d,
            SUM(d.question_count) OVER (
                PARTITION BY d.skill ORDER BY d.date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) AS skill_rolling_sum_30d
        FROM stackoverflow_daily_all d
        WHERE d.date >= :from_date AND d.date < :to_date
    ), totals AS (
        -- 분모는 **수집된 200개 전부**의 합이다. skill 테이블과 조인하기 전에
        -- 낸다 — 이름이 맞지 않는 32개(Deno, ESLint 등)를 여기서 떨구면
        -- 분모가 작아져 나머지 기술의 비중이 전부 부풀려진다.
        SELECT date AS metric_date, SUM(question_count) AS total_count
        FROM stackoverflow_daily_all
        WHERE date >= :from_date AND date < :to_date
        GROUP BY date
    ), totals_rolling AS (
        SELECT
            metric_date,
            SUM(total_count) OVER (
                ORDER BY metric_date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) AS total_rolling_sum_30d
        FROM totals
    ), shared AS (
        SELECT
            so.metric_date,
            so.skill,
            so.question_count,
            so.rolling_avg_30d,
            CASE WHEN tr.total_rolling_sum_30d > 0
                 THEN so.skill_rolling_sum_30d::NUMERIC / tr.total_rolling_sum_30d
                 ELSE 0
            END AS share
        FROM so
        JOIN totals_rolling tr ON tr.metric_date = so.metric_date
    ), baseline AS (
        SELECT skill, AVG(share) AS avg_share
        FROM shared
        GROUP BY skill
    )
    SELECT
        shared.metric_date AS date,
        s.skill_code AS "skillCode",
        s.skill_name AS "skillName",
        shared.question_count AS "stackoverflowQuestionCount",
        ROUND(shared.rolling_avg_30d::NUMERIC, 3) AS "stackoverflowRollingAvg30d",
        CASE WHEN baseline.avg_share > 0
             THEN ROUND((shared.share / baseline.avg_share * 100)::NUMERIC, 2)
             ELSE NULL
        END AS "stackoverflowIndex",
        (baseline.avg_share > 0) AS "hasIndexBaseline"
    FROM shared
    JOIN baseline ON baseline.skill = shared.skill
    -- 이름이 정확히 맞는 기술만 통과시킨다. 200개 중 168개다. 나머지는 위에서
    -- 분모에는 들어갔지만 응답에는 실리지 않는다 — 어느 기술인지 모르는 행을
    -- 내보내면 화면이 붙일 데가 없다.
    JOIN skill s ON s.skill_name = shared.skill AND s.is_active = TRUE
    -- 기술 하나만 걸러 내보낼 수 있다. **걸러내기는 여기, 맨 마지막에서만
    -- 한다** — 위의 totals/totals_rolling은 전체 기술 합계라 분모이고,
    -- baseline은 그 기술의 조회 구간 평균 비중이다. 어느 쪽이든 앞단에서
    -- 걸러내면 비중이 1.0이 되어 지수가 통째로 무의미해진다.
    --
    -- 형 없는 파라미터를 IS NULL에 바로 쓰면 Postgres가 "could not determine
    -- data type of parameter"로 거절하므로 캐스팅이 필요하다.
    --
    -- **postfix 캐스트가 아니라 CAST()로 쓴다.** 콜론 두 개를 붙여 쓰면
    -- SQLAlchemy의 text()가 파라미터 이름을 한 글자 짧게 끊는다 — 콜론 표기와
    -- PostgreSQL 캐스트가 충돌해서다. 값이 안 채워진 콜론이 날것으로 넘어가
    -- "syntax error at or near" 로 쿼리 전체가 죽는다. skill을 주든 말든 항상.
    --
    -- 이 주석에 콜론+이름 형태를 예시로 적지 말 것. text()는 주석 안까지
    -- 훑어서 그것도 바인드 파라미터로 잡는다.
    WHERE (CAST(:skill_code AS TEXT) IS NULL OR s.skill_code = :skill_code)
    ORDER BY shared.metric_date, s.skill_name
""")


# 월별 생태계 활동. is_partial_period=TRUE인 달(집계가 진행 중인 이번 달)은
# 통째로 뺀다 — 21일치가 31일치와 비교되어 거의 모든 기술이 거짓 하락으로
# 보인다. scripts/build_tech_extras.py가 CSV로 하던 판정과 같은 조건이다.
TREND_SQL = text("""
    SELECT s.skill_code,
           m.metric_month,
           coalesce(g.issue_count, 0) + coalesce(g.pull_request_count, 0) AS github,
           so.question_count AS stackoverflow
    FROM (
        SELECT metric_month FROM ecosystem_monthly_github_metrics
        WHERE is_partial_period = FALSE
        GROUP BY metric_month
    ) m
    JOIN skill s ON s.is_active = true
    LEFT JOIN ecosystem_monthly_github_metrics g
      ON g.metric_month = m.metric_month AND g.skill_id = s.skill_id
     AND g.is_partial_period = FALSE
    LEFT JOIN ecosystem_monthly_stackoverflow_metrics so
      ON so.metric_month = m.metric_month AND so.skill_id = s.skill_id
     AND so.is_partial_period = FALSE
    WHERE g.skill_id IS NOT NULL OR so.skill_id IS NOT NULL
    ORDER BY m.metric_month
""")


def build_trends(db: Session) -> dict[str, dict]:
    """기술별 생태계 활동 추이. 상세 패널의 스파크라인이 이 값을 그린다.

    **원시 건수를 그대로 내리면 안 된다.** 8개월 동안 전체 합계가 GitHub는
    +162%, Stack Overflow는 -69%로 움직인다. 그대로 그리면 GitHub는 거의 다
    상승, SO는 거의 다 하락하는, 개별 기술과 무관한 플랫폼 추세만 보인다.
    두 계열을 더해도 자릿수가 1000배 차이라 사실상 GitHub 값이 된다.

    그래서 각 달의 **점유율**(그 달 전체 합계 대비 비중)로 바꾼다. 분모가 함께
    움직이므로 플랫폼 전체의 성장·축소가 상쇄되고 "다른 기술 대비 이 기술이
    뜨는가"만 남는다. 두 계열 모두 합이 1인 비중이라 서로 더할 수 있다.

        비중(m) = ( gh(m)/gh_합계(m) + so(m)/so_합계(m) ) / 2   <- SO가 없으면 gh 항만
        지수(m) = 비중(m) / 비중(첫 달) * 100

    정의는 scripts/build_tech_extras.py와 같다. 그 스크립트는 CSV에서 만든
    frontend/lib/techExtras.json을 프론트가 들고 있었고, 이제 여기가 대신한다.
    """
    rows = [dict(row) for row in db.execute(TREND_SQL).mappings()]
    if not rows:
        return {}

    months = sorted({row["metric_month"] for row in rows})
    gh_total = defaultdict(int)
    so_total = defaultdict(int)
    for row in rows:
        gh_total[row["metric_month"]] += row["github"] or 0
        so_total[row["metric_month"]] += row["stackoverflow"] or 0

    by_skill: dict[str, dict] = defaultdict(dict)
    for row in rows:
        by_skill[row["skill_code"]][row["metric_month"]] = row

    trends: dict[str, dict] = {}
    for skill_code, per_month in by_skill.items():
        github = [(per_month.get(m) or {}).get("github") or 0 for m in months]
        so_values = [(per_month.get(m) or {}).get("stackoverflow") for m in months]
        # SO 태그가 없는 기술은 질문 수가 통째로 비어 온다. 0으로 채워 비중을
        # 계산하면 GitHub 항만 있는 것과 결과가 달라지므로(0.5배로 눌린다)
        # 계열 자체를 빼고 GitHub 한 항만으로 평균을 낸다.
        has_so = any(value is not None for value in so_values)
        stackoverflow = [value or 0 for value in so_values] if has_so else None

        shares = []
        for i, month in enumerate(months):
            parts = []
            if gh_total[month]:
                parts.append(github[i] / gh_total[month])
            if has_so and so_total[month]:
                parts.append(stackoverflow[i] / so_total[month])
            shares.append(sum(parts) / len(parts) if parts else 0.0)

        base = shares[0]
        if not base:
            continue
        index = [round(share / base * 100, 1) for share in shares]

        delta = None
        if len(index) >= 2 and index[-2]:
            delta = {
                "pct": round((index[-1] / index[-2] - 1) * 100, 1),
                "value": index[-1],
                "prevValue": index[-2],
                "month": str(months[-1])[:7],
                "prevMonth": str(months[-2])[:7],
            }

        trends[skill_code] = {
            "months": [str(month)[:7] for month in months],
            "index": index,
            "github": github,
            "stackoverflow": stackoverflow,
            "hasStackoverflow": has_so,
            "delta": delta,
        }
    return trends


# 학습 자료 — 공식 문서 1개 + 유튜브 영상 3개.
#
# 두 테이블 모두 팀원이 원본 CSV를 그대로 올린 것이라, 정규화된 skill_id가
# 아니라 **기술명 문자열 skill로 조인한다**. skill 테이블에 붙여 이름이 정확히
# 맞는 행만 통과시킨다 — 이름이 어긋난 행을 그냥 내보내면 프론트가 어느 기술의
# 자료인지 붙일 수 없다.
DOCS_SQL = text("""
    SELECT s.skill_name, d.official_docs_url AS url, NULLIF(BTRIM(d.note), '') AS note
    FROM tech_official_docs d
    JOIN skill s ON s.skill_name = d.skill AND s.is_active = true
    WHERE NULLIF(BTRIM(d.official_docs_url), '') IS NOT NULL
""")

# rank가 추천 순위다(1이 첫 카드). 화면은 3장만 그리므로 여기서 잘라 보낸다.
VIDEOS_SQL = text("""
    SELECT s.skill_name, v.video_id, v.title, v.channel_title, v.view_count, v.duration_seconds
    FROM youtube_skill_videos v
    JOIN skill s ON s.skill_name = v.skill AND s.is_active = true
    WHERE v.rank IS NOT NULL AND v.rank <= :per_tech
      AND NULLIF(BTRIM(v.video_id), '') IS NOT NULL
    ORDER BY s.skill_name, v.rank
""")

VIDEOS_PER_TECH = 3


def build_docs(db: Session) -> dict[str, dict]:
    """기술별 공식 문서. note는 있는 기술에만 붙는다(툴팁으로만 쓰인다)."""
    docs = {}
    for row in db.execute(DOCS_SQL).mappings():
        entry = {"url": row["url"].strip()}
        if row["note"]:
            entry["note"] = row["note"]
        docs[row["skill_name"]] = entry
    return docs


def build_videos(db: Session) -> dict[str, list[dict]]:
    """기술별 입문 영상 3편.

    썸네일 주소는 싣지 않는다. 200건 전부
    https://i.ytimg.com/vi/{video_id}/hqdefault.jpg 규칙을 따르므로 화면이
    id로 만든다 — 원본 thumbnail_url을 그대로 내보내면 만료된 주소가 섞인다.
    """
    videos: dict[str, list[dict]] = defaultdict(list)
    for row in db.execute(VIDEOS_SQL, {"per_tech": VIDEOS_PER_TECH}).mappings():
        videos[row["skill_name"]].append({
            "id": row["video_id"].strip(),
            "title": row["title"],
            "channel": row["channel_title"],
            "views": row["view_count"],
            "seconds": row["duration_seconds"],
        })
    return dict(videos)


def percentile(values: list[int]) -> dict[int, float]:
    if len(values) < 2:
        return {value: 100.0 for value in values}
    ordered = sorted(values)
    return {
        value: round(100 * sum(other < value for other in ordered) / (len(ordered) - 1), 1)
        for value in set(values)
    }


def rank(values: list[int]) -> dict[int, int]:
    result: dict[int, int] = {}
    seen = 0
    for value in sorted(set(values), reverse=True):
        result[value] = seen + 1
        seen += values.count(value)
    return result


def quadrant(demand: float, ecosystem: float) -> str:
    if demand >= 50:
        return "필수" if ecosystem >= 50 else "희소가치"
    return "선점 후보" if ecosystem >= 50 else "저관심"


# ---------------------------------------------------------------------------
# 선점 후보 사분면의 줄 세우기
#
# 이 사분면(수요 낮음 · 생태계 높음)은 지금까지 다른 사분면과 똑같이 수요
# 내림차순으로만 뽑았다. 그러면 사분면 경계(수요 50)에 가장 가까운 기술이
# 위로 올라와, 실측 200개 기준으로 PHP·Perl·.NET·Angular가 "선점 후보"로
# 찍힌다 — 셋 다 생태계 비중이 오히려 줄고 있다. 선점과는 반대 방향이다.
#
# 그래서 이 사분면만 세 가지 근거로 다시 줄을 세운다.
#
#   a. 생태계 비중이 오르는가   trend.index 양끝 3개월 평균 비교
#   b. 산업 스택에 편입됐는가   candidate_skill_evidence.evidence_label
#   c. 여러 회사로 퍼졌는가     vw_skill_adoption_breadth
#
# 셋의 역할이 다르다.
#   c는 게이트다 — 한 회사 전용 기술은 "근거가 약한 후보"가 아니라 후보가 아니다.
#   a는 방향이 게이트고(하락 중이면 탈락) 크기가 점수다.
#   b는 게이트가 아니라 가중치다 — insufficient_evidence는 반증이 아니라 근거
#   부족이라, 게이트로 쓰면 신생 기술이 구조적으로 탈락한다. 정작 찾으려는 게
#   신생 기술인데.
#
# **게이트 탈락은 제외가 아니라 -1점이다.** 지도는 사분면당 N개를 뽑으므로
# (frontend/lib/mapPoints.js) 여기서 행을 지우면 그 사분면이 덜 차고 남은 몫이
# 다른 사분면으로 넘어가 판이 기운다. 뒤로 밀면 칸은 채우되 순서는 근거대로다.
# 화면은 점수가 아니라 adoption.spread / evidenceLabel 배지로 이 차이를 보여준다.
# ---------------------------------------------------------------------------

GATE_FAIL_SCORE = -1.0

# c 게이트. 표본이 30개사라 3곳은 10%다.
MIN_COMPANY_COUNT = 3
MIN_EFFECTIVE_COMPANIES = 2.0
# "확산형" 배지 기준. 표본의 20%(30개사면 6곳) 이상에서, 실질 4개사 이상으로.
WIDE_COVERAGE_RATIO = 0.2
WIDE_EFFECTIVE_COMPANIES = 4.0

EVIDENCE_WEIGHT = {"supporting_evidence": 1.0, "weak_evidence": 0.8}
UNGRADED_EVIDENCE_WEIGHT = 0.6


def num(value) -> float | None:
    """NUMERIC 컬럼은 Decimal로 온다. JSON에 그대로 실을 수 없다."""
    return None if value is None else float(value)


def trend_growth(trend: dict | None) -> float | None:
    """생태계 비중 지수의 최근 구간 대비 초기 구간 증가율.

    trend["delta"](직전 달 대비)로 판정하면 안 된다 — 지금 시계열이 8개월치라
    마지막 달 하나만 튀어도 상승/하락이 뒤집힌다. 양끝 3개월씩의 평균으로 본다.
    구간이 짧으면 겹치지 않게 줄인다.
    """
    index = (trend or {}).get("index") or []
    if len(index) < 2:
        return None
    window = min(3, len(index) // 2)
    head = sum(index[:window]) / window
    if not head:
        return None
    return sum(index[-window:]) / window / head - 1


def spread_label(breadth: dict | None) -> str | None:
    """c축을 화면 문구로 옮긴다. HHI를 숫자 그대로 보여주지 않기 위한 3분류.

    coverage_rate 컬럼이 아니라 정수 두 개로 판정한다 — 저 컬럼이 0~1인지
    0~100인지 뷰 소유자 쪽 정의를 아직 확인하지 못했다(db/jobs/views.sql 주석).
    company_count / sample_company_count는 단위가 모호할 수 없다.
    """
    if not breadth:
        return None
    companies = breadth["company_count"] or 0
    sample = breadth["sample_company_count"] or 0
    effective = num(breadth["effective_company_count"]) or 0.0
    if (
        sample
        and companies >= WIDE_COVERAGE_RATIO * sample
        and effective >= WIDE_EFFECTIVE_COMPANIES
    ):
        return "확산형"
    if companies >= MIN_COMPANY_COUNT and effective >= MIN_EFFECTIVE_COMPANIES:
        return "집중형"
    return "단일기업"


def early_mover_scores(items: list[dict]) -> dict[str, float]:
    """선점 후보 사분면 안에서만 매기는 0~100 점수. skillCode -> score.

    백분위를 이 사분면 안에서 다시 매기는 게 핵심이다. 200개 전체 기준으로
    매기면 이 사분면은 정의상 수요 하위 절반이라 값이 전부 아래에 눌려 순위가
    갈리지 않는다.
    """
    pool = [item for item in items if item["quadrant"] == "선점 후보"]
    if not pool:
        return {}

    growths = {item["skillCode"]: trend_growth(item.get("trend")) for item in pool}
    effectives = {
        item["skillCode"]: (item.get("adoption") or {}).get("effectiveCompanyCount")
        for item in pool
    }
    growth_pct = percentile([value for value in growths.values() if value is not None])
    effective_pct = percentile([value for value in effectives.values() if value is not None])

    scores = {}
    for item in pool:
        code = item["skillCode"]
        growth = growths[code]
        spread = (item.get("adoption") or {}).get("spread")
        # 확산 근거가 없거나(c), 생태계 비중이 줄고 있으면(a) 뒤로 보낸다.
        # breadth 행 자체가 없는 기술도 여기 걸린다 — 확산을 확인하지 못한 것과
        # 확산되지 않은 것을 구분할 방법이 없으니 후보로 올리지 않는다.
        if spread in (None, "단일기업") or growth is None or growth <= 0:
            scores[code] = GATE_FAIL_SCORE
            continue
        base = (growth_pct[growth] + effective_pct.get(effectives[code], 0.0)) / 2
        weight = EVIDENCE_WEIGHT.get(item.get("evidenceLabel"), UNGRADED_EVIDENCE_WEIGHT)
        scores[code] = round(base * weight, 1)
    return scores


def load_data(db: Session):
    skills = [dict(row) for row in db.execute(SKILLS_SQL).mappings()]
    role_counts: dict[int, list[dict]] = defaultdict(list)
    for row in db.execute(ROLE_COUNTS_SQL).mappings():
        role_counts[row["skill_id"]].append(dict(row))
    ecosystem = {
        row["skill_id"]: dict(row) for row in db.execute(ECOSYSTEM_SQL).mappings()
    }
    period = dict(db.execute(PERIOD_SQL).mappings().one())
    return skills, role_counts, ecosystem, period


def map_items(db: Session) -> tuple[list[dict], dict]:
    skills, role_counts, ecosystem, period = load_data(db)
    trends = build_trends(db)
    breadth = {
        row["skill_id"]: dict(row)
        for row in db.execute(ADOPTION_BREADTH_SQL).mappings()
    }
    evidence = {
        row["skill_id"]: row["evidence_label"]
        for row in db.execute(EVIDENCE_SQL).mappings()
    }
    skills = [
        skill
        for skill in skills
        if skill["postings"] and skill["skill_id"] in ecosystem
    ]
    demand_scores = percentile([skill["postings"] for skill in skills])
    demand_ranks = rank([skill["postings"] for skill in skills])
    by_role: dict[str, list[int]] = defaultdict(list)
    for rows in role_counts.values():
        for row in rows:
            by_role[row["role_name"]].append(row["postings"])
    role_percentiles = {role: percentile(values) for role, values in by_role.items()}
    role_ranks = {role: rank(values) for role, values in by_role.items()}
    total = period["total_postings"] or 0
    items = []
    for skill in skills:
        eco = ecosystem[skill["skill_id"]]
        ecosystem_score = float(eco["ecosystem_score"])
        breakdown = []
        for row in sorted(role_counts[skill["skill_id"]], key=lambda value: (-value["postings"], value["role_name"])):
            demand = role_percentiles[row["role_name"]][row["postings"]]
            breakdown.append({
                "role": row["role_name"],
                "count": row["postings"],
                "demand": demand,
                "rank": role_ranks[row["role_name"]][row["postings"]],
                "quadrant": quadrant(demand, ecosystem_score),
            })
        demand = demand_scores[skill["postings"]]
        share = round(100 * skill["postings"] / total, 1) if total else 0.0
        item = {
            "tech": skill["skill_name"], "skillCode": skill["skill_code"],
            "kind": skill["category"], "category": skill["category"],
            "aliases": skill["aliases"], "roles": [row["role"] for row in breakdown[:2]],
            "roleBreakdown": breakdown, "demand": demand,
            "demandRank": demand_ranks[skill["postings"]],
            "ecosystemScore": ecosystem_score,
            "quadrant": quadrant(demand, ecosystem_score),
            "postings": skill["postings"], "postingsShare": share,
            "postingsNote": f"활성 채용공고 {total:,}건 중 {skill['postings']:,}건({share}%)에서 요구",
            "ecosystem": {
                "githubRepo": {
                    "score": float(eco["github_repository_score"]),
                    "raw": eco["github_repository_count"],
                },
                "githubActivity": {
                    "score": float(eco["github_activity_score"]),
                    "raw": eco["github_activity_count_180d"],
                },
                "stackoverflow": {
                    "score": float(eco["stackoverflow_score"]),
                    "raw": eco["stackoverflow_question_count_180d"],
                },
            },
            "signals": [
                {"meta": "채용", "title": f"활성 공고 {skill['postings']:,}건에서 요구됩니다."},
                {"meta": "생태계 · GitHub", "title": f"저장소 {eco['github_repository_count']:,}개 기준 백분위 {float(eco['github_repository_score'])}점입니다."},
                {"meta": "생태계 · GitHub 활동", "title": f"최근 180일 이슈·PR {eco['github_activity_count_180d']:,}건 기준 백분위 {float(eco['github_activity_score'])}점입니다."},
                {"meta": "생태계 · Stack Overflow", "title": f"최근 180일 질문 {eco['stackoverflow_question_count_180d']:,}건 기준 백분위 {float(eco['stackoverflow_score'])}점입니다."},
            ],
        }
        # 추이는 월별 수집이 있는 기술에만 붙는다. 프론트는 없으면 스파크라인
        # 블록 자체를 그리지 않는다.
        trend = trends.get(skill["skill_code"])
        if trend:
            item["trend"] = trend
        # 확산 범위와 근거 등급. 뷰/테이블에 행이 없는 기술에는 키를 만들지
        # 않는다 — 프론트는 없으면 배지를 그리지 않는다.
        row = breadth.get(skill["skill_id"])
        if row:
            item["adoption"] = {
                "companyCount": row["company_count"],
                "sampleCompanyCount": row["sample_company_count"],
                "coverageRate": num(row["coverage_rate"]),
                "hhi": num(row["hhi"]),
                "effectiveCompanyCount": num(row["effective_company_count"]),
                "spread": spread_label(row),
            }
        label = evidence.get(skill["skill_id"])
        if label:
            item["evidenceLabel"] = label
        items.append(item)

    # 선점 후보 사분면의 정렬 키. 다른 사분면에는 붙지 않는다(수요순 그대로).
    scores = early_mover_scores(items)
    for item in items:
        if item["skillCode"] in scores:
            item["earlyMoverScore"] = scores[item["skillCode"]]
    # 이웃 이름을 지금 응답에 실린 기술로만 거른다. build_stacks가 이 집합을
    # 넘겨받아야 화면에서 검색 결과 0건인 칩이 나오지 않는다.
    stacks = build_stacks(db, {item["tech"] for item in items})
    docs = build_docs(db)
    videos = build_videos(db)
    for item in items:
        # 없는 자료는 키 자체를 만들지 않는다. 프론트는 없으면 그 카드를,
        # 둘 다 없으면 학습 탭 자체를 그리지 않는다.
        for key, table in (("stack", stacks), ("docs", docs), ("videos", videos)):
            value = table.get(item["tech"])
            if value:
                item[key] = value

    items.sort(key=lambda item: (-item["postings"], item["tech"]))
    return items, period


@router.get("/gapmap", response_model=GapMapResponse)
def get_gapmap(db: Session = Depends(get_db)):
    items, period = map_items(db)
    roles = sorted(
        {row["role"] for item in items for row in item["roleBreakdown"]},
        key=lambda role: -sum(row["count"] for item in items for row in item["roleBreakdown"] if row["role"] == role),
    )
    return {"meta": {
        "fromDate": str(period["from_date"]) if period["from_date"] else None,
        "toDate": str(period["to_date"]) if period["to_date"] else None,
        "totalTechs": len(items), "mappedTechs": len(items),
        "totalPostings": period["total_postings"] or 0, "mapLimit": MAP_LIMIT,
        "detailedTechs": len(items), "roles": roles,
    }, "items": items}


@router.get("/skills", response_model=SkillsResponse)
def get_skills(db: Session = Depends(get_db)):
    skills, role_counts, ecosystem, period = load_data(db)
    ranks = rank([skill["postings"] for skill in skills if skill["postings"]])
    total = period["total_postings"] or 0
    items = []
    for skill in skills:
        roles = sorted(role_counts[skill["skill_id"]], key=lambda value: (-value["postings"], value["role_name"]))
        items.append({
            "tech": skill["skill_name"], "skillCode": skill["skill_code"],
            "category": skill["category"], "aliases": skill["aliases"],
            "postings": skill["postings"],
            "postingsShare": round(100 * skill["postings"] / total, 1) if total else 0.0,
            "rank": ranks.get(skill["postings"]),
            "roles": [row["role_name"] for row in roles[:2]],
            "detailed": skill["skill_id"] in ecosystem,
        })
    items.sort(key=lambda item: item["tech"].lower())
    categories = sorted({item["category"] for item in items})
    return {"meta": {
        "totalSkills": len(items), "detailedSkills": sum(item["detailed"] for item in items),
        "taggedSkills": sum(item["postings"] > 0 for item in items),
        "totalPostings": total, "categories": categories,
    }, "items": items}


@router.get("/tech/{skill_code}/postings", response_model=PostingsResponse)
def get_tech_postings(
    skill_code: str,
    limit: int = Query(default=5, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"items": [dict(row) for row in db.execute(
        POSTINGS_SQL, {"skill_code": skill_code, "limit": limit}
    ).mappings()]}


@router.get("/tech/{skill_code}/cluster", response_model=ClusterResponse | None)
def get_tech_cluster(skill_code: str, db: Session = Depends(get_db)):
    row = db.execute(CLUSTER_SQL, {"skill_code": skill_code}).mappings().one_or_none()
    if row is None:
        return None
    return {
        "asOfDate": row["as_of_date"],
        "clusterId": row["cluster_id"],
        "clusterSize": row["skill_count"],
        "membershipQuality": row["membership_quality"],
        "evidenceLabel": row["evidence_label"],
        "jobCount": row["job_count"],
        "companyCount": row["company_count"],
        "coherence": row["cluster_coherence"],
        "stability": row["membership_stability"],
        "marginRatio": row["centroid_margin_ratio"],
        "neighborCompanyShare": row["same_cluster_top_company_share"],
        "dominantCompany": row["dominant_company"],
        "dominantCompanyShare": row["top_company_share"],
        "neighbors": neighbors(row["same_cluster_strongest_neighbors"]),
        "globalNeighbors": neighbors(row["global_strongest_neighbors"]),
    }


@router.get("/timeseries", response_model=TimeSeriesResponse)
def get_timeseries(
    from_month: str = Query(default="2025-12-01", alias="from"),
    to_month: str = Query(default="2026-08-01", alias="to"),
    db: Session = Depends(get_db),
):
    rows = [dict(row) for row in db.execute(
        TIMESERIES_SQL,
        {"from_month": from_month, "to_month": to_month},
    ).mappings()]
    for row in rows:
        if row["month"] is not None:
            row["month"] = row["month"].isoformat()
    return {
        "meta": {"from": from_month, "to": to_month},
        "items": rows,
    }


@router.get("/timeseries/daily", response_model=TimeSeriesDailyResponse)
def get_timeseries_daily(
    from_date: str = Query(default="2026-02-24", alias="from"),
    to_date: str = Query(default="2026-08-23", alias="to"),
    # 기술 하나만 받으려면 skill=<skill_code>. 상세 화면은 한 기술의 선만
    # 그리는데, 걸러내지 않으면 200개 기술 x 180일이 한꺼번에 내려와 응답이
    # 6MB를 넘는다. 생략하면 지금까지처럼 전부 내려준다.
    skill_code: str | None = Query(default=None, alias="skill"),
    db: Session = Depends(get_db),
):
    rows = [dict(row) for row in db.execute(
        TIMESERIES_DAILY_SQL,
        {"from_date": from_date, "to_date": to_date, "skill_code": skill_code},
    ).mappings()]
    for row in rows:
        if row["date"] is not None:
            row["date"] = row["date"].isoformat()
    return {
        "meta": {"from": from_date, "to": to_date, "skill": skill_code},
        "items": rows,
    }
