"""Ingestor de especificações multi-fonte — soquete/RAM com redundância.

    python -m seed.ingest_specs                # gera observações + reconcilia
    python -m seed.ingest_specs --status        # confirmados vs. em conflito
    python -m seed.ingest_specs --conflicts     # lista os conflitos pendentes
    python -m seed.ingest_specs --resolve SKU ATTRIBUTE VALUE

Cada corrida grava TODAS as observações das fontes activas em
``spec_observations`` (append-only — histórico nunca se perde) e usa
``specs.reconcile`` para decidir: atributo confirmado -> promove pra
``products.specs``; fontes divergem ou nenhuma bate a barra de confiança ->
vira (ou permanece) uma linha em ``spec_conflicts``, pendente de revisão.

Idempotente e seguro por cima de conflito já resolvido à mão: uma corrida
nova NUNCA sobrescreve um ``spec_conflicts.resolved_at`` humano — só toca
conflitos ainda abertos.
"""
from __future__ import annotations

import json
import os
import sys

import psycopg2

from specs import LLMSpecAdapter, ReferenceAdapter, reconcile

DDL = """
CREATE TABLE IF NOT EXISTS spec_observations (
    id            SERIAL PRIMARY KEY,
    product_id    INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute     VARCHAR(100) NOT NULL,
    value         TEXT NOT NULL,
    source_name   VARCHAR(100) NOT NULL,
    source_url    TEXT,
    source_date   DATE,
    confidence    NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence BETWEEN 0 AND 1),
    notes         TEXT,
    fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spec_observations_product_attr
    ON spec_observations(product_id, attribute);

CREATE TABLE IF NOT EXISTS spec_conflicts (
    id             SERIAL PRIMARY KEY,
    product_id     INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute      VARCHAR(100) NOT NULL,
    candidates     JSONB NOT NULL,
    reason         TEXT,
    detected_at    TIMESTAMPTZ DEFAULT NOW(),
    resolved_at    TIMESTAMPTZ,
    resolved_value TEXT,
    resolved_by    TEXT,
    UNIQUE(product_id, attribute)
);
CREATE INDEX IF NOT EXISTS idx_spec_conflicts_open
    ON spec_conflicts(product_id, attribute) WHERE resolved_at IS NULL;
"""

_VALID_VALUES = {
    "socket": {"AM4", "AM5", "LGA1200", "LGA1700", "LGA1851"},
    "ram_type": {"DDR4", "DDR5"},
}


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    for drv in ("+asyncpg", "+psycopg2", "+psycopg"):
        dsn = dsn.replace(drv, "")
    return psycopg2.connect(dsn)


def _adapters() -> list:
    out = [ReferenceAdapter()]
    llm = LLMSpecAdapter()
    if llm.available():
        out.append(llm)
    return out


