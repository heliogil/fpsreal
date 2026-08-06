"""Comprimento de GPU por montadoras reais (faixa de mercado) — fecha o
achado do founder de que o comprimento é definido pela placa (ASUS/ASRock/
Sapphire), não pelo chip (NVIDIA/AMD).

    python -m seed.resolve_aib_lengths                # resolve pendentes (até --limit)
    python -m seed.resolve_aib_lengths --status        # confirmados vs. pendentes
    python -m seed.resolve_aib_lengths --limit N       # teto de GPUs por corrida (default 5)
    python -m seed.resolve_aib_lengths --force SKU     # ignora cache, busca de novo

Cada GPU custa VÁRIAS requisições (até 3 montadoras × 3 páginas cada) — o
teto é bem menor que o de resolve_source_urls.py de propósito. Idempotente:
GPU que já tem >= 2 montadoras diferentes registradas em spec_observations
não é tocada de novo (nem gasta requisição) a menos que ``--force``.
"""
from __future__ import annotations

import json
import os
import sys

import httpx
import psycopg2

from specs.aib_adapter import AibDimensionAdapter
from specs.llm_adapter import LLMSpecAdapter
from specs.reconcile import MIN_INDEPENDENT_MARKET_SOURCES, reconcile

USER_AGENT = "Mozilla/5.0 (compatible; ReiDoFPS-SpecBot/1.0; +https://reidofps.com.br)"
DEFAULT_LIMIT = 5   # bem menor que resolve_source_urls.py -- cada GPU é várias requisições


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    for drv in ("+asyncpg", "+psycopg2", "+psycopg"):
        dsn = dsn.replace(drv, "")
    return psycopg2.connect(dsn)


def _make_http_get(client: httpx.Client):
    def get(url: str) -> str | None:
        try:
            r = client.get(url, timeout=15.0, follow_redirects=True)
            if r.status_code >= 400:
                return None
            return r.text
        except httpx.HTTPError:
            return None
    return get


def _eligible_gpus(cur, only_sku: str | None, force: bool):
    if only_sku:
        cur.execute("SELECT id, sku, name, brand, category FROM products "
                    "WHERE sku = %s AND is_active", (only_sku,))
        return cur.fetchall()

    cur.execute("""
        SELECT p.id, p.sku, p.name, p.brand, p.category,
               count(DISTINCT o.source_name) FILTER (WHERE o.source_name LIKE 'aib_market:%%') AS brands
        FROM products p
        LEFT JOIN spec_observations o ON o.product_id = p.id AND o.attribute = 'length_mm'
        WHERE p.is_active AND p.category = 'gpu'
        GROUP BY p.id, p.sku, p.name, p.brand, p.category
        ORDER BY p.sku
    """)
    rows = cur.fetchall()
    if force:
        return [(pid, sku, name, brand, cat) for pid, sku, name, brand, cat, _ in rows]
    return [(pid, sku, name, brand, cat) for pid, sku, name, brand, cat, brands in rows
            if brands < MIN_INDEPENDENT_MARKET_SOURCES]


def _promote_or_conflict(cur, pid: int, attribute: str, observations) -> str:
    result = reconcile(observations)
    if result.status == "confirmed":
        cur.execute(
            "UPDATE products SET specs = specs || %s::jsonb, updated_at = now() WHERE id = %s",
            (json.dumps({attribute: result.value}), pid),
        )
        cur.execute(
            "DELETE FROM spec_conflicts WHERE product_id=%s AND attribute=%s AND resolved_at IS NULL",
            (pid, attribute),
        )
    else:
        cur.execute(
            """INSERT INTO spec_conflicts (product_id, attribute, candidates, reason)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (product_id, attribute) DO UPDATE SET
                   candidates = EXCLUDED.candidates, reason = EXCLUDED.reason, detected_at = now()
               WHERE spec_conflicts.resolved_at IS NULL""",
            (pid, attribute, json.dumps(result.candidates), result.reason),
        )
    return result.status


