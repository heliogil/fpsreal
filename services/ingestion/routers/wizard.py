"""Wizard endpoint — the core of the product.

Accepts a budget + game list and returns the top 3 builds ranked by
``fps_per_brl``. Every FPS figure returned carries
``method="anchor_scale_estimate"`` and a confidence band — the API never
claims that figures were measured on hardware.
"""
from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import (
    CuratedBuild,
    FpsEstimate,
    Offer,
    Product,
    Variant,
)

router = APIRouter(tags=["wizard"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class WizardRequest(BaseModel):
    budget_brl: Decimal = Field(..., gt=0, le=Decimal("100000"))
    games: List[str] = Field(default_factory=list)
    resolution: str = Field("1080p", pattern="^(1080p|1440p|4k)$")
    preset: str = Field("high", pattern="^(low|medium|high|ultra)$")
    priority: Optional[str] = Field(
        None,
        description="Optional preference: 'fps', 'silence', 'upgrade_path'.",
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


@router.post("/", response_model=WizardResponse)
async def run_wizard(
    body: WizardRequest,
    db: AsyncSession = Depends(get_db),
) -> WizardResponse:
    """Run the wizard and return up to three top builds.

    Algorithm:
    1. Pick all active CPU+GPU pairs whose combined cheapest price fits
       within ``budget_brl``.
    2. For each pair, look up ``fps_estimates`` for the requested games
       (or the default list) and average the ``fps_estimate`` values.
    3. Compute ``fps_per_brl = avg_fps / total_price_brl`` and keep the
       top three pairs.
    4. Each result row includes a ``method`` field of
       ``"anchor_scale_estimate"`` so the frontend never misrepresents
       the figures as measured.
    """
    budget = Decimal(body.budget_brl)
    resolution = body.resolution
    preset = body.preset
    games = body.games or []

    pairs = await _candidate_pairs(db, budget)
    if not pairs:
        raise HTTPException(
            status_code=404,
            detail="No CPU+GPU pairs fit within the requested budget.",
        )

    candidates: List[BuildCandidate] = []
    for pair in pairs:
        figures = await _fps_for_pair(db, pair["cpu_id"], pair["gpu_id"], games, resolution, preset)
        avg_fps = (
            sum(f["fps_estimate"] for f in figures) / len(figures) if figures else 0.0
        )
        total_price = float(pair["total_price_brl"])
        if total_price <= 0 or avg_fps <= 0:
            continue
        candidates.append(
            BuildCandidate(
                cpu_id=pair["cpu_id"],
                gpu_id=pair["gpu_id"],
                total_price_brl=total_price,
                fps_per_brl=avg_fps / total_price,
                fps_figures=[FpsFigure(**f) for f in figures],
                components=[
                    ComponentOut(
                        category="cpu",
                        product_id=pair["cpu_id"],
                        name=pair["cpu_name"],
                        cheapest_price_brl=float(pair["cpu_price"]),
                    ),
                    ComponentOut(
                        category="gpu",
                        product_id=pair["gpu_id"],
                        name=pair["gpu_name"],
                        cheapest_price_brl=float(pair["gpu_price"]),
                    ),
                ],
            )
        )

    candidates.sort(key=lambda c: c.fps_per_brl, reverse=True)
    top = candidates[:3]

    return WizardResponse(
        budget_brl=float(budget),
        resolution=resolution,
        preset=preset,
        candidates=top,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _candidate_pairs(db: AsyncSession, budget: Decimal) -> List[dict]:
    """Return a list of {cpu_id, gpu_id, cpu_name, gpu_name, prices, total}.

    For each CPU and GPU product we take the cheapest available offer
    across all variants and all merchants. We then keep only the pairs
    whose combined cheapest price fits the budget.
    """
    cpus = await _cheapest_offers_by_category(db, "cpu")
    gpus = await _cheapest_offers_by_category(db, "gpu")

    pairs: List[dict] = []
    for cpu in cpus:
        for gpu in gpus:
            total = cpu["price_brl"] + gpu["price_brl"]
            if total <= budget:
                pairs.append(
                    {
                        "cpu_id": cpu["product_id"],
                        "cpu_name": cpu["name"],
                        "cpu_price": cpu["price_brl"],
                        "gpu_id": gpu["product_id"],
                        "gpu_name": gpu["name"],
                        "gpu_price": gpu["price_brl"],
                        "total_price_brl": total,
                    }
                )
    return pairs


async def _cheapest_offers_by_category(db: AsyncSession, category: str) -> List[dict]:
    """For each product in a category, find the cheapest available offer."""
    products_stmt = select(Product).where(
        Product.category == category, Product.is_active.is_(True)
    )
    result = await db.execute(products_stmt)
    products = result.scalars().all()
    if not products:
        return []

    product_ids = [p.id for p in products]
    offers_stmt = (
        select(Offer, Variant)
        .join(Variant, Variant.id == Offer.variant_id)
        .where(Variant.product_id.in_(product_ids), Offer.is_available.is_(True))
        .order_by(Variant.product_id, Offer.price_brl.asc())
    )
    result = await db.execute(offers_stmt)
    rows = result.all()

    seen: dict = {}
    for offer, variant in rows:
        pid = variant.product_id
        if pid in seen:
            continue
        seen[pid] = {
            "product_id": pid,
            "name": next(p.name for p in products if p.id == pid),
            "price_brl": Decimal(offer.price_brl),
        }
    return list(seen.values())


async def _fps_for_pair(
    db: AsyncSession,
    cpu_id: int,
    gpu_id: int,
    games: List[str],
    resolution: str,
    preset: str,
) -> List[dict]:
    """Look up FPS estimates for a pair. Empty list means we have no data."""
    stmt = select(FpsEstimate).where(
        FpsEstimate.cpu_id == cpu_id,
        FpsEstimate.gpu_id == gpu_id,
        FpsEstimate.resolution == resolution,
        FpsEstimate.preset == preset,
    )
    if games:
        stmt = stmt.where(FpsEstimate.game_slug.in_(games))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: List[dict] = []
    for r in rows:
        out.append(
            {
                "game_slug": r.game_slug,
                "fps_estimate": float(r.fps_estimate),
                "confidence_band_pct": (
                    float(r.confidence_band_pct) if r.confidence_band_pct is not None else None
                ),
                "method": "anchor_scale_estimate",
                "sources": r.sources or [],
            }
        )
    return out
