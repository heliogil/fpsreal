"""Adiciona/atualiza SÓ os SKUs indicados — para crescer o catálogo em produção.

    python -m seed.upsert_skus case-flux-pro            # mostra o que faria
    python -m seed.upsert_skus case-flux-pro --apply    # grava

Porquê não `run_seed`: o seed completo regrava os specs de TODOS os produtos a
partir de catalog_data.py, o que desfaria correções feitas na base por outros
pipelines (ingest_specs, resolve_aib_lengths). Este script toca apenas nas
linhas dos SKUs pedidos: produto (specs do catalog_data), variante padrão e a
oferta de amostra (se houver preço em adapters/sample.py). Não mexe em FPS,
builds nem regras — e por isso não serve para CPU/GPU novas (essas precisam do
recálculo de FPS: seed.recompute_fps).
"""
from __future__ import annotations

import argparse
import json
import sys

from adapters.sample import SAMPLE_PRICES
from seed.catalog_data import build_products


def run(skus: list[str], apply: bool) -> int:
    from seed.run_seed import _connect  # driver só quando grava/lê a base

    wanted = {p["sku"]: p for p in build_products() if p["sku"] in skus}
    missing = [s for s in skus if s not in wanted]
    if missing:
        print(f"SKU(s) fora do catalog_data: {', '.join(missing)}")
        return 2
    bad = [s for s, p in wanted.items() if p["category"] in ("cpu", "gpu")]
    if bad:
        print(f"CPU/GPU precisam de FPS — use o seed completo + recompute_fps: {', '.join(bad)}")
        return 2

    con = _connect()
    cur = con.cursor()
    cur.execute("INSERT INTO merchants (slug, name, data_source, is_active) VALUES ('amostra', 'Amostra (demo)', NULL, true) "
                "ON CONFLICT (slug) DO UPDATE SET is_active=true RETURNING id")
    merch_id = cur.fetchone()[0]
    for sku, p in wanted.items():
        cur.execute("SELECT id FROM products WHERE sku=%s", (sku,))
        row = cur.fetchone()
        print(f"{sku}: {'atualiza' if row else 'NOVO'} · {p['name']} · preço amostra {SAMPLE_PRICES.get(sku, '—')}")
        cur.execute(
            """INSERT INTO products (sku, name, category, brand, specs, is_active, updated_at)
               VALUES (%s, %s, %s, %s, %s::jsonb, true, NOW())
               ON CONFLICT (sku) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
                 brand=EXCLUDED.brand, specs=EXCLUDED.specs, is_active=true, updated_at=NOW()
               RETURNING id""",
            (sku, p["name"], p["category"], p["brand"], json.dumps(p["specs"])))
        pid = cur.fetchone()[0]
        vname = f"{p['name']} (padrão)"
        cur.execute("""INSERT INTO variants (product_id, variant_name, is_active)
                       SELECT %s, %s, true WHERE NOT EXISTS
                         (SELECT 1 FROM variants WHERE product_id=%s AND variant_name=%s)""",
                    (pid, vname, pid, vname))
        cur.execute("SELECT MIN(id) FROM variants WHERE product_id=%s", (pid,))
        vid = cur.fetchone()[0]
        if sku in SAMPLE_PRICES:
            cur.execute(
                """INSERT INTO offers (variant_id, merchant_id, external_id, url, price_brl, is_available, last_seen_at)
                   VALUES (%s, %s, %s, %s, %s, true, NOW())
                   ON CONFLICT (variant_id, merchant_id) DO UPDATE SET price_brl=EXCLUDED.price_brl,
                     url=EXCLUDED.url, external_id=EXCLUDED.external_id, is_available=true, last_seen_at=NOW()""",
                (vid, merch_id, f"amostra-{sku}", f"https://reidofps.com.br/amostra/{sku}", SAMPLE_PRICES[sku]))
    if apply:
        con.commit()
        print("gravado")
    else:
        con.rollback()
        print("simulação (nada gravado) — rodar com --apply")
    con.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("skus", nargs="+")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    sys.exit(run(a.skus, a.apply))
