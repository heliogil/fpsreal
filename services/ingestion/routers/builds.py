"""Curated builds endpoints.

The "Rei do FPS" of each tier is the build with ``is_rei=true`` and
``is_active=true``. The router also exposes a list endpoint for the SEO
comparative pages.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import CuratedBuild, Product

router = APIRouter(tags=["builds"])

ALLOWED_TIERS = {"r3k", "r5k", "r8k", "r12k_plus"}


class BuildComponent(BaseModel):
    id: int
    name: str
    category: str


class BuildOut(BaseModel):
    id: int
    slug: str
    name: str
    budget_tier: Optional[str]
    is_rei: bool
    total_price_brl: Optional[float]
    fps_per_brl: Optional[float]
    seo_description: Optional[str] = None
    is_active: bool
    crowned_at: Optional[str] = None
    components: dict  # category -> BuildComponent

    class Config:
        from_attributes = True


def _serialize(build: CuratedBuild, components: dict) -> BuildOut:
    return BuildOut(
        id=build.id,
        slug=build.slug,
        name=build.name,
        budget_tier=build.budget_tier,
        is_rei=build.is_rei,
        total_price_brl=(
            float(build.total_price_brl) if build.total_price_brl is not None else None
        ),
        fps_per_brl=(
            float(build.fps_per_brl) if build.fps_per_brl is not None else None
        ),
        seo_description=build.seo_description,
        is_active=build.is_active,
        crowned_at=build.crowned_at.isoformat() if build.crowned_at else None,
        components=components,
    )


@router.get("/", response_model=List[BuildOut])
async def list_builds(
    budget_tier: Optional[str] = Query(None),
    is_active: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> List[BuildOut]:
    """List curated builds, optionally filtered by tier."""
    stmt = select(CuratedBuild).where(CuratedBuild.is_active == is_active)
    if budget_tier:
        if budget_tier not in ALLOWED_TIERS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid budget_tier. Allowed: {sorted(ALLOWED_TIERS)}",
            )
        stmt = stmt.where(CuratedBuild.budget_tier == budget_tier)
    stmt = stmt.order_by(CuratedBuild.budget_tier, CuratedBuild.fps_per_brl.desc())
    result = await db.execute(stmt)
    builds = result.scalars().all()
    return [_serialize(b, await _load_components(db, b)) for b in builds]


@router.get("/{tier}/rei", response_model=BuildOut)
async def get_rei_of_tier(tier: str, db: AsyncSession = Depends(get_db)) -> BuildOut:
    """Return the *Rei do FPS* (is_rei=true) of a budget tier."""
    if tier not in ALLOWED_TIERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tier. Allowed: {sorted(ALLOWED_TIERS)}",
        )
    stmt = (
        select(CuratedBuild)
        .where(
            CuratedBuild.budget_tier == tier,
            CuratedBuild.is_rei.is_(True),
            CuratedBuild.is_active.is_(True),
        )
        .order_by(CuratedBuild.crowned_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    build = result.scalar_one_or_none()
    if build is None:
        raise HTTPException(
            status_code=404,
            detail=f"No active 'Rei do FPS' for tier {tier!r}",
        )
    return _serialize(build, await _load_components(db, build))


async def _load_components(db: AsyncSession, build: CuratedBuild) -> dict:
    """Load the eight component references for a build into a dict."""
    slot_attrs = {
        "cpu": build.cpu_id,
        "gpu": build.gpu_id,
        "ram": build.ram_id,
        "motherboard": build.motherboard_id,
        "storage": build.storage_id,
        "psu": build.psu_id,
        "case": build.case_id,
        "cooler": build.cooler_id,
    }
    ids = [i for i in slot_attrs.values() if i is not None]
    if not ids:
        return {}
    stmt = select(Product).where(Product.id.in_(ids))
    result = await db.execute(stmt)
    products = {p.id: p for p in result.scalars().all()}
    out: dict = {}
    for slot, pid in slot_attrs.items():
        p = products.get(pid)
        if p is None:
            continue
        out[slot] = {"id": p.id, "name": p.name, "category": p.category}
    return out
