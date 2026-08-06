"""Contrato multi-fonte de especificação — o seam para redundância de dados.

Mesma forma do ``PriceAdapter``/``VisionAdapter``: qualquer fonte de specs
(tabela curada de chipset, extração por IA, scraper futuro) implementa
``fetch()`` e devolve ``RawSpecObservation`` — nunca escreve direto em
``products.specs``. Quem decide se um valor está confirmado é o
``reconcile()``, não a fonte.

INTEGRIDADE: uma fonte nunca promove sozinha um atributo que decide
compatibilidade (socket, tipo de RAM) — isso exige acordo entre fontes ou
confiança máxima de uma fonte autoritativa. Ver ``specs.reconcile``.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class RawSpecObservation:
    """Uma alegação de UMA fonte sobre UM atributo de UM produto.

    Nunca é escrita direto em ``products.specs`` — vira uma linha em
    ``spec_observations`` (append-only, nunca sobrescreve outra fonte) e só
    chega ao catálogo via ``reconcile()``.
    """
    product_sku: str
    attribute: str          # ex.: "socket", "ram_type"
    value: str               # sempre string; o consumidor converte se precisar
    source_name: str         # ex.: "amd_intel_chipset_reference", "llm_extraction"
    source_url: Optional[str] = None
    source_date: Optional[date] = None
    confidence: float = 1.0
    notes: str = ""


@runtime_checkable
class SpecAdapter(Protocol):
    """Uma fonte de especificação. Implementar isto para ligar uma fonte nova."""

    #: nome escrito em ``spec_observations.source_name``
    source_name: str

    def fetch(self, product: dict) -> list[RawSpecObservation]:
        """Devolve as observações que esta fonte consegue para ``product``
        (linha do catálogo com ``sku``, ``category``, ``name``, ``specs``).

        Lista vazia = fonte não sabe nada sobre este produto (não é erro).
        Nunca inventa valor sem saber — melhor devolver vazio.
        """
        ...
