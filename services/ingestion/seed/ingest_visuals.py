"""Ingestor de modelos visuais — gera, valida e persiste descritores de aparência.

    python -m seed.ingest_visuals                # gera/actualiza pela FICHA (NÃO aprova)
    python -m seed.ingest_visuals --visao        # tenta a FOTO, cai na ficha
    python -m seed.ingest_visuals --status       # o que está pendente/aprovado
    python -m seed.ingest_visuals --approve-all  # portão de revisão (explícito)
    python -m seed.ingest_visuals --approve SKU [SKU...]
    python -m seed.ingest_visuals --revoke SKU

PORTÃO: nada chega ao viewer sem ``reviewed_at``. Gerar é barato e automático;
aprovar é um acto deliberado. Um descritor que contradiga a ficha técnica é
REJEITADO na geração — não entra sequer como pendente.

Idempotente: re-correr actualiza o descritor e PRESERVA a aprovação apenas se o
descritor não mudou; se mudou, a aprovação cai (tem de ser revista de novo).
"""
from __future__ import annotations

import json
import os
import sys

import psycopg2
import psycopg2.extras

from visuals import DescriptorError, SCHEMA_VERSION, SpecsAdapter, validate
from visuals.schema import canon

DDL = """
CREATE TABLE IF NOT EXISTS product_visuals (
    product_id     INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    category       TEXT        NOT NULL,
    descriptor     JSONB       NOT NULL,
    schema_version INTEGER     NOT NULL DEFAULT 1,
    source         TEXT        NOT NULL,
    photo_hash     TEXT,
    confidence     REAL        NOT NULL DEFAULT 0,
    notes          TEXT,
    reviewed_at    TIMESTAMPTZ,
    reviewed_by    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_visuals_reviewed ON product_visuals(reviewed_at);
"""


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    # psycopg2 não entende sufixo de driver SQLAlchemy (+asyncpg/+psycopg2)
    for drv in ("+asyncpg", "+psycopg2", "+psycopg"):
        dsn = dsn.replace(drv, "")
    return psycopg2.connect(dsn)


def ingest(cur, use_vision: bool = False) -> tuple[int, int, int]:
    """Gera descritores. Com ``use_vision``, tenta primeiro a FOTO e cai na
    ficha técnica quando não há foto, não há credencial, ou a confiança é baixa
    — a ficha é sempre o piso, a visão é enriquecimento.

    CUSTO: a foto é buscada e hasheada ANTES de qualquer chamada ao modelo; se
    o ``photo_hash`` não mudou e já existe um descritor de visão, o produto é
    saltado sem gastar nada."""
    specs_adapter = SpecsAdapter()
    vision = None
    if use_vision:
        from visuals import LLMVisionAdapter
        from visuals.vision_adapter import fetch_photo
        vision = LLMVisionAdapter()

    cur.execute("SELECT id, sku, name, category, specs FROM products WHERE is_active")
    rows = cur.fetchall()
    cur.execute("SELECT product_id, photo_hash, source FROM product_visuals")
    seen = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    ok = skipped = rejected = 0
    cached = 0
    for pid, sku, name, category, specs in rows:
        product = {"sku": sku, "name": name, "category": category, "specs": specs or {}}
        raw = None
        if vision is not None:
            got = fetch_photo(product)
            if got is not None:
                prev_hash, prev_src = seen.get(pid, (None, None))
                if prev_hash == got[2] and prev_src == "visao":
                    cached += 1          # foto igual: nada a re-ler, nada a pagar
                    continue
                product["_photo"] = got
                raw = vision.describe(product)
        if raw is None:
            raw = specs_adapter.describe(product)   # a ficha é o piso
        if raw is None:
            skipped += 1
            continue
        try:
            clean = validate(raw.category, raw.descriptor, product["specs"])
        except DescriptorError as e:
            # o portão de integridade: contradição não entra nem como pendente
            print(f"  REJEITADO {sku}: {e}")
            rejected += 1
            continue
        cur.execute(
            """
            INSERT INTO product_visuals (product_id, category, descriptor, schema_version,
                                         source, photo_hash, confidence, notes, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (product_id) DO UPDATE SET
                category=EXCLUDED.category,
                descriptor=EXCLUDED.descriptor,
                schema_version=EXCLUDED.schema_version,
                source=EXCLUDED.source,
                photo_hash=EXCLUDED.photo_hash,
                confidence=EXCLUDED.confidence,
                notes=EXCLUDED.notes,
                updated_at=now(),
                -- descritor mudou => a aprovação anterior deixa de valer
                reviewed_at = CASE WHEN product_visuals.descriptor = EXCLUDED.descriptor
                                   THEN product_visuals.reviewed_at ELSE NULL END,
                reviewed_by = CASE WHEN product_visuals.descriptor = EXCLUDED.descriptor
                                   THEN product_visuals.reviewed_by ELSE NULL END
            """,
            (pid, canon(raw.category), json.dumps(clean), SCHEMA_VERSION, raw.source,
             raw.photo_hash, clean.get("confidence", 0), raw.notes),
        )
        ok += 1
    if cached:
        print(f"  {cached} produto(s) com foto inalterada — sem chamada de visão")
    return ok, skipped, rejected


