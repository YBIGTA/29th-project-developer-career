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

# 노트북이 이웃을 "React (score=0.412, companies=7), ..." 한 덩어리 문자열로
# 내보낸다. 항목 안에도 쉼표가 있어서 ", " 단순 분리는 깨진다.
NEIGHBOR_RE = re.compile(r"(.+?) \(score=([\d.]+), companies=(\d+)\)(?:, |$)")


def neighbors(blob: str | None) -> list[dict]:
    return [
        {"tech": tech, "score": float(score), "companies": int(companies)}
        for tech, score, companies in NEIGHBOR_RE.findall(blob or "")
    ]


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
        items.append(item)
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
