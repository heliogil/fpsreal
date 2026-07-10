"""Wizard endpoint — the core of the product.

Takes a budget + games + a **priority mode** and returns the top complete
builds. For each CPU+GPU pair it auto-selects the cheapest *compatible*
motherboard, RAM, PSU, cooler, case and storage (the selection itself adapts
to the mode), then ranks by a mode-specific metric.

Modes (``priority``):
- ``budget``      — best cost per FPS: maximise ``avg_fps / total_price`` (default).
- ``fps``         — max FPS in budget: maximise ``avg_fps`` (spends up to budget).
- ``quiet``       — FPS per watt: maximise ``avg_fps / system_tdp``; forces an
                    aftermarket cooler with ≥50% TDP headroom (no stock).
- ``future_proof``— longevity: AM5 only + 32GB RAM + PSU ×1.5 headroom + 2TB SSD;
                    ranks by ``avg_fps × VRAM bonus``.

Every FPS figure is an anchor+scale **estimate** (``method`` + confidence band);
the API never claims figures were measured. FPS for any CPU is estimated via its
tier's representative in the seeded matrix.
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

TIER_TO_MATRIX_SKU = {
    "flagship": "cpu-r7-9800x3d",
    "high": "cpu-r5-7600",
    "mid": "cpu-r5-7600",
    "budget": "cpu-r5-5600",
}
PSU_OVERHEAD_W = 100.0
PSU_HEADROOM = {"future_proof": 1.5}
PSU_HEADROOM_DEFAULT = 1.25
QUIET_COOLER_MULT = 1.5          # quiet mode wants a cooler with big headroom
FUTUREPROOF_MIN_RAM_GB = 32
FUTUREPROOF_MIN_STORAGE_GB = 2000
DEAD_END_SOCKETS = {"AM4"}       # excluded in future_proof (no upgrade path)

_BUILD_SLOTS = ("cpu", "gpu", "motherboard", "ram", "psu", "cooler", "case", "storage")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class WizardRequest(BaseModel):
    budget_brl: Decimal = Field(..., gt=0, le=Decimal("100000"))
    games: List[str] = Field(default_factory=list)
    resolution: str = Field("1080p", pattern="^(1080p|1440p|4k)$")
    preset: str = Field("high", pattern="^(low|medium|high|ultra)$")
    priority: str = Field(
        "budget",
        pattern="^(budget|fps|quiet|future_proof)$",
        description="Ranking mode: budget | fps | quiet | future_proof.",
    )


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
    total_tdp_w: float
    avg_fps: float
    fps_per_brl: float
    fps_figures: List[FpsFigure]
    components: List[ComponentOut]
    method: str = "anchor_scale_estimate"


class WizardResponse(BaseModel):
    budget_brl: float
    resolution: str
    preset: str
    priority: str
    candidates: List[BuildCandidate]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/", response_model=WizardResponse)
async def run_wizard(body: WizardRequest, db: AsyncSession = Depends(get_db)) -> WizardResponse:
    budget = Decimal(body.budget_brl)
    mode = body.priority
    catalog = await _load_catalog(db)
    cpus, gpus = catalog.get("cpu", []), catalog.get("gpu", [])
    if not cpus or not gpus:
        raise HTTPException(status_code=404, detail="Catalog has no priced CPUs/GPUs yet.")

    gpus_by_id = {g["product_id"]: g for g in gpus}
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
            built = _complete_build(cpu, gpu, catalog, mode)
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
            total_tdp = _fnum(cpu["specs"], "tdp_w") + _fnum(gpu["specs"], "tdp_w")
            candidates.append(
                BuildCandidate(
                    cpu_id=cpu["product_id"],
                    gpu_id=gpu["product_id"],
                    total_price_brl=float(total),
                    total_tdp_w=total_tdp,
                    avg_fps=round(avg_fps, 1),
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
        raise HTTPException(status_code=404, detail="No complete build fits the budget in this mode.")

    candidates.sort(key=lambda c: _metric(mode, c, gpus_by_id), reverse=True)
    return WizardResponse(
        budget_brl=float(budget),
        resolution=body.resolution,
        preset=body.preset,
        priority=mode,
        candidates=candidates[:3],
    )


# ---------------------------------------------------------------------------
# Ranking metric per mode
# ---------------------------------------------------------------------------


def _metric(mode: str, c: BuildCandidate, gpus_by_id: Dict[int, dict]) -> float:
    if mode == "fps":
        return c.avg_fps
    if mode == "quiet":
        return c.avg_fps / max(c.total_tdp_w, 1.0)
    if mode == "future_proof":
        vram = _fnum(gpus_by_id.get(c.gpu_id, {}).get("specs", {}), "vram_gb")
        return c.avg_fps * (1.0 + vram / 24.0)
    return c.fps_per_brl  # budget (default)


# ---------------------------------------------------------------------------
# Catalog / build completion
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
        if p.id not in cheapest:
            continue
        catalog.setdefault(p.category, []).append({
            "product_id": p.id, "name": p.name, "sku": p.sku,
            "price": cheapest[p.id], "specs": p.specs or {},
        })
    for items in catalog.values():
        items.sort(key=lambda x: x["price"])
    return catalog


def _cheapest_where(items: List[dict], pred) -> Optional[dict]:
    for it in items:
        if pred(it):
            return it
    return None


def _fnum(specs: dict, key: str) -> float:
    try:
        return float(specs.get(key))
    except (TypeError, ValueError):
        return 0.0


def _complete_build(
    cpu: dict, gpu: dict, catalog: Dict[str, List[dict]], mode: str
) -> Optional[Tuple[dict, Decimal]]:
    """Cheapest compatible mobo/ram/psu/cooler/case/storage. Selection adapts to mode."""
    socket = cpu["specs"].get("socket")
    cpu_tdp = _fnum(cpu["specs"], "tdp_w")
    gpu_tdp = _fnum(gpu["specs"], "tdp_w")
    gpu_len = _fnum(gpu["specs"], "length_mm")

    if mode == "future_proof" and socket in DEAD_END_SOCKETS:
        return None  # no upgrade path

    mobo = _cheapest_where(catalog.get("motherboard", []), lambda m: m["specs"].get("socket") == socket)
    if not mobo:
        return None
    ram_type = mobo["specs"].get("ram_type")
    ram_min = FUTUREPROOF_MIN_RAM_GB if mode == "future_proof" else 0
    ram = _cheapest_where(
        catalog.get("ram", []),
        lambda r: r["specs"].get("type") == ram_type and _fnum(r["specs"], "capacity_gb") >= ram_min,
    )
    if not ram:
        return None

    headroom = PSU_HEADROOM.get(mode, PSU_HEADROOM_DEFAULT)
    need_w = (cpu_tdp + gpu_tdp + PSU_OVERHEAD_W) * headroom
    psu = _cheapest_where(catalog.get("psu", []), lambda p: _fnum(p["specs"], "watts") >= need_w)
    if not psu:
        return None

    cool_mult = QUIET_COOLER_MULT if mode == "quiet" else 1.0
    cooler = _cheapest_where(
        catalog.get("cooler", []),
        lambda c: _fnum(c["specs"], "tdp_rating_w") >= cpu_tdp * cool_mult
        and (mode != "quiet" or c["specs"].get("cooler_type") != "stock"),
    )
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
    if mode == "future_proof":
        storage = _cheapest_where(
            storage_list, lambda s: _fnum(s["specs"], "capacity_gb") >= FUTUREPROOF_MIN_STORAGE_GB
        ) or storage_list[0]
    else:
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
