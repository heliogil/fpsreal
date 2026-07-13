"""FPS estimate endpoints."""
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
    game: Optional[str] = Query(None),
    res: Optional[str] = Query(None),
    preset: str = Query("high"),
    db: AsyncSession = Depends(get_db),
):
    """Single estimate (game given) or full list for a cpu+gpu pair."""
    stmt = select(FpsEstimate).where(
        FpsEstimate.cpu_id == cpu, FpsEstimate.gpu_id == gpu
    )
    if res:
        stmt = stmt.where(FpsEstimate.resolution == res)
    if game:
        stmt = stmt.where(FpsEstimate.game_slug == game, FpsEstimate.preset == preset).limit(1)
        row = (await db.execute(stmt)).scalar_one_or_none()
        return _serialize(row) if row else None
    rows = (await db.execute(stmt.order_by(FpsEstimate.game_slug))).scalars().all()
    return [_serialize(r) for r in rows]


@router.get("/by-cpu", response_model=None)
async def fps_by_cpu(
    cpu: int = Query(..., description="CPU product id"),
    res: Optional[str] = Query(None, description="1080p | 1440p | 4k"),
    preset: str = Query("high"),
    db: AsyncSession = Depends(get_db),
):
    """All FPS estimates for one CPU across every GPU in the DB.

    Replaces N parallel /fps?cpu=&gpu= calls on the /pecas page with a single
    query. Returns a dict keyed by gpu_id for O(1) lookup on the client.
    """
    stmt = select(FpsEstimate).where(FpsEstimate.cpu_id == cpu)
    if res:
        stmt = stmt.where(FpsEstimate.resolution == res)
    if preset:
        stmt = stmt.where(FpsEstimate.preset == preset)
    rows = (await db.execute(stmt.order_by(FpsEstimate.gpu_id, FpsEstimate.game_slug))).scalars().all()
    # Group by gpu_id -> game_slug -> fps
    out: dict = {}
    for r in rows:
        gpu_key = str(r.gpu_id)
        out.setdefault(gpu_key, {})[r.game_slug] = float(r.fps_estimate)
    return out
