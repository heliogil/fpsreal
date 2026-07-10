"""GPU upgrade advisor — the "meu PC atual" purchase-intent hook.

POST /upgrade/gpu
  { "gpu_name": "GeForce RTX 4060", "cpu_id"?: int, "budget_brl"?: number,
    "games"?: [str], "resolution"?: "1080p" }

Matches the detected GPU to the catalog, then ranks every GPU the budget
affords by FPS *gain* over the current one — the answer to "vale a pena o
upgrade?". FPS is always an estimate (same integrity rule).
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import FpsEstimate, Offer, Product, Variant

router = APIRouter(tags=["upgrade"])

DEFAULT_CPU_SKU = "cpu-r5-7600"
DEFAULT_GAMES = ["cs2", "fortnite", "gta-v", "cyberpunk-2077"]


class UpgradeRequest(BaseModel):
    gpu_name: str = Field(..., min_length=2)
    cpu_id: Optional[int] = None
    budget_brl: Optional[float] = None
    games: List[str] = Field(default_factory=list)
    resolution: str = Field("1080p", pattern="^(1080p|1440p|4k)$")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


async def _cheapest_by_gpu(db: AsyncSession, gpu_ids: List[int]) -> dict[int, dict]:
    rows = (
        await db.execute(
            select(Variant.product_id, Offer.id, Offer.price_brl)
            .join(Offer, Offer.variant_id == Variant.id)
            .where(Variant.product_id.in_(gpu_ids), Offer.is_available.is_(True))
            .order_by(Variant.product_id, Offer.price_brl.asc())
        )
    ).all()
    out: dict[int, dict] = {}
    for pid, oid, price in rows:
        if pid not in out:
            out[pid] = {"offer_id": oid, "price": float(price)}
    return out


async def _avg_fps_by_gpu(
    db: AsyncSession, cpu_id: int, gpu_ids: List[int], games: List[str], resolution: str
) -> dict[int, float]:
    stmt = select(FpsEstimate.gpu_id, FpsEstimate.fps_estimate).where(
        FpsEstimate.cpu_id == cpu_id,
        FpsEstimate.gpu_id.in_(gpu_ids),
        FpsEstimate.resolution == resolution,
        FpsEstimate.preset == "high",
        FpsEstimate.game_slug.in_(games),
    )
    rows = (await db.execute(stmt)).all()
    acc: dict[int, list] = {}
    for gid, fps in rows:
        acc.setdefault(gid, []).append(float(fps))
    return {g: round(sum(v) / len(v), 1) for g, v in acc.items() if v}


@router.post("/gpu", response_model=None)
async def upgrade_gpu(body: UpgradeRequest, db: AsyncSession = Depends(get_db)):
    gpus = (
        await db.execute(select(Product).where(Product.category == "gpu", Product.is_active.is_(True)))
    ).scalars().all()
    if not gpus:
        return {"matched": None, "current": None, "upgrades": []}

    # Match the detected name: prefer the shortest catalog name that overlaps.
    target = _norm(body.gpu_name)
    matches = [g for g in gpus if target and (target in _norm(g.name) or _norm(g.name) in target)]
    matches.sort(key=lambda g: len(g.name))
    current = matches[0] if matches else None

    # Representative CPU (upgrade holds the CPU constant).
    cpu_id = body.cpu_id
    if not cpu_id:
        cpu = (
            await db.execute(select(Product).where(Product.sku == DEFAULT_CPU_SKU))
        ).scalar_one_or_none()
        cpu_id = cpu.id if cpu else None
    if not cpu_id:
        return {"matched": None, "current": None, "upgrades": []}

    games = body.games or DEFAULT_GAMES
    gpu_ids = [g.id for g in gpus]
    fps_map = await _avg_fps_by_gpu(db, cpu_id, gpu_ids, games, body.resolution)
    price_map = await _cheapest_by_gpu(db, gpu_ids)

    cur_fps = fps_map.get(current.id) if current else None

    upgrades = []
    for g in gpus:
        if current and g.id == current.id:
            continue
        fps = fps_map.get(g.id)
        pinfo = price_map.get(g.id)
        if fps is None or pinfo is None:
            continue
        price = pinfo["price"]
        if body.budget_brl is not None and price > body.budget_brl:
            continue
        gain = round(fps - cur_fps, 1) if cur_fps is not None else None
        if cur_fps is not None and (gain is None or gain <= 0):
            continue  # only real upgrades
        upgrades.append({
            "gpu_id": g.id,
            "name": g.name,
            "brand": g.brand,
            "price_brl": price,
            "offer_id": pinfo["offer_id"],
            "avg_fps": fps,
            "gain_fps": gain,
            "gain_pct": round((gain / cur_fps) * 100, 0) if (cur_fps and gain is not None) else None,
            "fps_per_1k": round(fps / price * 1000, 1),
        })

    # Rank: by FPS gain when we know the current card, else by value (fps/R$).
    if cur_fps is not None:
        upgrades.sort(key=lambda u: (u["gain_fps"] or 0), reverse=True)
    else:
        upgrades.sort(key=lambda u: u["fps_per_1k"], reverse=True)

    return {
        "matched": bool(current),
        "cpu_id": cpu_id,
        "resolution": body.resolution,
        "games": games,
        "current": (
            {"gpu_id": current.id, "name": current.name, "avg_fps": cur_fps}
            if current else {"name": body.gpu_name, "avg_fps": None}
        ),
        "upgrades": upgrades[:6],
        "method": "anchor_scale_estimate",
    }
