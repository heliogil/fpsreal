"""LLMSpecAdapter — segunda fonte via extração de texto, para o que a tabela
curada não cobre (chipset novo, modelo fora do CPU_SOCKET).

Mesmo padrão de integridade do ``LLMVisionAdapter`` (services/ingestion/
visuals/vision_adapter.py): decodificação restrita a um enum FECHADO (o
modelo escolhe de uma lista, nunca escreve texto livre), confiança baixa
descarta, e nunca é a única fonte que decide um atributo crítico sozinha —
isso é o ``reconcile()`` que garante, não este adapter.

BLOQUEADO POR DADOS, por enquanto (mesmo estado do LLMVisionAdapter): só
funciona quando (a) o produto tem ``specs.source_url`` (página do fabricante
ou datasheet — não existe hoje no catálogo, entra com o feed de afiliado) e
(b) ``MINIMAX_API_KEY`` está no ambiente do pcb_api. Sem qualquer um dos
dois, ``fetch()`` devolve lista vazia — nunca inventa.

Default MiniMax por decisão de custo do founder (mesma decisão do
LLMVisionAdapter, ver visuals/backends.py) — texto é mais barato ainda que
visão, mas a decisão de fornecedor é a mesma.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

from .base import RawSpecObservation

log = logging.getLogger("pcb.specs.llm")

# enum fechado por atributo — o modelo escolhe daqui, nunca texto livre
_ENUMS: dict[str, tuple[str, ...]] = {
    "socket": ("AM4", "AM5", "LGA1200", "LGA1700", "LGA1851", "unknown"),
    "ram_type": ("DDR4", "DDR5", "unknown"),
}

MIN_CONFIDENCE = 0.6


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    i, j = t.find("{"), t.rfind("}")
    return t[i:j + 1] if i >= 0 and j > i else t


def _json_schema(attribute: str) -> dict:
    return {
        "type": "object",
        "properties": {
            "value": {"type": "string", "enum": list(_ENUMS[attribute])},
            "confidence": {"type": "number"},
        },
        "required": ["value", "confidence"],
        "additionalProperties": False,
    }


class LLMSpecAdapter:
    """Extrai um atributo fechado a partir do texto de uma página/datasheet."""

    source_name = "llm_extraction"

    def __init__(self) -> None:
        self.base = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
        self.key = os.environ.get("MINIMAX_API_KEY") or ""
        self.model = os.environ.get("SPECS_LLM_MODEL", "MiniMax-M3")

    def available(self) -> bool:
        return bool(self.key)

    def fetch(self, product: dict) -> list[RawSpecObservation]:
        if not self.available():
            return []
        specs = product.get("specs") or {}
        source_url = specs.get("source_url")
        page_text = specs.get("source_text")  # já buscado pelo chamador, se houver
        if not source_url or not page_text:
            return []  # sem página == sem o que ler, não inventa

        cat = str(product.get("category") or "")
        attributes = ("socket",) if cat == "cpu" else ("socket", "ram_type") if cat == "motherboard" else ()
        out: list[RawSpecObservation] = []
        for attr in attributes:
            obs = self._extract_one(product, attr, source_url, page_text)
            if obs is not None:
                out.append(obs)
        return out

    def _extract_one(self, product: dict, attribute: str, source_url: str,
                     page_text: str) -> Optional[RawSpecObservation]:
        enum_values = ", ".join(_ENUMS[attribute])
        prompt = (
            f"Produto: {product.get('name')}\n\n"
            f"Texto da página do fabricante:\n{page_text[:4000]}\n\n"
            f"Qual é o valor de '{attribute}' deste produto? Responda só com um "
            f"destes valores: {enum_values}. Se o texto não disser claramente, "
            f"responda 'unknown'. Dê também 'confidence' entre 0 e 1 — quão "
            f"claro o texto é sobre isso (ambíguo ou implícito = abaixo de 0.5)."
        )
        try:
            import httpx
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "Você extrai uma especificação técnica exata de um texto. Nunca infira além do que o texto diz."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 200,
                "response_format": {"type": "json_object"},
            }
            r = httpx.post(f"{self.base}/chat/completions", json=payload, timeout=60.0,
                           headers={"Authorization": f"Bearer {self.key}",
                                    "Content-Type": "application/json"})
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            data = json.loads(_strip_fences(text))
        except Exception as e:
            log.warning("specs/llm: %s", e)
            return None

        value = data.get("value")
        confidence = float(data.get("confidence") or 0.0)
        if value not in _ENUMS[attribute] or value == "unknown" or confidence < MIN_CONFIDENCE:
            return None  # abaixo da barra ou fora do enum — não promove, não inventa

        return RawSpecObservation(
            product_sku=str(product["sku"]), attribute=attribute, value=value,
            source_name=self.source_name, source_url=source_url, confidence=confidence,
            notes="extraído por LLM (MiniMax) do texto da página do fabricante",
        )
