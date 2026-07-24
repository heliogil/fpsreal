"""Contrato do ingestor de modelos visuais — o seam para ligar visão por IA.

Mesma forma do ``PriceAdapter``: hoje corre um adapter DETERMINÍSTICO que deriva
a aparência da ficha técnica (sem IA, sem foto, sem custo, sem risco legal);
amanhã liga-se o adapter de visão que lê a foto do feed afiliado. Trocar um pelo
outro é "registar o adapter", nada mais.

INTEGRIDADE: ``RawVisual.source`` tem de nomear a origem honestamente
(``ficha`` = derivado dos specs; ``visao`` = derivado de foto+ficha). O viewer
mostra "aparência aproximada" — nunca se afirma que é a foto do produto.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class RawVisual:
    """Aparência proposta para um produto, antes de virar ``product_visuals``."""
    product_sku: str
    category: str
    descriptor: dict
    source: str                 # 'ficha' | 'visao'
    photo_hash: str | None = None   # dispara re-ingestão quando o feed troca a imagem
    notes: str = ""
    extra: dict = field(default_factory=dict)


@runtime_checkable
class VisionAdapter(Protocol):
    """Uma fonte de aparência. Implementar isto para ligar visão por IA."""

    #: origem escrita em ``product_visuals.source``
    source: str

    def describe(self, product: dict) -> RawVisual | None:
        """Devolve a aparência proposta para ``product`` (linha do catálogo com
        ``sku``, ``category``, ``name``, ``specs``), ou ``None`` se não souber.

        Nunca deve devolver dimensão — só aparência. A validação cruzada em
        ``visuals.schema.validate`` rejeita o que contradiga a ficha.
        """
        ...
