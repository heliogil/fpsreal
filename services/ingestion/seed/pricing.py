"""Sample offers + curated builds (Tronos) seed.

Lights up the PRICED half of the product with clearly-labelled sample data so
the whole pipeline (offers -> cost/FPS -> Tronos -> wizard) is demonstrable
before official affiliate feeds exist. Sample prices live under the 'amostra'
merchant ("Amostra (demo)", data_source NULL). Swapping in a real feed =
implement a PriceAdapter and register it; the sample offers are then dropped.
"""
from __future__ import annotations

from decimal import Decimal

from adapters.sample import SampleAdapter

# Games averaged for the cost/FPS headline (1080p high).
GAMES_FOR_RANK = ["cs2", "fortnite", "gta-v", "cyberpunk-2077"]

# fps_estimates only cover the matrix CPUs; map each build CPU to the nearest.
FPS_CPU_FOR = {
    "cpu-r5-5600": "cpu-r5-5600",
    "cpu-i5-13400f": "cpu-r5-5600",
    "cpu-r5-7600": "cpu-r5-7600",
    "cpu-r7-9700x": "cpu-r5-7600",
    "cpu-i5-14600kf": "cpu-r5-7600",
    "cpu-r7-7800x3d": "cpu-r7-9800x3d",
    "cpu-r7-9800x3d": "cpu-r7-9800x3d",
}

# slug, name, tier, is_rei, {slot: sku}, seo
BUILDS = [
    ("rei-r3k", "Rei dos R$ 3k", "r3k", True, {
        "cpu": "cpu-r5-5600", "gpu": "gpu-rx-6600", "ram": "ram-ddr4-3600-16",
        "motherboard": "mb-b550-steel", "storage": "ssd-nv2-1tb", "psu": "psu-cx550",
        "case": "case-air-903", "cooler": "cooler-stock-amd",
    }, "O melhor custo por FPS na faixa de entrada — 1080p sem drama."),
    ("rei-r5k", "Rei dos R$ 5k", "r5k", True, {
        "cpu": "cpu-r5-7600", "gpu": "gpu-rtx-4060", "ram": "ram-ddr5-6000-16",
        "motherboard": "mb-b650-tuf", "storage": "ssd-nv2-1tb", "psu": "psu-rm650",
        "case": "case-4000d", "cooler": "cooler-ak400",
    }, "1080p alto com folga e caminho de upgrade AM5."),
    ("rei-r8k", "Rei dos R$ 8k", "r8k", True, {
        "cpu": "cpu-r7-9700x", "gpu": "gpu-rtx-4070-super", "ram": "ram-ddr5-6000-32",
        "motherboard": "mb-b650-tomahawk", "storage": "ssd-sn770-1tb", "psu": "psu-rm750e",
        "case": "case-lancool-216", "cooler": "cooler-pa120",
    }, "1440p confortável mantendo o melhor R$/FPS da faixa."),
    ("rei-r12k", "Rei dos R$ 12k+", "r12k_plus", True, {
        "cpu": "cpu-r7-7800x3d", "gpu": "gpu-rtx-5070-ti", "ram": "ram-ddr5-6000-32",
        "motherboard": "mb-b650-tomahawk", "storage": "ssd-990pro-2tb", "psu": "psu-rm850",
        "case": "case-lancool-216", "cooler": "cooler-lf3-360",
    }, "X3D + Blackwell: topo de custo/FPS antes do exagero."),
    ("rei-absoluto", "Rei Absoluto", "r12k_plus", False, {
        "cpu": "cpu-r7-9800x3d", "gpu": "gpu-rtx-5090", "ram": "ram-ddr5-6000-32",
        "motherboard": "mb-b650-tomahawk", "storage": "ssd-990pro-2tb", "psu": "psu-a1000g",
        "case": "case-lancool-216", "cooler": "cooler-lf3-360",
    }, "O topo simbólico: o melhor que o dinheiro compra, custe o que custar."),
]


def _variant_by_product(cur) -> dict[int, int]:
    cur.execute("SELECT product_id, MIN(id) FROM variants GROUP BY product_id")
    return {r[0]: r[1] for r in cur.fetchall()}


