"""Melhor PC gamer até R$ X — a build com mais FPS para cada orçamento.

    python -m seed.best_by_budget            # mostra o que gravaria
    python -m seed.best_by_budget --apply    # grava em budget_picks

Alimenta as páginas /melhor-pc-gamer/ate-<X> (SEO de cauda longa). A regra é
a MESMA do Rei de cada faixa (seed/crown_reis.py) — máximo de FPS médio em
1080p, sem erro nem aviso de compatibilidade, fluxo de ar ≥ 70, só CPUs
calibradas, empate de FPS → a mais barata — para a página "até R$ 4.500" nunca
contradizer o "Rei até R$ 4,5k". Só muda o teto: um por orçamento, de R$ 2.000
a R$ 20.000 de 500 em 500.

Orçamento sem build válida fica de fora (a página não existe — nada de página
vazia indexável). Roda todo dia depois da coroação (cron na VPS).
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from compat_core import Part, evaluate
from seed.crown_reis import (MAX_AIR_CALLS_PER_PAIR, SLOTS, AirflowUnavailable, _air, _connect,
                             _Rule, geomean, pick_rei)
from seed.performance_data import CPU_CALIBRATION
from tiers import MIN_AIRFLOW, RANK_GAMES, RANK_RESOLUTION, Tier

BUDGETS = list(range(2000, 20001, 500))

DDL = """
CREATE TABLE IF NOT EXISTS budget_picks (
    budget_brl  integer PRIMARY KEY,
    components  jsonb NOT NULL,
    total_brl   numeric(10,2) NOT NULL,
    avg_fps     numeric(7,1) NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT now()
)
"""

Pair = Tuple[float, Callable[[], Optional[Tuple[float, dict]]]]

# Falha da API de fluxo de ar: `_air` (crown_reis) tenta 3 vezes e depois
# levanta AirflowUnavailable — o run para sem gravar nada.


# ── núcleo puro (testado em tests/test_best_by_budget.py) ────────────────────
def pick_all(pairs: Iterable[Pair], budgets: List[int]) -> Dict[int, Tuple[float, float, dict]]:
    """Para cada orçamento, (fps, total, peças) da melhor build ≤ orçamento.
    `pairs` é consumido várias vezes — passe uma lista. A completação de cada
    par é memoizada por quem a cria, por isso orçamentos vizinhos não repetem
    as chamadas caras (fluxo de ar)."""
    pairs = list(pairs)
    out: Dict[int, Tuple[float, float, dict]] = {}
    for b in sorted(budgets):
        best = pick_rei(pairs, Tier(f"ate-{b}", f"até R$ {b}", f"até R$ {b}", 0, b))
        if best is not None:
            out[b] = best
    return out


# ── dados (mesma carga do crown_reis) ────────────────────────────────────────
def _load(cur) -> List[Pair]:
    cur.execute("""SELECT p.id, p.sku, p.name, p.category, p.specs, MIN(o.price_brl)
                   FROM products p JOIN variants v ON v.product_id=p.id
                   JOIN offers o ON o.variant_id=v.id AND o.is_available
                   WHERE p.is_active GROUP BY p.id""")
    by_cat: Dict[str, List[dict]] = {}
    for pid, sku, name, cat, specs, price in cur.fetchall():
        if cat == "cpu" and sku not in CPU_CALIBRATION:
            continue
        by_cat.setdefault(cat, []).append(
            {"id": pid, "sku": sku, "name": name, "cat": cat, "specs": specs or {}, "price": float(price)})

    cur.execute("""SELECT cpu_id, gpu_id, game_slug, fps_estimate FROM fps_estimates
                   WHERE resolution=%s AND preset='high' AND game_slug = ANY(%s)""",
                (RANK_RESOLUTION, RANK_GAMES))
    per_pair: Dict[Tuple[int, int], Dict[str, float]] = {}
    for c, g, game, f in cur.fetchall():
        per_pair.setdefault((c, g), {})[game] = float(f)

    cur.execute("""SELECT rule_type, category_a, attribute_a, operator, category_b, attribute_b,
                          severity, message_template FROM compatibility_rules WHERE is_active""")
    rules = [_Rule(r) for r in cur.fetchall()]

    def clean(parts: dict) -> bool:
        r = evaluate({k: Part(name=v["name"], specs=v["specs"]) for k, v in parts.items()}, rules)
        return not r["errors"] and not r["warnings"]

    plat = [x for x in itertools.product(by_cat["cpu"], by_cat["motherboard"], by_cat["ram"], by_cat["cooler"])
            if clean(dict(zip(("cpu", "motherboard", "ram", "cooler"), x)))]
    air_cache: Dict[tuple, Optional[float]] = {}
    memo: Dict[Tuple[int, int], Optional[Tuple[float, dict]]] = {}

    def completer(cpu: dict, gpu: dict):
        def complete():
            k = (cpu["id"], gpu["id"])
            if k in memo:
                return memo[k]
            combos = []
            for (_, mb, ram, cool), psu, case, ssd in itertools.product(
                    [p for p in plat if p[0]["id"] == cpu["id"]], by_cat["psu"], by_cat["case"], by_cat["storage"]):
                parts = {"cpu": cpu, "gpu": gpu, "ram": ram, "motherboard": mb,
                         "storage": ssd, "psu": psu, "case": case, "cooler": cool}
                combos.append((sum(p["price"] for p in parts.values()), parts))
            combos.sort(key=lambda x: x[0])
            calls, found = 0, None
            for total, parts in combos:
                if not clean(parts):
                    continue
                key = (cpu["id"], gpu["id"], parts["case"]["id"], parts["cooler"]["id"], parts["psu"]["id"])
                if key not in air_cache:
                    if calls >= MAX_AIR_CALLS_PER_PAIR:
                        break
                    air_cache[key] = _air(parts)
                    calls += 1
                af = air_cache[key]
                if af is not None and af >= MIN_AIRFLOW:
                    found = (total, parts)
                    break
            memo[k] = found
            return found
        return complete

    out: List[Pair] = []
    for c in by_cat["cpu"]:
        for g in by_cat["gpu"]:
            d = per_pair.get((c["id"], g["id"]), {})
            if len(d) == len(RANK_GAMES):
                out.append((geomean(list(d.values())), completer(c, g)))
    return out


def run(apply: bool) -> int:
    con = _connect()
    cur = con.cursor()
    try:
        picks = pick_all(_load(cur), BUDGETS)
    except AirflowUnavailable as e:
        print(f"ABORTADO: {e} — nada gravado")
        con.close()
        return 3
    prev = None
    for b in BUDGETS:
        if b not in picks:
            print(f"até R$ {b:>6,}: sem build válida — página não existe")
            continue
        fps, total, parts = picks[b]
        same = prev is not None and prev[2] is not None and \
            all(prev[2][k]["id"] == parts[k]["id"] for k in SLOTS)
        print(f"até R$ {b:>6,}: {parts['cpu']['name']} + {parts['gpu']['name']} · R$ {total:,.0f} · "
              f"{fps:.0f} FPS{'  (igual à anterior)' if same else ''}")
        prev = picks[b]
    if apply:
        cur.execute(DDL)
        cur.execute("DELETE FROM budget_picks WHERE NOT (budget_brl = ANY(%s))", (list(picks),))
        for b, (fps, total, parts) in picks.items():
            comps = {f"{k}_id": v["id"] for k, v in parts.items()}
            cur.execute("""INSERT INTO budget_picks (budget_brl, components, total_brl, avg_fps, computed_at)
                           VALUES (%s, %s::jsonb, %s, %s, now())
                           ON CONFLICT (budget_brl) DO UPDATE SET components=EXCLUDED.components,
                             total_brl=EXCLUDED.total_brl, avg_fps=EXCLUDED.avg_fps, computed_at=now()""",
                        (b, json.dumps(comps), round(total, 2), round(fps, 1)))
        con.commit()
        print(f"gravado: {len(picks)} orçamento(s)")
    else:
        con.rollback()
        print(f"simulação: {len(picks)} orçamento(s) — rodar com --apply para gravar")
    con.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    sys.exit(run(ap.parse_args().apply))
