"""Upgrade advisor — the "meu PC atual" purchase-intent hook.

POST /upgrade/advise
  { "gpu_name": "GeForce RTX 4060", "cpu_name"?: "Ryzen 5 5600",
    "cpu_id"?: int, "budget_brl"?: number, "games"?: [str], "resolution"?: "1080p" }

Matches the current GPU + CPU to the catalog and returns, in one call:
  - gpu_upgrades: hold the CPU, rank every affordable GPU by FPS gain
  - cpu_upgrades: hold the GPU, rank every affordable CPU by FPS gain

FPS is always an estimate. (POST /upgrade/gpu kept for backward-compat.)
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


class AdviseRequest(BaseModel):
    gpu_name: str = Field("", description="Detected/entered GPU model")
    cpu_name: str = Field("", description="Entered CPU model")
    cpu_id: Optional[int] = None
    budget_brl: Optional[float] = None
    games: List[str] = Field(default_factory=list)
    resolution: str = Field("1080p", pattern="^(1080p|1440p|4k)$")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _match(products, name: str):
    t = _norm(name)
    if not t:
        return None
    hits = [p for p in products if t in _norm(p.name) or _norm(p.name) in t]
    hits.sort(key=lambda p: len(p.name))
    return hits[0] if hits else None


async def _cheapest(db: AsyncSession, pids: List[int]) -> dict[int, dict]:
    rows = (
        await db.execute(
            select(Variant.product_id, Offer.id, Offer.price_brl)
            .join(Offer, Offer.variant_id == Variant.id)
            .where(Variant.product_id.in_(pids), Offer.is_available.is_(True))
            .order_by(Variant.product_id, Offer.price_brl.asc())
        )
    ).all()
    out: dict[int, dict] = {}
    for pid, oid, price in rows:
        if pid not in out:
            out[pid] = {"offer_id": oid, "price": float(price)}
    return out


async def _avg_fps(
    db: AsyncSession, *, cpu_ids: List[int], gpu_ids: List[int], games, resolution, key: str
) -> dict[int, float]:
    """Average FPS keyed by 'gpu' (vary GPU) or 'cpu' (vary CPU)."""
    stmt = select(FpsEstimate.cpu_id, FpsEstimate.gpu_id, FpsEstimate.fps_estimate).where(
        FpsEstimate.cpu_id.in_(cpu_ids),
        FpsEstimate.gpu_id.in_(gpu_ids),
        FpsEstimate.resolution == resolution,
        FpsEstimate.preset == "high",
        FpsEstimate.game_slug.in_(games),
    )
    rows = (await db.execute(stmt)).all()
    acc: dict[int, list] = {}
    for cid, gid, fps in rows:
        k = gid if key == "gpu" else cid
        acc.setdefault(k, []).append(float(fps))
    return {k: round(sum(v) / len(v), 1) for k, v in acc.items() if v}


def _rank(items, current_fps, budget, price_map, id_key):
    out = []
    for p, fps in items:
        pinfo = price_map.get(p.id)
        if fps is None or pinfo is None:
            continue
        price = pinfo["price"]
        if budget is not None and price > budget:
            continue
        gain = round(fps - current_fps, 1) if current_fps is not None else None
        if current_fps is not None and (gain is None or gain <= 0):
            continue
        out.append({
            id_key: p.id,
            "name": p.name,
            "brand": p.brand,
            "price_brl": price,
            "offer_id": pinfo["offer_id"],
            "avg_fps": fps,
            "gain_fps": gain,
            "gain_pct": round((gain / current_fps) * 100, 0) if (current_fps and gain is not None) else None,
            "fps_per_1k": round(fps / price * 1000, 1),
        })
    out.sort(key=lambda u: (u["gain_fps"] if u["gain_fps"] is not None else u["fps_per_1k"]), reverse=True)
    return out[:6]


@router.post("/advise", response_model=None)
async def advise(body: AdviseRequest, db: AsyncSession = Depends(get_db)):
    gpus = (await db.execute(select(Product).where(Product.category == "gpu", Product.is_active.is_(True)))).scalars().all()
    cpus = (await db.execute(select(Product).where(Product.category == "cpu", Product.is_active.is_(True)))).scalars().all()
    if not gpus or not cpus:
        return {"current": None, "gpu_upgrades": [], "cpu_upgrades": []}

    cur_gpu = _match(gpus, body.gpu_name)

    # Resolve current CPU: explicit id > name match > representative default.
    cur_cpu = next((c for c in cpus if c.id == body.cpu_id), None) if body.cpu_id else None
    matched_cpu = cur_cpu is not None
    if not cur_cpu and body.cpu_name:
        cur_cpu = _match(cpus, body.cpu_name)
        matched_cpu = cur_cpu is not None
    if not cur_cpu:
        cur_cpu = next((c for c in cpus if c.sku == DEFAULT_CPU_SKU), cpus[0])
        matched_cpu = False

    games = body.games or DEFAULT_GAMES
    gpu_ids = [g.id for g in gpus]
    cpu_ids = [c.id for c in cpus]
    price_gpu = await _cheapest(db, gpu_ids)
    price_cpu = await _cheapest(db, cpu_ids)

    # GPU upgrades: hold the current CPU, vary the GPU.
    fps_by_gpu = await _avg_fps(db, cpu_ids=[cur_cpu.id], gpu_ids=gpu_ids, games=games, resolution=body.resolution, key="gpu")
    cur_fps = fps_by_gpu.get(cur_gpu.id) if cur_gpu else None
    gpu_upgrades = _rank(
        [(g, fps_by_gpu.get(g.id)) for g in gpus if not cur_gpu or g.id != cur_gpu.id],
        cur_fps, body.budget_brl, price_gpu, "gpu_id",
    )

    # CPU upgrades: hold the current GPU, vary the CPU (needs a matched GPU).
    cpu_upgrades: list = []
    if cur_gpu:
        fps_by_cpu = await _avg_fps(db, cpu_ids=cpu_ids, gpu_ids=[cur_gpu.id], games=games, resolution=body.resolution, key="cpu")
        cur_fps_cpu = fps_by_cpu.get(cur_cpu.id)
        cpu_upgrades = _rank(
            [(c, fps_by_cpu.get(c.id)) for c in cpus if c.id != cur_cpu.id],
            cur_fps_cpu, body.budget_brl, price_cpu, "cpu_id",
        )

    return {
        "matched_gpu": bool(cur_gpu),
        "matched_cpu": matched_cpu,
        "resolution": body.resolution,
        "games": games,
        "current": {
            "gpu": {"name": cur_gpu.name if cur_gpu else body.gpu_name, "avg_fps": cur_fps},
            "cpu": {"name": cur_cpu.name, "id": cur_cpu.id},
        },
        "gpu_upgrades": gpu_upgrades,
        "cpu_upgrades": cpu_upgrades,
        "method": "anchor_scale_estimate",
    }


# Backward-compat: the older GPU-only endpoint delegates to /advise.
@router.post("/gpu", response_model=None)
async def upgrade_gpu(body: AdviseRequest, db: AsyncSession = Depends(get_db)):
    r = await advise(body, db)
    cur = r.get("current")
    return {
        "matched": r.get("matched_gpu"),
        "current": {"name": cur["gpu"]["name"], "avg_fps": cur["gpu"]["avg_fps"]} if cur else None,
        "upgrades": r.get("gpu_upgrades", []),
    }
