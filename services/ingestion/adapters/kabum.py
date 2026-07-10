"""KaBuM! adapter — official affiliate feed (STUB).

This is the seam to wire when the KaBuM affiliate program is approved.
Implement ``fetch()`` against the official affiliate feed/API (never scraping)
and map each item to a ``RawOffer`` under the ``kabum`` merchant. Register it
in the ingestion loader and the sample offers are superseded.

Required to activate:
- KaBuM affiliate account + feed/API credentials (env: KABUM_AFFILIATE_TOKEN).
- SKU matching: map KaBuM product ids to our canonical ``products.sku``.
"""
from __future__ import annotations

from .base import RawOffer


class KabumAdapter:
    merchant_slug = "kabum"

    def __init__(self, token: str | None = None) -> None:
        self.token = token

    def fetch(self) -> list[RawOffer]:
        raise NotImplementedError(
            "KaBuM official feed not wired yet. Implement against the affiliate "
            "feed/API and map items to RawOffer(merchant_slug='kabum')."
        )
