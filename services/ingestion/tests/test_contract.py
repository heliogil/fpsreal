"""Contract tests — hit every router over HTTP and assert status + shape.

Black-box against the running API. Read-only except the /go redirect test,
which is cleaned up via the ``cleanup_clicks`` fixture. Alongside status codes
these lock in the project's integrity contract: every FPS/airflow figure is a
labelled *estimate*, and prices stay honest (offer-or-null).
"""
from __future__ import annotations

import httpx
import pytest


# --- liveness -----------------------------------------------------------------

def test_health(client: httpx.Client):
    r = client.get("/health")
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "ok"
    assert b["db"] == "connected"
    assert "version" in b


def test_root(client: httpx.Client):
    r = client.get("/")
    assert r.status_code == 200
    assert "service" in r.json()


# --- catalog ------------------------------------------------------------------

def test_products_list_gpu(client: httpx.Client):
    r = client.get("/products/", params={"category": "gpu"})
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and items
    p = items[0]
    for key in ("id", "sku", "name", "category", "specs", "is_active"):
        assert key in p
    assert p["category"] == "gpu"
    assert isinstance(p["specs"], dict)


def test_product_get_and_404(client: httpx.Client, ids: dict):
    r = client.get(f"/products/{ids['gpu_id']}")
    assert r.status_code == 200
    assert r.json()["id"] == ids["gpu_id"]
    assert client.get("/products/999999").status_code == 404


def test_builds_list(client: httpx.Client):
    r = client.get("/builds/")
    assert r.status_code == 200
    builds = r.json()
    assert isinstance(builds, list) and len(builds) >= 1
    for key in ("slug", "total_price_brl", "components"):
        assert key in builds[0]


# --- fps + integrity ----------------------------------------------------------

def test_fps_single(client: httpx.Client, ids: dict):
    r = client.get("/fps/", params={"cpu": ids["cpu_id"], "gpu": ids["gpu_id"],
                                     "game": "cs2", "res": "1080p"})
    assert r.status_code == 200
    row = r.json()
    assert row is not None, "expected a seeded cs2 estimate for the anchor pair"
    assert row["fps"] > 0
    assert row["method"]                 # never an unlabelled figure
    assert "fps_estimate" not in row     # web contract key is `fps`


def test_fps_list_every_row_labelled(client: httpx.Client, ids: dict):
    r = client.get("/fps/", params={"cpu": ids["cpu_id"], "gpu": ids["gpu_id"], "res": "1080p"})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and rows
    # Integrity contract: every estimate carries method + confidence band.
    for row in rows:
        assert row["method"], f"unlabelled fps row: {row}"
        assert row["confidence_band_pct"] is not None, f"missing band: {row}"


# --- vs comparison ------------------------------------------------------------

def test_vs_ok(client: httpx.Client, ids: dict):
    r = client.get(f"/vs/{ids['gpu_sku']}/{ids['gpu_sku_b']}", params={"res": "1080p"})
    assert r.status_code == 200
    b = r.json()
    for key in ("gpu_a", "gpu_b", "rows", "overall_winner", "avg_delta_pct"):
        assert key in b
    assert b["overall_winner"] in ("a", "b", "tie")
    assert isinstance(b["rows"], list)
    for row in b["rows"]:
        assert row["winner"] in ("a", "b", "tie")


def test_vs_unknown_sku_404(client: httpx.Client, ids: dict):
    r = client.get(f"/vs/gpu-nao-existe/{ids['gpu_sku']}")
    assert r.status_code == 404


def test_vs_invalid_resolution_422(client: httpx.Client, ids: dict):
    r = client.get(f"/vs/{ids['gpu_sku']}/{ids['gpu_sku_b']}", params={"res": "8k"})
    assert r.status_code == 422


# --- offers (prices stay honest) ---------------------------------------------

def test_offers_best_offer_or_null(client: httpx.Client, ids: dict):
    r = client.get("/offers/best", params={"product": ids["gpu_id"]})
    assert r.status_code == 200
    b = r.json()
    assert b is None or ("price_brl" in b and "url" in b)


# --- compatibility / interior -------------------------------------------------

