"""Idempotent seed loader — Rei do FPS.

    python -m seed.run_seed            # full seed
    python -m seed.run_seed --catalog # catalog only

Re-runnable: every write is an UPSERT keyed on a natural unique column, or a
DELETE-of-managed-rows + INSERT for the two rule tables (which have no natural
key). Never seeds prices/offers.
"""
from __future__ import annotations

import json
import os
import sys

import psycopg2
import psycopg2.extras

from .catalog_data import build_products
from .performance_data import build_performance_index, build_fps_estimates
from .compatibility_data import COMPATIBILITY_RULES, THERMAL_RULES


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    # psycopg2 wants postgresql:// (not +asyncpg etc.)
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgresql+psycopg2://", "postgresql://"
    )
    return psycopg2.connect(dsn)


def fix_merchants(cur) -> None:
    """Enforce the 'official affiliate only, zero scraping' decision."""
    cur.execute(
        "UPDATE merchants SET data_source='feed' WHERE slug='kabum' AND data_source='scraper'"
    )


def seed_products(cur) -> dict[str, int]:
    products = build_products()
    sku_to_id: dict[str, int] = {}
    for p in products:
        cur.execute(
            """
            INSERT INTO products (sku, name, category, brand, specs, is_active, updated_at)
            VALUES (%s, %s, %s, %s, %s::jsonb, true, NOW())
            ON CONFLICT (sku) DO UPDATE
              SET name=EXCLUDED.name, category=EXCLUDED.category,
                  brand=EXCLUDED.brand, specs=EXCLUDED.specs,
                  is_active=true, updated_at=NOW()
            RETURNING id
            """,
            (p["sku"], p["name"], p["category"], p["brand"], json.dumps(p["specs"])),
        )
        sku_to_id[p["sku"]] = cur.fetchone()[0]

    # one default variant per product (idempotent by product_id + variant_name)
    for p in products:
        pid = sku_to_id[p["sku"]]
        vname = f"{p['name']} (padrão)"
        cur.execute(
            """
            INSERT INTO variants (product_id, variant_name, is_active)
            SELECT %s, %s, true
            WHERE NOT EXISTS (
                SELECT 1 FROM variants WHERE product_id=%s AND variant_name=%s
            )
            """,
            (pid, vname, pid, vname),
        )

    # component footprints (GPUs) — product_id is UNIQUE
    for p in products:
        fp = p.get("footprint")
        if not fp:
            continue
        pid = sku_to_id[p["sku"]]
        cur.execute(
            """
            INSERT INTO component_footprints
              (product_id, length_mm, installed_thickness_mm, slot_type_required,
               airflow_zone, airflow_resistance_factor, dimensions_source, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'manufacturer_spec', NOW())
            ON CONFLICT (product_id) DO UPDATE
              SET length_mm=EXCLUDED.length_mm,
                  installed_thickness_mm=EXCLUDED.installed_thickness_mm,
                  slot_type_required=EXCLUDED.slot_type_required,
                  airflow_zone=EXCLUDED.airflow_zone,
                  airflow_resistance_factor=EXCLUDED.airflow_resistance_factor,
                  updated_at=NOW()
            """,
            (pid, fp["length_mm"], fp["installed_thickness_mm"],
             fp["slot_type_required"], fp["airflow_zone"], fp["airflow_resistance_factor"]),
        )
    return sku_to_id


def seed_performance(cur, sku_to_id: dict[str, int]) -> None:
    for r in build_performance_index():
        pid = sku_to_id.get(r["product_sku"])
        anchor_id = sku_to_id.get(r["anchor_product_sku"])
        if pid is None:
            continue
        cur.execute(
            """
            INSERT INTO performance_index
              (product_id, benchmark_type, index_value, anchor_product_id,
               source, source_url, source_date, confidence, notes, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (product_id, benchmark_type) DO UPDATE
              SET index_value=EXCLUDED.index_value,
                  anchor_product_id=EXCLUDED.anchor_product_id,
                  source=EXCLUDED.source, source_url=EXCLUDED.source_url,
                  source_date=EXCLUDED.source_date, confidence=EXCLUDED.confidence,
                  notes=EXCLUDED.notes, updated_at=NOW()
            """,
            (pid, r["benchmark_type"], r["index_value"], anchor_id,
             r["source"], r["source_url"], r["source_date"], r["confidence"], r["notes"]),
        )


def seed_fps(cur, sku_to_id: dict[str, int]) -> int:
    rows = build_fps_estimates()
    n = 0
    for r in rows:
        cpu_id = sku_to_id.get(r["cpu_sku"])
        gpu_id = sku_to_id.get(r["gpu_sku"])
        if cpu_id is None or gpu_id is None:
            continue
        cur.execute(
            """
            INSERT INTO fps_estimates
              (cpu_id, gpu_id, game_slug, resolution, preset, fps_estimate,
               fps_low_1pct, confidence_band_pct, method, sources, is_crowdsourced, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, NOW())
            ON CONFLICT (cpu_id, gpu_id, game_slug, resolution, preset) DO UPDATE
              SET fps_estimate=EXCLUDED.fps_estimate,
                  fps_low_1pct=EXCLUDED.fps_low_1pct,
                  confidence_band_pct=EXCLUDED.confidence_band_pct,
                  method=EXCLUDED.method, sources=EXCLUDED.sources,
                  updated_at=NOW()
            """,
            (cpu_id, gpu_id, r["game_slug"], r["resolution"], r["preset"],
             r["fps_estimate"], r["fps_low_1pct"], r["confidence_band_pct"],
             r["method"], json.dumps(r["sources"]), r["is_crowdsourced"]),
        )
        n += 1
    return n


def seed_rules(cur) -> None:
    managed = tuple(r[0] for r in COMPATIBILITY_RULES)
    cur.execute("DELETE FROM compatibility_rules WHERE rule_type IN %s", (managed,))
    for rt, ca, aa, op, cb, ab, sev, msg in COMPATIBILITY_RULES:
        cur.execute(
            """
            INSERT INTO compatibility_rules
              (rule_type, category_a, attribute_a, operator, category_b, attribute_b,
               severity, message_template, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true)
            """,
            (rt, ca, aa, op, cb, ab, sev, msg),
        )

    cur.execute("DELETE FROM thermal_rules WHERE product_id IS NULL")
    for tmin, tmax, cooler, airflow, notes in THERMAL_RULES:
        cur.execute(
            """
            INSERT INTO thermal_rules
              (product_id, tdp_min_w, tdp_max_w, min_cooler_type, min_case_airflow, notes)
            VALUES (NULL, %s, %s, %s, %s, %s)
            """,
            (tmin, tmax, cooler, airflow, notes),
        )


def main() -> None:
    catalog_only = "--catalog" in sys.argv
    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            fix_merchants(cur)
            sku_to_id = seed_products(cur)
            print(f"products upserted: {len(sku_to_id)}")
            if not catalog_only:
                seed_performance(cur, sku_to_id)
                n_fps = seed_fps(cur, sku_to_id)
                print(f"fps_estimates upserted: {n_fps}")
                seed_rules(cur)
                print("compatibility + thermal rules refreshed")
        conn.commit()
        print("seed committed OK")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
