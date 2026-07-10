"""Price adapters — the seam for wiring official affiliate sources.

Today: SampleAdapter (labelled placeholder prices under the 'amostra' merchant).
Next: KabumAdapter, MercadoLivreAdapter (official feeds) — implement fetch(),
register in the ingestion loader, done.
"""
from .base import PriceAdapter, RawOffer
from .sample import SampleAdapter
from .kabum import KabumAdapter
from .mercadolivre import MercadoLivreAdapter

__all__ = [
    "PriceAdapter", "RawOffer",
    "SampleAdapter", "KabumAdapter", "MercadoLivreAdapter",
]
