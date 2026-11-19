"""Mounts do gabinete em 3D — esquema único para o motor de vento, o 2D e o glTF.

Até 2026-11-18 um mount só tinha um retângulo no corte lateral (x, y, w, h) e
cada consumidor ADIVINHAVA a parede pela posição: "w > h e lá em cima" = topo;
o resto = frente ou traseira. Uma ventoinha na cobertura da fonte (em baixo,
soprando para cima) ou na tampa lateral não tinha como existir — caía na
parede da frente. E o CFM vinha de um total por gabinete dividido por igual.

Agora cada mount declara (todos opcionais — o que falta é derivado como antes,
por isso os gabinetes antigos não mudam um número):

  face        front | rear | top | bottom | side   — a face em que assenta
  z, d        centro e extensão ao longo da LARGURA (bandeja→vidro), em mm
  stock_fans  quantas ventoinhas vêm de fábrica neste mount (padrão 1)
  slots       quantas ventoinhas cabem (padrão: 1 num mount de fan; a largura
              ÷ 120 numa baia de radiador)
  fan_cfm     CFM nominal de CADA ventoinha de fábrica (ficha do fabricante)
  cfm_source  de onde vem o fan_cfm — vai no payload, a UI pode citar

Regra do CFM de fábrica, por orientação (entrada / saída): se TODOS os mounts
de fábrica daquela orientação declaram fan_cfm, o total é a SOMA mount a mount;
senão vale o agregado do catálogo (intake_cfm / exhaust_cfm) dividido pelos
mounts, como sempre foi. Nunca se mistura as duas contas na mesma orientação.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

FACES = ("front", "rear", "top", "bottom", "side")

# CFM nominal por classe de ventoinha (estimativa de catálogo, não medição).
FAN_CFM_BY_KIND = {"fan120": 55.0, "fan140": 70.0, "fan160": 80.0}
_FAN_MM = {"fan120": 120.0, "fan140": 140.0, "fan160": 160.0}


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def mount_face(m: dict, D: float, H: float) -> str:
    """Face declarada; sem ela, a mesma dedução que o 2D sempre fez."""
    f = str(m.get("face") or "")
    if f in FACES:
        return f
    x, y, w, h = (_num(m.get(k)) for k in ("x", "y", "w", "h"))
    if w > h:
        cy = y + h / 2
        if cy > H * 0.8:
            return "top"
        if cy < H * 0.3:
            return "bottom"
    return "front" if x + w / 2 < D / 2 else "rear"


def fan_size_mm(m: dict) -> float:
    kind = str(m.get("kind") or "")
    if kind in _FAN_MM:
        return _FAN_MM[kind]
    for k in ("fan160", "fan140", "fan120"):
        if k in (m.get("accepts") or []):
            return _FAN_MM[k]
    return 120.0


def fan_capacity(m: dict) -> int:
    """Quantas ventoinhas cabem neste mount."""
    slots = int(_num(m.get("slots")))
    if slots > 0:
        return slots
    if str(m.get("kind") or "") in FAN_CFM_BY_KIND:
        return max(1, int(_num(m.get("stock_fans")) or 1))
    w = _num(m.get("w"))
    return max(1, int(w // 120)) if w else 1


def what_if_fan_cfm(m: dict) -> float:
    """CFM de UMA ventoinha adicionada neste mount (estimativa de classe)."""
    kind = str(m.get("kind") or "")
    if kind in FAN_CFM_BY_KIND:
        return FAN_CFM_BY_KIND[kind]
    accepts = [str(a) for a in (m.get("accepts") or [])]
    for k in ("fan160", "fan140", "fan120"):
        if k in accepts:
            return FAN_CFM_BY_KIND[k]
    return FAN_CFM_BY_KIND["fan120"]


def normalize_mounts(mounts: List[dict], D: float, H: float, W: float) -> List[dict]:
    """Cópias dos mounts com face, z, d, stock_fans e capacity sempre presentes."""
    out: List[dict] = []
    for raw in mounts:
        m = dict(raw)
        m["face"] = mount_face(m, D, H)
        size = fan_size_mm(m)
        if m["face"] == "side":
            # na tampa: a extensão ao longo da largura é a espessura da fan
            m["d"] = _num(m.get("d")) or 25.0
            m["z"] = _num(m["z"]) if m.get("z") is not None else (W - m["d"] / 2)
        else:
            m["d"] = _num(m.get("d")) or min(size, W)
            m["z"] = _num(m["z"]) if m.get("z") is not None else W / 2
        m["stock_fans"] = (max(1, int(_num(m.get("stock_fans")) or 1)) if m.get("stock") else 0)
        m["capacity"] = fan_capacity(m)
        out.append(m)
    return out


def stock_cfm(mounts: List[dict], agg_intake: float, agg_exhaust: float
              ) -> Tuple[float, float, Dict[str, float], Dict[str, str]]:
    """CFM de fábrica: (entrada, saída, cfm por mount stock, método por orientação).

    `mounts` já normalizados. Método: "por_mount" (soma das fichas) ou
    "agregado" (total do catálogo dividido pelos mounts de fábrica)."""
    per: Dict[str, float] = {}
    method: Dict[str, str] = {}
    totals = {"intake": 0.0, "exhaust": 0.0}
    agg = {"intake": agg_intake, "exhaust": agg_exhaust}
    for orient in ("intake", "exhaust"):
        stock = [m for m in mounts if m.get("stock") and str(m.get("orient")) == orient]
        if stock and all(_num(m.get("fan_cfm")) > 0 for m in stock):
            method[orient] = "por_mount"
            for m in stock:
                c = round(_num(m["fan_cfm"]) * m["stock_fans"], 2)
                per[str(m["id"])] = c
                totals[orient] += c
        else:
            method[orient] = "agregado"
            totals[orient] = agg[orient]
            if stock and agg[orient] > 0:
                for m in stock:
                    per[str(m["id"])] = round(agg[orient] / len(stock), 1)
    return round(totals["intake"], 2), round(totals["exhaust"], 2), per, method
