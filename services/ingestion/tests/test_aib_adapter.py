"""Testes unitários do AibDimensionAdapter — sem rede real (http_get e LLM
são fakes injetados).
"""
from __future__ import annotations

from specs.aib_adapter import AIB_DOMAINS, MAX_CANDIDATES_PER_BRAND, AibDimensionAdapter
from specs.base import RawSpecObservation


class _FakeLLM:
    """Fake do LLMSpecAdapter — devolve um comprimento fixo por URL, sem
    chamar rede nenhuma."""

    def __init__(self, lengths_by_url: dict[str, float]):
        self._lengths = lengths_by_url

    def available(self) -> bool:
        return True

    def _extract_numeric(self, product, attribute, source_url, page_text, source_name=None):
        value = self._lengths.get(source_url)
        if value is None:
            return None
        return RawSpecObservation(
            product_sku=product["sku"], attribute=attribute, value=f"{value:g}",
            source_name=source_name or "llm_extraction", source_url=source_url,
            confidence=0.9, notes="fake",
        )


def _fake_http(pages: dict[str, str]):
    def get(url: str):
        return pages.get(url)
    return get


def _sitemap_xml(urls: list[str]) -> str:
    locs = "".join(f"<url><loc>{u}</loc></url>" for u in urls)
    return f"<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>{locs}</urlset>"


def test_fetch_returns_nothing_for_non_gpu_category():
    adapter = AibDimensionAdapter(_fake_http({}), llm=_FakeLLM({}), request_delay=0)
    obs = adapter.fetch({"sku": "case-x", "name": "Some Case", "category": "case", "brand": "X"})
    assert obs == []


def test_fetch_returns_nothing_when_llm_unavailable():
    class _Unavailable:
        def available(self):
            return False

    adapter = AibDimensionAdapter(_fake_http({}), llm=_Unavailable(), request_delay=0)
    obs = adapter.fetch({"sku": "gpu-x", "name": "GeForce RTX 5090", "category": "gpu", "brand": "NVIDIA"})
    assert obs == []


def test_fetch_collects_one_observation_per_brand():
    # RTX 5090 é chip NVIDIA -- Sapphire (só fabrica AMD/Radeon) nem entra
    # na busca, ver test_sapphire_excluded_for_nvidia_chips
    asus_url = "https://www.asus.com/rog-strix-rtx-5090/"
    asrock_url = "https://www.asrock.com/rtx-5090-phantom/"

    pages = {
        "https://www.asus.com/robots.txt": "Sitemap: https://www.asus.com/sitemap.xml\n",
        "https://www.asus.com/sitemap.xml": _sitemap_xml([asus_url]),
        asus_url: "<html><body>ASUS ROG Strix GeForce RTX 5090 — a maior placa da linha.</body></html>",

        "https://www.asrock.com/robots.txt": "Sitemap: https://www.asrock.com/sitemap.xml\n",
        "https://www.asrock.com/sitemap.xml": _sitemap_xml([asrock_url]),
        asrock_url: "<html><body>ASRock Phantom Gaming GeForce RTX 5090.</body></html>",
    }
    llm = _FakeLLM({asus_url: 357.0, asrock_url: 348.0})
    adapter = AibDimensionAdapter(_fake_http(pages), llm=llm, request_delay=0)

    obs = adapter.fetch({"sku": "gpu-rtx-5090", "name": "GeForce RTX 5090", "category": "gpu", "brand": "NVIDIA"})

    by_source = {o.source_name: float(o.value) for o in obs}
    assert by_source == {
        "aib_market:asus": 357.0,
        "aib_market:asrock": 348.0,
    }


def test_fetch_skips_candidate_page_that_does_not_confirm_product():
    url = "https://www.asus.com/rtx-5090-wrong-page/"
    pages = {
        "https://www.asus.com/robots.txt": "Sitemap: https://www.asus.com/sitemap.xml\n",
        "https://www.asus.com/sitemap.xml": _sitemap_xml([url]),
        "https://www.asrock.com/robots.txt": None,
        "https://www.asrock.com/sitemap.xml": None,
        "https://www.sapphiretech.com/robots.txt": None,
        "https://www.sapphiretech.com/sitemap.xml": None,
        # a URL bate no slug (tem "5090"), mas o corpo da página não fala do produto
        url: "<html><body>Página não encontrada.</body></html>",
    }
    llm = _FakeLLM({url: 357.0})
    adapter = AibDimensionAdapter(_fake_http(pages), llm=llm, request_delay=0)

    obs = adapter.fetch({"sku": "gpu-rtx-5090", "name": "GeForce RTX 5090", "category": "gpu", "brand": "NVIDIA"})
    assert obs == []


def test_candidate_urls_deduplicates_locale_variants_before_capping():
    # o mesmo produto ASUS aparece 2x no sitemap (en-us / en-gb) + um SKU
    # diferente (TUF) — a deduplicação por idioma tem de colapsar as duas
    # cópias do rog-strix num grupo só, sem esconder o TUF (SKU real distinto)
    rog_us = "https://www.asus.com/en-us/rog-strix-rtx-5090/"
    rog_gb = "https://www.asus.com/en-gb/rog-strix-rtx-5090/"
    tuf_us = "https://www.asus.com/en-us/tuf-gaming-rtx-5090/"
    pages = {
        "https://www.asus.com/robots.txt": "Sitemap: https://www.asus.com/sitemap.xml\n",
        "https://www.asus.com/sitemap.xml": _sitemap_xml([rog_us, rog_gb, tuf_us]),
    }
    adapter = AibDimensionAdapter(_fake_http(pages), llm=_FakeLLM({}), request_delay=0)
    result = adapter._candidate_urls("www.asus.com", ["5090"])
    assert len(result) == 2   # rog-strix (1x, não 2x) + tuf-gaming


def test_max_candidates_per_brand_is_small_not_exhaustive():
    # documenta a intenção: amostra, não catálogo inteiro da marca
    assert 1 <= MAX_CANDIDATES_PER_BRAND <= 5


def test_aib_domains_cover_both_nvidia_and_amd():
    # asus/asrock vendem placas dos dois chips; sapphire é parceira AMD
    assert "asus" in AIB_DOMAINS and "asrock" in AIB_DOMAINS and "sapphire" in AIB_DOMAINS


def test_sapphire_excluded_for_nvidia_chips():
    # regressão real (2026-08-06): Sapphire só fabrica placas AMD/Radeon —
    # consultá-la pra uma RTX é gasto garantido de 0 resultado
    from specs.aib_adapter import _domains_for_chip
    domains = _domains_for_chip("NVIDIA")
    assert "sapphire" not in domains
    assert "asus" in domains and "asrock" in domains


def test_sapphire_included_for_amd_chips():
    from specs.aib_adapter import _domains_for_chip
    domains = _domains_for_chip("AMD")
    assert "sapphire" in domains
    assert "asus" in domains and "asrock" in domains
