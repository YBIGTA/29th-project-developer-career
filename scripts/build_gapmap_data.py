# -*- coding: utf-8 -*-
"""저장소 루트의 CSV에서 frontend/lib/mockData.json을 재생성한다.

입력 (모두 200개 기술로 집합이 일치한다):
  skills_counts(수정).csv              기술별 채용공고 태그 등장 수 (중복 제거본, 정본)
  skills_by_job_role(수정).csv         직군 14 x 기술 등장 수
  github_search_detail_180d.csv        저장소 수 / 최근 180일 이슈-PR 수 / 샘플 저장소
  stackoverflow_skillcount_180d.csv    최근 180일 질문 수 / 태그명
  (skills_by_job_role_stackoverflow.csv는 위 두 파일의 조인본이라 쓰지 않는다)
  scripts/tech_notes.json                손으로 쓴 문장 27건 (kind / stack / summary / verdict)

정규화 방침 — 두 축 모두 **백분위 순위**를 쓴다.
CSV에 실려 오는 github_repo_score / github_activity_score / ecosystem_heat_score_log는
Min-Max라 200개 중 178개가 10점 미만으로 눌린다. 그대로 쓰면 지도 왼쪽 아래에 점이
뭉쳐 사분면이 성립하지 않는다. 그래서 여기서는 raw 카운트를 다시 백분위로 환산한다.
데이터팀 DW의 demand_score(선형 최대값 환산)를 쓰지 않는 이유도 같다.

기존 27개 기술의 손으로 쓴 문장(summary / verdict / kind / stack)은 그대로 물려받고,
나머지 173개는 비워 둔다. signals 3종은 200개 전부 데이터에서 기계적으로 조립한다.
"""

import csv
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "lib", "mockData.json")
NOTES = os.path.join(ROOT, "scripts", "tech_notes.json")

# 수집된 채용공고 총 건수. skills_counts의 변경분은 전부 별칭 매칭 개선이라
# (예: MongoDB Atlas 0 -> 71) 모집단 자체는 직전 버전과 같다.
TOTAL_POSTINGS = 2412

# 지도에 기본으로 찍는 개수. 수요 상위 N개가 아니라 사분면별로 고르게 뽑는다
# (frontend/lib/mapPoints.js의 pickMapPoints). 60이면 네 구역에서 15개씩이다.
MAP_LIMIT = 60

QUADRANT_THRESHOLD = 50

# skillIndex.json에 아직 없는 기술의 skillCode. 이전 데이터에서 GPT는 OpenAI와
# "GPT / OpenAI" 한 항목으로 묶여 skillCode가 openai였는데, 신규 데이터는 둘을
# 갈라 놓았다. 공고 수가 145건 대 19건이라 GPT가 독립 항목이 된다.
EXTRA_SKILL_CODES = {"GPT": "gpt"}

# skillIndex.json에서 통째로 걷어낼 표제어. 신규 데이터가 GPT와 OpenAI를 갈라
# 놓으면서 합쳐진 옛 항목이 낡은 수치를 그대로 들고 남는다.
RETIRED_INDEX_TECHS = {"GPT / OpenAI"}

# 지도 항목이 되면서 사전에 새로 들어가는 표제어의 분류.
EXTRA_CATEGORIES = {"GPT": "AI 플랫폼"}


