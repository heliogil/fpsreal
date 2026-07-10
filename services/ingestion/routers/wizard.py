"""Wizard endpoint — the core of the product.

Takes a budget + games and returns the top builds ranked by **cost-per-FPS of
the complete build** (not just CPU+GPU). For each CPU+GPU pair it auto-selects
the cheapest *compatible* motherboard, RAM, PSU, cooler, case and storage, then
ranks by ``avg_fps / total_build_price``.

Every FPS figure is an anchor+scale **estimate** (``method`` +
``confidence_band``); the API never claims figures were measured on hardware.
FPS for any CPU is estimated via its tier's representative in the seeded matrix.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import FpsEstimate, Offer, Product, Variant

router = APIRouter(tags=["wizard"])

# CPUs with seeded FPS rows; every CPU maps to its tier's representative.
TIER_TO_MATRIX_SKU = {
    "flagship": "cpu-r7-9800x3d",
    "high": "cpu-r5-7600",
    "mid": "cpu-r5-7600",
    "budget": "cpu-r5-5600",
}
PSU_HEADROOM = 1.25
PSU_OVERHEAD_W = 100.0


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class WizardRequest(BaseModel):
    budget_brl: Decimal = Field(..., gt=0, le=Decimal("100000"))
    games: List[str] = Field(default_factory=list)
    resolution: str = Field("1080p", pattern="^(1080p|1440p|4k)$")
    preset: str = Field("high", pattern="^(low|medium|high|ultra)$")
    priority: Optional[str] = Field(None, description="'fps', 'silence', 'upgrade_path'.")


class FpsFigure(BaseModel):
    game_slug: str
    fps_estimate: float
    confidence_band_pct: Optional[float] = None
    method: str = "anchor_scale_estimate"
    sources: Optional[List[str]] = None


class ComponentOut(BaseModel):
    category: str
    product_id: int
    name: str
    cheapest_price_brl: float


class BuildCandidate(BaseModel):
    cpu_id: int
    gpu_id: int
    total_price_brl: float
    fps_per_brl: float
    fps_figures: List[FpsFigure]
    components: List[ComponentOut]
    method: str = "anchor_scale_estimate"


class WizardResponse(BaseModel):
    budget_brl: float
    resolution: str
    preset: str
    candidates: List[BuildCandidate]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

# Fixed slot order for a complete build.
_BUILD_SLOTS = ("cpu", "gpu", "motherboard", "ram", "psu", "cooler", "case", "storage")


@router.post("/", response_model=WizardResponse)
async def run_wizard(body: WizardRequest, db: AsyncSession = Depends(get_db)) -> WizardResponse:
    budget = Decimal(body.budget_brl)
    catalog = await _load_catalog(db)
    cpus, gpus = catalog.get("cpu", []), catalog.get("gpu", [])
    if not cpus or not gpus:
        raise HTTPException(status_code=404, detail="Catalog has no priced CPUs/GPUs yet.")

    sku_to_id = {c["sku"]: c["product_id"] for c in cpus}
    matrix_ids = {t: sku_to_id.get(s) for t, s in TIER_TO_MATRIX_SKU.items()}
    fps_map = await _load_fps(
        db, [i for i in matrix_ids.values() if i], [g["product_id"] for g in gpus],
        body.games, body.resolution, body.preset,
    )

    candidates: List[BuildCandidate] = []
    for cpu in cpus:
        matrix_cpu = matrix_ids.get(cpu["specs"].get("game_tier")) or cpu["product_id"]
        for gpu in gpus:
            if cpu["price"] + gpu["price"] > budget:
                continue
            built = _complete_build(cpu, gpu, catalog)
            if built is None:
                continue
            parts, total = built
            if total > budget or total <= 0:
                continue
            figures = fps_map.get((matrix_cpu, gpu["product_id"]), [])
            if not figures:
                continue
            avg_fps = sum(f["fps_estimate"] for f in figures) / len(figures)
            if avg_fps <= 0:
                continue
            candidates.append(
                BuildCandidate(
                    cpu_id=cpu["product_id"],
                    gpu_id=gpu["product_id"],
                    total_price_brl=float(total),
                    fps_per_brl=avg_fps / float(total),
                    fps_figures=[FpsFigure(**f) for f in figures],
                    components=[
                        ComponentOut(
                            category=slot,
                            product_id=parts[slot]["product_id"],
                            name=parts[slot]["name"],
                            cheapest_price_brl=float(parts[slot]["price"]),
                        )
                        for slot in _BUILD_SLOTS
                    ],
                )
            )

    if not candidates:
        raise HTTPException(status_code=404, detail="No complete build fits the budget with FPS data.")

    candidates.sort(key=lambda c: c.fps_per_brl, reverse=True)
    return WizardResponse(
        budget_brl=float(budget),
        resolution=body.resolution,
        preset=body.preset,
        candidates=candidates[:3],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_catalog(db: AsyncSession) -> Dict[str, List[dict]]:
    """All active, *priced* products by category, each sorted cheapest-first."""
    products = (
        await db.execute(select(Product).where(Product.is_active.is_(True)))
    ).scalars().all()
    if not products:
        return {}
    ids = [p.id for p in products]
    offer_rows = (
        await db.execute(
            select(Variant.product_id, Offer.price_brl)
            .join(Offer, Offer.variant_id == Variant.id)
            .where(Variant.product_id.in_(ids), Offer.is_available.is_(True))
            .order_by(Variant.product_id, Offer.price_brl.asc())
        )
    ).all()
    cheapest: Dict[int, Decimal] = {}
    for pid, price in offer_rows:
        if pid not in cheapest:
            cheapest[pid] = Decimal(price)

    catalog: Dict[str, List[dict]] = {}
    for p in products:
        if p.id not in cheapest:  # no price -> cannot be part of a priced build
            continue
        catalog.setdefault(p.category, []).append({
            "product_id": p.id, "name": p.name, "sku": p.sku,
            "price": cheapest[p.id], "specs": p.specs or {},
        })
    for items in catalog.values():
        items.sort(key=lambda x: x["price"])
    return catalog


def _cheapest_where(items: List[dict], pred) -> Optional[dict]:
    """First (cheapest, since pre-sorted) item satisfying pred."""
    for it in items:
        if pred(it):
            return it
    return None


def _fnum(specs: dict, key: str) -> float:
    try:
        return float(specs.get(key))
    except (TypeError, ValueError):
        return 0.0


def _complete_build(cpu: dict, gpu: dict, catalog: Dict[str, List[dict]]) -> Optional[Tuple[dict, Decimal]]:
    """Pick the cheapest compatible mobo/ram/psu/cooler/case/storage. None if any is missing."""
    socket = cpu["specs"].get("socket")
    cpu_tdp = _fnum(cpu["specs"], "tdp_w")
    gpu_tdp = _fnum(gpu["specs"], "tdp_w")
    gpu_len = _fnum(gpu["specs"], "length_mm")

    mobo = _cheapest_where(catalog.get("motherboard", []), lambda m: m["specs"].get("socket") == socket)
    if not mobo:
        return None
    ram_type = mobo["specs"].get("ram_type")
    ram = _cheapest_where(catalog.get("ram", []), lambda r: r["specs"].get("type") == ram_type)
    if not ram:
        return None
    need_w = (cpu_tdp + gpu_tdp + PSU_OVERHEAD_W) * PSU_HEADROOM
    psu = _cheapest_where(catalog.get("psu", []), lambda p: _fnum(p["specs"], "watts") >= need_w)
    if not psu:
        return None
    cooler = _cheapest_where(catalog.get("cooler", []), lambda c: _fnum(c["specs"], "tdp_rating_w") >= cpu_tdp)
    if not cooler:
        return None
    cooler_h = _fnum(cooler["specs"], "height_mm")
    case = _cheapest_where(
        catalog.get("case", []),
        lambda k: _fnum(k["specs"], "max_gpu_length_mm") >= gpu_len
        and _fnum(k["specs"], "max_cooler_height_mm") >= cooler_h,
    )
    if not case:
        return None
    storage_list = catalog.get("storage", [])
    if not storage_list:
        return None
    storage = storage_list[0]

    parts = {
        "cpu": cpu, "gpu": gpu, "motherboard": mobo, "ram": ram,
        "psu": psu, "cooler": cooler, "case": case, "storage": storage,
    }
    total = sum(p["price"] for p in parts.values())
    return parts, total


async def _load_fps(
    db: AsyncSession,
    matrix_cpu_ids: List[int],
    gpu_ids: List[int],
    games: List[str],
    resolution: str,
    preset: str,
) -> Dict[Tuple[int, int], List[dict]]:
    """One query: (matrix_cpu_id, gpu_id) -> list of FPS figures."""
    if not matrix_cpu_ids or not gpu_ids:
        return {}
    stmt = select(FpsEstimate).where(
        FpsEstimate.cpu_id.in_(matrix_cpu_ids),
        FpsEstimate.gpu_id.in_(gpu_ids),
        FpsEstimate.resolution == resolution,
        FpsEstimate.preset == preset,
    )
    if games:
        stmt = stmt.where(FpsEstimate.game_slug.in_(games))
    rows = (await db.execute(stmt)).scalars().all()
    out: Dict[Tuple[int, int], List[dict]] = {}
    for r in rows:
        out.setdefault((r.cpu_id, r.gpu_id), []).append({
            "game_slug": r.game_slug,
            "fps_estimate": float(r.fps_estimate),
            "confidence_band_pct": (
                float(r.confidence_band_pct) if r.confidence_band_pct is not None else None
            ),
            "method": "anchor_scale_estimate",
            "sources": r.sources or [],
        })
    return out