def ingest(cur) -> tuple[int, int, int]:
    adapters = _adapters()
    cur.execute(
        "SELECT id, sku, name, category, specs FROM products "
        "WHERE is_active AND category IN ('cpu','motherboard')"
    )
    rows = cur.fetchall()

    confirmed = conflict = insufficient = 0
    for pid, sku, name, category, specs in rows:
        product = {"sku": sku, "name": name, "category": category, "specs": specs or {}}

        by_attribute: dict[str, list] = {}
        for adapter in adapters:
            for obs in adapter.fetch(product):
                by_attribute.setdefault(obs.attribute, []).append(obs)
                cur.execute(
                    """INSERT INTO spec_observations
                       (product_id, attribute, value, source_name, source_url,
                        source_date, confidence, notes)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (pid, obs.attribute, obs.value, obs.source_name, obs.source_url,
                     obs.source_date, obs.confidence, obs.notes),
                )

        for attribute, observations in by_attribute.items():
            result = reconcile(observations)
            if result.status == "confirmed":
                confirmed += 1
                cur.execute(
                    "UPDATE products SET specs = specs || %s::jsonb, updated_at = now() "
                    "WHERE id = %s",
                    (json.dumps({attribute: result.value}), pid),
                )
                # já resolvido de facto — não fica pendurado como conflito
                cur.execute(
                    "DELETE FROM spec_conflicts WHERE product_id=%s AND attribute=%s "
                    "AND resolved_at IS NULL",
                    (pid, attribute),
                )
            else:
                cur.execute(
                    """INSERT INTO spec_conflicts (product_id, attribute, candidates, reason)
                       VALUES (%s,%s,%s,%s)
                       ON CONFLICT (product_id, attribute) DO UPDATE SET
                           candidates = EXCLUDED.candidates,
                           reason = EXCLUDED.reason,
                           detected_at = now()
                       WHERE spec_conflicts.resolved_at IS NULL""",
                    (pid, attribute, json.dumps(result.candidates), result.reason),
                )
                if result.status == "conflict":
                    conflict += 1
                else:
                    insufficient += 1
    return confirmed, conflict, insufficient


def status(cur) -> None:
    cur.execute("""
        SELECT p.category, count(*) FILTER (WHERE p.specs ? 'socket') AS com_socket,
               count(*) FILTER (WHERE p.category='motherboard' AND p.specs ? 'ram_type') AS com_ram,
               count(*) AS total
        FROM products p WHERE p.category IN ('cpu','motherboard') AND p.is_active
        GROUP BY p.category ORDER BY p.category
    """)
    print("  categoria        c/ socket  c/ ram_type  total")
    for cat, ws, wr, tot in cur.fetchall():
        print(f"  {cat:16} {ws:>9}  {wr:>11}  {tot:>5}")

    cur.execute("SELECT count(*) FROM spec_conflicts WHERE resolved_at IS NULL")
    (pending,) = cur.fetchone()
    print(f"\n  conflitos pendentes de revisão: {pending}")


def list_conflicts(cur) -> None:
    cur.execute("""
        SELECT p.sku, p.name, c.attribute, c.candidates, c.reason
        FROM spec_conflicts c JOIN products p ON p.id = c.product_id
        WHERE c.resolved_at IS NULL ORDER BY p.sku, c.attribute
    """)
    rows = cur.fetchall()
    if not rows:
        print("  nenhum conflito pendente")
        return
    for sku, name, attribute, candidates, reason in rows:
        print(f"\n  {sku} ({name}) . {attribute}")
        print(f"    motivo: {reason}")
        for cand in candidates:
            print(f"    - {cand['value']!r} via {cand['source_name']} "
                 f"(confiança {cand['confidence']})")


def resolve(cur, sku: str, attribute: str, value: str, by: str) -> bool:
    valid = _VALID_VALUES.get(attribute)
    if valid is not None and value not in valid:
        sys.exit(f"valor inválido para {attribute}: {value!r} (aceites: {sorted(valid)})")
    cur.execute("SELECT id, specs FROM products WHERE sku = %s", (sku,))
    row = cur.fetchone()
    if row is None:
        sys.exit(f"SKU não encontrado: {sku}")
    pid, _specs = row
    cur.execute(
        "UPDATE products SET specs = specs || %s::jsonb, updated_at = now() WHERE id = %s",
        (json.dumps({attribute: value}), pid),
    )
    cur.execute(
        """UPDATE spec_conflicts SET resolved_at = now(), resolved_value = %s, resolved_by = %s
           WHERE product_id = %s AND attribute = %s""",
        (value, by, pid, attribute),
    )
    return cur.rowcount > 0


def main() -> None:
    args = sys.argv[1:]
    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
            who = os.environ.get("USER") or os.environ.get("USERNAME") or "operador"
            if "--status" in args:
                status(cur)
            elif "--conflicts" in args:
                list_conflicts(cur)
            elif "--resolve" in args:
                i = args.index("--resolve")
                rest = args[i + 1:]
                if len(rest) != 3:
                    sys.exit("--resolve precisa de SKU ATTRIBUTE VALUE")
                sku, attribute, value = rest
                ok = resolve(cur, sku, attribute, value, who)
                print("resolvido" if ok else "aviso: não havia conflito aberto para isso "
                                              "(o specs foi actualizado do mesmo jeito)")
            else:
                confirmed, conflict, insufficient = ingest(cur)
                print(f"confirmados: {confirmed} · conflitos: {conflict} · "
                     f"insuficientes: {insufficient}")
                status(cur)
                if conflict or insufficient:
                    print("\nVer pendências: python -m seed.ingest_specs --conflicts")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
