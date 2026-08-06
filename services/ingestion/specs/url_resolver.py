"""Resolução automática de ``source_url`` — descoberta via sitemap, não busca.

Testado empiricamente contra a VPS antes de escrever isto (2026-08-06): busca
sem chave (DuckDuckGo HTML) devolve 202 vazio — bloqueada pra tráfego de
script. Em vez de contornar isso, o mecanismo usa o canal que os PRÓPRIOS
fabricantes publicam pra serem indexados: ``robots.txt`` → ``Sitemap:`` →
XML com todas as páginas do site. É o oposto de evasão — é o crawler mais
"convidado" que existe.

DUAS CAMADAS DE VERIFICAÇÃO, nenhuma opcional:
  1. URL: o slug da URL candidata tem de conter TODOS os tokens "código de
     modelo" do nome do produto (token com dígito, ex. "5090", "216", "ak400")
     — nunca aceita por overlap parcial de palavras genéricas.
  2. Texto: depois de buscar a página, o corpo do texto tem de mencionar um
     número mínimo de tokens do nome — a URL pode bater e a página ainda
     assim ser a errada (redirect, produto descontinuado redirecionado).

CONTROLE DE DUPLICATA (pedido explícito — "lojas divergem, sitemaps também
podem"): o ``content_hash`` (sha256 do texto) de cada resolução é comparado
contra os já salvos. Se o MESMO hash já pertence a OUTRO produto, a
resolução é rejeitada — é sinal de que caiu numa página genérica (categoria,
404 disfarçado, template vazio) que serviria pra qualquer SKU, não uma ficha
real. Isso nunca deveria acontecer com uma correspondência de verdade.

Este módulo é dependência mínima de propósito (stdlib + httpx, já usado no
resto do projeto) — sem BeautifulSoup/lxml, mesmo espírito "puro-Python" do
resto do ingestor (ver airflow_field.py).
"""
from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Callable, Optional

#: domínio oficial conhecido por marca — só entra aqui quem já foi TESTADO
#: como alcançável da VPS (ver notas da sessão de 2026-08-06). Marca ausente
#: ou domínio que passou a bloquear = fica sem resolver, nunca adivinha outro.
BRAND_DOMAINS: dict[str, str] = {
    "nvidia": "www.nvidia.com",
    "amd": "www.amd.com",              # bloqueado/inalcançável no teste — fica sem resolver
    "asus": "www.asus.com",
    "msi": "www.msi.com",              # 403 no teste — fica sem resolver
    "gigabyte": "www.gigabyte.com",    # 403 no teste — fica sem resolver
    "corsair": "www.corsair.com",
    "kingston": "www.kingston.com",
    "western digital": "www.westerndigital.com",
    "samsung": "www.samsung.com",
    "asrock": "www.asrock.com",
    "lian li": "lian-li.com",
    "nzxt": "nzxt.com",
    "montech": "www.montechusa.com",
    "deepcool": "www.deepcool.com",
    "thermalright": "www.thermalright.com",
    "arctic": "www.arctic.de",
}

#: DELIBERADAMENTE curta. Um achado real (2026-08-06): "flow" foi stopword
#: aqui e causou um falso-positivo de verdade em produção — "NZXT H5 Flow"
#: resolveu pra "h5-elite-case" (modelo DIFERENTE da mesma linha), porque
#: "Flow" não é enfeite de marketing pra esse fabricante, é o que distingue
#: o modelo. Palavras "genéricas" viram identificador de linha dependendo do
#: fabricante (mesmo raciocínio vale pra "Airflow" nos gabinetes Corsair
#: 4000D — existe "4000D" liso e "4000D Airflow", produtos DIFERENTES). Por
#: isso a lista só tem o que é seguro em QUALQUER marca: preenchimento de
#: frase e categoria genérica de produto — nunca um adjetivo/variante que
#: algum fabricante já usou pra nomear um SKU específico.
_STOPWORDS = {
    "gaming", "series", "edition", "the", "and", "with", "for",
    "case", "cooler", "cpu", "gpu", "psu", "kit",
}

MAX_NESTED_SITEMAPS = 8
MAX_URLS_COLLECTED = 20000
MIN_TEXT_TOKEN_MATCHES = 2

_SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def brand_domain(brand: str) -> Optional[str]:
    return BRAND_DOMAINS.get(brand.strip().lower())


