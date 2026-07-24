"""Descritor visual — schema FECHADO e validação cruzada com a ficha técnica.

O ingestor de modelos não gera desenho: gera este descritor, e os renderers do
viewer consomem-no. A consequência arquitetural é a que interessa: **o descritor
só descreve APARÊNCIA**. A dimensão continua vindo do motor de geometria em mm,
por isso é estruturalmente impossível um gerador mentir sobre tamanho.

INTEGRIDADE:
  - não existe campo de COR (o desenho usa só tokens da marca);
  - não existe campo de LOGÓTIPO/marca gráfica (risco de trademark);
  - toda contradição com os specs é REJEITADA, nunca corrigida em silêncio —
    um descritor contraditório vale confiança zero e o viewer cai no tier.

Ver spec: docs/superpowers/specs/2026-07-23-viewer-2d-ingestor-de-modelos-design.md
"""
from __future__ import annotations

from typing import Any

SCHEMA_VERSION = 2   # v2: campo `lighting` (iluminação DECLARADA pelo fabricante)

# ── enums fechados por categoria ─────────────────────────────────────────────
# (campo -> valores aceites). Inteiros declaram faixa em INT_RANGES.
#
# ILUMINAÇÃO (`lighting`): só entra quando a FONTE declara. Hoje o catálogo não
# tem campo de luz nenhum e nenhum nome de produto diz RGB/ARGB, por isso todos
# os descritores saem com `none` — e é essa a resposta correta. Inventar que
# peça acende seria fabricar um critério de compra. Quando o feed de afiliado
# trouxer os nomes reais (peça gamer quase sempre declara RGB no nome), acende
# sozinho; e o LLMVisionAdapter pode confirmá-lo pela foto.
ENUMS: dict[str, dict[str, tuple[str, ...]]] = {
    "gpu": {
        "fan_style": ("ring", "blade", "blower", "none"),
        "shroud": ("flat", "dual_tone", "angular", "industrial"),
        "vent_cut": ("none", "diagonal", "hex", "slot"),
        "accent": ("none", "strip_bottom", "edge", "plate"),
        "power": ("none", "6pin", "8pin", "8x2", "12vhpwr"),
        "lighting": ("none", "logo", "edge", "fans", "full"),
    },
    "cooler": {
        "kind": ("tower", "low_profile", "aio"),
        "fin_style": ("dense", "open", "stacked"),
        "top_plate": ("none", "brushed", "logo_plate"),
        "lighting": ("none", "ring", "logo", "full"),
    },
    "psu": {
        "cabling": ("fixed", "semi", "modular"),
        "grill": ("honeycomb", "round", "slot"),
        "fan_pos": ("bottom", "rear"),
    },
    "ram": {
        "spreader": ("bare", "low", "tall", "tall_diffuser"),
        "lighting": ("none", "diffuser"),
    },
    "case_front": {
        "surface": ("mesh", "solid", "glass", "hybrid"),
        "cut": ("none", "side_intake", "slit"),
        "lighting": ("none", "strip", "ring"),
    },
    "motherboard": {
        "vrm_heatsink": ("none", "small", "large"),
        "io_cover": ("none", "partial", "full"),
    },
}

INT_RANGES: dict[str, dict[str, tuple[int, int]]] = {
    "gpu": {"fans": (0, 4)},
    "cooler": {"towers": (1, 2), "fans": (0, 3)},
    "ram": {"sticks": (1, 4)},
    "motherboard": {"m2_shields": (0, 3)},
}

BOOLS: dict[str, tuple[str, ...]] = {
    "gpu": ("backplate",),
    "cooler": ("side_fan",),
    "psu": ("shroud_window",),
    "case_front": ("dust_filter",),
}


#: o catálogo chama a categoria de `case`; o descritor descreve o painel frontal
CATEGORY_ALIAS = {"case": "case_front"}


def canon(category: str) -> str:
    return CATEGORY_ALIAS.get(category, category)


