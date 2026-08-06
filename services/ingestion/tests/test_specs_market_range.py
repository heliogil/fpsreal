"""Testes unitários da reconciliação "faixa de mercado" (gpu.length_mm) —
sem DB, sem HTTP.

Achado do founder (2026-08-06): o comprimento de uma GPU é definido pela
MONTADORA (ASUS/ASRock/Sapphire...), não pelo chip (NVIDIA/AMD) — a mesma
RTX 5070 sai em cards de ~200mm a ~330mm dependendo do modelo. Aqui
DIVERGÊNCIA entre fontes reais é o esperado, não erro — o oposto do modo
dimensional (test_specs_dimensional.py), onde divergência é conflito.
"""
from __future__ import annotations

from specs.base import RawSpecObservation
from specs.reconcile import reconcile


def _obs(value, source, confidence=0.9, sku="gpu-x"):
    return RawSpecObservation(
        product_sku=sku, attribute="length_mm", value=str(value),
        source_name=source, confidence=confidence,
    )


def test_single_source_is_insufficient_even_with_high_confidence():
    # uma montadora sozinha não fala pelo mercado inteiro, mesmo com certeza
    result = reconcile([_obs(304, "aib_market:asus", confidence=0.99)])
    assert result.status == "insufficient"
    assert result.value is None


def test_same_manufacturer_reported_twice_does_not_count_as_two():
    result = reconcile([
        _obs(304, "aib_market:asus", confidence=0.9),
        _obs(304, "aib_market:asus", confidence=0.9),
    ])
    assert result.status == "insufficient"


def test_two_different_manufacturers_confirm_with_the_larger_value():
    # ASUS e ASRock DIVERGEM de verdade (cards diferentes) — isso é normal
    # aqui, não conflito. Promove o maior (pior caso pra encaixe no gabinete).
    result = reconcile([
        _obs(240, "aib_market:asus", confidence=0.9),
        _obs(320, "aib_market:asrock", confidence=0.9),
    ])
    assert result.status == "confirmed"
    assert float(result.value) == 320.0


def test_wide_divergence_between_three_manufacturers_still_confirms_the_max():
    # ao contrário do modo dimensional, NENHUMA tolerância barra isto — é o
    # mercado, não erro de leitura
    result = reconcile([
        _obs(200, "aib_market:asus", confidence=0.9),
        _obs(330, "aib_market:asrock", confidence=0.9),
        _obs(260, "aib_market:sapphire", confidence=0.9),
    ])
    assert result.status == "confirmed"
    assert float(result.value) == 330.0


def test_unparseable_value_among_sources_is_excluded_not_crashing():
    result = reconcile([
        _obs("unknown", "aib_market:asus", confidence=0.9),
        _obs(300, "aib_market:asrock", confidence=0.9),
    ])
    # só 1 observação numérica válida sobra -> insuficiente, não crasha
    assert result.status == "insufficient"
    assert result.value is None


def test_all_unparseable_is_conflict():
    result = reconcile([
        _obs("unknown", "aib_market:asus", confidence=0.9),
        _obs("unknown", "aib_market:asrock", confidence=0.9),
    ])
    assert result.status == "conflict"
    assert result.value is None
