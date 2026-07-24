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


# ── glossário: o que cada valor QUER DIZER, em linguagem visual ──────────────
# Existe por causa dos modelos mais fracos: `shroud=industrial` não se adivinha
# do nome. Descrever cada opção é o que mantém a qualidade aceitável fora dos
# modelos de topo — e como é gerado desta mesma fonte, não pode divergir.
FIELD_HELP: dict[str, dict[str, Any]] = {
    "gpu": {
        "fans": ("nº de ventoinhas visíveis na face da placa", {}),
        "fan_style": ("forma das ventoinhas", {
            "ring": "aro contínuo a toda a volta das pás",
            "blade": "pás normais, sem aro à volta",
            "blower": "uma só turbina que expulsa o ar pela traseira",
            "none": "sem ventoinha (placa passiva)"}),
        "shroud": ("aspecto da carcaça", {
            "flat": "lisa e simples, sem relevo",
            "dual_tone": "dois materiais/tons bem distintos",
            "angular": "facetas e linhas diagonais agressivas",
            "industrial": "metal sóbrio, sem recortes decorativos"}),
        "vent_cut": ("recortes de ventilação na carcaça", {
            "none": "fechada", "diagonal": "rasgos na diagonal",
            "hex": "favo de mel", "slot": "rasgos rectos paralelos"}),
        "accent": ("detalhe decorativo aplicado", {
            "none": "nenhum", "strip_bottom": "faixa ao longo da aresta inferior",
            "edge": "detalhe curto numa aresta", "plate": "placa/emblema aplicado"}),
        "power": ("conector(es) de energia no topo da placa", {
            "none": "sem conector", "6pin": "um de 6 pinos", "8pin": "um de 8 pinos",
            "8x2": "dois de 8 pinos", "12vhpwr": "um conector pequeno e muito denso"}),
        "backplate": ("chapa rígida a cobrir as costas da placa", {}),
        "lighting": ("iluminação visível", {
            "none": "não acende", "logo": "só o emblema acende",
            "edge": "uma aresta acende", "fans": "os aros das ventoinhas acendem",
            "full": "vários elementos acendem"}),
    },
    "cooler": {
        "kind": ("tipo de cooler", {
            "tower": "torre de aletas com ventoinha",
            "low_profile": "bloco baixo e largo assente sobre o socket",
            "aio": "bloco/bomba sobre a CPU com tubos para um radiador"}),
        "towers": ("nº de blocos de aletas", {}),
        "fans": ("nº de ventoinhas no cooler", {}),
        "fin_style": ("aspecto das aletas", {
            "dense": "juntas e finas", "open": "espaçadas",
            "stacked": "em blocos empilhados/separados"}),
        "top_plate": ("tampa no topo", {
            "none": "sem tampa", "brushed": "tampa metálica lisa",
            "logo_plate": "tampa com emblema"}),
        "side_fan": ("ventoinha presa na lateral do bloco", {}),
        "lighting": ("iluminação visível", {
            "none": "não acende", "ring": "anel aceso", "logo": "emblema aceso",
            "full": "vários elementos acendem"}),
    },
    "psu": {
        "cabling": ("cabos", {
            "fixed": "todos presos à fonte", "semi": "alguns presos, alguns encaixáveis",
            "modular": "todos encaixáveis"}),
        "grill": ("grelha da ventoinha", {
            "honeycomb": "favo de mel", "round": "aro circular", "slot": "rasgos"}),
        "fan_pos": ("onde está a ventoinha", {"bottom": "na face larga", "rear": "na traseira"}),
        "shroud_window": ("janela na tampa", {}),
    },
    "ram": {
        "spreader": ("dissipador do módulo", {
            "bare": "PCB nu, sem dissipador", "low": "dissipador baixo",
            "tall": "dissipador alto", "tall_diffuser": "alto com barra translúcida"}),
        "sticks": ("nº de módulos visíveis", {}),
        "lighting": ("iluminação", {"none": "não acende", "diffuser": "barra difusora acesa"}),
    },
    "case_front": {
        "surface": ("painel frontal", {
            "mesh": "malha perfurada", "solid": "painel fechado",
            "glass": "vidro", "hybrid": "parte fechada + parte em malha"}),
        "cut": ("recorte de entrada de ar", {
            "none": "nenhum", "side_intake": "rasgo lateral", "slit": "rasgos horizontais"}),
        "dust_filter": ("filtro de pó visível", {}),
        "lighting": ("iluminação", {"none": "não acende", "strip": "faixa acesa",
                                     "ring": "anel aceso"}),
    },
    "motherboard": {
        "vrm_heatsink": ("dissipadores ao lado do socket", {
            "none": "nenhum", "small": "pequenos", "large": "grandes/contínuos"}),
        "io_cover": ("cobertura plástica sobre a zona de I/O", {
            "none": "nenhuma", "partial": "cobre parte", "full": "cobre tudo"}),
        "m2_shields": ("nº de chapas de M.2", {}),
    },
}


