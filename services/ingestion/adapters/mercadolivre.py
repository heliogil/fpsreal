"""Mercado Livre adapter — official Developers API (STUB).

Seam to wire when the Mercado Livre Developers app is registered. Implement
``fetch()`` against the official ML Products/Items API (documented, rate-limited)
and map results to ``RawOffer`` under the ``mercadolivre`` merchant.

Required to activate:
- ML Developers app (client id/secret) + OAuth (env: ML_ACCESS_TOKEN).
- Query mapping: our ``products`` -> ML search/item ids; keep raw external_id.
"""
from __future__ import annotations

from .base import RawOffer


class MercadoLivreAdapter:
    merchant_slug = "mercadolivre"

    def __init__(self, access_token: str | None = None) -> None:
        self.access_token = access_token

    def fetch(self) -> list[RawOffer]:
        raise NotImplementedError(
            "Mercado Livre Developers API not wired yet. Implement against the "
            "official items API and map to RawOffer(merchant_slug='mercadolivre')."
        )