def read_csv(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def percentile_map(values):
    """값 -> 백분위 순위(0~100). 같은 값은 같은 점수를 받는다."""
    ordered = sorted(values)
    n = len(ordered)
    if n < 2:
        return {v: 100.0 for v in values}
    out = {}
    for v in set(values):
        below = sum(1 for x in ordered if x < v)
        out[v] = round(100.0 * below / (n - 1), 1)
    return out


def rank_map(values):
    """값 -> 내림차순 순위(1부터, 동점은 같은 순위)."""
    counts = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    out = {}
    seen = 0
    for v in sorted(counts, reverse=True):
        out[v] = seen + 1
        seen += counts[v]
    return out


def quadrant_of(demand, ecosystem):
    if demand >= QUADRANT_THRESHOLD:
        return "필수" if ecosystem >= QUADRANT_THRESHOLD else "희소가치"
    return "선점 후보" if ecosystem >= QUADRANT_THRESHOLD else "저관심"


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def fmt(n):
    return "{:,}".format(int(n))


def write_skill_index(items, index):
    """기술 사전(skillIndex.json)의 채용 수치를 같은 소스로 다시 맞춘다.

    사전은 지도보다 넓다 — 지표가 수집된 200개에 더해, 파이프라인 사전에는
    있지만 공고 어디에서도 발견되지 않은 표제어까지 담는다. 분류(category)와
    별칭(aliases)은 사전 쪽이 정본이라 그대로 두고, 공고 건수·순위·직군만
    갱신한다. 이 값이 지도와 어긋나면 같은 기술이 두 화면에서 다른 숫자를
    말하게 된다.
    """
    entries = []
    covered = set()
    for item in items:
        prior = index.get(item["tech"], {})
        entries.append({
            "tech": item["tech"],
            "skillCode": item["skillCode"],
            "category": item["category"],
            "aliases": prior.get("aliases", []),
            "postings": item["postings"],
            "postingsShare": item["postingsShare"],
            "rank": item["demandRank"],
            "roles": item["roles"],
            "detailed": True,
        })
        covered.add(item["tech"])

    # 공고에서 한 번도 안 걸린 표제어. 지어낸 값을 채우지 않고 0으로 남긴다.
    for tech, prior in index.items():
        if tech in covered or tech in RETIRED_INDEX_TECHS:
            continue
        entries.append({
            "tech": tech,
            "skillCode": prior["skillCode"],
            "category": prior["category"],
            "aliases": prior.get("aliases", []),
            "postings": 0,
            "postingsShare": 0.0,
            "rank": prior.get("rank"),
            "roles": [],
            "detailed": False,
        })

    entries.sort(key=lambda e: e["tech"].lower())

    # 카테고리 칩은 표제어가 많은 순으로 늘어놓는다. 첫 등장 순으로 두면
    # 표제어 정렬 방식이 바뀔 때마다 칩 순서가 같이 흔들린다.
    counts_by_category = {}
    for e in entries:
        counts_by_category[e["category"]] = counts_by_category.get(e["category"], 0) + 1
    categories = sorted(counts_by_category, key=lambda c: (-counts_by_category[c], c))

    doc = {
        "meta": {
            "totalSkills": len(entries),
            "detailedSkills": sum(1 for e in entries if e["detailed"]),
            "taggedSkills": sum(1 for e in entries if e["postings"] > 0),
            "totalPostings": TOTAL_POSTINGS,
            "categories": categories,
        },
        "items": entries,
    }

    path = os.path.join(ROOT, "frontend", "lib", "skillIndex.json")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote %s -- %d entries (%d 지표 수집, %d 공고 등장)" % (
        path, len(entries), doc["meta"]["detailedSkills"], doc["meta"]["taggedSkills"]))


