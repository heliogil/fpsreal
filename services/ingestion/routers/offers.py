"""Offer (price) endpoints.

Prices come exclusively from official affiliate feeds; until a feed is wired
these return honest-empty results ([] / null). Shapes match the web contract
(``types.ts`` → ``Offer & { merchant: Merchant }``): DB ``is_available`` maps
to ``in_stock`` and ``last_seen_at`` to ``last_checked_at``.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import Merchant, Offer, PriceHistory, Variant

router = APIRouter(tags=["offers"])


def _merchant(m: Merchant) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "slug": m.slug,
        "affiliate_base_url": m.affiliate_base_url or "",
        "affiliate_param": "",  # not modelled yet; feed integration will set it
        "is_active": m.is_active,
        "created_at": None,
    }


def _offer_with_merchant(o: Offer, m: Merchant) -> dict:
    return {
        "id": o.id,
        "variant_id": o.variant_id,
        "merchant_id": o.merchant_id,
        "price_brl": float(o.price_brl),
        "in_stock": o.is_available,
        "url": o.affiliate_url or o.url,
        "last_checked_at": o.last_seen_at.isoformat() if o.last_seen_at else None,
        "merchant": _merchant(m),
    }


@router.get("", response_model=None)
@router.get("/", response_model=None)
async def list_offers(
    variant: int = Query(..., description="Variant id"),
    db: AsyncSession = Depends(get_db),
):
    """All available offers for a variant, joined with merchant."""
    stmt = (
        select(Offer, Merchant)
        .join(Merchant, Merchant.id == Offer.merchant_id)
        .where(Offer.variant_id == variant, Offer.is_available.is_(True))
        .order_by(Offer.price_brl.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [_offer_with_merchant(o, m) for o, m in rows]


@router.get("/best", response_model=None)
async def best_offer(
    product: int = Query(..., description="Product id"),
    db: AsyncSession = Depends(get_db),
):
    """Cheapest available offer across all variants of a product."""
    stmt = (
        select(Offer, Merchant)
        .join(Merchant, Merchant.id == Offer.merchant_id)
        .join(Variant, Variant.id == Offer.variant_id)
        .where(Variant.product_id == product, Offer.is_available.is_(True))
        .order_by(Offer.price_brl.asc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    o, m = row
    return _offer_with_merchant(o, m)


@router.get("/{offer_id}/history", response_model=None)
async def price_history(
    offer_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Price history points for an offer, newest first."""
    stmt = (
        select(PriceHistory)
        .where(PriceHistory.offer_id == offer_id)
        .order_by(PriceHistory.recorded_at.desc())
        .limit(500)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"ts": r.recorded_at.isoformat() if r.recorded_at else None,
         "price_brl": float(r.price_brl)}
        for r in rows
    ]