def status(cur) -> None:
    cur.execute("""
        SELECT v.category, count(*) FILTER (WHERE v.reviewed_at IS NOT NULL) AS aprovados,
               count(*) FILTER (WHERE v.reviewed_at IS NULL) AS pendentes
        FROM product_visuals v GROUP BY v.category ORDER BY v.category
    """)
    print("  categoria        aprovados  pendentes")
    for cat, apr, pend in cur.fetchall():
        print(f"  {cat:16} {apr:>9}  {pend:>9}")


def approve(cur, skus: list[str] | None, by: str) -> int:
    if skus:
        cur.execute("""
            UPDATE product_visuals v SET reviewed_at=now(), reviewed_by=%s
            FROM products p WHERE p.id=v.product_id AND p.sku = ANY(%s)
        """, (by, skus))
    else:
        cur.execute("UPDATE product_visuals SET reviewed_at=now(), reviewed_by=%s "
                    "WHERE reviewed_at IS NULL", (by,))
    return cur.rowcount


def revoke(cur, skus: list[str]) -> int:
    cur.execute("""
        UPDATE product_visuals v SET reviewed_at=NULL, reviewed_by=NULL
        FROM products p WHERE p.id=v.product_id AND p.sku = ANY(%s)
    """, (skus,))
    return cur.rowcount


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
            elif "--approve-all" in args:
                n = approve(cur, None, who)
                print(f"aprovados: {n}")
            elif "--approve" in args:
                skus = args[args.index("--approve") + 1:]
                if not skus:
                    sys.exit("--approve precisa de pelo menos um SKU")
                print(f"aprovados: {approve(cur, skus, who)}")
            elif "--revoke" in args:
                skus = args[args.index("--revoke") + 1:]
                if not skus:
                    sys.exit("--revoke precisa de pelo menos um SKU")
                print(f"revogados: {revoke(cur, skus)}")
            else:
                use_vision = "--visao" in args
                if use_vision:
                    # pergunta ao backend ACTIVO (default MiniMax), não a um
                    # fornecedor fixo — trocar de fornecedor é só a env var
                    from visuals.backends import get_backend
                    _b = get_backend()
                    if not _b.available():
                        print(f"AVISO: --visao pedido, fornecedor '{_b.name}' sem "
                              f"credencial — a correr só pela ficha técnica.")
                    else:
                        print(f"visão: {_b.name} / {getattr(_b, 'model', '-')}")
                ok, skipped, rejected = ingest(cur, use_vision=use_vision)
                print(f"descritores gerados/actualizados: {ok} · "
                      f"sem adapter: {skipped} · rejeitados pelo portão: {rejected}")
                status(cur)
                print("\nNada vai ao viewer sem aprovação:")
                print("  python -m seed.ingest_visuals --approve-all")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