def tokenize(name: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", name.lower())
    return [t for t in raw if t not in _STOPWORDS and len(t) > 1]


def _is_model_code(token: str) -> bool:
    return any(ch.isdigit() for ch in token)


def best_match_url(urls: list[str], product_name: str) -> Optional[str]:
    """Só aceita uma URL se ela contiver TODOS os tokens-código de modelo do
    nome (ver docstring do módulo). Entre as que passam, escolhe a de maior
    overlap total — MAS só se essa vencedora tiver uma margem clara sobre a
    segunda colocada. Empate (ou quase) nunca é resolvido no palpite: dois
    modelos da mesma linha (ex. "H5 Flow" vs "H5 Elite") costumam empatar no
    único token-código que os dois compartilham, e escolher um dos dois seria
    inventar qual produto é — mesmo princípio do reconcile() pra fontes que
    divergem. Sem tokens-código no nome, exige TODOS os tokens restantes
    (mais rígido, porque não há um identificador forte pra ancorar)."""
    tokens = tokenize(product_name)
    model_codes = [t for t in tokens if _is_model_code(t)]
    required = model_codes if model_codes else tokens
    if not required:
        return None

    scored: list[tuple[int, str]] = []
    for url in urls:
        slug_tokens = set(re.findall(r"[a-z0-9]+", url.lower()))
        if not all(t in slug_tokens for t in required):
            continue
        score = sum(1 for t in tokens if t in slug_tokens)
        scored.append((score, url))
    if not scored:
        return None

    scored.sort(key=lambda pair: pair[0], reverse=True)
    best_score, best_url = scored[0]
    if len(scored) > 1 and scored[1][0] >= best_score:
        return None   # empate real (ou quase) entre candidatos válidos — não escolhe
    return best_url


def text_confirms(page_text: str, product_name: str,
                  min_matches: int = MIN_TEXT_TOKEN_MATCHES) -> bool:
    """Segunda camada: a URL bateu, mas a PÁGINA de verdade fala do produto?"""
    tokens = tokenize(product_name)
    if not tokens:
        return False
    text_tokens = set(re.findall(r"[a-z0-9]+", page_text.lower()))
    matches = sum(1 for t in tokens if t in text_tokens)
    return matches >= min(min_matches, len(tokens))


def strip_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def parse_sitemap_xml(xml_text: str) -> tuple[list[str], list[str]]:
    """Devolve (urls_de_pagina, urls_de_sitemap_aninhado)."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return [], []
    locs = [el.text.strip() for el in root.iter(f"{_SITEMAP_NS}loc") if el.text]
    if root.tag.endswith("sitemapindex"):
        return [], locs
    return locs, []


def parse_robots_sitemaps(robots_text: str, domain: str) -> list[str]:
    sitemaps = [
        line.split(":", 1)[1].strip()
        for line in robots_text.splitlines()
        if line.lower().startswith("sitemap:")
    ]
    return sitemaps or [f"https://{domain}/sitemap.xml"]


_RELEVANT_HINTS = ("product", "catalog", "shop", "en", "en-us", "global")


def _prioritize_nested(nested: list[str]) -> list[str]:
    """Sitemap-índice de site grande tem dezenas de sub-sitemaps (blog,
    suporte, fórum, idiomas...); prioriza os que parecem ter produto."""
    def score(url: str) -> int:
        low = url.lower()
        return sum(1 for hint in _RELEVANT_HINTS if hint in low)
    return sorted(nested, key=score, reverse=True)


@dataclass(frozen=True)
class ResolvedPage:
    url: str
    text: str
    content_hash: str


class SitemapUrlResolver:
    """Orquestra a descoberta: robots.txt -> sitemap(s) -> melhor URL ->
    busca a página -> confirma pelo texto. ``http_get`` é injetado (não usa
    httpx diretamente aqui) para os testes unitários rodarem sem rede."""

    def __init__(self, http_get: Callable[[str], Optional[str]]):
        self._get = http_get

    def _collect_candidate_urls(self, domain: str) -> list[str]:
        robots = self._get(f"https://{domain}/robots.txt")
        roots = parse_robots_sitemaps(robots, domain) if robots else [f"https://{domain}/sitemap.xml"]

        urls: list[str] = []
        nested_budget = MAX_NESTED_SITEMAPS
        queue = list(roots)
        while queue and len(urls) < MAX_URLS_COLLECTED:
            sm_url = queue.pop(0)
            xml_text = self._get(sm_url)
            if not xml_text:
                continue
            page_urls, nested = parse_sitemap_xml(xml_text)
            urls.extend(page_urls)
            if nested and nested_budget > 0:
                take = _prioritize_nested(nested)[:nested_budget]
                queue.extend(take)
                nested_budget -= len(take)
        return urls

    def resolve(self, product: dict) -> Optional[ResolvedPage]:
        brand = str(product.get("brand") or "")
        name = str(product.get("name") or "")
        domain = brand_domain(brand)
        if domain is None:
            return None

        candidate_urls = self._collect_candidate_urls(domain)
        if not candidate_urls:
            return None

        best_url = best_match_url(candidate_urls, name)
        if best_url is None:
            return None

        html = self._get(best_url)
        if not html:
            return None
        text = strip_html(html)
        if not text_confirms(text, name):
            return None

        return ResolvedPage(url=best_url, text=text, content_hash=content_hash(text))
