"""Reconciliação multi-fonte — decide o que vira ``products.specs`` e o que
vira fila de conflito. Esta é a peça que a redundância existe para proteger.

REGRA (para atributos CRÍTICOS — os que decidem se uma build liga):
  - uma fonte só ISOLADA promove se tiver confiança >= ``AUTHORITATIVE`` (uma
    fonte autoritativa e inequívoca, ex.: soquete de CPU);
  - abaixo disso, precisa de DUAS fontes independentes concordando;
  - fontes concordam mas nenhuma bate a barra -> ``insufficient`` (fica sem
    valor, nunca builda com incerteza silenciosa);
  - fontes DIVERGEM em valor -> ``conflict`` (nunca resolve por maioria/voto;
    fica para revisão humana).

Atributos fora de ``CRITICAL_ATTRIBUTES`` usam a barra mais baixa de sempre
(uma fonte de confiança razoável basta) — a redundância pesada é só onde
errar quebra o produto.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .base import RawSpecObservation

Status = Literal["confirmed", "conflict", "insufficient"]

#: atributos onde um valor errado recomenda uma build fisicamente incompatível
CRITICAL_ATTRIBUTES = {"socket", "ram_type"}

#: confiança mínima para UMA fonte isolada promover um atributo crítico
AUTHORITATIVE_CONFIDENCE = 0.95

#: confiança mínima para UMA fonte isolada promover um atributo não crítico
NON_CRITICAL_CONFIDENCE = 0.5

#: valores-sentinela nunca promovem, mesmo com confiança > 0 por engano
_SENTINEL_VALUES = {"AMBIGUOUS"}


@dataclass(frozen=True)
class ReconcileResult:
    product_sku: str
    attribute: str
    status: Status
    value: str | None
    confidence: float
    candidates: list[dict] = field(default_factory=list)
    reason: str = ""


def _candidate(o: RawSpecObservation) -> dict:
    return {
        "value": o.value,
        "source_name": o.source_name,
        "source_url": o.source_url,
        "confidence": o.confidence,
        "notes": o.notes,
    }


def reconcile(observations: list[RawSpecObservation]) -> ReconcileResult:
    """``observations`` deve conter só um (product_sku, attribute) — o
    chamador agrupa antes de invocar isto (ver ``seed/ingest_specs.py``)."""
    if not observations:
        return ReconcileResult("", "", "insufficient", None, 0.0, [], "sem observações")

    sku, attribute = observations[0].product_sku, observations[0].attribute
    candidates = [_candidate(o) for o in observations]

    usable = [o for o in observations
              if o.confidence > 0 and o.value not in _SENTINEL_VALUES]

    if not usable:
        return ReconcileResult(
            sku, attribute, "conflict", None, 0.0, candidates,
            "todas as observações são de confiança zero / valor-sentinela "
            "(ambiguidade documentada pela fonte, não erro de leitura)",
        )

    distinct_values = {o.value for o in usable}
    is_critical = attribute in CRITICAL_ATTRIBUTES
    floor = AUTHORITATIVE_CONFIDENCE if is_critical else NON_CRITICAL_CONFIDENCE

    if len(distinct_values) > 1:
        return ReconcileResult(
            sku, attribute, "conflict", None, 0.0, candidates,
            f"fontes divergem: {sorted(distinct_values)!r} — nunca resolvido por maioria",
        )

    # todas as fontes usáveis concordam no mesmo valor
    value = next(iter(distinct_values))
    best_confidence = max(o.confidence for o in usable)
    independent_sources = {o.source_name for o in usable}

    if best_confidence >= floor or (is_critical and len(independent_sources) >= 2):
        return ReconcileResult(sku, attribute, "confirmed", value, best_confidence, candidates,
                               "fonte autoritativa" if best_confidence >= floor
                               else f"{len(independent_sources)} fontes independentes concordam")

    return ReconcileResult(
        sku, attribute, "insufficient", None, best_confidence, candidates,
        f"confiança {best_confidence:.2f} abaixo da barra {floor:.2f} para atributo "
        f"{'crítico' if is_critical else 'não-crítico'}, e só {len(independent_sources)} fonte(s)",
    )
