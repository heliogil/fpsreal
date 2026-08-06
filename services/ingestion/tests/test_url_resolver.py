"""Testes unitários do resolvedor de source_url — sem rede.

O que importa testar aqui é o filtro anti-falso-positivo: uma URL errada que
passa pela camada 1 (slug) ou uma página errada que passa pela camada 2
(texto) contamina o LLMSpecAdapter com "fonte" que não é fonte nenhuma.
"""
from __future__ import annotations

from specs.url_resolver import (
    SitemapUrlResolver,
    best_match_url,
    content_hash,
    parse_robots_sitemaps,
    parse_sitemap_xml,
    strip_html,
    text_confirms,
    tokenize,
)


# ── tokenize ────────────────────────────────────────────────────────────────

def test_tokenize_drops_stopwords_and_short_tokens():
    tokens = tokenize("Corsair 4000D Airflow RGB Gaming Case")
    # "gaming" e "case" são preenchimento seguro em qualquer marca — sempre stopword.
    assert "gaming" not in tokens
    assert "case" not in tokens
    assert "4000d" in tokens
    assert "corsair" in tokens
    # "airflow"/"rgb" ficam — não são stopword. "Airflow" distingue produto de
    # verdade pra Corsair (4000D existe liso E em variante Airflow, são SKUs
    # diferentes); stopwordá-lo foi a causa raiz de um falso-positivo real
    # (ver test_best_match_refuses_to_pick_between_tied_sibling_models).
    assert "airflow" in tokens
    assert "rgb" in tokens


# ── best_match_url ──────────────────────────────────────────────────────────

def test_best_match_requires_model_code_token_in_slug():
    urls = [
        "https://www.example.com/graphics-cards/rtx-5080/",
        "https://www.example.com/graphics-cards/rtx-5090/",
        "https://www.example.com/news/rtx-launch-event/",
    ]
    match = best_match_url(urls, "GeForce RTX 5090")
    assert match == "https://www.example.com/graphics-cards/rtx-5090/"


def test_best_match_returns_none_when_no_url_has_model_code():
    urls = ["https://www.example.com/graphics-cards/rtx-5080/",
            "https://www.example.com/news/rtx-launch-event/"]
    assert best_match_url(urls, "GeForce RTX 5090") is None


def test_best_match_picks_highest_overlap_among_valid_candidates():
    urls = [
        "https://www.example.com/us/products/lancool-216/",
        "https://www.example.com/global/en/lian-li-lancool-216/",
    ]
    # as duas têm "216" (o único token-código, condição de entrada); a
    # segunda também bate "lian"/"li"/"lancool" — desempata pelo overlap total
    match = best_match_url(urls, "Lian Li Lancool 216")
    assert match == "https://www.example.com/global/en/lian-li-lancool-216/"


def test_best_match_never_accepts_generic_category_page():
    urls = ["https://www.example.com/cases/", "https://www.example.com/support/"]
    assert best_match_url(urls, "NZXT H5 Flow") is None


def test_best_match_refuses_to_pick_between_tied_sibling_models():
    # regressão real (2026-08-06, rodada ao vivo contra nzxt.com): "H5 Flow" e
    # "H5 Elite" são modelos DIFERENTES da mesma linha e empatam no único
    # token-código que compartilham ("h5") se o resto do nome não desempatar
    # a favor de nenhum dos dois — aqui NENHUMA URL menciona "flow", então
    # nunca deveria escolher a do "elite"
    urls = ["https://nzxt.com/en-intl/products/h5-elite-case",
            "https://nzxt.com/en-intl/products/h5-elite-case-rgb"]
    assert best_match_url(urls, "NZXT H5 Flow") is None


def test_best_match_picks_correctly_when_distinguishing_token_present():
    # mesmo cenário, mas agora existe uma URL que bate TAMBÉM em "flow" —
    # essa tem de vencer com margem clara sobre a "elite"
    urls = ["https://nzxt.com/en-intl/products/h5-elite-case",
            "https://nzxt.com/en-intl/products/h5-flow"]
    assert best_match_url(urls, "NZXT H5 Flow") == "https://nzxt.com/en-intl/products/h5-flow"


# ── text_confirms — camada 2, a URL pode bater e a página ainda ser errada ──

def test_text_confirms_requires_minimum_token_overlap():
    page = "Esta AIO Liquid Freezer III 360 vem com três ventoinhas e bomba de alto fluxo."
    assert text_confirms(page, "Arctic Liquid Freezer III 360")


