"""Collect KaBuM! price observations for every GPU and CPU in the catalogue.

Writes to ``price_observations`` only. Never touches ``offers`` -- see the
module docstring in ``kabum_scrape.py`` for why.

Usage (inside the pcb_api container):
    python -m observers.run_kabum            # all gpu + cpu
    python -m observers.run_kabum --dry-run  # scrape and report, write nothing
    python -m observers.run_kabum --limit 3
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import psycopg2

from observers.kabum_scrape import model_tokens, observe, scrape_cards

CATEGORIES = ("gpu", "cpu")
SOURCE = "kabum-scrape"


def dsn() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        sys.exit("DATABASE_URL not set")
    return raw.replace("postgresql+asyncpg://", "postgresql://")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--pause", type=float, default=2.0,
                    help="seconds between searches; be a polite visitor")
    args = ap.parse_args()

    conn = psycopg2.connect(dsn())
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(
        "select id, name, category from products "
        "where category = any(%s) and is_active order by category, name",
        (list(CATEGORIES),))
    products = cur.fetchall()
    if args.limit:
        products = products[: args.limit]

    total_obs = matched = 0
    for pid, name, category in products:
        query = " ".join(model_tokens(name))
        try:
            cards = scrape_cards(query)
        except Exception as exc:  # noqa: BLE001 - one bad page must not stop the run
            print(f"  {name:<28} ERRO: {str(exc)[:70]}")
            continue
        obs = observe(pid, name, cards)
        if obs:
            matched += 1
        cheapest = min((o.price_brl for o in obs), default=None)
        print(f"  {name:<28} {len(cards):>3} cartões  "
              f"{len(obs):>2} do modelo  "
              f"{('menor R$' + str(cheapest)) if cheapest else '— sem correspondência'}")
        if not args.dry_run:
            for o in obs:
                cur.execute(
                    "insert into price_observations "
                    "(product_id, source, observed_name, price_brl, url) "
                    "values (%s,%s,%s,%s,%s)",
                    (o.product_id, SOURCE, o.observed_name, o.price_brl, o.url))
            conn.commit()
        total_obs += len(obs)
        time.sleep(args.pause)

    print(f"\n  produtos: {len(products)} | com correspondência: {matched} "
          f"| observações: {total_obs}{' (DRY-RUN, nada escrito)' if args.dry_run else ''}")
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
