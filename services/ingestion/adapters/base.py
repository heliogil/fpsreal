"""Price adapter contract — the seam for wiring official affiliate sources.

Every price source (sample today; KaBuM / Mercado Livre / Pichau / Terabyte
tomorrow) implements ``PriceAdapter.fetch()`` and returns ``RawOffer`` rows.
The ingestion loader is source-agnostic: swapping the sample for a real feed
is "register the adapter", nothing else.

INTEGRITY: ``RawOffer.merchant_slug`` must name a real, honest source. Sample
data uses the dedicated ``amostra`` merchant ("Amostra (demo)") so nothing is
ever misrepresented as a real store price.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class RawOffer:
    """A price observation for a product, before it becomes a DB ``offer``."""
    product_sku: str
    merchant_slug: str
    price_brl: Decimal
    url: str
    external_id: str | None = None
    in_stock: bool = True
    affiliate_url: str | None = None


@runtime_checkable
class PriceAdapter(Protocol):
    """A source of offers. Implement this to wire an official affiliate feed."""

    #: Merchant slug this adapter writes to (must exist in ``merchants``).
    merchant_slug: str

    def fetch(self) -> list[RawOffer]:
        """Return current offers. Must never fabricate prices for a real store."""
        ...
