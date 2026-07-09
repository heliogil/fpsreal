"""Catalog products endpoints.

Read-only views over the ``products`` table joined with their cheapest
available offer. No mutations — ingestion is the only writer and runs
out-of-band.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import Offer, Product, Variant

router = APIRouter(tags=["products"])


class OfferSummary(BaseModel):
    merchant_id: int
    price_brl: float
    url: str
    affiliate_url: Optional[str] = None
    is_available: bool

    class Config:
        from_attributes = True


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    brand: Optional[str] = None
    specs: dict = {}
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    cheapest_offer: Optional[OfferSummary] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[ProductOut])
async def list_products(
    category: Optional[str] = Query(
        None,
        description="Filter by category: cpu, gpu, ram, motherboard, storage, psu, case, cooler, fan",
    ),
    is_active: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> List[ProductOut]:
    """List products, optionally filtered by category.

    The list is paginated and ordered by id. Each entry includes the
    cheapest available offer across all merchants at the time of the
    query.
    """
    stmt = select(Product).where(Product.is_active == is_active)
    if category:
        stmt = stmt.where(Product.category == category)
    stmt = stmt.order_by(Product.id).limit(limit).offset(offset)
    result = await db.execute(stmt)
    products = result.scalars().unique().all()

    out: List[ProductOut] = []
    for p in products:
        cheapest = await _cheapest_offer(db, p.id)
        out.append(
            ProductOut(
                id=p.id,
                sku=p.sku,
                name=p.name,
                category=p.category,
                brand=p.brand,
                specs=p.specs or {},
                is_active=p.is_active,
                created_at=p.created_at.isoformat() if p.created_at else None,
                updated_at=p.updated_at.isoformat() if p.updated_at else None,
                cheapest_offer=cheapest,
            )
        )
    return out


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)) -> ProductOut:
    """Fetch a single product by id, with its cheapest available offer."""
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
    cheapest = await _cheapest_offer(db, product_id)
    return ProductOut(
        id=product.id,
        sku=product.sku,
        name=product.name,
        category=product.category,
        brand=product.brand,
        specs=product.specs or {},
        is_active=product.is_active,
        created_at=product.created_at.isoformat() if product.created_at else None,
        updated_at=product.updated_at.isoformat() if product.updated_at else None,
        cheapest_offer=cheapest,
    )


async def _cheapest_offer(db: AsyncSession, product_id: int) -> Optional[OfferSummary]:
    """Return the cheapest *available* offer for a product, across all variants."""
    stmt = (
        select(Offer)
        .join(Variant, Variant.id == Offer.variant_id)
        .where(Variant.product_id == product_id, Offer.is_available.is_(True))
        .order_by(Offer.price_brl.asc())
        .limit(1)
    )
    result = await db.execute(stmt)
    offer = result.scalar_one_or_none()
    if offer is None:
        return None
    return OfferSummary(
        merchant_id=offer.merchant_id,
        price_brl=float(offer.price_brl),
        url=offer.url,
        affiliate_url=offer.affiliate_url,
        is_available=offer.is_available,
    )
