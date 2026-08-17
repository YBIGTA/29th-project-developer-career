from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.schemas import GapMapResponse, PostingsResponse, SkillsResponse
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
    SELECT skill, stackoverflow_question_count_180d, ecosystem_score
    FROM vw_stackoverflow_ecosystem_skill
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
        row["skill"]: dict(row) for row in db.execute(ECOSYSTEM_SQL).mappings()
    }
    period = dict(db.execute(PERIOD_SQL).mappings().one())
    return skills, role_counts, ecosystem, period


def map_items(db: Session) -> tuple[list[dict], dict]:
    skills, role_counts, ecosystem, period = load_data(db)
    # The database currently exposes only Stack Overflow ecosystem data.
    skills = [skill for skill in skills if skill["postings"] and skill["skill_name"] in ecosystem]
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
        eco = ecosystem[skill["skill_name"]]
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
            "ecosystem": {"stackoverflow": {
                "score": ecosystem_score,
                "raw": eco["stackoverflow_question_count_180d"],
            }},
            "signals": [
                {"meta": "채용", "title": f"활성 공고 {skill['postings']:,}건에서 요구됩니다."},
                {"meta": "생태계 · Stack Overflow", "title": f"최근 180일 질문 {eco['stackoverflow_question_count_180d']:,}건 기준 백분위 {ecosystem_score}점입니다."},
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
            "detailed": skill["skill_name"] in ecosystem,
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