def test_compatibility_check(client: httpx.Client, ids: dict):
    r = client.post("/compatibility/check",
                    json={"components": {"cpu_id": ids["cpu_id"], "gpu_id": ids["gpu_id"]}})
    assert r.status_code == 200
    b = r.json()
    assert isinstance(b["errors"], list)
    assert isinstance(b["warnings"], list)
    assert "clearances" in b


def test_interior_estimate_labelled(client: httpx.Client, ids: dict):
    r = client.post("/interior/estimate",
                    json={"components": {"cpu_id": ids["cpu_id"], "gpu_id": ids["gpu_id"]}})
    assert r.status_code == 200
    b = r.json()
    assert "estimate" in b["method"]     # airflow is an estimate, labelled as such
    assert "airflow" in b


def test_interior_parametric_geometry(client: httpx.Client):
    """Motor paramétrico: mounts com orientação, colocações em mm e fluxos compostos."""
    builds = client.get("/builds/").json()
    assert builds
    comp = {f"{k}_id": v["id"] for k, v in builds[0]["components"].items()}
    r = client.post("/interior/estimate", json={"components": comp})
    assert r.status_code == 200
    g = r.json()["geometry"]
    assert g is not None, "seeded case must expose parametric geometry"
    assert g["case"]["depth_mm"] > 0 and g["case"]["height_mm"] > 0
    assert g["mounts"], "case must declare its mounting provisions"
    assert all(m["orient"] in ("intake", "exhaust") for m in g["mounts"])
    assert any(m["occupied_by"] == "stock_fan" for m in g["mounts"])
    parts = {p["part"] for p in g["placements"]}
    assert {"motherboard", "gpu", "psu"} <= parts
    assert all(p["source"] in ("spec", "form_factor_default") for p in g["placements"])
    assert g["flows"], "composed intake->exhaust flows expected"
    for f in g["flows"]:
        assert f["to"]["side"] in ("rear", "top")
        assert 0 <= f["intensity"] <= 1
        assert f["heat_at"], "every flow declares where it heats up"


# --- upgrade advisor ----------------------------------------------------------

def test_upgrade_advise(client: httpx.Client):
    r = client.post("/upgrade/advise", json={"gpu_name": "RTX 4060", "budget_brl": 5000})
    assert r.status_code == 200
    b = r.json()
    assert isinstance(b["gpu_upgrades"], list)
    assert isinstance(b["cpu_upgrades"], list)


# --- wizard (core product) ----------------------------------------------------

def test_wizard_respects_budget(client: httpx.Client):
    budget = 8000
    r = client.post("/wizard/", json={"budget_brl": budget, "games": ["cs2"],
                                      "resolution": "1080p", "priority": "budget"})
    assert r.status_code == 200
    b = r.json()
    assert "candidates" in b and isinstance(b["candidates"], list)
    for cand in b["candidates"]:
        assert cand["total_price_brl"] <= budget + 0.01, (
            f"candidate over budget: {cand['total_price_brl']} > {budget}"
        )


def test_wizard_rejects_zero_budget(client: httpx.Client):
    r = client.post("/wizard/", json={"budget_brl": 0, "games": ["cs2"]})
    assert r.status_code == 422


# --- tracking + affiliate redirect -------------------------------------------

def test_track_click_unknown_ignored(client: httpx.Client):
    r = client.post("/track/click", json={"offer_id": 999999})
    assert r.status_code == 200
    assert r.json()["status"] == "ignored"


def test_go_redirect_records_and_302(client: httpx.Client, ids: dict, cleanup_clicks):
    best = client.get("/offers/best", params={"product": ids["gpu_id"]}).json()
    if not best:
        pytest.skip("no sample offer for the anchor GPU")
    r = client.get(f"/go/{best['id']}", params={"utm_source": "pytest"})
    assert r.status_code == 302
    assert r.headers.get("location", "").startswith("http")


def test_go_unknown_404(client: httpx.Client):
    assert client.get("/go/999999").status_code == 404


def test_go_invalid_id_422(client: httpx.Client):
    assert client.get("/go/abc").status_code == 422