def test_text_confirms_rejects_unrelated_page_despite_url_match():
    # simula: a URL casou por coincidência de número, mas a página é de outro produto
    page = "Página não encontrada. O produto que procura já não está disponível."
    assert not text_confirms(page, "Arctic Liquid Freezer III 360")


# ── strip_html ──────────────────────────────────────────────────────────────

def test_strip_html_removes_script_and_tags():
    html = "<html><head><script>evil()</script></head><body><h1>RTX 5090</h1><p>32GB</p></body></html>"
    text = strip_html(html)
    assert "evil()" not in text
    assert "RTX 5090" in text
    assert "32GB" in text
    assert "<" not in text


# ── sitemap parsing ─────────────────────────────────────────────────────────

def test_parse_sitemap_xml_urlset():
    xml = """<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
    </urlset>"""
    pages, nested = parse_sitemap_xml(xml)
    assert pages == ["https://example.com/a", "https://example.com/b"]
    assert nested == []


def test_parse_sitemap_xml_index():
    xml = """<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-products.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
    </sitemapindex>"""
    pages, nested = parse_sitemap_xml(xml)
    assert pages == []
    assert nested == ["https://example.com/sitemap-products.xml", "https://example.com/sitemap-blog.xml"]


def test_parse_sitemap_xml_malformed_returns_empty_not_crash():
    pages, nested = parse_sitemap_xml("not xml at all <<<")
    assert pages == [] and nested == []


def test_parse_robots_sitemaps_extracts_declared_lines():
    robots = "User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml\n"
    assert parse_robots_sitemaps(robots, "example.com") == ["https://example.com/sitemap.xml"]


def test_parse_robots_sitemaps_falls_back_to_conventional_path():
    assert parse_robots_sitemaps("User-agent: *\nDisallow: /", "example.com") == \
        ["https://example.com/sitemap.xml"]


# ── content_hash — a base do controle de duplicata ──────────────────────────

def test_content_hash_is_deterministic_and_sensitive_to_change():
    a = content_hash("mesmo texto")
    b = content_hash("mesmo texto")
    c = content_hash("texto diferente")
    assert a == b
    assert a != c


# ── SitemapUrlResolver — orquestração completa, com http_get fake ──────────

def _fake_http(pages: dict[str, str]):
    def get(url: str):
        return pages.get(url)
    return get


def test_resolver_end_to_end_success():
    robots = "Sitemap: https://nzxt.com/sitemap.xml\n"
    sitemap = ("<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"
              "<url><loc>https://nzxt.com/products/h5-flow</loc></url>"
              "<url><loc>https://nzxt.com/products/h9-flow</loc></url>"
              "</urlset>")
    product_page = "<html><body><h1>NZXT H5 Flow</h1><p>Mid-tower ATX case with high airflow.</p></body></html>"

    pages = {
        "https://nzxt.com/robots.txt": robots,
        "https://nzxt.com/sitemap.xml": sitemap,
        "https://nzxt.com/products/h5-flow": product_page,
    }
    resolver = SitemapUrlResolver(_fake_http(pages))
    result = resolver.resolve({"sku": "case-h5-flow", "name": "NZXT H5 Flow",
                               "brand": "NZXT", "category": "case"})
    assert result is not None
    assert result.url == "https://nzxt.com/products/h5-flow"
    assert "H5 Flow" in result.text


def test_resolver_returns_none_for_unmapped_brand():
    resolver = SitemapUrlResolver(_fake_http({}))
    result = resolver.resolve({"sku": "x", "name": "Something", "brand": "MarcaDesconhecida",
                               "category": "case"})
    assert result is None


def test_resolver_returns_none_when_page_text_does_not_confirm():
    robots = "Sitemap: https://nzxt.com/sitemap.xml\n"
    sitemap = ("<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"
              "<url><loc>https://nzxt.com/products/h5-flow</loc></url></urlset>")
    # a URL bate (tem "h5"), mas a página é um redirect morto — camada 2 barra
    wrong_page = "<html><body>Este produto foi descontinuado.</body></html>"
    pages = {
        "https://nzxt.com/robots.txt": robots,
        "https://nzxt.com/sitemap.xml": sitemap,
        "https://nzxt.com/products/h5-flow": wrong_page,
    }
    resolver = SitemapUrlResolver(_fake_http(pages))
    result = resolver.resolve({"sku": "case-h5-flow", "name": "NZXT H5 Flow",
                               "brand": "NZXT", "category": "case"})
    assert result is None
