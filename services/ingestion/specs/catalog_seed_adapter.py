"""CatalogSeedAdapter — o valor JÁ semeado em ``products.specs`` vira UMA
observação, não uma verdade assumida.

Para GPU/gabinete não existe uma tabela oficial pequena e fechada (tipo
chipset→socket) — comprimento de placa e capacidade de gabinete são um fato
POR MODELO, entre milhares de SKUs. A única fonte que existe hoje é o número
que alguém digitou no ``seed/catalog_data.py`` na hora de montar o catálogo,
sem citação — então é isso que este adapter declara, honestamente, como uma
fonte de confiança MODERADA, nunca autoritativa sozinha.

CONSEQUÊNCIA HONESTA: hoje, sem uma segunda fonte real (scraper vivo,
extração por IA), toda dimensão de GPU/gabinete fica em ``insufficient`` no
``reconcile()`` — não porque o número esteja errado, mas porque nada o
confirma de forma independente ainda. É o estado real, não um defeito desta
peça: ela é o que torna esse estado visível em vez de escondido atrás de uma
falsa confiança de "está no catálogo, deve estar certo".
"""
from __future__ import annotations

from .base import RawSpecObservation

#: confiança deliberadamente ABAIXO da barra autoritativa (0.95) — é só uma
#: leitura, não uma fonte publicada e citável
SEED_CONFIDENCE = 0.6

#: atributo numérico esperado por categoria — o que este adapter tenta ler
ATTRIBUTES_BY_CATEGORY: dict[str, tuple[str, ...]] = {
    "gpu": ("length_mm",),
    "case": ("max_gpu_length_mm", "max_cooler_height_mm"),
    "cooler": ("height_mm",),
}


class CatalogSeedAdapter:
    """Declara o valor já presente em ``product['specs']`` como observação."""

    source_name = "catalog_seed"

    def fetch(self, product: dict) -> list[RawSpecObservation]:
        cat = str(product.get("category") or "")
        attributes = ATTRIBUTES_BY_CATEGORY.get(cat, ())
        if not attributes:
            return []
        specs = product.get("specs") or {}
        sku = str(product.get("sku") or "")
        out: list[RawSpecObservation] = []
        for attribute in attributes:
            value = specs.get(attribute)
            if value is None:
                continue
            out.append(RawSpecObservation(
                product_sku=sku, attribute=attribute, value=str(value),
                source_name=self.source_name, confidence=SEED_CONFIDENCE,
                notes="valor já semeado no catálogo, sem fonte citável — "
                     "leitura única, não verificada de forma independente",
            ))
        return out
