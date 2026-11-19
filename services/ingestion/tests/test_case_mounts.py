"""Unit tests dos mounts 3D (case_mounts) — sem base, sem rede."""
from case_mounts import fan_capacity, mount_face, normalize_mounts, stock_cfm
from seed.geometry_data import CASE_GEOMETRY

D, H, W = 425.0, 400.0, 180.0


def _m(**kw):
    base = {"id": "m", "kind": "fan120", "accepts": ["fan120"], "x": 0, "y": 100,
            "w": 28, "h": 120, "orient": "intake", "stock": True}
    base.update(kw)
    return base


def test_face_is_inferred_like_the_old_2d_rule():
    assert mount_face(_m(), D, H) == "front"
    assert mount_face(_m(x=397), D, H) == "rear"
    assert mount_face(_m(x=20, y=372, w=400, h=28), D, H) == "top"
    assert mount_face(_m(x=30, y=55, w=250, h=25), D, H) == "bottom"


def test_declared_face_wins():
    assert mount_face(_m(face="side", x=200, y=200, w=120, h=120), D, H) == "side"


def test_normalize_fills_width_position():
    m = normalize_mounts([_m()], D, H, W)[0]
    assert m["z"] == W / 2 and m["d"] == 120 and m["stock_fans"] == 1 and m["capacity"] == 1
    side = normalize_mounts([_m(face="side", x=200, y=200, w=120, h=120)], D, H, W)[0]
    assert side["z"] == W - 12.5           # colada na tampa
    behind = normalize_mounts([_m(face="side", z=0)], D, H, W)[0]
    assert behind["z"] == 0                # z=0 declarado não vira "ausente"


def test_capacity_counts_slots_and_rad_bays():
    assert fan_capacity(_m(slots=2, stock_fans=2)) == 2
    assert fan_capacity({"kind": "rad_bay", "w": 400}) == 3


def test_aggregate_when_any_stock_mount_lacks_fan_cfm():
    ms = normalize_mounts([_m(id="a", fan_cfm=60), _m(id="b", y=230), _m(id="r", x=397, orient="exhaust")], D, H, W)
    i, e, per, method = stock_cfm(ms, 180, 75)
    assert (i, e) == (180, 75)
    assert method == {"intake": "agregado", "exhaust": "agregado"}
    assert per == {"a": 90.0, "b": 90.0, "r": 75.0}


def test_per_mount_sum_counts_every_fan():
    ms = normalize_mounts([_m(id="a", fan_cfm=85.96), _m(id="s", x=30, y=55, w=250, h=25,
                                                          stock_fans=2, slots=2, fan_cfm=55),
                           _m(id="r", x=397, orient="exhaust", fan_cfm=85.96)], D, H, W)
    i, e, per, method = stock_cfm(ms, 999, 999)   # agregado ignorado
    assert method == {"intake": "por_mount", "exhaust": "por_mount"}
    assert per["s"] == 110 and i == round(85.96 + 110, 2) and e == 85.96


def test_old_cases_keep_their_aggregate():
    """Regressão zero: só o Flux Pro tem ficha por ventoinha hoje."""
    for sku, geo in CASE_GEOMETRY.items():
        ms = normalize_mounts(geo["mounts"], geo["interior_mm"]["depth"], geo["interior_mm"]["height"], W)
        _, _, _, method = stock_cfm(ms, 100, 50)
        expect = "por_mount" if sku == "case-flux-pro" else "agregado"
        assert method == {"intake": expect, "exhaust": expect}, sku


def test_flux_pro_shroud_fans_are_bottom_intake():
    geo = CASE_GEOMETRY["case-flux-pro"]
    ms = normalize_mounts(geo["mounts"], geo["interior_mm"]["depth"], geo["interior_mm"]["height"], 190)
    shroud = next(m for m in ms if m["id"] == "shroud")
    assert shroud["face"] == "bottom" and shroud["orient"] == "intake" and shroud["stock_fans"] == 2
    i, e, _, _ = stock_cfm(ms, 0, 0)
    assert round(i) == 368 and round(e) == 86
