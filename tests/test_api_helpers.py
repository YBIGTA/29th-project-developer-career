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
