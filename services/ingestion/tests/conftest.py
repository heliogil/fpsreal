"""Shared fixtures for the ingestion contract/smoke tests.

The contract tests are black-box: they hit the running API over HTTP
(default ``http://localhost:8100``, overridable via ``PCB_TEST_BASE_URL``)
with a *synchronous* httpx client. Keeping them sync sidesteps the async
event-loop / connection-pool pitfalls of testing an asyncpg app in-process,
and lets the exact same suite run in CI against a ``docker compose up`` stack.

The smoke tests (test_smoke.py) don't use these fixtures — they import the app
directly to catch "router referenced but not imported" bugs at collection time.
"""
from __future__ import annotations

import os

import httpx
import pytest

BASE_URL = os.environ.get("PCB_TEST_BASE_URL", "http://localhost:8100")


@pytest.fixture(scope="session")
def client() -> httpx.Client:
    with httpx.Client(base_url=BASE_URL, timeout=20.0, follow_redirects=False) as c:
        yield c


@pytest.fixture(scope="session")
def ids(client: httpx.Client) -> dict:
    """Real catalog ids/skus derived from the API, so tests never hard-code them."""
    gpus = client.get("/products/", params={"category": "gpu", "limit": 200}).json()
    cpus = client.get("/products/", params={"category": "cpu", "limit": 200}).json()
    assert gpus, "no GPUs seeded"
    assert len(gpus) >= 2, "need at least two GPUs for /vs"
    assert cpus, "no CPUs seeded"
    return {
        "gpu_id": gpus[0]["id"],
        "gpu_sku": gpus[0]["sku"],
        "gpu_sku_b": gpus[1]["sku"],
        "cpu_id": cpus[0]["id"],
    }


@pytest.fixture
def cleanup_clicks():
    """Delete affiliate_clicks rows written by tests (utm_source='pytest')."""
    yield
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return
    import psycopg2

    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM affiliate_clicks WHERE utm_source = 'pytest'")
    finally:
        conn.close()
