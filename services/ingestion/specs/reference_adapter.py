"""ReferenceAdapter — socket/RAM derivados da tabela curada AMD/Intel.

É o piso: determinístico, sem custo, sem IA. Para CPU, o soquete é
inequívoco (uma tabela chega). Para placa-mãe, o CHIPSET às vezes não
decide sozinho o tipo de RAM (LGA1700 Intel) — nesse caso tenta desambiguar
pelo NOME do produto (fabricantes marcam "DDR4"/"DDR5" no nome exatamente
por causa dessa ambiguidade) e, se não conseguir, devolve uma observação de
confiança ZERO documentando o motivo — nunca escolhe um valor no palpite.
``reconcile()`` decide o que fazer com confiança zero (nunca promove).
"""
from __future__ import annotations

import re

from .base import RawSpecObservation
from .reference_data import (
    CHIPSET_SPECS,
    CPU_SOCKET,
    REFERENCE_DATE,
    REFERENCE_SOURCE_NAME,
    REFERENCE_SOURCE_NOTE,
)

#: só fronteira INICIAL — nomes reais colam sufixo (form factor/revisão)
#: direto no código, ex. "B760M", "B650M-K", "X670E-A". A ordem importa: a
#: variante mais longa tem de vir antes da mais curta (ex. b650e antes de
#: b650), senão "B650E" casaria só com "b650" e perderia o "e".
_CHIPSET_RE = re.compile(
    r"\b(x870e|x870|x670e|x670|b850|b650e|b650|a620|"
    r"x570|x470|b550|b450|a520|"
    r"z890|b860|h810|"
    r"z790|z690|h770|b760|h670|b660|h610|"
    r"z590|z490|h570|b560|h470|b460)",
    re.IGNORECASE,
)
_DDR5_RE = re.compile(r"\bddr\s*5\b", re.IGNORECASE)
_DDR4_RE = re.compile(r"\bddr\s*4\b", re.IGNORECASE)


def _match_cpu_socket(name: str) -> str | None:
    n = name.lower()
    # match mais longo primeiro evita "i5-13400" casar antes de "i5-13400f"
    for key in sorted(CPU_SOCKET, key=len, reverse=True):
        if key in n:
            return key
    return None


def _extract_chipset(name: str) -> str | None:
    m = _CHIPSET_RE.search(name)
    return m.group(1).lower() if m else None


def _disambiguate_ddr_from_name(name: str) -> str | None:
    has5, has4 = bool(_DDR5_RE.search(name)), bool(_DDR4_RE.search(name))
    if has5 and not has4:
        return "DDR5"
    if has4 and not has5:
        return "DDR4"
    return None  # nome não diz, ou diz os dois (suspeito) — não decide


class ReferenceAdapter:
    """Fonte autoritativa: soquete por CPU, soquete+RAM por chipset de placa."""

    source_name = REFERENCE_SOURCE_NAME

    def fetch(self, product: dict) -> list[RawSpecObservation]:
        cat = str(product.get("category") or "")
        name = str(product.get("name") or "")
        sku = str(product.get("sku") or "")
        if cat == "cpu":
            return self._cpu(sku, name)
        if cat == "motherboard":
            return self._motherboard(sku, name)
        return []

    def _obs(self, sku: str, attribute: str, value: str, confidence: float, notes: str) -> RawSpecObservation:
        return RawSpecObservation(
            product_sku=sku, attribute=attribute, value=value,
            source_name=self.source_name, source_url=None,
            source_date=REFERENCE_DATE, confidence=confidence,
            notes=notes,
        )

    def _cpu(self, sku: str, name: str) -> list[RawSpecObservation]:
        key = _match_cpu_socket(name)
        if key is None:
            return []
        socket = CPU_SOCKET[key]
        return [self._obs(sku, "socket", socket, 1.0, REFERENCE_SOURCE_NOTE)]

    def _motherboard(self, sku: str, name: str) -> list[RawSpecObservation]:
        chipset = _extract_chipset(name)
        if chipset is None or chipset not in CHIPSET_SPECS:
            return []
        info = CHIPSET_SPECS[chipset]
        out = [self._obs(sku, "socket", info["socket"], 1.0, REFERENCE_SOURCE_NOTE)]

        ram_type = info["ram_type"]
        if ram_type is not None:
            # chipset já decide sozinho (AMD, ou Intel LGA1200/1851)
            out.append(self._obs(sku, "ram_type", ram_type, 1.0, REFERENCE_SOURCE_NOTE))
            return out

        # chipset AMBÍGUO (Intel 600/700-series) — tenta o nome do produto
        disamb = _disambiguate_ddr_from_name(name)
        if disamb is not None:
            out.append(self._obs(
                sku, "ram_type", disamb, 0.9,
                f"chipset {chipset.upper()} é ambíguo (existe variante DDR4 e DDR5); "
                f"desambiguado pelo nome do produto, não pelo chipset sozinho.",
            ))
        else:
            # confiança ZERO é um sinal, não um erro de execução: documenta a
            # ambiguidade para o reconcile() abrir conflito, nunca escolhe.
            out.append(self._obs(
                sku, "ram_type", "AMBIGUOUS", 0.0,
                f"chipset {chipset.upper()} não decide sozinho (DDR4 ou DDR5) e o "
                f"nome do produto não desambigua — precisa de segunda fonte ou revisão humana.",
            ))
        return out