def resolve(cur, limit: int, only_sku: str | None = None, force: bool = False) -> tuple[int, int, int]:
    rows = _eligible_gpus(cur, only_sku, force)
    llm = LLMSpecAdapter()
    if not llm.available():
        print("AVISO: MINIMAX_API_KEY ausente — nada a fazer (AibDimensionAdapter precisa do LLM).")
        return 0, 0, 0

    confirmed = conflict = insufficient = 0
    with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
        adapter = AibDimensionAdapter(_make_http_get(client), llm=llm)
        for pid, sku, name, brand, category in rows[:limit]:
            product = {"sku": sku, "name": name, "brand": brand, "category": category}
            new_obs = adapter.fetch(product)
            for obs in new_obs:
                cur.execute(
                    """INSERT INTO spec_observations
                       (product_id, attribute, value, source_name, source_url, confidence, notes)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (pid, obs.attribute, obs.value, obs.source_name, obs.source_url,
                     obs.confidence, obs.notes),
                )
            print(f"  {sku}: {len(new_obs)} observação(ões) nova(s) — "
                 f"{sorted(o.source_name for o in new_obs)}")

            # reconcile com TODAS as observações aib_market:* já conhecidas (não só as
            # novas desta corrida) -- mas SÓ aib_market:*. Achado real: sem esse filtro,
            # as observações ANTIGAS (catalog_seed, llm_extraction via chip de
            # referência — a fonte que motivou trocar de arquitetura) contavam como
            # "2ª fonte independente" e confirmava com dado velho, sem montadora
            # nenhuma de verdade. O histórico fica no banco (nunca se apaga), só não
            # entra nesta reconciliação.
            cur.execute(
                """SELECT product_id, attribute, value, source_name, source_url, source_date,
                          confidence, notes
                   FROM spec_observations
                   WHERE product_id = %s AND attribute = 'length_mm'
                     AND source_name LIKE 'aib_market:%%'""",
                (pid,),
            )
            from specs.base import RawSpecObservation
            all_obs = [
                RawSpecObservation(product_sku=sku, attribute=attr, value=val,
                                  source_name=src, source_url=url, source_date=date,
                                  confidence=float(conf), notes=notes or "")
                for _pid, attr, val, src, url, date, conf, notes in cur.fetchall()
            ]
            status = _promote_or_conflict(cur, pid, "length_mm", all_obs)
            if status == "confirmed":
                confirmed += 1
            elif status == "conflict":
                conflict += 1
            else:
                insufficient += 1

    return confirmed, conflict, insufficient


def status(cur) -> None:
    cur.execute("""
        SELECT count(*) FILTER (WHERE specs ? 'length_mm') AS confirmados, count(*) AS total
        FROM products WHERE category = 'gpu' AND is_active
    """)
    confirmados, total = cur.fetchone()
    print(f"  gpu.length_mm confirmado por montadoras: {confirmados}/{total}")

    cur.execute("""
        SELECT p.sku, count(DISTINCT o.source_name)
        FROM products p LEFT JOIN spec_observations o
            ON o.product_id = p.id AND o.attribute = 'length_mm' AND o.source_name LIKE 'aib_market:%%'
        WHERE p.category = 'gpu' AND p.is_active AND NOT (p.specs ? 'length_mm')
        GROUP BY p.sku ORDER BY p.sku
    """)
    pending = cur.fetchall()
    if pending:
        print("\n  pendentes:")
        for sku, brands in pending:
            print(f"    {sku}: {brands} montadora(s) já vista(s)")


def main() -> None:
    args = sys.argv[1:]
    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            if "--status" in args:
                status(cur)
            elif "--force" in args:
                i = args.index("--force")
                if i + 1 >= len(args):
                    sys.exit("--force precisa de um SKU")
                sku = args[i + 1]
                confirmed, conflict, insufficient = resolve(cur, limit=1, only_sku=sku, force=True)
                print(f"confirmados: {confirmed} · conflitos: {conflict} · insuficientes: {insufficient}")
            else:
                limit = DEFAULT_LIMIT
                if "--limit" in args:
                    i = args.index("--limit")
                    limit = int(args[i + 1])
                confirmed, conflict, insufficient = resolve(cur, limit=limit)
                print(f"\nconfirmados: {confirmed} · conflitos: {conflict} · "
                     f"insuficientes: {insufficient}")
                status(cur)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
