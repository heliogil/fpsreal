"""SpecsAdapter — aparência DERIVADA da ficha técnica. Sem IA, sem foto.

É o equivalente visual do ``SampleAdapter`` dos preços: honesto, determinístico
e útil desde já. Uma placa de 3.5 slots e 575 W não pode parecer igual a uma de
2 slots e 115 W — e isso a ficha técnica já diz, sem precisar de visão.

Quando o feed afiliado trouxer fotos, o ``LLMVisionAdapter`` acrescenta o que a
ficha não sabe (estilo do shroud, recorte das grelhas). Este adapter continua a
ser o piso e o fallback.
"""
from __future__ import annotations

from .base import RawVisual, VisionAdapter


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


#: onde a luz aparece, POR CATEGORIA, quando o fabricante a declara
_LIT = {"gpu": "fans", "cooler": "ring", "ram": "diffuser", "case": "strip"}


def _lighting(name: str, category: str) -> str:
    """Iluminação só quando a FONTE declara — aqui, o nome do próprio produto.

    "RGB"/"ARGB" no nome é declaração do FABRICANTE, não palpite nosso. Sem essa
    marca devolve `none`: prefere-se não acender nada a inventar que a peça
    acende. Hoje o catálogo semeado não tem um único nome com RGB, portanto isto
    devolve `none` para tudo — resultado correcto, não bug. Quando o feed de
    afiliado trouxer nomes reais, a luz aparece sozinha.
    """
    n = name.lower()
    if "argb" in n or "rgb" in n:
        return _LIT.get(category, "none")
    return "none"


class SpecsAdapter:
    """Deriva o descritor apenas dos specs do catálogo."""

    source = "ficha"

    def describe(self, product: dict) -> RawVisual | None:
        cat = str(product.get("category") or "")
        specs = product.get("specs") or {}
        fn = getattr(self, f"_{cat}", None)
        if fn is None:
            return None
        desc = fn(specs, str(product.get("name") or ""))
        if not desc:
            return None
        return RawVisual(
            product_sku=str(product["sku"]), category=cat,
            descriptor=desc, source=self.source,
            notes="derivado da ficha técnica (sem foto)",
        )

    # ── por categoria ────────────────────────────────────────────────────────
    def _gpu(self, s: dict, name: str) -> dict:
        length = _num(s.get("length_mm"))
        tdp = _num(s.get("tdp_w"))
        slots = _num(s.get("slots"))
        # nº de ventoinhas: o que cabe no comprimento, limitado pelo porte
        if length >= 285 and (slots >= 3.0 or tdp >= 300):
            fans = 3
        elif length >= 240:
            fans = 3 if tdp >= 300 else 2
        elif length >= 175:
            fans = 2
        else:
            fans = 1
        fans = min(fans, max(1, int(length // 92) if length else 2))
        # conector: correlação directa com o TDP
        power = ("12vhpwr" if tdp >= 320 else "8x2" if tdp >= 220
                 else "8pin" if tdp >= 130 else "6pin")
        flagship = tdp >= 300 or slots >= 3.0
        return {
            "fans": fans,
            "fan_style": "ring" if flagship else "blade",
            "shroud": "angular" if flagship else ("dual_tone" if tdp >= 180 else "flat"),
            "vent_cut": "diagonal" if flagship else ("slot" if tdp >= 180 else "none"),
            "accent": "strip_bottom" if flagship else ("edge" if tdp >= 180 else "none"),
            "backplate": tdp >= 160 or slots >= 2.5,
            "power": power,
            "lighting": _lighting(name, "gpu"),
            "confidence": 0.7,   # ficha só: bom piso, não é leitura da peça
        }

    def _cooler(self, s: dict, name: str) -> dict:
        ctype = str(s.get("cooler_type") or "")
        h = _num(s.get("height_mm"))
        body = _num(s.get("body_w_mm"))
        if ctype.startswith("aio"):
            kind = "aio"
        elif 0 < h < 100:
            kind = "low_profile"
        else:
            kind = "tower"
        return {
            "kind": kind,
            "towers": 2 if (kind == "tower" and body >= 120) else 1,
            "fans": 0 if kind == "aio" else (1 if kind == "low_profile" else (2 if body >= 120 else 1)),
            "fin_style": "dense" if kind == "tower" else "open",
            "top_plate": "brushed" if kind != "low_profile" else "none",
            "side_fan": kind == "tower",
            "lighting": _lighting(name, "cooler"),
            "confidence": 0.75,
        }

    def _psu(self, s: dict, name: str) -> dict:
        w = _num(s.get("watts"))
        return {
            "cabling": "modular" if w >= 750 else ("semi" if w >= 600 else "fixed"),
            "grill": "honeycomb" if w >= 650 else "round",
            "fan_pos": "bottom",
            "shroud_window": False,
            "confidence": 0.7,
        }

    def _ram(self, s: dict, name: str) -> dict:
        ddr = str(s.get("ram_type") or s.get("ddr") or "").upper()
        return {
            "spreader": "tall_diffuser" if "DDR5" in ddr else "low",
            "sticks": 2,
            "lighting": _lighting(name, "ram"),
            "confidence": 0.65,
        }

    def _case(self, s: dict, name: str) -> dict:
        # categoria 'case' no catálogo -> descritor 'case_front' (painel frontal)
        aclass = str(s.get("airflow_class") or "").lower()
        return {
            "surface": "mesh" if aclass == "high" else ("hybrid" if aclass == "medium" else "solid"),
            "cut": "side_intake" if aclass == "high" else "none",
            "dust_filter": True,
            "lighting": _lighting(name, "case"),
            "confidence": 0.8,
        }

    def _motherboard(self, s: dict, name: str) -> dict:
        ff = str(s.get("form_factor") or "ATX").upper()
        return {
            "vrm_heatsink": "large" if ff.startswith("ATX") else "small",
            "io_cover": "partial" if ff.startswith("ATX") else "none",
            "m2_shields": 2 if ff.startswith("ATX") else 1,
            "confidence": 0.6,
        }


class LLMVisionAdapter:
    """STUB — lê foto do feed + ficha e devolve o descritor no schema fechado.

    Fica por ligar até haver (a) feed afiliado com foto e (b) decisão do founder
    sobre custo/credenciais de visão. Requisitos quando for ligado:
      - decodificação restrita ao schema (``visuals.schema.ENUMS``/``INT_RANGES``);
      - NUNCA guardar nem redistribuir a foto — só ``photo_hash`` e o descritor;
      - NUNCA extrair logótipo, marca gráfica ou cor;
      - confiança real do modelo, para o limiar de revisão.
    """

    source = "visao"

    def describe(self, product: dict) -> RawVisual | None:
        raise NotImplementedError(
            "LLMVisionAdapter por ligar — ver spec 2026-07-23, secção Pipeline"
        )


# checagem de contrato em tempo de import (mesmo padrão dos preços)
_: VisionAdapter = SpecsAdapter()