def prompt_spec(category: str) -> str:
    """Rende o schema fechado como INSTRUÇÃO explícita, valor a valor.

    É a peça que sustenta a qualidade fora dos modelos de topo: em vez de
    esperar que o modelo saiba o vocabulário, damos-lhe o vocabulário todo.
    """
    category = canon(category)
    if category not in ENUMS:
        raise DescriptorError(f"categoria sem schema: {category}")
    help_ = FIELD_HELP.get(category, {})
    out: list[str] = []
    for field, allowed in ENUMS[category].items():
        desc, vals = help_.get(field, ("", {}))
        out.append(f"- {field}: {desc}" if desc else f"- {field}:")
        for v in allowed:
            gloss = vals.get(v)
            out.append(f"    {v}{' = ' + gloss if gloss else ''}")
    for field, (lo, hi) in INT_RANGES.get(category, {}).items():
        desc = help_.get(field, ("", {}))[0]
        opts = ", ".join(str(n) for n in range(lo, hi + 1))
        out.append(f"- {field}: {desc} — inteiro, um de: {opts}")
    for field in BOOLS.get(category, ()):
        desc = help_.get(field, ("", {}))[0]
        out.append(f"- {field}: {desc} — true ou false")
    out.append("- confidence: quão legível é a peça NESTA foto — número entre 0 e 1. "
               "Foto em ângulo, render, foto de caixa, peça tapada, ou dúvida entre "
               "dois valores => abaixo de 0.5.")
    return "\n".join(out)


def json_schema_for(category: str) -> dict:
    """JSON Schema DERIVADO deste schema fechado, para decodificação restrita.

    É o que impede o modelo de visão de inventar valores: ele não escolhe texto
    livre, escolhe de um enum. E porque é gerado a partir de ENUMS/INT_RANGES/
    BOOLS, não pode divergir da validação — mudar o enum muda o schema e a
    validação ao mesmo tempo.

    Nota: a API não suporta `minimum`/`maximum`, por isso as faixas de inteiros
    viram enum explícito.
    """
    category = canon(category)
    if category not in ENUMS:
        raise DescriptorError(f"categoria sem schema: {category}")
    props: dict[str, Any] = {}
    required: list[str] = []
    for field, allowed in ENUMS[category].items():
        props[field] = {"type": "string", "enum": list(allowed)}
        required.append(field)
    for field, (lo, hi) in INT_RANGES.get(category, {}).items():
        props[field] = {"type": "integer", "enum": list(range(lo, hi + 1))}
        required.append(field)
    for field in BOOLS.get(category, ()):
        props[field] = {"type": "boolean"}
        required.append(field)
    props["confidence"] = {
        "type": "number",
        "description": ("0..1 — quão legível é a peça NESTA foto. Vista em ângulo, "
                        "render, foto de caixa, peça parcialmente tapada ou dúvida "
                        "entre dois valores => abaixo de 0.5."),
    }
    required.append("confidence")
    return {"type": "object", "properties": props,
            "required": required, "additionalProperties": False}


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