def seed_amostra_offers(cur, sku_to_id: dict[str, int]) -> int:
    cur.execute(
        """
        INSERT INTO merchants (slug, name, data_source, is_active)
        VALUES ('amostra', 'Amostra (demo)', NULL, true)
        ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, is_active=true
        RETURNING id
        """
    )
    merch_id = cur.fetchone()[0]
    vmap = _variant_by_product(cur)
    n = 0
    for ro in SampleAdapter().fetch():
        pid = sku_to_id.get(ro.product_sku)
        if pid is None:
            continue
        vid = vmap.get(pid)
        if vid is None:
            continue
        cur.execute(
            """
            INSERT INTO offers
              (variant_id, merchant_id, external_id, url, price_brl, is_available, last_seen_at)
            VALUES (%s, %s, %s, %s, %s, true, NOW())
            ON CONFLICT (variant_id, merchant_id) DO UPDATE
              SET price_brl=EXCLUDED.price_brl, url=EXCLUDED.url,
                  external_id=EXCLUDED.external_id, is_available=true, last_seen_at=NOW()
            """,
            (vid, merch_id, ro.external_id, ro.url, ro.price_brl),
        )
        n += 1
    return n


def seed_curated_builds(cur, sku_to_id: dict[str, int]) -> int:
    n = 0
    for slug, name, tier, is_rei, comps, seo in BUILDS:
        ids = {slot: sku_to_id.get(sku) for slot, sku in comps.items()}
        if any(v is None for v in ids.values()):
            continue
        pids = list(ids.values())
        cur.execute(
            """
            SELECT v.product_id, MIN(o.price_brl)
            FROM offers o JOIN variants v ON v.id = o.variant_id
            WHERE v.product_id = ANY(%s) AND o.is_available
            GROUP BY v.product_id
            """,
            (pids,),
        )
        price_by_pid = {r[0]: r[1] for r in cur.fetchall()}
        total = sum((price_by_pid.get(pid) or Decimal(0)) for pid in pids)

        matrix_cpu_id = sku_to_id.get(comps["cpu"])
        cur.execute(
            """
            SELECT AVG(fps_estimate) FROM fps_estimates
            WHERE cpu_id=%s AND gpu_id=%s AND resolution='1080p' AND preset='high'
              AND game_slug = ANY(%s)
            """,
            (matrix_cpu_id, ids["gpu"], GAMES_FOR_RANK),
        )
        avg_fps = cur.fetchone()[0] or Decimal(0)
        fps_per_brl = round(Decimal(avg_fps) / total, 4) if total > 0 else Decimal(0)

        cur.execute(
            """
            INSERT INTO curated_builds
              (slug, name, budget_tier, is_rei, cpu_id, gpu_id, ram_id, motherboard_id,
               storage_id, psu_id, case_id, cooler_id, total_price_brl, fps_per_brl,
               seo_description, is_active, crowned_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,NOW())
            ON CONFLICT (slug) DO UPDATE SET
              name=EXCLUDED.name, budget_tier=EXCLUDED.budget_tier, is_rei=EXCLUDED.is_rei,
              cpu_id=EXCLUDED.cpu_id, gpu_id=EXCLUDED.gpu_id, ram_id=EXCLUDED.ram_id,
              motherboard_id=EXCLUDED.motherboard_id, storage_id=EXCLUDED.storage_id,
              psu_id=EXCLUDED.psu_id, case_id=EXCLUDED.case_id, cooler_id=EXCLUDED.cooler_id,
              total_price_brl=EXCLUDED.total_price_brl, fps_per_brl=EXCLUDED.fps_per_brl,
              seo_description=EXCLUDED.seo_description, is_active=true
            """,
            (slug, name, tier, is_rei, ids["cpu"], ids["gpu"], ids["ram"],
             ids["motherboard"], ids["storage"], ids["psu"], ids["case"], ids["cooler"],
             total, fps_per_brl, seo),
        )
        n += 1
    return n
