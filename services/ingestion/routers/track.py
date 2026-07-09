"""Affiliate click tracking.

POST /track/click  { offer_id, build_id?, utm_source?, utm_medium?,
                     utm_campaign?, referer? }

Records a click into ``affiliate_clicks``. Because ``offer_id`` is a NOT NULL
FK and no offers exist until an affiliate feed is wired, unknown offers are
ignored gracefully (the web calls this fire-and-forget).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import AffiliateClick, Offer

router = APIRouter(tags=["tracking"])


class ClickIn(BaseModel):
    offer_id: int
    build_id: Optional[int] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    referer: Optional[str] = None


@router.post("/click", response_model=None)
async def record_click(body: ClickIn, db: AsyncSession = Depends(get_db)):
    offer = await db.get(Offer, body.offer_id)
    if offer is None:
        # No such offer yet (prices not wired) — ignore gracefully.
        return {"status": "ignored", "reason": "unknown offer"}
    click = AffiliateClick(
        offer_id=body.offer_id,
        build_id=body.build_id,
        utm_source=body.utm_source,
        utm_medium=body.utm_medium,
        utm_campaign=body.utm_campaign,
        referer=body.referer,
    )
    db.add(click)
    await db.commit()
    return {"status": "recorded", "id": click.id}
