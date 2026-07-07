"""Affiliate redirect endpoint with click tracking.

Visiting ``GET /go/{offer_id}`` records an ``affiliate_clicks`` row
(carrying UTM tags, referer, user-agent, and a *hashed* IP — never the
raw IP) and 302-redirects the browser to the offer's ``affiliate_url``
(or, as a fallback, its ``url``).
"""
from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import AffiliateClick, Offer

router = APIRouter(tags=["redirect"])


def _hash_ip(ip: str) -> str:
    """Return a 12-char SHA-256 prefix of the IP for anonymised tracking."""
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:12]


def _client_ip(request: Request) -> str:
    """Best-effort client IP extraction. Honours X-Forwarded-For when present."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@router.get("/{offer_id}")
async def affiliate_redirect(
    offer_id: int,
    request: Request,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    build_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Track the click and 302-redirect to the affiliate URL.

    UTM tags come from the query string and follow the standard
    convention ``utm_source`` / ``utm_medium`` / ``utm_campaign``. The
    build reference (``build_id``) lets the dashboard attribute
    conversions to a specific curated build.
    """
    offer = await db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail=f"Offer {offer_id} not found")

    target = offer.affiliate_url or offer.url
    if not target:
        # If we somehow have no URL, fail loudly rather than 404 silently.
        raise HTTPException(
            status_code=409,
            detail=f"Offer {offer_id} has no URL to redirect to",
        )

    click = AffiliateClick(
        offer_id=offer_id,
        build_id=build_id,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        referer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
        ip_hash=_hash_ip(_client_ip(request)),
    )
    db.add(click)
    await db.commit()

    return RedirectResponse(url=target, status_code=302)