def main():
    counts = read_csv("skills_counts(수정).csv")
    roles_rows = read_csv("skills_by_job_role(수정).csv")
    gh = {r["technology"]: r for r in read_csv("github_search_detail_180d.csv")}
    so = {r["technology"]: r for r in read_csv("stackoverflow_skillcount_180d.csv")}

    techs = [r["skill"] for r in counts]
    postings = {r["skill"]: int(r["count"]) for r in counts}

    with io.open(os.path.join(ROOT, "frontend", "lib", "skillIndex.json"), encoding="utf-8") as f:
        index = {i["tech"]: i for i in json.load(f)["items"]}

    # 손으로 쓴 문장(kind / stack / summary / verdict)은 scripts/tech_notes.json에
    # 따로 둔다. 생성기가 자기 출력물을 다시 읽으면 mockData.json이 지워졌을 때
    # 문장이 통째로 사라지고, 수치가 바뀌어도 옛 문장이 조용히 살아남는다.
    with io.open(NOTES, encoding="utf-8") as f:
        prior = json.load(f)

    # ---- 전체 기준 축 ----
    demand_pct = percentile_map([postings[t] for t in techs])
    demand_rank = rank_map([postings[t] for t in techs])

    eco_raw = {
        "githubRepo": {t: int(gh[t]["github_repository_count"]) for t in techs},
        "githubActivity": {t: int(gh[t]["github_activity_count_180d"]) for t in techs},
        "stackoverflow": {t: int(so[t]["stackoverflow_question_count_180d"]) for t in techs},
    }
    eco_pct = {k: percentile_map(list(v.values())) for k, v in eco_raw.items()}

    # ---- 직군별 축 ----
    # 직군을 고르면 그 직군 안에 등장하는 기술끼리만 다시 백분위를 매긴다.
    # 생태계 점수는 직군과 무관하므로 그대로 두고, 사분면만 다시 계산한다.
    by_role = {}
    for row in roles_rows:
        by_role.setdefault(row["job_role"], {})[row["skills"]] = int(row["count"])
    role_axis = {}
    for role, skills in by_role.items():
        vals = list(skills.values())
        role_axis[role] = (percentile_map(vals), rank_map(vals))

    role_of_tech = {}
    for row in roles_rows:
        role_of_tech.setdefault(row["skills"], []).append((row["job_role"], int(row["count"])))

    items = []
    for tech in techs:
        n = postings[tech]
        meta_idx = index.get(tech, {})
        old = prior.get(tech)

        eco_parts = {}
        for key in ("githubRepo", "githubActivity", "stackoverflow"):
            raw = eco_raw[key][tech]
            eco_parts[key] = {"score": eco_pct[key][raw], "raw": raw}
        ecosystem_score = round(sum(p["score"] for p in eco_parts.values()) / 3, 1)

        demand = demand_pct[n]
        share = round(100.0 * n / TOTAL_POSTINGS, 1)

        breakdown = []
        for role, count in sorted(role_of_tech.get(tech, []), key=lambda x: (-x[1], x[0])):
            pct, rnk = role_axis[role]
            role_demand = pct[count]
            breakdown.append({
                "role": role,
                "count": count,
                "demand": role_demand,
                "rank": rnk[count],
                "quadrant": quadrant_of(role_demand, ecosystem_score),
            })

        top_roles = [b["role"] for b in breakdown[:2]]
        role_text = ", ".join("%s %s건" % (b["role"], fmt(b["count"])) for b in breakdown[:2])

        signals = [
            {
                "meta": "채용 · 공고 %s건 기준" % fmt(TOTAL_POSTINGS),
                "title": "%s건(%s%%)에서 요구돼 200개 기술 중 %d위입니다.%s" % (
                    fmt(n), share, demand_rank[n],
                    (" 요구가 많은 직군 — %s." % role_text) if role_text else "",
                ),
            },
            {
                "meta": "생태계 · GitHub 180일",
                "title": "저장소 %s개, 최근 180일 이슈·PR %s건이 집계돼 저장소 점수 %s점 · 활동 점수 %s점입니다." % (
                    fmt(eco_parts["githubRepo"]["raw"]), fmt(eco_parts["githubActivity"]["raw"]),
                    eco_parts["githubRepo"]["score"], eco_parts["githubActivity"]["score"],
                ),
            },
            {
                "meta": "생태계 · Stack Overflow 180일",
                "title": "`%s` 태그로 최근 180일 질문 %s개가 올라와 열기 점수 %s점입니다." % (
                    so[tech]["stackoverflow_tag"], fmt(eco_parts["stackoverflow"]["raw"]),
                    eco_parts["stackoverflow"]["score"],
                ),
            },
        ]

        item = {
            "tech": tech,
            # skillCode는 skillIndex가 정본이다. slugify는 최후 수단으로만 쓴다
            # ("C++" -> "c"처럼 다른 기술과 충돌할 수 있어 아래에서 따로 검사한다).
            "skillCode": meta_idx.get("skillCode") or EXTRA_SKILL_CODES.get(tech) or slugify(tech),
            "kind": (old or {}).get("kind") or meta_idx.get("category") or "기타",
            "category": meta_idx.get("category") or EXTRA_CATEGORIES.get(tech) or "기타",
            "aliases": meta_idx.get("aliases", []),
            "roles": top_roles,
            "roleBreakdown": breakdown,
            "demand": demand,
            "demandRank": demand_rank[n],
            "ecosystemScore": ecosystem_score,
            "quadrant": quadrant_of(demand, ecosystem_score),
            "postings": n,
            "postingsShare": share,
            "postingsNote": "채용공고 %s건 중 %s건(%s%%)에서 요구" % (fmt(TOTAL_POSTINGS), fmt(n), share),
            "ecosystem": eco_parts,
            "sampleRepositories": [
                s.strip() for s in (gh[tech]["sample_repositories"] or "").split(";") if s.strip()
            ][:3],
            "signals": signals,
        }
        # 해석이 들어간 문장은 자동 생성이 안 된다. 이전 27개만 물려받는다.
        for field in ("summary", "verdict", "stack"):
            if old and old.get(field):
                item[field] = old[field]
        items.append(item)

    items.sort(key=lambda i: (-i["postings"], i["tech"]))

    # skillCode는 상세 화면 라우팅과 공고 조회의 키다. 겹치면 두 기술이 서로의
    # 데이터를 보여준다.
    seen_codes = {}
    for i in items:
        if i["skillCode"] in seen_codes:
            raise SystemExit(
                "skillCode 충돌: %s 와 %s 가 모두 '%s'" % (seen_codes[i["skillCode"]], i["tech"], i["skillCode"])
            )
        seen_codes[i["skillCode"]] = i["tech"]

    doc = {
        "meta": {
            "fromDate": gh[techs[0]]["from_date_utc"],
            "toDate": gh[techs[0]]["to_date_utc"],
            "totalTechs": len(items),
            "mappedTechs": len(items),
            "totalPostings": TOTAL_POSTINGS,
            "mapLimit": MAP_LIMIT,
            "detailedTechs": sum(1 for i in items if i.get("summary")),
            "roles": [r for r, _ in sorted(
                ((role, sum(s.values())) for role, s in by_role.items()),
                key=lambda x: -x[1],
            )],
        },
        "items": items,
    }

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    write_skill_index(items, index)

    dist = {}
    for i in items:
        dist[i["quadrant"]] = dist.get(i["quadrant"], 0) + 1
    print("wrote %s -- %d items, quadrants %s" % (OUT, len(items), dist))
    print("roles:", doc["meta"]["roles"])


if __name__ == "__main__":
    main()