class DescriptorError(ValueError):
    """Descritor fora do schema ou em contradição com a ficha técnica."""


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def validate(category: str, desc: dict, specs: dict | None = None) -> dict:
    """Valida e devolve o descritor limpo. Levanta ``DescriptorError`` se algo
    estiver fora do schema OU em contradição com a ficha técnica.

    Não "conserta" nada em silêncio: prefere-se cair no tier a mostrar uma peça
    que contradiz os próprios dados do produto.
    """
    specs = specs or {}
    category = canon(category)
    if category not in ENUMS:
        raise DescriptorError(f"categoria sem schema: {category}")
    clean: dict[str, Any] = {}

    for field, allowed in ENUMS[category].items():
        if field in desc:
            v = desc[field]
            if v not in allowed:
                raise DescriptorError(f"{category}.{field}={v!r} fora do enum {allowed}")
            clean[field] = v
    for field, (lo, hi) in INT_RANGES.get(category, {}).items():
        if field in desc:
            try:
                v = int(desc[field])
            except (TypeError, ValueError):
                raise DescriptorError(f"{category}.{field} não é inteiro: {desc[field]!r}")
            if not (lo <= v <= hi):
                raise DescriptorError(f"{category}.{field}={v} fora da faixa {lo}..{hi}")
            clean[field] = v
    for field in BOOLS.get(category, ()):
        if field in desc:
            if not isinstance(desc[field], bool):
                raise DescriptorError(f"{category}.{field} não é booleano")
            clean[field] = desc[field]

    conf = desc.get("confidence", 1.0)
    try:
        conf = float(conf)
    except (TypeError, ValueError):
        raise DescriptorError("confidence não é número")
    if not (0.0 <= conf <= 1.0):
        raise DescriptorError(f"confidence={conf} fora de 0..1")
    clean["confidence"] = round(conf, 3)

    _cross_check(category, clean, specs)
    return clean


def _cross_check(category: str, d: dict, specs: dict) -> None:
    """Contradições FÍSICAS com a ficha técnica. Cada regra é defensável —
    nada de palpite estético, só o que a dimensão/ficha não permite."""
    if category == "gpu":
        length = _num(specs.get("length_mm"))
        fans = d.get("fans")
        if fans is not None and length > 0:
            # ~92mm por ventoinha incluindo shroud (tripla real ≈ 285mm+)
            max_fans = max(1, int(length // 92))
            if fans > max_fans:
                raise DescriptorError(
                    f"gpu.fans={fans} não cabe em {length:.0f}mm (máx ~{max_fans})")
        if d.get("fan_style") == "blower" and fans is not None and fans > 1:
            raise DescriptorError("gpu blower tem no máximo 1 ventoinha")
        slots = _num(specs.get("slots"))
        if slots and slots <= 2.0 and fans is not None and fans > 3:
            raise DescriptorError(f"gpu {slots}-slot não comporta {fans} ventoinhas")

    elif category == "cooler":
        kind = d.get("kind")
        h = _num(specs.get("height_mm"))
        ctype = str(specs.get("cooler_type") or "")
        if kind == "aio" and h and not ctype.startswith("aio"):
            raise DescriptorError("descritor diz AIO mas a ficha não é AIO")
        if kind == "tower" and ctype.startswith("aio"):
            raise DescriptorError("descritor diz torre mas a ficha é AIO")
        if kind == "low_profile" and h and h >= 100:
            raise DescriptorError(f"low profile contradiz altura {h:.0f}mm")
        if d.get("towers") == 2 and h and 0 < h < 120:
            raise DescriptorError("dupla torre não cabe abaixo de 120mm")

    elif category == "ram":
        sticks = d.get("sticks")
        if sticks is not None and sticks < 1:
            raise DescriptorError("ram.sticks < 1")

    elif category == "case_front":
        surface = d.get("surface")
        aclass = str(specs.get("airflow_class") or "").lower()
        if surface == "mesh" and aclass in ("low",):
            raise DescriptorError("frontal mesh contradiz airflow_class=low")
        if surface == "solid" and aclass == "high":
            raise DescriptorError("frontal sólido contradiz airflow_class=high")
