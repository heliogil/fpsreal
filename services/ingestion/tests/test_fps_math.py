"""fps_math.geomean — the cross-game FPS average used by wizard, upgrade and /vs."""
import math

from fps_math import geomean


def test_geomean_basic():
    assert math.isclose(geomean([100, 400]), 200.0)


def test_each_game_weighs_equally():
    # doubling a 500-FPS eSports title moves the mean as much as doubling a 50-FPS AAA one
    base = geomean([500, 50])
    assert math.isclose(geomean([1000, 50]), geomean([500, 100]))
    assert geomean([1000, 50]) > base


def test_ignores_non_positive_and_empty():
    assert geomean([]) == 0.0
    assert geomean([0, -1]) == 0.0
    assert math.isclose(geomean([0, 64, 4]), 16.0)
