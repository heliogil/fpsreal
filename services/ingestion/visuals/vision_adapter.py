"""LLMVisionAdapter — aparência lida da FOTO do produto, no schema fechado.

É a segunda metade do ingestor de modelos: o ``SpecsAdapter`` deriva o que a
ficha técnica sabe (nº de ventoinhas por comprimento, conector por TDP); este lê
o que só a foto sabe — estilo do shroud, recorte das grelhas, se a peça acende.

COMO A INTEGRIDADE É MANTIDA (não por confiança no modelo, por construção):

1. **Decodificação restrita ao schema.** O modelo não devolve texto livre: a
   resposta é forçada a um JSON Schema gerado a partir de ``visuals.schema``
   (``json_schema_for``). Ele escolhe de um enum — não pode inventar valores,
   e o schema não pode divergir da validação porque é a MESMA fonte.
2. **O portão cruzado continua a valer.** O que sai daqui passa por
   ``validate(category, descriptor, specs)`` como qualquer descritor: se a foto
   "mostrar" 3 ventoinhas numa placa de 190mm, é REJEITADO. A ficha técnica
   ganha da foto, sempre.
3. **A foto nunca é guardada nem redistribuída.** Guarda-se o ``photo_hash``
   (sha256 dos bytes) e o descritor derivado. O hash serve também de cache: foto
   igual, zero chamadas — é o controlo de custo.
4. **Nunca logótipo, marca gráfica ou cor.** O schema não tem campo para isso e
   o prompt proíbe-o explicitamente.
5. **Nunca dimensão.** Dimensão vem do catálogo e do motor de geometria.
6. **Vista não-canónica ⇒ confiança baixa ⇒ cai no tier.** Abaixo do limiar
   devolve ``None`` e o ``SpecsAdapter`` continua a ser o piso.

Nada disto chega ao viewer sem ``reviewed_at`` — o portão humano é o último.

LIGAR: definir ``ANTHROPIC_API_KEY`` e ter foto no produto
(``specs.image_url``). Sem chave ou sem foto devolve ``None`` — a ingestão
continua a correr pelo SpecsAdapter, sem erro.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Optional

from .base import RawVisual
from .schema import DescriptorError, canon, json_schema_for

log = logging.getLogger("pcb.visuals.vision")

MODEL = os.environ.get("VISUALS_VISION_MODEL", "claude-opus-4-8")
#: abaixo disto o descritor não vale a pena — cai no tier
MIN_CONFIDENCE = float(os.environ.get("VISUALS_MIN_CONFIDENCE", "0.5"))
#: 'low' chega para classificar num enum fechado e mantém o custo do lote baixo
EFFORT = os.environ.get("VISUALS_VISION_EFFORT", "low")

_MEDIA = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png",
          b"GIF8": "image/gif", b"RIFF": "image/webp"}

SYSTEM = (
    "És um catalogador de peças de PC. Olhas para a foto de UM produto e "
    "descreves APENAS a sua APARÊNCIA, escolhendo de uma lista fechada de "
    "valores.\n\n"
    "REGRAS INEGOCIÁVEIS:\n"
    "1. Descreve só o que está VISÍVEL na foto. Não deduzas do nome do produto "
    "nem do que costuma ser verdade na categoria.\n"
    "2. NUNCA identifiques marca, logótipo, modelo ou fabricante, e nunca "
    "descrevas cor — não há campo para isso e não é isso que se pede.\n"
    "3. NUNCA estimes dimensões (comprimento, altura, espessura). Essas vêm da "
    "ficha técnica, não da foto.\n"
    "4. A ficha técnica é dada como CONTEXTO para desambiguar o que vês, não "
    "para preencher o que não vês. Se a foto contradiz a ficha, descreve a "
    "FOTO e baixa a confiança.\n"
    "5. Confiança é sobre ESTA foto: vista em ângulo, render, foto de "
    "embalagem, peça tapada, ou dúvida entre dois valores ⇒ abaixo de 0.5."
)


def _media_type(data: bytes) -> Optional[str]:
    for magic, mt in _MEDIA.items():
        if data.startswith(magic):
            return mt
    return None


def _image_url(product: dict) -> Optional[str]:
    specs = product.get("specs") or {}
    for key in ("image_url", "photo_url", "image"):
        v = specs.get(key) or product.get(key)
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            return v
    return None


def _fetch(url: str, timeout: float = 20.0) -> Optional[bytes]:
    try:
        import httpx
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        data = r.content
    except Exception as e:                       # rede/404: não é erro fatal
        log.warning("visuals: foto inacessível (%s): %s", url, e)
        return None
    if len(data) > 5 * 1024 * 1024:              # limite de sanidade
        log.warning("visuals: foto grande demais (%d bytes)", len(data))
        return None
    return data


def _specs_context(specs: dict) -> str:
    """Só os campos que ajudam a desambiguar o que se vê — nunca a resposta."""
    keep = ("tdp_w", "length_mm", "slots", "cooler_type", "height_mm",
            "body_w_mm", "rad_class", "watts", "modular", "form_factor",
            "ram_type", "airflow_class")
    got = {k: specs[k] for k in keep if k in specs and specs[k] not in (None, "")}
    return json.dumps(got, ensure_ascii=False) if got else "(sem ficha)"


def fetch_photo(product: dict) -> Optional[tuple[bytes, str, str]]:
    """(bytes, media_type, sha256) da foto do produto — SEM chamar o modelo.

    Serve o cache de custo: o chamador calcula o hash primeiro e só paga uma
    chamada de visão se a foto MUDOU face ao que já está no banco.
    """
    url = _image_url(product)
    if not url:
        return None
    data = _fetch(url)
    if data is None:
        return None
    media_type = _media_type(data)
    if media_type is None:
        log.warning("visuals: formato de imagem não suportado (%s)", url)
        return None
    return data, media_type, hashlib.sha256(data).hexdigest()


class LLMVisionAdapter:
    """Lê a foto do produto e devolve o descritor no schema fechado."""

    source = "visao"

    def __init__(self, model: str = MODEL, min_confidence: float = MIN_CONFIDENCE):
        self.model = model
        self.min_confidence = min_confidence
        self._client = None

    def _get_client(self):
        if self._client is None:
            import anthropic                     # importado tarde: sem chave, o
            self._client = anthropic.Anthropic()  # módulo continua importável
        return self._client

    def describe(self, product: dict) -> Optional[RawVisual]:
        category = canon(str(product.get("category") or ""))
        try:
            schema = json_schema_for(category)
        except DescriptorError:
            return None                          # categoria sem schema: nada a ler

        if not (os.environ.get("ANTHROPIC_API_KEY")
                or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            log.info("visuals: sem credencial de visão — a usar só a ficha")
            return None

        # o chamador pode já ter buscado a foto (cache por hash) — não rebusca
        got = product.get("_photo") or fetch_photo(product)
        if got is None:
            return None                          # sem foto ⇒ SpecsAdapter é o piso
        data, media_type, photo_hash = got

        import base64
        b64 = base64.standard_b64encode(data).decode("ascii")
        specs = product.get("specs") or {}
        prompt = (
            f"Categoria: {category}\n"
            f"Ficha técnica (contexto, não é a resposta): {_specs_context(specs)}\n\n"
            "Descreve a aparência VISÍVEL desta peça preenchendo o schema."
        )

        try:
            client = self._get_client()
            resp = client.messages.create(
                model=self.model,
                max_tokens=2000,
                system=SYSTEM,
                thinking={"type": "adaptive"},
                output_config={"effort": EFFORT,
                               "format": {"type": "json_schema", "schema": schema}},
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64",
                                                     "media_type": media_type,
                                                     "data": b64}},
                        {"type": "text", "text": prompt},
                    ],
                }],
            )
        except Exception as e:
            # qualquer falha de visão é degradação, não paragem: o lote continua
            log.warning("visuals: chamada de visão falhou para %s: %s",
                        product.get("sku"), e)
            return None

        if getattr(resp, "stop_reason", None) == "refusal":
            log.warning("visuals: pedido recusado para %s", product.get("sku"))
            return None

        try:
            text = next(b.text for b in resp.content if b.type == "text")
            desc = json.loads(text)
        except (StopIteration, ValueError) as e:
            log.warning("visuals: resposta ilegível para %s: %s", product.get("sku"), e)
            return None

        conf = desc.get("confidence", 0.0)
        try:
            conf = min(1.0, max(0.0, float(conf)))
        except (TypeError, ValueError):
            conf = 0.0
        desc["confidence"] = round(conf, 3)
        if conf < self.min_confidence:
            # vista não-canónica ou dúvida: melhor o tier do que um palpite
            log.info("visuals: confiança %.2f < %.2f em %s — fica pela ficha",
                     conf, self.min_confidence, product.get("sku"))
            return None

        return RawVisual(
            product_sku=str(product["sku"]), category=category,
            descriptor=desc, source=self.source, photo_hash=photo_hash,
            notes=f"lido da foto ({self.model}, efeito {EFFORT})",
        )
