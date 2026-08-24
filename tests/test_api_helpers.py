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


def test_build_stacks_orders_by_similarity_and_drops_unknown_names():
    """함께 요구되는 기술이 화면에 그대로 실릴 수 있는 모양으로 나오는지.

    이웃 문자열은 노트북이 찍어둔 것이라 그 뒤로 사라진 기술이 섞일 수 있다.
    화면에서 이 값은 누르면 검색이 걸리는 칩이므로, 응답에 없는 이름이 새면
    결과 0건짜리 막다른 길이 된다.
    """
    from app.api.routes import STACK_LIMIT, build_stacks

    rows = [
        {
            "skill_name": "AWS",
            # 유사도 내림차순으로 이미 정렬돼 온다. 순서를 그대로 지켜야 한다.
            "same_cluster_strongest_neighbors": (
                "Docker (score=0.612, companies=31), "
                "Terraform (score=0.544, companies=18), "
                "AWS CloudFormation (score=0.501, companies=9), "
                "폐기된기술 (score=0.480, companies=2), "
                "Kubernetes (score=0.470, companies=22), "
                "Linux (score=0.455, companies=14), "
                "Ansible (score=0.401, companies=6)"
            ),
        },
        # 자기 자신이 이웃으로 섞여 오면 뺀다.
        {"skill_name": "Vue", "same_cluster_strongest_neighbors": "Vue (score=1.0, companies=3)"},
        # 군집 대상이지만 이웃이 비어 있는 기술은 아예 키를 만들지 않는다.
        {"skill_name": "COBOL", "same_cluster_strongest_neighbors": None},
    ]

    class StubResult:
        def mappings(self):
            return rows

    class StubSession:
        def execute(self, *args, **kwargs):
            return StubResult()

    known = {"AWS", "Docker", "Terraform", "AWS CloudFormation", "Kubernetes", "Linux",
             "Ansible", "Vue", "COBOL"}
    stacks = build_stacks(StubSession(), known)

    # 이름에 공백이 있는 항목도 온전히 살아야 한다 — 이웃 문자열은 ", "로 단순
    # 분리하면 깨지므로 정규식으로 판다.
    assert stacks["AWS"] == ["Docker", "Terraform", "AWS CloudFormation", "Kubernetes", "Linux"]
    assert len(stacks["AWS"]) == STACK_LIMIT
    assert "폐기된기술" not in stacks["AWS"]
    assert "Vue" not in stacks
    assert "COBOL" not in stacks


def test_learning_resources_are_shaped_for_the_frontend():
    """공식 문서·영상이 화면이 기대하는 모양으로 나오는지.

    두 테이블 모두 CSV를 그대로 올린 것이라 기술명 문자열로 조인한다. 이름이
    어긋난 행은 SQL의 JOIN이 걸러내므로 여기서는 값 변환만 본다 — 특히
    썸네일 주소를 싣지 않는다는 규칙(화면이 video_id로 만든다)을 못 박는다.
    """
    from app.api.routes import VIDEOS_PER_TECH, build_docs, build_videos

    class StubSession:
        def __init__(self, rows):
            self.rows = rows

        def execute(self, *args, **kwargs):
            rows = self.rows

            class Result:
                def mappings(self):
                    return rows

            return Result()

    docs = build_docs(StubSession([
        {"skill_name": "Java", "url": " https://docs.oracle.com/en/java/ ", "note": None},
        {"skill_name": "JavaScript", "url": "https://developer.mozilla.org/", "note": "MDN"},
    ]))
    assert docs["Java"] == {"url": "https://docs.oracle.com/en/java/"}, "앞뒤 공백은 떼고, note가 없으면 키도 없다"
    assert docs["JavaScript"] == {"url": "https://developer.mozilla.org/", "note": "MDN"}

    videos = build_videos(StubSession([
        {"skill_name": "Java", "video_id": "LBqE4YOvhyc", "title": "JAVA Full Course",
         "channel_title": "Coder Army", "view_count": 283628, "duration_seconds": 3547},
        {"skill_name": "Java", "video_id": "23HFxAPyJ9U", "title": "Start coding with JAVA",
         "channel_title": "Bro Code", "view_count": 538762, "duration_seconds": 659},
        {"skill_name": "Go", "video_id": "aaaaaaaaaaa", "title": "Go",
         "channel_title": None, "view_count": None, "duration_seconds": None},
    ]))

    # 프론트가 읽는 키 이름 그대로여야 한다 (lib/learn.js 참고).
    assert videos["Java"][0] == {
        "id": "LBqE4YOvhyc", "title": "JAVA Full Course",
        "channel": "Coder Army", "views": 283628, "seconds": 3547,
    }
    # SQL이 rank 순으로 내려주므로 받은 순서를 그대로 지킨다.
    assert [v["id"] for v in videos["Java"]] == ["LBqE4YOvhyc", "23HFxAPyJ9U"]
    # 썸네일 주소는 싣지 않는다. 저장된 주소에는 만료된 것이 섞인다.
    assert all("thumbnail" not in key for v in videos["Java"] for key in v)
    # 메타가 비어도 항목을 버리지 않는다 — 화면이 그 줄만 안 그린다.
    assert videos["Go"] == [{"id": "aaaaaaaaaaa", "title": "Go",
                             "channel": None, "views": None, "seconds": None}]
    assert "Python" not in videos, "자료가 없는 기술은 키 자체가 없어야 한다"
    assert VIDEOS_PER_TECH == 3
