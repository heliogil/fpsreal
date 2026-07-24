"""LLMVisionAdapter — aparência lida da FOTO do produto, no schema fechado.

É a segunda metade do ingestor de modelos: o ``SpecsAdapter`` deriva o que a
ficha técnica sabe (nº de ventoinhas por comprimento, conector por TDP); este lê
o que só a foto sabe — estilo do shroud, recorte das grelhas, se a peça acende.

FORNECEDOR: agnóstico, via ``visuals.backends``. O default é a **MiniMax**
(decisão de custo do founder); a Anthropic fica disponível mas só entra com
``VISUALS_VISION_PROVIDER=anthropic``.

PORQUE UM MODELO MAIS FRACO É ACEITÁVEL AQUI — a integridade não depende da
qualidade do modelo, depende da construção:

1. **A tarefa é dada por extenso.** O prompt é gerado do schema fechado
   (``prompt_spec``) com CADA valor explicado em linguagem visual. O modelo não
   precisa de saber o vocabulário — recebe-o. É o que mais recupera qualidade
   fora dos modelos de topo.
2. **Enums fechados + portão cruzado.** A resposta é validada contra os enums e
   cruzada com a ficha técnica **dentro** do adapter. Valor fora do enum, ou
   contradição física (3 ventoinhas numa placa de 190mm), é REJEITADO.
3. **Uma tentativa de reparação.** Se falhar, devolve-se ao modelo o erro exacto
   e pede-se a correcção — uma só vez, para o custo do lote ficar previsível.
4. **Confiança baixa ⇒ cai no tier.** Vista em ângulo, render, foto de caixa.
5. **A foto nunca é guardada nem redistribuída** — só o ``photo_hash`` (sha256),
   que é também o cache de custo: foto igual, zero chamadas.
6. **Nunca logótipo, marca gráfica ou cor** (não há campo e o prompt proíbe-o) e
   **nunca dimensão** — essa vem do catálogo e do motor de geometria.

Consequência do desenho: um modelo pior custa **cobertura** (menos peças
descritas), nunca **verdade** (descritor errado no ar). O que não passa cai no
``SpecsAdapter``, que continua a ser o piso. E nada chega ao viewer sem
``reviewed_at``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Optional

from .backends import VisionBackend, get_backend
from .base import RawVisual
from .schema import DescriptorError, canon, json_schema_for, prompt_spec, validate

log = logging.getLogger("pcb.visuals.vision")

PROVIDER = os.environ.get("VISUALS_VISION_PROVIDER", "minimax")
#: abaixo disto o descritor não vale a pena — cai no tier
MIN_CONFIDENCE = float(os.environ.get("VISUALS_MIN_CONFIDENCE", "0.5"))

_MEDIA = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png",
          b"GIF8": "image/gif", b"RIFF": "image/webp"}

SYSTEM = (
    "És um catalogador de peças de PC. Olhas para a foto de UM produto e "
    "descreves APENAS a sua APARÊNCIA, escolhendo de uma lista fechada de "
    "valores.\n\n"
    "REGRAS INEGOCIÁVEIS:\n"
    "1. Descreve só o que está VISÍVEL na foto. Não deduzas do nome do produto "
    "nem do que costuma ser verdade na categoria.\n"
    "2. NUNCA identifiques marca, logótipo, modelo ou fabricante, e NUNCA "
    "descrevas cor — não há campo para isso e não é isso que se pede.\n"
    "3. NUNCA estimes dimensões (comprimento, altura, espessura). Essas vêm da "
    "ficha técnica, não da foto.\n"
    "4. A ficha técnica é CONTEXTO para desambiguar o que vês, não para "
    "preencher o que não vês. Se a foto contradiz a ficha, descreve a FOTO e "
    "baixa a confiança.\n"
    "5. Se não conseguires ver um detalhe, escolhe o valor mais conservador e "
    "baixa a confiança — não inventes.\n"
    "6. Responde SÓ com JSON válido."
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


def fetch_photo(product: dict) -> Optional[tuple]:
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

    def __init__(self, backend: Optional[VisionBackend] = None,
                 min_confidence: float = MIN_CONFIDENCE):
        self.backend = backend or get_backend(PROVIDER)
        self.min_confidence = min_confidence

    @property
    def model(self) -> str:
        return getattr(self.backend, "model", self.backend.name)

    def describe(self, product: dict) -> Optional[RawVisual]:
        category = canon(str(product.get("category") or ""))
        try:
            schema = json_schema_for(category)
            spec_txt = prompt_spec(category)
        except DescriptorError:
            return None                          # categoria sem schema: nada a ler

        if not getattr(self.backend, "available", lambda: True)():
            log.info("visuals: fornecedor %s sem credencial — a usar só a ficha",
                     self.backend.name)
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
            "CATEGORIA: " + category + "\n"
            "FICHA TÉCNICA (contexto para desambiguar, NÃO é a resposta): "
            + _specs_context(specs) + "\n\n"
            "Responde SÓ com um objecto JSON com EXACTAMENTE estas chaves, "
            "escolhendo um dos valores listados para cada uma:\n\n"
            + spec_txt + "\n\n"
            "Sem texto antes ou depois do JSON. Sem comentários."
        )

        # Uma tentativa de REPARAÇÃO: modelos mais fracos acertam muitas vezes à
        # segunda quando se lhes diz exactamente o que falhou. Fica em 1 para o
        # custo do lote continuar previsível.
        clean = None
        err_hint = ""
        for attempt in (1, 2):
            raw = self.backend.read(system=SYSTEM, prompt=prompt + err_hint,
                                    image_b64=b64, media_type=media_type,
                                    schema=schema)
            if raw is None:
                return None
            conf = raw.get("confidence", 0.0)
            try:
                conf = min(1.0, max(0.0, float(conf)))
            except (TypeError, ValueError):
                conf = 0.0
            raw["confidence"] = round(conf, 3)
            try:
                # valida JÁ AQUI (enums fechados + contradição com a ficha) para
                # poder reparar; o ingest volta a validar — é idempotente
                clean = validate(category, raw, specs)
                break
            except DescriptorError as e:
                if attempt == 1:
                    log.info("visuals: resposta inválida (%s) — a pedir correcção", e)
                    err_hint = (
                        "\n\nA tua resposta anterior foi REJEITADA: " + str(e) + "\n"
                        "Corrige APENAS esse ponto e devolve o JSON completo outra "
                        "vez, respeitando os valores permitidos."
                    )
                    continue
                log.warning("visuals: %s rejeitado após correcção: %s",
                            product.get("sku"), e)
                return None                      # cai no SpecsAdapter

        if clean is None:
            return None
        if clean.get("confidence", 0.0) < self.min_confidence:
            # vista não-canónica ou dúvida: melhor o tier do que um palpite
            log.info("visuals: confiança %.2f < %.2f em %s — fica pela ficha",
                     clean.get("confidence", 0.0), self.min_confidence,
                     product.get("sku"))
            return None

        return RawVisual(
            product_sku=str(product["sku"]), category=category,
            descriptor=clean, source=self.source, photo_hash=photo_hash,
            notes="lido da foto (" + self.backend.name + "/" + str(self.model) + ")",
        )
