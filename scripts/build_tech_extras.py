# -*- coding: utf-8 -*-
"""저장소 루트의 CSV에서 frontend/lib/techExtras.json을 만든다.

입력 (기술명 `skill` 열이 mockData.json의 tech와 200개 전부 일치한다):
  tech_official_docs.csv             기술별 공식 문서 URL (198건, 2건은 공란)
  youtube_skill_videos.csv           87개 기술 x 입문 영상 3편
  github_monthly_activity.csv        200 x 9개월, 이슈/PR 수
  stackoverflow_monthly_activity.csv 200 x 9개월, 질문 수

핵심 — 월별 활동량은 **원시값을 쓰면 안 된다.** 8개월 동안 200개 기술 합계가
GitHub는 19.1M -> 50.0M (+162%), Stack Overflow는 4,338 -> 1,354 (-69%)로
움직인다. 그대로 그리면 GitHub는 200개 중 194개가 상승, SO는 186개 중 147개가
하락하는, 개별 기술과 무관한 플랫폼 추세만 보게 된다. 두 계열을 더해도 자릿수가
1000배 차이라 사실상 GitHub 값이 된다.

그래서 각 달의 **점유율**(그 달 200개 합계 대비 비중)로 바꾼다. 분모가 함께
움직이므로 플랫폼 전체의 성장/축소가 상쇄되고 "다른 기술 대비 이 기술이
뜨는가"만 남는다. 두 계열 모두 합이 1인 비중이라 서로 더할 수 있다.

  비중(m) = ( gh(m)/gh_합계(m) + so(m)/so_합계(m) ) / 2   <- SO가 없으면 gh 항만
  지수(m) = 비중(m) / 비중(첫 달) * 100

부분 집계된 달(to_date가 그 달 말일이 아닌 달, 지금은 2026-08)은 통째로 버린다.
넣으면 21일치가 31일치와 비교되어 거의 모든 기술이 거짓 하락으로 보인다.
"""

import calendar
import csv
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "lib", "techExtras.json")

VIDEOS_PER_TECH = 3


def read_csv(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def complete_months(rows):
    """to_date가 그 달의 말일인 달만 골라 정렬해 돌려준다."""
    months = {}
    for r in rows:
        ym = r["year_month"]
        if ym in months:
            continue
        year, month = (int(x) for x in ym.split("-"))
        last_day = calendar.monthrange(year, month)[1]
        months[ym] = r["to_date"] == "%04d-%02d-%02d" % (year, month, last_day)
    return sorted(ym for ym, full in months.items() if full)


def build_docs():
    docs = {}
    for r in read_csv("tech_official_docs.csv"):
        url = r["official_docs_url"].strip()
        if not url:
            continue
        entry = {"url": url}
        note = (r.get("note") or "").strip()
        if note:
            entry["note"] = note
        docs[r["skill"]] = entry
    return docs


def build_videos():
    by_tech = {}
    for r in read_csv("youtube_skill_videos.csv"):
        by_tech.setdefault(r["skill"], []).append(r)
    out = {}
    for skill, rows in by_tech.items():
        rows.sort(key=lambda r: int(r["rank"]))
        out[skill] = [
            {
                "id": r["video_id"],
                "title": r["title"],
                "channel": r["channel_title"],
                "views": int(r["view_count"]),
                "seconds": int(r["duration_seconds"]),
            }
            # 썸네일은 200건 전부 https://i.ytimg.com/vi/{id}/hqdefault.jpg 규칙을
            # 따르므로 싣지 않고 화면에서 id로 만든다.
            for r in rows[:VIDEOS_PER_TECH]
        ]
    return out


def build_trend():
    gh_rows = read_csv("github_monthly_activity.csv")
    so_rows = read_csv("stackoverflow_monthly_activity.csv")

    months = complete_months(gh_rows)
    so_months = complete_months(so_rows)
    if months != so_months:
        raise SystemExit("두 월별 CSV의 완전한 달 목록이 다릅니다: %s vs %s" % (months, so_months))

    gh = {}
    for r in gh_rows:
        if r["year_month"] in months:
            gh.setdefault(r["skill"], {})[r["year_month"]] = int(r["github_issue_count"]) + int(
                r["github_pr_count"]
            )
    so = {}
    for r in so_rows:
        if r["year_month"] in months:
            so.setdefault(r["skill"], {})[r["year_month"]] = int(r["question_count"])

    # 분모는 버릴 달을 뺀 뒤에 낸다.
    gh_total = [sum(v.get(m, 0) for v in gh.values()) for m in months]
    so_total = [sum(v.get(m, 0) for v in so.values()) for m in months]

    trends = {}
    for skill in gh:
        gh_series = [gh[skill].get(m, 0) for m in months]
        so_series = [so.get(skill, {}).get(m, 0) for m in months]
        has_so = sum(so_series) > 0

        shares = []
        for i in range(len(months)):
            g = gh_series[i] / gh_total[i] if gh_total[i] else 0.0
            if has_so:
                s = so_series[i] / so_total[i] if so_total[i] else 0.0
                shares.append((g + s) / 2)
            else:
                shares.append(g)

        # 첫 달이 0이면 기준을 잡을 수 없다. 지금 데이터에는 없지만, 생기면
        # 지수 대신 원시값만 남겨 화면이 추이 섹션을 건너뛰게 한다.
        if shares[0] <= 0:
            continue

        index = [round(v / shares[0] * 100, 1) for v in shares]
        entry = {
            "index": index,
            "github": gh_series,
            "hasStackoverflow": has_so,
        }
        if has_so:
            entry["stackoverflow"] = so_series
        trends[skill] = entry

    return months, trends


def main():
    docs = build_docs()
    videos = build_videos()
    months, trends = build_trend()

    skills = sorted(set(docs) | set(videos) | set(trends))
    techs = {}
    for skill in skills:
        entry = {}
        if skill in docs:
            entry["docs"] = docs[skill]
        if skill in videos:
            entry["videos"] = videos[skill]
        if skill in trends:
            entry.update(trends[skill])
        techs[skill] = entry

    doc = {"months": months, "techs": techs}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    up = sum(1 for t in trends.values() if t["index"][-1] > 100)
    down = len(trends) - up
    no_so = sum(1 for t in trends.values() if not t["hasStackoverflow"])
    size_kb = os.path.getsize(OUT) / 1024
    print("wrote %s -- %.0fKB" % (OUT, size_kb))
    print("  기술 %d개 (문서 %d, 영상 %d, 추이 %d)" % (len(techs), len(docs), len(videos), len(trends)))
    print("  월 %d개: %s ~ %s" % (len(months), months[0], months[-1]))
    print("  지수 상승 %d / 하락 %d  (한쪽으로 쏠리면 점유율 정규화가 잘못된 것)" % (up, down))
    print("  Stack Overflow 없이 GitHub만으로 계산한 기술 %d개" % no_so)


if __name__ == "__main__":
    main()
