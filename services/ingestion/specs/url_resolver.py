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

#: subiu de 8: sites com dezenas de países (ASUS = 83) têm vários
#: sub-sitemaps NUMERADOS por região só (us1.xml, us2.xml, ...) — 8 mal dava
#: pra uma região só depois da priorização por _PREFERRED_REGIONS
MAX_NESTED_SITEMAPS = 20
MAX_URLS_COLLECTED = 20000
MIN_TEXT_TOKEN_MATCHES = 2

_SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def brand_domain(brand: str) -> Optional[str]:
    return BRAND_DOMAINS.get(brand.strip().lower())


def tokenize(name: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", name.lower())
    return [t for t in raw if t not in _STOPWORDS and len(t) > 1]


#: achado real (2026-08-06): "12gb" (capacidade de VRAM, não parte do
#: modelo) tem dígito e virava token-código OBRIGATÓRIO — "GeForce RTX 3060
#: 12GB" exigia "3060" E "12gb" juntos na URL, e a maioria das montadoras
#: nem bota capacidade no slug quando só existe uma variante. Zero
#: candidatos passavam. Sufixo de capacidade (gb/mb/tb/g) nunca é obrigatório.
_CAPACITY_SUFFIX_RE = re.compile(r"^\d+(gb|mb|tb|g)$")


def _is_model_code(token: str) -> bool:
    if _CAPACITY_SUFFIX_RE.match(token):
        return False
    return any(ch.isdigit() for ch in token)


#: prefixo de locale no início do path (ex. /en-us/, /pt-br/, /en-intl/,
#: /de/) — achado real: sites grandes (NVIDIA) publicam a MESMA página de
#: produto em 8+ variantes de idioma no sitemap. Sem normalizar isso, elas
#: competem entre si e nunca uma vence — mas não são ambiguidade de verdade,
#: é o MESMO conteúdo. Ver test_best_match_collapses_locale_duplicates.
_LOCALE_PREFIX_RE = re.compile(r"^(https?://[^/]+)/[a-z]{2}(-[a-z]{2,7})?/", re.IGNORECASE)

#: sinal estrutural de página de PRODUTO vs. conteúdo editorial — não é
#: palpite sobre o conteúdo, é o próprio site categorizando a página pelo
#: path. Só desempata DENTRO do grupo de maior pontuação, nunca substitui o
#: overlap de tokens. Achado real: "graphics-cards" como substring solta
#: (sem barra) casava também com o SLUG de notícia
#: ".../news/win-rtx-4060-ti-graphics-cards/" — o hint tem de vir cercado
#: de barra (segmento de path de verdade), nunca substring livre.
_PRODUCT_PATH_HINTS = ("/graphics-cards/", "/product/", "/products/", "/p/", "/item/")
_EDITORIAL_PATH_HINTS = ("/news/", "/blog/", "/article/", "/press/", "/events/", "/promotions/")


def _normalize_locale(url: str) -> str:
    return _LOCALE_PREFIX_RE.sub(r"\1/", url)


def _path_quality(url: str) -> int:
    low = url.lower()
    if any(h in low for h in _PRODUCT_PATH_HINTS):
        return 1
    if any(h in low for h in _EDITORIAL_PATH_HINTS):
        return -1
    return 0


def best_match_url(urls: list[str], product_name: str) -> Optional[str]:
    """Só aceita uma URL se ela contiver TODOS os tokens-código de modelo do
    nome (ver docstring do módulo). Entre as que passam, escolhe a de maior
    overlap total — MAS só se essa vencedora tiver uma margem clara sobre a
    segunda colocada, com DOIS desempates seguros antes de desistir:

      1. Locale: candidatos empatados que são a MESMA página em idiomas
         diferentes colapsam num só (não é ambiguidade, é duplicata).
      2. Estrutura: entre grupos ainda empatados, uma página de PRODUTO
         (``/graphics-cards/``, ``/product/``...) vence uma editorial
         (``/news/``, ``/blog/``...) — sinal do próprio site, não palpite.

    Só depois desses dois, um empate real (ex. "H5 Flow" vs "H5 Elite" — são
    produtos DIFERENTES da mesma linha, não duplicata) continua sem escolha
    — inventar qual produto é seria o mesmo erro que o reconcile() nunca
    comete pra fontes que divergem. Sem tokens-código no nome, exige TODOS
    os tokens restantes (mais rígido, sem identificador forte pra ancorar)."""
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

    top_score = max(s for s, _ in scored)
    top = [u for s, u in scored if s == top_score]

    # desempate 1: colapsa duplicatas de locale dentro do grupo de topo
    by_normalized: dict[str, list[str]] = {}
    for u in top:
        by_normalized.setdefault(_normalize_locale(u), []).append(u)

    if len(by_normalized) == 1:
        group = next(iter(by_normalized.values()))
        return _pick_canonical_locale(group)

    # desempate 2: estrutura de path — produto vence editorial
    groups = list(by_normalized.items())
    qualities = [max(_path_quality(u) for u in variants) for _, variants in groups]
    best_q = max(qualities)
    winners = [g for g, q in zip(groups, qualities) if q == best_q]
    if len(winners) == 1:
        return _pick_canonical_locale(winners[0][1])

    return None   # ambiguidade real entre produtos DIFERENTES — não escolhe


def _pick_canonical_locale(urls: list[str]) -> str:
    """Dentro de um grupo que já sabemos ser a MESMA página (só idioma
    diferente), escolhe uma representante de forma determinística —
    preferindo en-us/en quando existe, senão a primeira em ordem alfabética."""
    for u in sorted(urls):
        if re.search(r"//[^/]+/en(-us)?/", u, re.IGNORECASE):
            return u
    return sorted(urls)[0]


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

#: achado real (2026-08-06): a ASUS organiza o sitemap por 83 CÓDIGOS DE
#: REGIÃO como primeiro segmento do path (ex. "us", "uk", "au", "africa-fr"),
#: listados em ordem que começa alfabeticamente por "africa-fr" — sem
#: reconhecer "us" como segmento de região preferido, o teto de sub-sitemaps
#: (8) esgotava inteiro em regiões irrelevantes antes de chegar em "us", e
#: zero candidatos apareciam pra QUALQUER produto. Cobre os padrões mais
#: comuns vistos (ASUS: us/uk; NZXT: en-intl) — não exaustivo, só evita
#: desperdiçar o orçamento numa região aleatória primeiro.
_PREFERRED_REGIONS = {"us", "en-us", "en-intl", "en-gb", "uk", "en", "global", "en-au", "ca-en", "au"}

_REGION_SEGMENT_RE = re.compile(r"^https?://[^/]+/([^/]+)/", re.IGNORECASE)


def _region_segment(url: str) -> Optional[str]:
    m = _REGION_SEGMENT_RE.match(url)
    return m.group(1).lower() if m else None


def _prioritize_nested(nested: list[str]) -> list[str]:
    """Sitemap-índice de site grande tem dezenas de sub-sitemaps (blog,
    suporte, fórum, idiomas, dezenas de países...); prioriza primeiro por
    região preferida (segmento de path de verdade, não substring solta),
    depois pelos hints de conteúdo de sempre."""
    def score(url: str) -> tuple[int, int]:
        region = _region_segment(url)
        region_score = 2 if region in _PREFERRED_REGIONS else 0
        low = url.lower()
        hint_score = sum(1 for hint in _RELEVANT_HINTS if hint in low)
        return (region_score, hint_score)
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
