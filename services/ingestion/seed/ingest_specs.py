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

from specs import CatalogSeedAdapter, LLMSpecAdapter, ReferenceAdapter, reconcile

#: categorias cobertas e por que: cpu/motherboard = socket+RAM (categórico,
#: tabela oficial); gpu/case/cooler = dimensão física (comprimento/altura,
#: tolerância em mm — ver specs.reconcile)
_INGEST_CATEGORIES = ("cpu", "motherboard", "gpu", "case", "cooler")

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

#: faixa sã (mm) pra --resolve de atributo dimensional — mesma faixa do
#: LLMSpecAdapter (specs/llm_adapter.py), duplicada de propósito: são dois
#: pontos de entrada diferentes (humano vs. IA), a checagem não deve
#: depender de importar um módulo do outro
_NUMERIC_RANGES_MM = {
    "length_mm": (100.0, 450.0),
    "height_mm": (25.0, 200.0),
    "max_gpu_length_mm": (150.0, 500.0),
    "max_cooler_height_mm": (100.0, 250.0),
}


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    for drv in ("+asyncpg", "+psycopg2", "+psycopg"):
        dsn = dsn.replace(drv, "")
    return psycopg2.connect(dsn)


def _adapters() -> list:
    # ReferenceAdapter só responde por cpu/motherboard, CatalogSeedAdapter só
    # por gpu/case/cooler — cada um devolve [] fora da sua categoria, por
    # isso os dois entram sempre na lista, sem condicional por categoria aqui
    out = [ReferenceAdapter(), CatalogSeedAdapter()]
    llm = LLMSpecAdapter()
    if llm.available():
        out.append(llm)
    return out


def ingest(cur) -> tuple[int, int, int]:
    adapters = _adapters()
    cur.execute(
        """SELECT p.id, p.sku, p.name, p.category, p.specs, u.url, u.fetched_text
           FROM products p LEFT JOIN product_source_urls u ON u.product_id = p.id
           WHERE p.is_active AND p.category IN %s""",
        (_INGEST_CATEGORIES,),
    )
    rows = cur.fetchall()

    confirmed = conflict = insufficient = 0
    for pid, sku, name, category, specs, source_url, source_text in rows:
        # source_url/source_text nunca são persistidos em products.specs — só
        # existem aqui, na memória, pro LLMSpecAdapter consumir nesta corrida.
        # A tabela de origem é product_source_urls (seed/resolve_source_urls.py),
        # que NÃO toca a rede de novo — só ele faz isso, e com teto/pausa.
        product_specs = dict(specs or {})
        if source_url and source_text:
            product_specs["source_url"] = source_url
            product_specs["source_text"] = source_text
        product = {"sku": sku, "name": name, "category": category, "specs": product_specs}

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


#: atributos que este ingestor é responsável por confirmar, por categoria —
#: usado só pro relatório de --status, não pela geração de observações
_TRACKED_ATTRIBUTES = {
    "cpu": ("socket",),
    "motherboard": ("socket", "ram_type"),
    "gpu": ("length_mm",),
    "case": ("max_gpu_length_mm", "max_cooler_height_mm"),
    "cooler": ("height_mm",),
}


def status(cur) -> None:
    cur.execute(
        "SELECT category, count(*) FROM products "
        "WHERE category IN %s AND is_active GROUP BY category",
        (_INGEST_CATEGORIES,),
    )
    totals = dict(cur.fetchall())

    print("  categoria        atributo               confirmado  total")
    for cat in _INGEST_CATEGORIES:
        total = totals.get(cat, 0)
        for attribute in _TRACKED_ATTRIBUTES[cat]:
            cur.execute(
                "SELECT count(*) FROM products WHERE category = %s AND is_active "
                "AND specs ? %s",
                (cat, attribute),
            )
            (confirmed,) = cur.fetchone()
            print(f"  {cat:16} {attribute:22} {confirmed:>10}  {total:>5}")

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


def _validate_resolve_value(attribute: str, value: str) -> None:
    valid = _VALID_VALUES.get(attribute)
    if valid is not None:
        if value not in valid:
            sys.exit(f"valor inválido para {attribute}: {value!r} (aceites: {sorted(valid)})")
        return
    num_range = _NUMERIC_RANGES_MM.get(attribute)
    if num_range is not None:
        try:
            num = float(value)
        except ValueError:
            sys.exit(f"{attribute} precisa de um número (mm), recebi {value!r}")
        lo, hi = num_range
        if not (lo <= num <= hi):
            sys.exit(f"{attribute}={num}mm fora da faixa sã {lo:g}-{hi:g}mm")


def resolve(cur, sku: str, attribute: str, value: str, by: str) -> bool:
    _validate_resolve_value(attribute, value)
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
