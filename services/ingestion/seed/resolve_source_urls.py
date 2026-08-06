"""Resolução automática de source_url via sitemap do fabricante — a peça que
alimenta o LLMSpecAdapter com texto real.

    python -m seed.resolve_source_urls                # resolve pendentes (até --limit)
    python -m seed.resolve_source_urls --status        # resolvidos vs. pendentes vs. sem marca mapeada
    python -m seed.resolve_source_urls --duplicates    # content_hash repetido entre produtos DIFERENTES
    python -m seed.resolve_source_urls --force SKU     # ignora cache, resolve de novo
    python -m seed.resolve_source_urls --limit N       # teto de resoluções NOVAS nesta corrida (default 20)

CONTROLE DE DUPLICATA (ver specs/url_resolver.py para o porquê de cada
camada): idempotente por padrão — produto já resolvido não é tocado de novo
(nem gasta requisição) a menos que ``--force``; toda resolução nova é
comparada por ``content_hash`` contra as já salvas, e REJEITADA se bater com
outro produto (sinal de página genérica, não ficha real).

Educado por padrão: 1 fabricante = 1 sessão HTTP reaproveitada, pausa entre
requisições, teto de sitemaps aninhados e de resoluções novas por corrida.
User-Agent identifica o bot honestamente — nunca finge ser browser.
"""
from __future__ import annotations

import os
import sys
import time

import httpx
import psycopg2

from specs.url_resolver import SitemapUrlResolver, brand_domain

DDL = """
CREATE TABLE IF NOT EXISTS product_source_urls (
    product_id     INT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    resolver       TEXT NOT NULL DEFAULT 'sitemap',
    content_hash   TEXT NOT NULL,
    -- texto já extraído (strip_html), guardado pra ingest_specs.py nunca
    -- precisar refazer a requisição HTTP — só resolve_source_urls.py toca a rede
    fetched_text   TEXT NOT NULL,
    verified       BOOLEAN NOT NULL DEFAULT true,
    fetched_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_urls_content_hash ON product_source_urls(content_hash);
"""

USER_AGENT = "Mozilla/5.0 (compatible; ReiDoFPS-SpecBot/1.0; +https://reidofps.com.br)"
REQUEST_DELAY_S = 1.5   # educado: pausa entre CADA requisição HTTP de saída
DEFAULT_LIMIT = 20      # teto de resoluções NOVAS por corrida — não hiberna a VPS num fabricante só


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL not set")
    for drv in ("+asyncpg", "+psycopg2", "+psycopg"):
        dsn = dsn.replace(drv, "")
    return psycopg2.connect(dsn)


def _make_http_get(client: httpx.Client):
    def get(url: str) -> str | None:
        time.sleep(REQUEST_DELAY_S)
        try:
            r = client.get(url, timeout=15.0, follow_redirects=True)
            if r.status_code >= 400:
                return None
            return r.text
        except httpx.HTTPError:
            return None
    return get


def _eligible_products(cur, only_sku: str | None = None):
    if only_sku:
        cur.execute(
            "SELECT id, sku, name, brand, category FROM products WHERE sku = %s AND is_active",
            (only_sku,),
        )
    else:
        cur.execute("""
            SELECT p.id, p.sku, p.name, p.brand, p.category
            FROM products p
            LEFT JOIN product_source_urls u ON u.product_id = p.id
            WHERE p.is_active AND p.category IN ('gpu','case','cooler')
              AND u.product_id IS NULL
            ORDER BY p.category, p.sku
        """)
    return cur.fetchall()


