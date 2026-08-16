from app.api.routes import percentile, quadrant, rank


def test_score_helpers_preserve_ties_and_quadrants():
    assert percentile([1, 1, 3]) == {1: 0.0, 3: 100.0}
    assert rank([3, 3, 1]) == {3: 1, 1: 3}
    assert quadrant(49.9, 50) == "선점 후보"
    assert quadrant(50, 49.9) == "희소가치"
