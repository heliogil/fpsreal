"""Testes unitários do motor de reconciliação — sem DB, sem HTTP.

Isto é a peça crítica do sistema de specs multi-fonte: errar aqui recomenda
uma build que não liga (socket errado) ou que builda com RAM incompatível.
Cada regra do docstring de ``specs.reconcile`` tem um teste correspondente.
"""
from __future__ import annotations

from specs.base import RawSpecObservation
from specs.reconcile import reconcile


def _obs(attribute="socket", value="AM5", source="ref", confidence=1.0, sku="cpu-x"):
    return RawSpecObservation(
        product_sku=sku, attribute=attribute, value=value,
        source_name=source, confidence=confidence,
    )


def test_no_observations_is_insufficient():
    result = reconcile([])
    assert result.status == "insufficient"
    assert result.value is None


def test_critical_attribute_single_authoritative_source_confirms():
    result = reconcile([_obs(confidence=1.0)])
    assert result.status == "confirmed"
    assert result.value == "AM5"


def test_critical_attribute_single_low_confidence_source_is_insufficient():
    result = reconcile([_obs(confidence=0.9, source="llm_extraction")])
    assert result.status == "insufficient"
    assert result.value is None


def test_critical_attribute_two_independent_low_confidence_sources_confirm():
    result = reconcile([
        _obs(confidence=0.9, source="reference_disambiguated"),
        _obs(confidence=0.7, source="llm_extraction"),
    ])
    assert result.status == "confirmed"
    assert result.value == "AM5"


def test_critical_attribute_same_source_repeated_does_not_count_as_two():
    # mesma fonte relatando duas vezes não é "duas fontes independentes"
    result = reconcile([
        _obs(confidence=0.8, source="llm_extraction"),
        _obs(confidence=0.8, source="llm_extraction"),
    ])
    assert result.status == "insufficient"


def test_diverging_values_never_resolve_by_majority():
    result = reconcile([
        _obs(value="DDR4", confidence=1.0, source="a", attribute="ram_type"),
        _obs(value="DDR4", confidence=0.9, source="b", attribute="ram_type"),
        _obs(value="DDR5", confidence=1.0, source="c", attribute="ram_type"),
    ])
    assert result.status == "conflict"
    assert result.value is None
    assert len(result.candidates) == 3


def test_all_zero_confidence_sentinel_is_conflict_not_silent_skip():
    result = reconcile([_obs(value="AMBIGUOUS", confidence=0.0)])
    assert result.status == "conflict"
    assert result.value is None


def test_non_critical_attribute_lower_bar_confirms_single_source():
    result = reconcile([_obs(attribute="form_factor", value="ATX", confidence=0.6)])
    assert result.status == "confirmed"
    assert result.value == "ATX"


def test_non_critical_attribute_too_low_confidence_is_insufficient():
    result = reconcile([_obs(attribute="form_factor", value="ATX", confidence=0.3)])
    assert result.status == "insufficient"