def resolve(cur, limit: int, only_sku: str | None = None, force: bool = False) -> tuple[int, int, int]:
    if force and only_sku:
        cur.execute("DELETE FROM product_source_urls WHERE product_id = "
                    "(SELECT id FROM products WHERE sku = %s)", (only_sku,))

    rows = _eligible_products(cur, only_sku)
    resolved = skipped_no_domain = rejected_duplicate = 0

    with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
        resolver = SitemapUrlResolver(_make_http_get(client))
        done = 0
        for pid, sku, name, brand, category in rows:
            if done >= limit:
                break
            if brand_domain(brand or "") is None:
                skipped_no_domain += 1
                continue

            done += 1
            product = {"sku": sku, "name": name, "brand": brand, "category": category}
            page = resolver.resolve(product)
            if page is None:
                print(f"  sem resolução: {sku} ({name})")
                continue

            cur.execute(
                "SELECT p.sku FROM product_source_urls u JOIN products p ON p.id = u.product_id "
                "WHERE u.content_hash = %s AND u.product_id != %s",
                (page.content_hash, pid),
            )
            collision = cur.fetchone()
            if collision is not None:
                rejected_duplicate += 1
                print(f"  REJEITADO (conteúdo duplicado com {collision[0]}): {sku} -> {page.url}")
                continue

            cur.execute(
                """INSERT INTO product_source_urls (product_id, url, content_hash, fetched_text, fetched_at)
                   VALUES (%s,%s,%s,%s, now())
                   ON CONFLICT (product_id) DO UPDATE SET
                       url = EXCLUDED.url, content_hash = EXCLUDED.content_hash,
                       fetched_text = EXCLUDED.fetched_text, fetched_at = now()""",
                (pid, page.url, page.content_hash, page.text),
            )
            resolved += 1
            print(f"  resolvido: {sku} -> {page.url}")

    return resolved, skipped_no_domain, rejected_duplicate


def status(cur) -> None:
    cur.execute("""
        SELECT p.category, count(*) AS total,
               count(u.product_id) AS resolvidos
        FROM products p LEFT JOIN product_source_urls u ON u.product_id = p.id
        WHERE p.is_active AND p.category IN ('gpu','case','cooler')
        GROUP BY p.category ORDER BY p.category
    """)
    print("  categoria        resolvidos  total")
    for cat, total, done in cur.fetchall():
        print(f"  {cat:16} {done:>10}  {total:>5}")

    cur.execute("""
        SELECT p.category, count(*) FROM products p
        WHERE p.is_active AND p.category IN ('gpu','case','cooler')
          AND p.id NOT IN (SELECT product_id FROM product_source_urls)
        GROUP BY p.category
    """)
    pending = dict(cur.fetchall())
    no_domain = 0
    cur.execute("SELECT brand FROM products WHERE is_active AND category IN ('gpu','case','cooler')")
    for (brand,) in cur.fetchall():
        if brand_domain(brand or "") is None:
            no_domain += 1
    print(f"\n  pendentes sem marca mapeada (nunca vão resolver sem código novo): ~{no_domain}")


def list_duplicates(cur) -> None:
    cur.execute("""
        SELECT u.content_hash, array_agg(p.sku ORDER BY p.sku)
        FROM product_source_urls u JOIN products p ON p.id = u.product_id
        GROUP BY u.content_hash HAVING count(*) > 1
    """)
    rows = cur.fetchall()
    if not rows:
        print("  nenhuma duplicata de conteúdo entre produtos diferentes (esperado — "
              "resoluções colidentes são rejeitadas antes de salvar)")
        return
    for content_hash, skus in rows:
        print(f"  hash {content_hash[:12]}... compartilhado por: {skus}")


def main() -> None:
    args = sys.argv[1:]
    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
            if "--status" in args:
                status(cur)
            elif "--duplicates" in args:
                list_duplicates(cur)
            elif "--force" in args:
                i = args.index("--force")
                if i + 1 >= len(args):
                    sys.exit("--force precisa de um SKU")
                sku = args[i + 1]
                resolved, _, rejected = resolve(cur, limit=1, only_sku=sku, force=True)
                print(f"resolvidos: {resolved} · rejeitados por duplicata: {rejected}")
            else:
                limit = DEFAULT_LIMIT
                if "--limit" in args:
                    i = args.index("--limit")
                    limit = int(args[i + 1])
                resolved, no_domain, rejected = resolve(cur, limit=limit)
                print(f"\nresolvidos: {resolved} · sem marca mapeada: {no_domain} · "
                     f"rejeitados por duplicata: {rejected}")
                status(cur)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
