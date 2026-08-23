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

TIMESERIES_DAILY_SQL = text("""
    WITH so AS (
        SELECT
            d.metric_date,
            d.skill_id,
            d.question_count,
            AVG(d.question_count) OVER (
                PARTITION BY d.skill_id ORDER BY d.metric_date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) AS rolling_avg_30d,
            SUM(d.question_count) OVER (
                PARTITION BY d.skill_id ORDER BY d.metric_date
                ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
            ) AS skill_rolling_sum_30d
        FROM ecosystem_daily_stackoverflow_metrics d
        WHERE d.metric_date >= :from_date AND d.metric_date < :to_date
    ), totals AS (
        SELECT metric_date, SUM(question_count) AS total_count
        FROM ecosystem_daily_stackoverflow_metrics
        WHERE metric_date >= :from_date AND metric_date < :to_date
        GROUP BY metric_date
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
            so.skill_id,
            so.question_count,
            so.rolling_avg_30d,
            CASE WHEN tr.total_rolling_sum_30d > 0
                 THEN so.skill_rolling_sum_30d::NUMERIC / tr.total_rolling_sum_30d
                 ELSE 0
            END AS share
        FROM so
        JOIN totals_rolling tr ON tr.metric_date = so.metric_date
    ), baseline AS (
        SELECT skill_id, AVG(share) AS avg_share
        FROM shared
        GROUP BY skill_id
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
    JOIN baseline ON baseline.skill_id = shared.skill_id
    JOIN skill s ON s.skill_id = shared.skill_id AND s.is_active = TRUE
    ORDER BY shared.metric_date, s.skill_name
""")


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
        items.append({
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
        })
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
    db: Session = Depends(get_db),
):
    rows = [dict(row) for row in db.execute(
        TIMESERIES_DAILY_SQL,
        {"from_date": from_date, "to_date": to_date},
    ).mappings()]
    for row in rows:
        if row["date"] is not None:
            row["date"] = row["date"].isoformat()
    return {
        "meta": {"from": from_date, "to": to_date},
        "items": rows,
    }
