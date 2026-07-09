"""FPS estimate endpoints.

Serves the anchor+scale estimates seeded in ``fps_estimates``. Shape matches
the web repository contract (``apps/web/src/lib/repositories/types.ts`` →
``FpsEstimate``): ``fps`` (not ``fps_estimate``), ``sources`` as a string list.

Integrity: every row carries ``method`` and ``confidence_band_pct``. The API
never presents these as measured figures.

Contract (mirrors ``api.ts`` LiveFpsRepo):
- ``GET /fps?cpu=&gpu=&game=&res=``  → single ``FpsEstimate`` or ``null``
- ``GET /fps?cpu=&gpu=``             → ``FpsEstimate[]`` (all games/resolutions)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import FpsEstimate

router = APIRouter(tags=["fps"])


def _serialize(r: FpsEstimate) -> dict:
    return {
        "id": r.id,
        "cpu_id": r.cpu_id,
        "gpu_id": r.gpu_id,
        "game_slug": r.game_slug,
        "resolution": r.resolution,
        "preset": r.preset,
        "fps": float(r.fps_estimate),
        "confidence_band_pct": (
            float(r.confidence_band_pct) if r.confidence_band_pct is not None else None
        ),
        "method": r.method or "anchor_scale",
        "sources": r.sources or [],
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("", response_model=None)
@router.get("/", response_model=None)
async def get_fps(
    cpu: int = Query(..., description="CPU product id"),
    gpu: int = Query(..., description="GPU product id"),
    game: Optional[str] = Query(None, description="Game slug; if set, returns a single estimate"),
    res: Optional[str] = Query(None, description="Resolution: 1080p | 1440p | 4k"),
    preset: str = Query("high", description="Graphics preset"),
    db: AsyncSession = Depends(get_db),
):
    """Return a single estimate (when ``game`` is given) or the full list."""
    stmt = select(FpsEstimate).where(
        FpsEstimate.cpu_id == cpu, FpsEstimate.gpu_id == gpu
    )
    if res:
        stmt = stmt.where(FpsEstimate.resolution == res)

    if game:
        stmt = stmt.where(
            FpsEstimate.game_slug == game, FpsEstimate.preset == preset
        ).limit(1)
        row = (await db.execute(stmt)).scalar_one_or_none()
        return _serialize(row) if row else None

    rows = (await db.execute(stmt.order_by(FpsEstimate.game_slug))).scalars().all()
    return [_serialize(r) for r in rows]
