"""Sample price adapter — placeholder BR prices for demo, clearly labelled.

These are NOT real store prices. They exist so the whole priced pipeline
(cost/FPS ranking, Tronos, wizard) is wired end-to-end and demonstrable
BEFORE the official affiliate feeds are connected. They are attributed to the
dedicated ``amostra`` merchant ("Amostra (demo)") so the UI never presents
them as a real KaBuM/ML price. When a real adapter lands, its offers replace
these under real merchants; the sample offers can then be dropped.
"""
from __future__ import annotations

from decimal import Decimal

from .base import PriceAdapter, RawOffer

MERCHANT_SLUG = "amostra"

# sku -> approximate BR street price (R$), 2026, SAMPLE ONLY.
SAMPLE_PRICES: dict[str, int] = {
    # GPUs
    "gpu-rtx-5090": 15000, "gpu-rtx-5080": 9000, "gpu-rtx-5070-ti": 6500,
    "gpu-rtx-5070": 4800, "gpu-rtx-5060-ti": 3200, "gpu-rtx-5060": 2400,
    "gpu-rtx-4090": 13000, "gpu-rtx-4070-super": 4500, "gpu-rtx-4060-ti": 2800,
    "gpu-rtx-4060": 2100, "gpu-rtx-3060": 1700, "gpu-rx-9070-xt": 5200,
    "gpu-rx-7900-xtx": 7000, "gpu-rx-7800-xt": 3600, "gpu-rx-7700-xt": 3000,
    "gpu-rx-7600": 1900, "gpu-rx-6600": 1300,
    # CPUs
    "cpu-r7-9800x3d": 3200, "cpu-r7-7800x3d": 2600, "cpu-r7-9700x": 2200,
    "cpu-r5-7600": 1400, "cpu-r5-5600": 700, "cpu-i5-14600kf": 1600,
    "cpu-i5-13400f": 900,
    # RAM
    "ram-ddr5-6000-32": 700, "ram-ddr5-6000-16": 400, "ram-ddr4-3600-16": 260,
    # Motherboards
    "mb-b650-tuf": 1300, "mb-b650-tomahawk": 1500, "mb-b760-gaming-x": 1100,
    "mb-b550-steel": 700,
    # Storage
    "ssd-nv2-1tb": 400, "ssd-sn770-1tb": 500, "ssd-990pro-2tb": 1200,
    # PSU
    "psu-cx550": 300, "psu-rm650": 550, "psu-rm750e": 650, "psu-rm850": 800,
    "psu-a1000g": 1100,
    # Case
    "case-lancool-216": 550, "case-h5-flow": 600, "case-4000d": 650,
    "case-air-903": 350,
    # Cooler (stock ships with the CPU -> 0)
    "cooler-stock-amd": 0, "cooler-ak400": 180, "cooler-pa120": 250,
    "cooler-lt520": 400, "cooler-lf3-360": 700,
}


class SampleAdapter:
    """PriceAdapter that emits the SAMPLE_PRICES under the 'amostra' merchant."""

    merchant_slug = MERCHANT_SLUG

    def fetch(self) -> list[RawOffer]:
        return [
            RawOffer(
                product_sku=sku,
                merchant_slug=self.merchant_slug,
                price_brl=Decimal(price),
                url=f"https://reidofps.com.br/amostra/{sku}",
                external_id=f"amostra-{sku}",
                in_stock=True,
            )
            for sku, price in SAMPLE_PRICES.items()
        ]


# Structural typing sanity: SampleAdapter satisfies PriceAdapter.
_: PriceAdapter = SampleAdapter()
