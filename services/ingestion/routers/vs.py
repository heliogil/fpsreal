"""GPU head-to-head comparison.

GET /vs/{sku_a}/{sku_b}?res=1080p

Returns an FPS-by-game comparison of two GPUs using a fixed reference CPU
(Ryzen 5 7600, mid-tier) so the delta reflects GPU performance alone.
All figures are anchor+scale estimates.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import FpsEstimate, PerformanceIndex, Product

router = APIRouter(tags=["vs"])

REFERENCE_CPU_SKU = "cpu-r5-7600"

GAME_LABELS: dict[str, str] = {
    "apex-legends":         "Apex Legends",
    "call-of-duty-warzone": "COD: Warzone",
    "cs2":                  "Counter-Strike 2",
    "cyberpunk-2077":       "Cyberpunk 2077",
    "elden-ring":           "Elden Ring",
    "fortnite":             "Fortnite",
    "gta-v":                "Grand Theft Auto V",
    "hogwarts-legacy":      "Hogwarts Legacy",
    "league-of-legends":    "League of Legends",
    "minecraft":            "Minecraft",
    "rdr2":                 "Red Dead Redemption 2",
    "the-sims-4":           "The Sims 4",
    "valorant":             "Valorant",
}

GAME_ORDER = [
    "cs2", "valorant", "league-of-legends", "fortnite", "apex-legends",
    "call-of-duty-warzone", "gta-v", "minecraft", "the-sims-4",
    "hogwarts-legacy", "rdr2", "cyberpunk-2077", "elden-ring",
]


class GpuSpec(BaseModel):
    id: int
    sku: str
    name: str
    brand: str
    tdp_w: int
    vram_gb: int
    length_mm: int
    fps_1080p_agg: int
    index_value: float


class GameRow(BaseModel):
    game_slug: str
    game_label: str
    fps_a: float
    fps_b: float
    delta_pct: float
    winner: Literal["a", "b", "tie"]


class VsResponse(BaseModel):
    gpu_a: GpuSpec
    gpu_b: GpuSpec
    resolution: str
    reference_cpu_name: str
    reference_cpu_sku: str
    overall_winner: Literal["a", "b", "tie"]
    avg_fps_a: float
    avg_fps_b: float
    avg_delta_pct: float
    rows: list[GameRow]


def _to_spec(p: Product, index_value: float) -> GpuSpec:
    s = p.specs or {}
    return GpuSpec(
        id=p.id,
        sku=p.sku,
        name=p.name,
        brand=p.brand or "",
        tdp_w=int(s.get("tdp_w", 0)),
        vram_gb=int(s.get("vram_gb", 0)),
        length_mm=int(s.get("length_mm", 0)),
        fps_1080p_agg=int(s.get("fps_1080p_agg", 0)),
        index_value=float(index_value),
    )


def _decide(delta_pct: float) -> Literal["a", "b", "tie"]:
    if delta_pct > 2.0:
        return "a"
    if delta_pct < -2.0:
        return "b"
    return "tie"


@router.get("/{sku_a}/{sku_b}", response_model=VsResponse)
async def compare_gpus(
    sku_a: str,
    sku_b: str,
    res: str = Query("1080p", pattern="^(1080p|1440p|4k)$"),
    db: AsyncSession = Depends(get_db),
) -> VsResponse:
    gpu_a = (await db.execute(
        select(Product).where(Product.sku == sku_a, Product.category == "gpu")
    )).scalar_one_or_none()
    if not gpu_a:
        raise HTTPException(404, detail=f"GPU not found: {sku_a}")

    gpu_b = (await db.execute(
        select(Product).where(Product.sku == sku_b, Product.category == "gpu")
    )).scalar_one_or_none()
    if not gpu_b:
        raise HTTPException(404, detail=f"GPU not found: {sku_b}")

    ref_cpu = (await db.execute(
        select(Product).where(Product.sku == REFERENCE_CPU_SKU)
    )).scalar_one_or_none()
    if not ref_cpu:
        raise HTTPException(500, detail="Reference CPU not configured")

    pi_rows = (await db.execute(
        select(PerformanceIndex).where(
            PerformanceIndex.product_id.in_([gpu_a.id, gpu_b.id]),
            PerformanceIndex.benchmark_type == "gaming_1080p",
        )
    )).scalars().all()
    pi_map = {r.product_id: float(r.index_value) for r in pi_rows}

    fps_rows = (await db.execute(
        select(FpsEstimate).where(
            FpsEstimate.cpu_id == ref_cpu.id,
            FpsEstimate.gpu_id.in_([gpu_a.id, gpu_b.id]),
            FpsEstimate.resolution == res,
            FpsEstimate.preset == "high",
        )
    )).scalars().all()

    fps_a: dict[str, float] = {}
    fps_b: dict[str, float] = {}
    for r in fps_rows:
        if r.gpu_id == gpu_a.id:
            fps_a[r.game_slug] = float(r.fps_estimate)
        else:
            fps_b[r.game_slug] = float(r.fps_estimate)

    rows: list[GameRow] = []
    for slug in GAME_ORDER:
        fa = fps_a.get(slug)
        fb = fps_b.get(slug)
        if fa is None or fb is None:
            continue
        delta = round((fa / fb - 1) * 100, 1) if fb > 0 else 0.0
        rows.append(GameRow(
            game_slug=slug,
            game_label=GAME_LABELS.get(slug, slug),
            fps_a=round(fa, 1),
            fps_b=round(fb, 1),
            delta_pct=delta,
            winner=_decide(delta),
        ))

    avg_a = round(sum(r.fps_a for r in rows) / len(rows), 1) if rows else 0.0
    avg_b = round(sum(r.fps_b for r in rows) / len(rows), 1) if rows else 0.0
    avg_delta = round((avg_a / avg_b - 1) * 100, 1) if avg_b > 0 else 0.0

    return VsResponse(
        gpu_a=_to_spec(gpu_a, pi_map.get(gpu_a.id, 0.0)),
        gpu_b=_to_spec(gpu_b, pi_map.get(gpu_b.id, 0.0)),
        resolution=res,
        reference_cpu_name=ref_cpu.name,
        reference_cpu_sku=ref_cpu.sku,
        overall_winner=_decide(avg_delta),
        avg_fps_a=avg_a,
        avg_fps_b=avg_b,
        avg_delta_pct=avg_delta,
        rows=rows,
    )
