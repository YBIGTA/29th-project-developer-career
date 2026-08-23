from app.api.routes import neighbors, percentile, quadrant, rank


def test_score_helpers_preserve_ties_and_quadrants():
    assert percentile([1, 1, 3]) == {1: 0.0, 3: 100.0}
    assert rank([3, 3, 1]) == {3: 1, 1: 3}
    assert quadrant(49.9, 50) == "선점 후보"
    assert quadrant(50, 49.9) == "희소가치"


def test_neighbors_parses_blob_including_names_with_commas():
    blob = "React (score=0.412, companies=7), Foo, Bar (score=0.100, companies=2)"
    assert neighbors(blob) == [
        {"tech": "React", "score": 0.412, "companies": 7},
        {"tech": "Foo, Bar", "score": 0.1, "companies": 2},
    ]
    assert neighbors(None) == []


def test_build_trends_matches_the_json_the_frontend_used_to_carry():
    """추이 지수가 scripts/build_tech_extras.py와 같은 값을 낸다.

    RDS에 붙지 않고도 확인할 수 있다 — 그 스크립트가 CSV로 만들어 둔
    frontend/lib/techExtras.json 이 정답지다. 여기서는 그 JSON의 월별 원시
    건수를 DB 행 모양으로 되돌려 build_trends에 먹이고, 나오는 index가 JSON의
    index와 같은지 본다. 점유율의 분모(그 달 전체 합계)는 200개 기술을 모두
    넣어야 맞으므로 일부만 골라 돌리면 안 된다.
    """
    import datetime
    import json
    import pathlib

    from app.api.routes import build_trends

    path = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "lib" / "techExtras.json"
    expected = json.loads(path.read_text(encoding="utf-8"))
    months = [datetime.date(int(m[:4]), int(m[5:]), 1) for m in expected["months"]]

    rows = []
    for name, extra in expected["techs"].items():
        if "index" not in extra:
            continue
        for i, month in enumerate(months):
            rows.append({
                "skill_code": name,
                "metric_month": month,
                "github": extra["github"][i],
                "stackoverflow": extra["stackoverflow"][i] if extra["hasStackoverflow"] else None,
            })

    class StubResult:
        def mappings(self):
            return rows

    class StubSession:
        def execute(self, *args, **kwargs):
            return StubResult()

    trends = build_trends(StubSession())

    assert len(trends) == sum("index" in e for e in expected["techs"].values())
    for name, extra in expected["techs"].items():
        if "index" not in extra:
            continue
        got = trends[name]
        assert got["months"] == expected["months"], name
        assert got["hasStackoverflow"] == extra["hasStackoverflow"], name
        # 반올림 자리가 같으므로 값이 그대로 일치해야 한다.
        assert got["index"] == extra["index"], name
        assert got["delta"]["pct"] == round(
            (extra["index"][-1] / extra["index"][-2] - 1) * 100, 1
        ), name
