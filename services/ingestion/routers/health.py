"""Health endpoint with database round-trip check."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    """Liveness + DB connectivity probe.

    Returns ``db: "connected"`` only if a trivial ``SELECT 1`` round-trip
    succeeds. The endpoint itself never raises — failure becomes a
    machine-readable status so the orchestrator can mark the service
    unhealthy without parsing exception bodies.
    """
    db_status = "disconnected"
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        # We deliberately swallow exceptions here — /health must always
        # return 200 with a useful payload so the load balancer can act.
        db_status = "disconnected"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "db": db_status,
        "version": "0.1.0",
    }
