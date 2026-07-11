"""Smoke tests — construct the app and assert every router is wired.

This is the direct regression guard for the bug class where a router is
*referenced* (``app.include_router(vs.router, ...)``) but never *imported*:
that raises ``NameError`` at import time, so simply importing ``main`` here
fails loudly at collection. No DB connection or network is needed
(``create_async_engine`` does not connect until the first query), only the
``DATABASE_URL`` env var, which is present in the container and in CI.

Route registration is checked via the OpenAPI schema (``app.openapi()``), the
version-stable flattened list of real paths — ``app.routes`` keeps included
routers as nested wrapper objects on this FastAPI version.
"""
from __future__ import annotations

import importlib

# Every router prefix + route that must stay wired. If someone adds a router
# and forgets to import it (or drops one), this set diverges and the test fails.
EXPECTED_ROUTES = {
    "/",
    "/health",
    "/products/",
    "/products/{product_id}",
    "/builds/",
    "/wizard/",
    "/fps/",
    "/offers/best",
    "/compatibility/check",
    "/interior/estimate",
    "/upgrade/advise",
    "/track/click",
    "/go/{offer_id}",
    "/vs/{sku_a}/{sku_b}",
}


def test_app_constructs():
    main = importlib.import_module("main")
    assert main.app is not None


def test_all_routers_registered():
    main = importlib.import_module("main")
    paths = set(main.app.openapi()["paths"].keys())
    missing = EXPECTED_ROUTES - paths
    assert not missing, (
        f"routes not registered (router imported but not wired, or vice-versa?): {missing}"
    )
