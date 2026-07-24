"""Backends de visão — o mesmo padrão de adapter dos preços, agora no modelo.

Trocar de fornecedor é registar um backend, nada mais. O DEFAULT é a **MiniMax**
(decisão de custo do founder: a Anthropic é muito mais cara para um lote que
corre sobre o catálogo inteiro). O backend Anthropic fica disponível, mas só
entra se alguém o pedir explicitamente em ``VISUALS_VISION_PROVIDER``.

O que NÃO muda com o fornecedor — e é por isso que um modelo mais fraco é
aceitável aqui:

  * o prompt é gerado do schema fechado (``prompt_spec``), com cada valor
    explicado — o modelo não precisa de saber o vocabulário, recebe-o;
  * a resposta é validada contra os enums fechados E cruzada com a ficha
    técnica antes de sair do adapter;
  * o que não passa é REJEITADO e a peça cai no SpecsAdapter.

Consequência: um modelo pior custa COBERTURA (menos peças descritas), nunca
VERDADE (descritor errado no ar). É o tradeoff certo para esta decisão.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional, Protocol, runtime_checkable

log = logging.getLogger("pcb.visuals.backend")


@runtime_checkable
class VisionBackend(Protocol):
    """Um fornecedor de visão. Devolve o JSON cru (dict) ou None."""

    name: str

    def read(self, *, system: str, prompt: str, image_b64: str,
             media_type: str, schema: dict) -> Optional[dict]:
        ...


def _strip_fences(text: str) -> str:
    """Modelos mais fracos embrulham o JSON em ```json … ``` — é normal."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    i, j = t.find("{"), t.rfind("}")
    return t[i:j + 1] if i >= 0 and j > i else t


class MiniMaxBackend:
    """MiniMax via API compatível com OpenAI (`/v1/chat/completions`).

    NOTA: o endpoint correcto é ``api.minimax.io`` — ``api.minimaxi.com``
    devolve 401 (já custou tempo noutro projecto do estúdio).
    """

    name = "minimax"

    def __init__(self) -> None:
        self.base = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
        self.key = os.environ.get("MINIMAX_API_KEY") or ""
        self.model = os.environ.get("VISUALS_VISION_MODEL", "MiniMax-M3")

    def available(self) -> bool:
        return bool(self.key)

    def read(self, *, system: str, prompt: str, image_b64: str,
             media_type: str, schema: dict) -> Optional[dict]:
        if not self.key:
            return None
        import httpx
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "image_url",
                     "image_url": {"url": f"data:{media_type};base64,{image_b64}"}},
                    {"type": "text", "text": prompt},
                ]},
            ],
            # temperatura baixa: isto é classificação, não criatividade
            "temperature": 0.1,
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
        }
        try:
            r = httpx.post(f"{self.base}/chat/completions", json=payload, timeout=90.0,
                           headers={"Authorization": f"Bearer {self.key}",
                                    "Content-Type": "application/json"})
            if r.status_code == 400 and "response_format" in r.text:
                payload.pop("response_format", None)   # modelo sem modo JSON
                r = httpx.post(f"{self.base}/chat/completions", json=payload, timeout=90.0,
                               headers={"Authorization": f"Bearer {self.key}",
                                        "Content-Type": "application/json"})
            r.raise_for_status()
            body = r.json()
            text = body["choices"][0]["message"]["content"]
            if isinstance(text, list):               # alguns devolvem blocos
                text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
            return json.loads(_strip_fences(text))
        except Exception as e:
            log.warning("visuals/minimax: %s", e)
            return None


class AnthropicBackend:
    """Claude via SDK oficial. Melhor qualidade, custo bem mais alto — por isso
    NÃO é o default. Usa structured outputs, por isso a saída é forçada ao
    schema em vez de apenas validada."""

    name = "anthropic"

    def __init__(self) -> None:
        self.model = os.environ.get("VISUALS_VISION_MODEL", "claude-opus-4-8")
        self.effort = os.environ.get("VISUALS_VISION_EFFORT", "low")

    def available(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY")
                    or os.environ.get("ANTHROPIC_AUTH_TOKEN"))

    def read(self, *, system: str, prompt: str, image_b64: str,
             media_type: str, schema: dict) -> Optional[dict]:
        if not self.available():
            return None
        try:
            import anthropic
            client = anthropic.Anthropic()
            resp = client.messages.create(
                model=self.model, max_tokens=2000, system=system,
                thinking={"type": "adaptive"},
                output_config={"effort": self.effort,
                               "format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64",
                                                 "media_type": media_type,
                                                 "data": image_b64}},
                    {"type": "text", "text": prompt}]}],
            )
            if getattr(resp, "stop_reason", None) == "refusal":
                log.warning("visuals/anthropic: pedido recusado")
                return None
            text = next(b.text for b in resp.content if b.type == "text")
            return json.loads(_strip_fences(text))
        except Exception as e:
            log.warning("visuals/anthropic: %s", e)
            return None


_BACKENDS = {"minimax": MiniMaxBackend, "anthropic": AnthropicBackend}


def get_backend(name: Optional[str] = None):
    """Backend activo. Default MiniMax (decisão de custo)."""
    key = (name or os.environ.get("VISUALS_VISION_PROVIDER") or "minimax").lower()
    cls = _BACKENDS.get(key)
    if cls is None:
        raise ValueError(f"fornecedor de visão desconhecido: {key} "
                         f"(disponíveis: {', '.join(_BACKENDS)})")
    return cls()
