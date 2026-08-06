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
``MIN_INDEPENDENT_MARKET_SOURCES`` montadoras DIFERENTES concordando em
existir (não em bater o número — divergir é esperado).

Fontes reais testadas alcançáveis da VPS (2026-08-06, mesma disciplina do
``url_resolver``: nunca contorna bloqueio) — ver ``AIB_DOMAINS``. Zotac,
GALAX e MSI/Gigabyte bloqueiam (403); PowerColor/Colorful inalcançáveis;
ficam de fora até algo mudar, nunca substituídos por adivinhação.
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


def _domains_for_chip(chip_brand: str) -> dict[str, str]:
    chip = chip_brand.strip().lower()
    exclusive_to_others = {
        d for brand, domains in _BRAND_ONLY_DOMAINS.items() if brand != chip
        for d in domains
    }
    return {b: d for b, d in AIB_DOMAINS.items() if b not in exclusive_to_others}

#: teto de páginas candidatas TENTADAS por montadora — não é "todas as SKUs
#: da marca", é uma amostra suficiente pra achar o maior comprimento comum
MAX_CANDIDATES_PER_BRAND = 3

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
            if all(t in set(re.findall(r"[a-z0-9]+", u.lower())) for t in required)
        ]
        # colapsa duplicata de idioma antes de escolher quais tentar — sem
        # isso, as N primeiras seriam N cópias da mesma página em idiomas
        # diferentes, desperdiçando o teto em vez de amostrar SKUs de verdade
        seen_normalized: set[str] = set()
        deduped: list[str] = []
        for u in matching:
            norm = _normalize_locale(u)
            if norm in seen_normalized:
                continue
            seen_normalized.add(norm)
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

        obs = self._llm._extract_numeric(
            {"sku": sku, "name": name}, "length_mm", url, text,
            source_name=f"aib_market:{brand}",
        )
        if obs is not None:
            log.info("aib_market:%s -> %s: %smm", brand, sku, obs.value)
        return obs
