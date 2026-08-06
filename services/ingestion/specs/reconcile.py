"""Reconciliação multi-fonte — decide o que vira ``products.specs`` e o que
vira fila de conflito. Esta é a peça que a redundância existe para proteger.

TRÊS TIPOS DE ATRIBUTO, TRÊS REGRAS DE ACORDO:

  - CATEGÓRICO (socket, ram_type) — fontes têm de bater o valor EXATO.
  - DIMENSIONAL (max_gpu_length_mm, height_mm, ...) — é medida física de UMA
    peça específica, não identidade; fontes que caem dentro de
    ``DIMENSIONAL_TOLERANCE_MM`` uma da outra CONCORDAM, e o valor promovido
    é o mais CONSERVADOR (nunca o que faria uma peça parecer caber quando
    pode não caber — ver ``CONSERVATIVE_DIRECTION``).
  - FAIXA DE MERCADO (``length_mm`` de GPU) — achado do founder (2026-08-06):
    o comprimento de uma GPU é definido pela MONTADORA (ASUS/ASRock/
    Sapphire/...), não pelo chip (NVIDIA/AMD) — a mesma RTX 5070 sai em
    cards de ~200mm a ~330mm dependendo do modelo. Aqui DIVERGÊNCIA entre
    fontes é o ESPERADO (fontes reais e independentes, cada uma um card
    diferente de verdade) — não é erro pra rejeitar, é o mercado. Promove o
    MAIOR valor visto, mas só com >= 2 montadoras reais e DIFERENTES (nunca
    confia numa fabricante sozinha, mesmo com confiança alta) — ver
    ``specs/aib_adapter.py``.

REGRA DE CONFIANÇA (igual para os dois tipos, em atributos CRÍTICOS — os que
decidem se uma build liga):
  - uma fonte só ISOLADA promove se tiver confiança >= ``AUTHORITATIVE`` (ex.:
    tabela oficial de chipset — não existe equivalente pra dimensão física,
    por isso nenhuma fonte de dimensão bate essa barra sozinha hoje);
  - abaixo disso, precisa de DUAS fontes independentes concordando (exato ou
    dentro da tolerância, conforme o tipo);
  - fontes concordam mas nenhuma bate a barra -> ``insufficient`` (fica sem
    valor, nunca builda com incerteza silenciosa — é o estado honesto de hoje
    pra GPU/gabinete: só existe UMA fonte real, o catálogo semeado);
  - fontes DIVERGEM (fora da tolerância, no caso dimensional) -> ``conflict``
    (nunca resolve por maioria/voto; fica para revisão humana).

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
CRITICAL_ATTRIBUTES = {
    "socket", "ram_type",
    "length_mm", "height_mm", "max_gpu_length_mm", "max_cooler_height_mm",
}

#: tolerância (mm) para duas leituras de dimensão "concordarem" — fabricante
#: arredonda, loja copia errado por 1-2mm, isso é normal e não é divergência.
#: NÃO inclui length_mm de GPU — esse vai por MARKET_RANGE_ATTRIBUTES abaixo,
#: porque ali divergência é o mercado, não erro de leitura.
DIMENSIONAL_TOLERANCE_MM: dict[str, float] = {
    "height_mm": 5.0,
    "max_gpu_length_mm": 5.0,
    "max_cooler_height_mm": 5.0,
}

#: quando fontes concordam (dentro da tolerância), qual extremo promover.
#: "size" = tamanho da PEÇA -> assume o MAIOR (pior caso: a peça é maior do
#: que qualquer leitura individual disse, nunca menor).
#: "capacity" = capacidade do GABINETE -> assume o MENOR (pior caso: o
#: gabinete cabe MENOS do que qualquer leitura individual disse).
_CONSERVATIVE_KIND: dict[str, str] = {
    "height_mm": "size",
    "max_gpu_length_mm": "capacity",
    "max_cooler_height_mm": "capacity",
}

#: atributos onde a fonte de verdade é o MERCADO (várias peças reais
#: diferentes), não um fato único — ver docstring do módulo. Promove o
#: MAIOR valor visto, exige montadoras DIFERENTES (nunca um número mínimo
#: de observações da MESMA fonte).
MARKET_RANGE_ATTRIBUTES = {"length_mm"}
MIN_INDEPENDENT_MARKET_SOURCES = 2


def _conservative_value(attribute: str, values: list[float]) -> float:
    kind = _CONSERVATIVE_KIND.get(attribute)
    if kind == "capacity":
        return min(values)
    return max(values)   # "size" e qualquer numérico sem regra definida: pior caso = maior


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


def _to_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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

    is_critical = attribute in CRITICAL_ATTRIBUTES
    floor = AUTHORITATIVE_CONFIDENCE if is_critical else NON_CRITICAL_CONFIDENCE

    if attribute in MARKET_RANGE_ATTRIBUTES:
        return _reconcile_market_range(sku, attribute, usable, candidates)

    tolerance = DIMENSIONAL_TOLERANCE_MM.get(attribute)
    if tolerance is not None:
        return _reconcile_dimensional(sku, attribute, usable, candidates, is_critical, floor, tolerance)
    return _reconcile_categorical(sku, attribute, usable, candidates, is_critical, floor)


def _reconcile_categorical(sku, attribute, usable, candidates, is_critical, floor) -> ReconcileResult:
    distinct_values = {o.value for o in usable}
    if len(distinct_values) > 1:
        return ReconcileResult(
            sku, attribute, "conflict", None, 0.0, candidates,
            f"fontes divergem: {sorted(distinct_values)!r} — nunca resolvido por maioria",
        )

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


def _reconcile_dimensional(sku, attribute, usable, candidates, is_critical, floor, tolerance) -> ReconcileResult:
    numeric = [(o, _to_float(o.value)) for o in usable]
    numeric = [(o, v) for o, v in numeric if v is not None]
    if not numeric:
        return ReconcileResult(sku, attribute, "conflict", None, 0.0, candidates,
                               "nenhuma observação numérica válida (valor não parseável)")

    values = [v for _, v in numeric]
    if max(values) - min(values) > tolerance:
        return ReconcileResult(
            sku, attribute, "conflict", None, 0.0, candidates,
            f"fontes divergem além da tolerância de {tolerance}mm: "
            f"{sorted(set(values))!r} — nunca resolvido por maioria",
        )

    # dentro da tolerância: todas "concordam" — promove o extremo conservador,
    # nunca uma média que possa mascarar um valor real maior/menor
    resolved = _conservative_value(attribute, values)
    best_confidence = max(o.confidence for o, _ in numeric)
    independent_sources = {o.source_name for o, _ in numeric}

    if best_confidence >= floor or (is_critical and len(independent_sources) >= 2):
        return ReconcileResult(
            sku, attribute, "confirmed", f"{resolved:g}", best_confidence, candidates,
            ("fonte autoritativa" if best_confidence >= floor
             else f"{len(independent_sources)} fontes independentes concordam (±{tolerance}mm)")
            + " — valor conservador",
        )

    return ReconcileResult(
        sku, attribute, "insufficient", None, best_confidence, candidates,
        f"confiança {best_confidence:.2f} abaixo da barra {floor:.2f} para atributo crítico, "
        f"e só {len(independent_sources)} fonte(s) — precisa de segunda fonte independente",
    )


def _reconcile_market_range(sku, attribute, usable, candidates) -> ReconcileResult:
    """Promove o MAIOR valor visto entre montadoras REAIS e DIFERENTES —
    nunca a média (mascararia o pior caso) e nunca por confiança alta de
    uma fonte só (uma montadora sozinha não fala pelo mercado inteiro,
    mesmo que tenha certeza absoluta do próprio produto)."""
    numeric = [(o, _to_float(o.value)) for o in usable]
    numeric = [(o, v) for o, v in numeric if v is not None]
    if not numeric:
        return ReconcileResult(sku, attribute, "conflict", None, 0.0, candidates,
                               "nenhuma observação numérica válida (valor não parseável)")

    independent_sources = {o.source_name for o, _ in numeric}
    if len(independent_sources) < MIN_INDEPENDENT_MARKET_SOURCES:
        return ReconcileResult(
            sku, attribute, "insufficient", None, 0.0, candidates,
            f"só {len(independent_sources)} montadora(s) real(is) — precisa de pelo menos "
            f"{MIN_INDEPENDENT_MARKET_SOURCES} fontes independentes de mercado, nunca confia "
            f"numa fabricante sozinha",
        )

    max_value = max(v for _, v in numeric)
    best_confidence = max(o.confidence for o, _ in numeric)
    return ReconcileResult(
        sku, attribute, "confirmed", f"{max_value:g}", best_confidence, candidates,
        f"maior valor entre {len(independent_sources)} montadoras reais "
        f"({', '.join(sorted(s.split(':')[-1] for s in independent_sources))}) — "
        f"varia por fabricante, valor conservador (pior caso de tamanho)",
    )
