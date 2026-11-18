"""AibDimensionAdapter — comprimento de GPU por MONTADORA real, não pelo
card de referência do chip.

Achado do founder (2026-08-06): o comprimento de uma GPU é definido por
quem monta a placa (ASUS/ASRock/Sapphire/...), não pela NVIDIA/AMD — a
mesma RTX 5070 sai em cards de ~200mm a ~330mm dependendo do modelo. A
página de referência do chip (usada antes, ver ``git log``) descreve só o
Founders Edition — um produto que às vezes nem chega a vender no Brasil.
Tratar isso como "a" fonte era medir a coisa errada, não corrigir um erro
de digitação.

DESENHO — diferente do ``SitemapUrlResolver`` de propósito: lá a ambiguidade
entre páginas candidatas é um problema a evitar (H5 Flow vs H5 Elite são
produtos DIFERENTES, escolher errado é inventar qual é). Aqui a "ambiguidade"
entre ROG Strix / TUF Gaming / Dual da MESMA GPU É O OBJETIVO — cada uma é
uma observação real e válida, e ``reconcile()`` (modo "faixa de mercado",
ver ``specs/reconcile.py``) promove o MAIOR valor visto, exigindo pelo menos
``MIN_INDEPENDENT_MARKET_SOURCES`` SKUs REAIS e DIFERENTES concordando em
existir (não em bater o número — divergir é esperado).

CORREÇÃO 2026-08-06: a independência conta por SKU, não por marca. Uma
montadora sozinha (ex. só a ASUS alcançável de verdade pra um chip NVIDIA,
depois de ASRock/Sapphire/MSI/Gigabyte/Zotac/GALAX ficarem indisponíveis)
já vende VÁRIOS modelos reais e diferentes do mesmo chip — Dual, TUF, T1,
Prime da própria ASUS têm comprimentos diferentes de verdade, é a mesma
variação de mercado que motivou este desenho, só que dentro de um
fabricante em vez de entre fabricantes. Fonte é rotulada
``aib_market:{marca}:{sku-da-pagina}``, não só ``aib_market:{marca}`` —
sem isso, 3 páginas da ASUS contavam como "1 fonte" e nunca confirmava nada.

Fontes reais testadas alcançáveis da VPS (2026-08-06, mesma disciplina do
``url_resolver``: nunca contorna bloqueio) — ver ``AIB_DOMAINS``. Zotac,
GALAX e MSI/Gigabyte bloqueiam (403); PowerColor/Colorful inalcançáveis;
ASRock e PNY/Palit/Gainward/Inno3D têm sitemap acessível mas sem catálogo
de GPU navegável (ASRock: página de categoria atrás de bot-detection
Incapsula; os outros quatro: sitemap real mas raso, sem página por SKU
descobrível) — ficam de fora até algo mudar, nunca substituídos por
adivinhação.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Callable, Optional

from .base import RawSpecObservation
from .llm_adapter import LLMSpecAdapter
from .url_resolver import (
    SitemapUrlResolver,
    _is_model_code,
    _normalize_locale,
    _slug_has_all_codes,
    strip_html,
    text_confirms,
    tokenize,
)

log = logging.getLogger("pcb.specs.aib")

#: montadoras reais testadas alcançáveis (robots.txt/sitemap OK) — cobre
#: NVIDIA (asus, asrock) e AMD (asrock, sapphire) com pelo menos 2 fontes
#: cada. Ver notas de sessão 2026-08-06 pra por que a lista não é maior.
AIB_DOMAINS: dict[str, str] = {
    "asus": "www.asus.com",
    "asrock": "www.asrock.com",
    "sapphire": "www.sapphiretech.com",
}

#: achado real: Sapphire só fabrica placas AMD/Radeon — consultá-la pra um
#: chip NVIDIA é garantidamente 0 resultado, gasto à toa. ASUS/ASRock fazem
#: placa dos dois lados. brand="NVIDIA"/"AMD" vem de products.brand (o chip,
#: não a montadora).
_BRAND_ONLY_DOMAINS: dict[str, tuple[str, ...]] = {
    "amd": ("sapphire",),
}


#: achado real (2026-08-06): a ficha de um produto ASUS tem VÁRIAS sub-
#: páginas do MESMO SKU ("t1-rtx5070-o12g-gaming/techspec/", ".../review/",
#: ".../where-to-buy/") — usar só o último segmento pegava "techspec" como
#: se fosse o identificador do produto, e duas sub-páginas do MESMO card
#: contavam como 2 fontes independentes (uma delas nem é a página real, é
#: sempre "techspec"). Precisa subir até o segmento que É o produto.
_GENERIC_PAGE_SUFFIXES = {
    "techspec", "specifications", "spec", "specs", "overview",
    "review", "reviews", "where-to-buy", "buy", "helpdesk_download",
    "helpdesk_manual", "helpdesk_warranty", "helpdesk_service", "helpdesk_knowledge",
}


def _product_slug(url: str) -> str:
    """Segmento do path que identifica o PRODUTO — ignora sub-páginas
    genéricas (techspec/review/where-to-buy/...) que toda ficha tem, pra
    ``source_name`` contar por PRODUTO real, não por tipo de sub-página
    (ver correção 2026-08-06 na docstring do módulo)."""
    path = url.split("?", 1)[0].rstrip("/")
    segments = [s for s in path.split("/") if s]
    while segments and segments[-1].lower() in _GENERIC_PAGE_SUFFIXES:
        segments.pop()
    return segments[-1] if segments else "root"


def _domains_for_chip(chip_brand: str) -> dict[str, str]:
    chip = chip_brand.strip().lower()
    exclusive_to_others = {
        d for brand, domains in _BRAND_ONLY_DOMAINS.items() if brand != chip
        for d in domains
    }
    return {b: d for b, d in AIB_DOMAINS.items() if b not in exclusive_to_others}

#: teto de páginas candidatas TENTADAS por montadora — não é "todas as SKUs
#: da marca", é uma amostra suficiente pra achar o maior comprimento comum.
#: 5, não 3 (subido 2026-08-06): medido ao vivo que a ASUS sozinha vende 7
#: SKUs reais e distintos da mesma RTX 5070 (T1/Dual/TUF×2/Prime×3) — com
#: teto 3 e o dedupe por produto (ver ``_candidate_urls``), 3 tentativas já
#: bastam pra achar 2 confirmações a maior parte do tempo, mas 5 dá folga
#: pra quando ``text_confirms``/LLM falha numa das amostras.
MAX_CANDIDATES_PER_BRAND = 5

#: pausa entre requisições HTTP de saída — mesmo espírito educado do resolver
REQUEST_DELAY_S = 1.5


class AibDimensionAdapter:
    """Busca ``length_mm`` de GPU em várias montadoras reais — devolve UMA
    observação por (montadora, SKU encontrado), nunca escolhe uma só."""

    def __init__(self, http_get: Callable[[str], Optional[str]],
                llm: Optional[LLMSpecAdapter] = None,
                request_delay: float = REQUEST_DELAY_S):
        self._get = http_get
        self._resolver = SitemapUrlResolver(http_get)
        self._llm = llm or LLMSpecAdapter()
        self._request_delay = request_delay

    def fetch(self, product: dict) -> list[RawSpecObservation]:
        if str(product.get("category") or "") != "gpu":
            return []
        if not self._llm.available():
            return []

        name = str(product.get("name") or "")
        sku = str(product.get("sku") or "")
        tokens = tokenize(name)
        required = [t for t in tokens if _is_model_code(t)]
        if not required:
            return []

        observations: list[RawSpecObservation] = []
        domains = _domains_for_chip(str(product.get("brand") or ""))
        for brand, domain in domains.items():
            for url in self._candidate_urls(domain, required):
                obs = self._try_extract(sku, name, brand, url)
                if obs is not None:
                    observations.append(obs)
        return observations

    def _candidate_urls(self, domain: str, required: list[str]) -> list[str]:
        all_urls = self._resolver._collect_candidate_urls(domain)
        matching = [
            u for u in all_urls
            if _slug_has_all_codes(set(re.findall(r"[a-z0-9]+", u.lower())), required)
        ]
        # colapsa duplicata de idioma E de sub-página do mesmo produto antes
        # de escolher quais tentar — regressão real (2026-08-06): cada SKU
        # da ASUS tem várias sub-páginas (raiz/techspec/review/where-to-buy),
        # e sem deduplicar por PRODUTO o teto era gasto todo em variações do
        # MESMO card, nunca sobrando espaço pra amostrar um segundo SKU real
        # (foi por isso que só "t1" saía confirmado, nunca "dual"/"tuf"/...).
        seen_normalized: set[str] = set()
        seen_products: set[str] = set()
        deduped: list[str] = []
        for u in matching:
            norm = _normalize_locale(u)
            if norm in seen_normalized:
                continue
            product = _product_slug(u)
            if product in seen_products:
                continue
            seen_normalized.add(norm)
            seen_products.add(product)
            deduped.append(u)
        return deduped[:MAX_CANDIDATES_PER_BRAND]

    def _try_extract(self, sku: str, name: str, brand: str, url: str) -> Optional[RawSpecObservation]:
        if self._request_delay:
            time.sleep(self._request_delay)
        html = self._get(url)
        if not html:
            return None
        text = strip_html(html)
        if not text_confirms(text, name):
            return None  # a URL bateu no slug, a página não fala do produto

        product_slug = _product_slug(url)
        obs = self._llm._extract_numeric(
            {"sku": sku, "name": name}, "length_mm", url, text,
            source_name=f"aib_market:{brand}:{product_slug}",
        )
        if obs is not None:
            log.info("aib_market:%s:%s -> %s: %smm", brand, product_slug, sku, obs.value)
        return obs
