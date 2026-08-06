"""LLMSpecAdapter — segunda fonte via extração de texto, para o que a tabela
curada / o catálogo semeado não confirmam sozinhos.

Mesmo padrão de integridade do ``LLMVisionAdapter`` (services/ingestion/
visuals/vision_adapter.py): decodificação restrita (enum fechado para
socket/ram_type; faixa numérica sã para dimensão), confiança baixa descarta,
e nunca é a única fonte que decide um atributo crítico sozinha — isso é o
``reconcile()`` que garante, não este adapter.

BLOQUEADO POR DADOS, por enquanto (mesmo estado do LLMVisionAdapter): só
funciona quando (a) o produto tem ``specs.source_url`` + texto já buscado
(``specs.source_text`` — não existe hoje no catálogo, entra com o feed de
afiliado/scraper) e (b) ``MINIMAX_API_KEY`` está no ambiente do pcb_api. Sem
qualquer um dos dois, ``fetch()`` devolve lista vazia — nunca inventa.

Default MiniMax por decisão de custo do founder (mesma decisão do
LLMVisionAdapter, ver visuals/backends.py).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from .base import RawSpecObservation

log = logging.getLogger("pcb.specs.llm")

#: atributo categórico -> enum fechado
_ENUMS: dict[str, tuple[str, ...]] = {
    "socket": ("AM4", "AM5", "LGA1200", "LGA1700", "LGA1851", "unknown"),
    "ram_type": ("DDR4", "DDR5", "unknown"),
}

#: atributo dimensional -> faixa sã em mm (fora disso é rejeitado como
#: alucinação, não "confiança baixa" — dimensão de PC não sai desse universo)
_NUMERIC_RANGES_MM: dict[str, tuple[float, float]] = {
    "length_mm": (100.0, 450.0),
    "height_mm": (25.0, 200.0),
    "max_gpu_length_mm": (150.0, 500.0),
    "max_cooler_height_mm": (100.0, 250.0),
}

MIN_CONFIDENCE = 0.6

#: achado real (2026-08-06): página de produto tem MUITO boilerplate de nav/
#: menu antes da ficha técnica de verdade — "GPU LENGTH CLEARANCE 392mm" só
#: aparecia depois do caractere 8000 numa página de ~9500. 4000 cortava antes
#: da ficha chegar. strip_html não distingue conteúdo principal de boilerplate
#: (ver notas do módulo url_resolver), então a defesa aqui é so mandar mais
#: texto — mais barato que construir extração de "conteúdo principal".
PAGE_TEXT_CHAR_LIMIT = 12000


#: achado real (2026-08-06, rodada ao vivo): MiniMax-M3 é modelo de RACIOCÍNIO
#: — a resposta vem com um bloco <think>...</think> antes do JSON, tudo no
#: mesmo campo "content" (não é canal separado). Com max_tokens curto, o
#: raciocínio consome o orçamento inteiro e a resposta trunca ANTES do JSON —
#: dá erro "Expecting value" no json.loads. Remover o <think> explicitamente
#: (não só cortar por ```/chaves) torna a extração imune a chaves/chaves que
#: por acaso apareçam DENTRO do raciocínio.
_THINK_RE = re.compile(r"(?is)^\s*<think>.*?</think>\s*")


def _strip_fences(text: str) -> str:
    t = _THINK_RE.sub("", text.strip()).strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    i, j = t.find("{"), t.rfind("}")
    return t[i:j + 1] if i >= 0 and j > i else t


class LLMSpecAdapter:
    """Extrai um atributo (categórico ou dimensional) do texto de uma página."""

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
        categorical = ("socket",) if cat == "cpu" else ("socket", "ram_type") if cat == "motherboard" else ()
        numeric = {
            "gpu": ("length_mm",), "case": ("max_gpu_length_mm", "max_cooler_height_mm"),
            "cooler": ("height_mm",),
        }.get(cat, ())

        out: list[RawSpecObservation] = []
        for attr in categorical:
            obs = self._extract_categorical(product, attr, source_url, page_text)
            if obs is not None:
                out.append(obs)
        for attr in numeric:
            obs = self._extract_numeric(product, attr, source_url, page_text)
            if obs is not None:
                out.append(obs)
        return out

    def _call(self, prompt: str) -> Optional[dict]:
        try:
            import httpx
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "Você extrai uma especificação técnica exata de um texto. Nunca infira além do que o texto diz."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                # generoso de propósito: MiniMax-M3 gasta uma fatia do orçamento
                # "pensando" (bloco <think>, ver _strip_fences) antes do JSON —
                # 200 truncava o raciocínio e nunca chegava na resposta
                "max_tokens": 1500,
                "response_format": {"type": "json_object"},
            }
            r = httpx.post(f"{self.base}/chat/completions", json=payload, timeout=90.0,
                           headers={"Authorization": f"Bearer {self.key}",
                                    "Content-Type": "application/json"})
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            parsed = json.loads(_strip_fences(text))
            # achado real: às vezes o modelo devolve só um número solto (JSON
            # válido, mas não o objecto pedido) — "392" desparsa pra float,
            # não pra dict, e quebraria .get() em quem chama isto
            if not isinstance(parsed, dict):
                log.warning("specs/llm: resposta não é um objeto JSON: %r", parsed)
                return None
            return parsed
        except Exception as e:
            log.warning("specs/llm: %s", e)
            return None

    def _extract_categorical(self, product: dict, attribute: str, source_url: str,
                             page_text: str) -> Optional[RawSpecObservation]:
        enum_values = ", ".join(_ENUMS[attribute])
        prompt = (
            f"Produto: {product.get('name')}\n\n"
            f"Texto da página do fabricante:\n{page_text[:PAGE_TEXT_CHAR_LIMIT]}\n\n"
            f"Qual é o valor de '{attribute}' deste produto? Responda em JSON "
            f"EXATAMENTE neste formato: {{\"value\": <um destes: {enum_values}>, "
            f"\"confidence\": <número 0 a 1>}}. Se o texto não disser claramente, "
            f"use \"value\": \"unknown\". 'confidence' é quão claro o texto é "
            f"sobre isso (ambíguo ou implícito = abaixo de 0.5). Use a chave "
            f"\"value\" — não o nome do atributo."
        )
        data = self._call(prompt)
        if data is None:
            return None
        value = data.get("value")
        confidence = float(data.get("confidence") or 0.0)
        if value not in _ENUMS[attribute] or value == "unknown" or confidence < MIN_CONFIDENCE:
            return None
        return RawSpecObservation(
            product_sku=str(product["sku"]), attribute=attribute, value=value,
            source_name=self.source_name, source_url=source_url, confidence=confidence,
            notes="extraído por LLM (MiniMax) do texto da página do fabricante",
        )

    def _extract_numeric(self, product: dict, attribute: str, source_url: str,
                         page_text: str) -> Optional[RawSpecObservation]:
        lo, hi = _NUMERIC_RANGES_MM[attribute]
        prompt = (
            f"Produto: {product.get('name')}\n\n"
            f"Texto da página do fabricante:\n{page_text[:PAGE_TEXT_CHAR_LIMIT]}\n\n"
            f"Qual é o valor de '{attribute}' (em milímetros) deste produto? "
            f"Responda em JSON EXATAMENTE neste formato: "
            f"{{\"value\": <número entre {lo:g} e {hi:g}>, \"confidence\": <número 0 a 1>}}. "
            f"Se o texto não disser claramente, use \"value\": null. 'confidence' é "
            f"quão claro o texto é sobre isso (ambíguo/estimado = abaixo de 0.5). "
            f"Use a chave \"value\" — não o nome do atributo."
        )
        data = self._call(prompt)
        if data is None:
            return None
        value = data.get("value")
        confidence = float(data.get("confidence") or 0.0)
        try:
            value = float(value)
        except (TypeError, ValueError):
            return None
        # faixa sã: fora disso é alucinação, não "baixa confiança" — rejeita sempre
        if not (lo <= value <= hi) or confidence < MIN_CONFIDENCE:
            return None
        return RawSpecObservation(
            product_sku=str(product["sku"]), attribute=attribute, value=f"{value:g}",
            source_name=self.source_name, source_url=source_url, confidence=confidence,
            notes="extraído por LLM (MiniMax) do texto da página do fabricante",
        )
