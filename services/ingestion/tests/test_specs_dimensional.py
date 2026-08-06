"""Testes unitários da reconciliação DIMENSIONAL (GPU/gabinete/cooler) e do
CatalogSeedAdapter — sem DB, sem HTTP.

Cobre o que é diferente do caso categórico (CPU/placa): tolerância em mm em
vez de igualdade exata, e a direção conservadora (gabinete = pega o "cabe
até" menor; peça = assume o tamanho maior) — errar essa direção é o tipo de
bug que faz o comparador recomendar uma GPU que não cabe.
"""
from __future__ import annotations

from specs.base import RawSpecObservation
from specs.catalog_seed_adapter import CatalogSeedAdapter
from specs.reconcile import reconcile


def _obs(attribute, value, source="catalog_seed", confidence=0.6, sku="gpu-x"):
    return RawSpecObservation(
        product_sku=sku, attribute=attribute, value=str(value),
        source_name=source, confidence=confidence,
    )


# ── CatalogSeedAdapter ──────────────────────────────────────────────────────

def test_catalog_seed_adapter_reads_gpu_length():
    adapter = CatalogSeedAdapter()
    product = {"sku": "gpu-rtx-5090", "name": "GeForce RTX 5090", "category": "gpu",
               "specs": {"length_mm": 304, "tdp_w": 575}}
    obs = adapter.fetch(product)
    assert len(obs) == 1
    assert obs[0].attribute == "length_mm"
    assert obs[0].value == "304"
    assert obs[0].source_name == "catalog_seed"
    assert obs[0].confidence < 0.95   # nunca autoritativo sozinho


def test_catalog_seed_adapter_reads_case_capacity_both_attributes():
    adapter = CatalogSeedAdapter()
    product = {"sku": "case-lancool-216", "name": "Lian Li Lancool 216", "category": "case",
               "specs": {"max_gpu_length_mm": 392, "max_cooler_height_mm": 180}}
    obs = adapter.fetch(product)
    by_attr = {o.attribute: o.value for o in obs}
    assert by_attr == {"max_gpu_length_mm": "392", "max_cooler_height_mm": "180"}


def test_catalog_seed_adapter_skips_missing_value():
    adapter = CatalogSeedAdapter()
    product = {"sku": "case-x", "name": "Case X", "category": "case", "specs": {}}
    assert adapter.fetch(product) == []


def test_catalog_seed_adapter_irrelevant_category_returns_nothing():
    adapter = CatalogSeedAdapter()
    product = {"sku": "cpu-x", "name": "CPU X", "category": "cpu", "specs": {"socket": "AM5"}}
    assert adapter.fetch(product) == []


# ── reconcile() dimensional — estado real de hoje: 1 fonte só, insuficiente ──

def test_dimensional_single_catalog_seed_source_is_insufficient():
    # é o estado HONESTO de hoje: só existe o catálogo semeado, sem 2ª fonte
    result = reconcile([_obs("length_mm", 304)])
    assert result.status == "insufficient"
    assert result.value is None


# ── tolerância ────────────────────────────────────────────────────────────

def test_dimensional_two_sources_within_tolerance_confirm():
    result = reconcile([
        _obs("length_mm", 304, source="catalog_seed", confidence=0.6),
        _obs("length_mm", 301, source="llm_extraction", confidence=0.7),
    ])
    assert result.status == "confirmed"
    # "size": conservador = MAIOR das duas leituras que concordam
    assert float(result.value) == 304.0


def test_dimensional_two_sources_beyond_tolerance_conflict():
    result = reconcile([
        _obs("length_mm", 304, source="catalog_seed", confidence=0.6),
        _obs("length_mm", 260, source="llm_extraction", confidence=0.7),
    ])
    assert result.status == "conflict"
    assert result.value is None


# ── direção conservadora ──────────────────────────────────────────────────

def test_case_capacity_conservative_direction_is_minimum():
    # gabinete: duas fontes concordam (dentro da tolerância) em 392 e 388mm de
    # comprimento MÁXIMO suportado — o conservador é o MENOR (pior caso: cabe
    # menos do que qualquer leitura individual disse)
    result = reconcile([
        _obs("max_gpu_length_mm", 392, source="catalog_seed", confidence=0.6, sku="case-x"),
        _obs("max_gpu_length_mm", 388, source="llm_extraction", confidence=0.7, sku="case-x"),
    ])
    assert result.status == "confirmed"
    assert float(result.value) == 388.0


def test_gpu_size_conservative_direction_is_maximum():
    # peça: duas fontes concordam em 300 e 304mm de comprimento da PLACA — o
    # conservador é o MAIOR (pior caso: a placa é maior do que a leitura menor)
    result = reconcile([
        _obs("length_mm", 300, source="catalog_seed", confidence=0.6, sku="gpu-x"),
        _obs("length_mm", 304, source="llm_extraction", confidence=0.7, sku="gpu-x"),
    ])
    assert result.status == "confirmed"
    assert float(result.value) == 304.0


def test_dimensional_unparseable_value_is_excluded_not_crashing():
    result = reconcile([_obs("length_mm", "unknown", confidence=0.9)])
    assert result.status == "conflict"
    assert result.value is None
