"""Case interior estimate — fit (clearance) + airflow, for the visual viewport.

POST /interior/estimate  {"components": {"cpu_id":..,"gpu_id":..,"case_id":..,"cooler_id":..}}

Returns everything the "Interior do gabinete" Canvas needs, in one call:
- case geometry (max GPU length / cooler height) to set the drawing scale,
- part footprints (GPU length, cooler height) for the fit,
- clearances (remaining mm + tight flag),
- an airflow estimate via a directed zone-graph (Phase 1 — NOT CFD).

INTEGRITY: airflow is an *estimate* ("estimativa de fluxo"), never a measurement.
``method='zone_graph_estimate'`` is echoed so the UI can label it honestly.
"""
from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import Product

router = APIRouter(tags=["interior"])

TIGHT_MM = 15.0
PSU_OVERHEAD_W = 60.0
# Tuning: a high-airflow case (~200 CFM) on a ~345 W build lands ~80 (healthy).
SCORE_K = 0.75


class InteriorRequest(BaseModel):
    components: Dict[str, Optional[int]]


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _zone_status(cfm: float, heat_w: float, need_ratio: float) -> str:
    if cfm <= 0:
        return "dead_zone"
    if heat_w <= 0:
        return "ok"
    ratio = cfm / heat_w
    if ratio < need_ratio * 0.7:
        return "critical"
    if ratio < need_ratio:
        return "tight"
    return "ok"


@router.post("/estimate", response_model=None)
async def estimate_interior(body: InteriorRequest, db: AsyncSession = Depends(get_db)):
    ids = [v for v in body.components.values() if v]
    by_cat: Dict[str, Product] = {}
    if ids:
        rows = (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars().all()
        pid = {p.id: p for p in rows}
        for key, v in body.components.items():
            if v and v in pid:
                by_cat[key[:-3] if key.endswith("_id") else key] = pid[v]

    cpu, gpu, case, cooler = (by_cat.get(k) for k in ("cpu", "gpu", "case", "cooler"))
    cs = (case.specs or {}) if case else {}
    gs = (gpu.specs or {}) if gpu else {}
    ks = (cooler.specs or {}) if cooler else {}
    cps = (cpu.specs or {}) if cpu else {}

    max_gpu = _num(cs.get("max_gpu_length_mm"))
    max_cooler = _num(cs.get("max_cooler_height_mm"))
    gpu_len = _num(gs.get("length_mm"))
    cooler_h = _num(ks.get("height_mm"))

    clearances: Dict[str, dict] = {}
    if max_gpu and gpu_len:
        rem = round(max_gpu - gpu_len, 1)
        clearances["gpu"] = {"remaining_mm": rem, "is_tight": 0 <= rem < TIGHT_MM}
    if max_cooler and cooler_h:
        rem = round(max_cooler - cooler_h, 1)
        clearances["cooler"] = {"remaining_mm": rem, "is_tight": 0 <= rem < TIGHT_MM}

    # ---- Airflow (zone-graph estimate, Phase 2: real intake/exhaust fans) ----
    cpu_w = _num(cps.get("tdp_w"))
    gpu_w = _num(gs.get("tdp_w"))
    total_w = cpu_w + gpu_w + PSU_OVERHEAD_W

    intake = _num(cs.get("intake_cfm"))
    exhaust = _num(cs.get("exhaust_cfm"))
    if intake <= 0 and exhaust <= 0:  # backward-compat with Phase-1 base_cfm
        intake = exhaust = _num(cs.get("base_cfm"))
    # Fresh cool air over the parts is the driver; exhaust helps evacuate heat.
    effective = intake + 0.5 * exhaust
    balance = intake - exhaust
    pressure = "positive" if balance > 30 else ("negative" if balance < -30 else "neutral")
    fans = {"intake": max(0, round(intake / 75)), "exhaust": max(0, round(exhaust / 75))}

    if effective > 0 and total_w > 0:
        score = int(max(0, min(100, round(100 * effective / (total_w * SCORE_K)))))
    else:
        score = 0
    if exhaust <= 0 and intake > 0:  # heat trap: no way out
        score = min(score, 40)

    zones = [
        {"zone": "intake_front", "type": "intake", "status": "ok" if intake > 0 else "dead_zone"},
        {"zone": "cpu_zone", "type": "internal", "status": _zone_status(effective, cpu_w, 1.4)},
        # front intake feeds the GPU directly in a modern front-to-back case
        {"zone": "gpu_zone", "type": "internal", "status": _zone_status(intake, gpu_w, 0.7)},
        {"zone": "exhaust_rear", "type": "exhaust", "status": "ok" if exhaust > 0 else "dead_zone"},
    ]

    # ---- Geometria paramétrica (volumetria + motor de vento composicional) ----
    # Vista lateral em mm: origem no canto frontal-inferior do interior;
    # x → traseira, y → cima. Tudo deriva dos dados: mounts do gabinete
    # (intake/exhaust, stock, o que aceitam), dimensões das peças (specs +
    # padrões de form factor) e composição de fluxo por mount ocupado.
    geometry = None
    interior_mm = cs.get("interior_mm")
    mounts_spec = cs.get("mounts")
    if isinstance(interior_mm, dict) and isinstance(mounts_spec, list) and mounts_spec:
        D = _num(interior_mm.get("depth"))
        H = _num(interior_mm.get("height"))
        mounts = [dict(m) for m in mounts_spec]

        cooler_type = str(ks.get("cooler_type") or "")
        is_aio = cooler_type.startswith("aio")
        rad_class = str(ks.get("rad_class") or "")
        rad_len = _num(ks.get("radiator_mm")) or (398.0 if "360" in cooler_type else 282.0)
        rad_th = cooler_h or 30.0  # p/ AIO, height_mm do catálogo = espessura do radiador
        FAN_TH = 25.0
        AIO_FAN_RAW = 56.0  # CFM nominal por fan de radiador
        RAD_PASS = 0.6      # fração que atravessa o radiador (resistência do core)

        # ocupação dos mounts
        rad_mount = None
        for m in mounts:
            m["occupied_by"] = "stock_fan" if m.get("stock") else None
            m["cfm"] = 0.0
        if is_aio:
            for m in mounts:
                acc = m.get("accepts") or []
                if m["occupied_by"] is None and (rad_class in acc or any(a.startswith("rad") for a in acc)):
                    if rad_class in acc or rad_class == "":
                        m["occupied_by"] = "aio_radiator"
                        rad_mount = m
                        break

        # CFM por mount: agregado do gabinete dividido pelos fans stock; AIO soma exaustão
        stock_in = [m for m in mounts if m["occupied_by"] == "stock_fan" and m["orient"] == "intake"]
        stock_out = [m for m in mounts if m["occupied_by"] == "stock_fan" and m["orient"] == "exhaust"]
        if stock_in and intake > 0:
            for m in stock_in:
                m["cfm"] = round(intake / len(stock_in), 1)
        if stock_out and exhaust > 0:
            for m in stock_out:
                m["cfm"] = round(exhaust / len(stock_out), 1)
        aio_fan_count = int(_num(ks.get("fan_count"))) or (3 if "360" in (rad_class + cooler_type) else 2)
        if rad_mount is not None:
            rad_mount["cfm"] = round(aio_fan_count * AIO_FAN_RAW * RAD_PASS, 1)

        # ---- colocações (mm; specs quando existem, senão padrão de form factor) ----
        placements: list[dict] = []
        SHROUD_H = 80.0
        mb = by_cat.get("motherboard")
        mbs = (mb.specs or {}) if mb else {}
        mb_ff = str(mbs.get("form_factor") or "ATX").lower()
        mobo_w, mobo_h = (244.0, 244.0) if mb_ff.startswith("m") else (244.0, 305.0)
        mobo_x1 = D - 12.0
        mobo = {"part": "motherboard", "x": mobo_x1 - mobo_w, "y": SHROUD_H + 8, "w": mobo_w, "h": mobo_h,
                "source": "form_factor_default"}
        placements.append(mobo)

        sock_cx = mobo["x"] + mobo_w - 150.0
        sock_cy = mobo["y"] + mobo_h - 90.0
        placements.append({"part": "cpu_socket", "x": sock_cx - 22, "y": sock_cy - 5, "w": 44.0, "h": 10.0,
                           "source": "form_factor_default"})

        if cooler is not None:
            if is_aio:
                placements.append({"part": "aio_pump", "x": sock_cx - 34, "y": sock_cy + 5, "w": 68.0, "h": 68.0,
                                   "source": "form_factor_default"})
                if rad_mount is not None:
                    rx = _num(rad_mount["x"]) + max(0.0, (_num(rad_mount["w"]) - rad_len) / 2)
                    # radiador encostado no teto; fila de fans logo abaixo —
                    # o stack (rad+fan) invade o interior: é o tradeoff da build
                    placements.append({"part": "aio_radiator", "x": rx, "y": H - rad_th, "w": rad_len, "h": rad_th,
                                       "source": "spec"})
                    placements.append({"part": "aio_fans", "x": rx, "y": H - rad_th - FAN_TH, "w": rad_len,
                                       "h": FAN_TH, "fan_count": aio_fan_count, "source": "form_factor_default"})
            else:
                body_w = _num(ks.get("body_w_mm")) or 90.0
                placements.append({"part": "air_cooler", "x": sock_cx - body_w / 2, "y": sock_cy + 5,
                                   "w": body_w, "h": cooler_h or 80.0,
                                   "source": "spec" if cooler_h else "form_factor_default"})

        placements.append({"part": "ram", "x": sock_cx + 58, "y": sock_cy + 5, "w": 26.0, "h": 45.0,
                           "sticks": 2, "source": "form_factor_default"})

        gpu_slot_y = mobo["y"] + mobo_h - 200.0
        if gpu is not None and gpu_len:
            placements.append({"part": "gpu", "x": mobo_x1 - 8 - gpu_len, "y": gpu_slot_y - 55.0,
                               "w": gpu_len, "h": 55.0, "source": "spec"})
        placements.append({"part": "m2_ssd", "x": sock_cx - 60, "y": gpu_slot_y + 18, "w": 80.0, "h": 9.0,
                           "source": "form_factor_default"})
        placements.append({"part": "psu", "x": D - 165.0, "y": 6.0, "w": 150.0, "h": 86.0,
                           "source": "form_factor_default"})
        for m in mounts:
            if m["occupied_by"] == "stock_fan":
                if m["orient"] == "intake":
                    placements.append({"part": "case_fan", "x": _num(m["x"]), "y": _num(m["y"]),
                                       "w": FAN_TH, "h": _num(m["h"]), "mount": m["id"], "source": "spec"})
                else:
                    placements.append({"part": "case_fan", "x": _num(m["x"]), "y": _num(m["y"]),
                                       "w": FAN_TH, "h": _num(m["h"]), "mount": m["id"], "source": "spec"})

        # ---- fluxos: cada fonte (intake) alimenta cada dreno (exhaust) ----
        gpu_box = next((p for p in placements if p["part"] == "gpu"), None)
        cooler_box = next((p for p in placements if p["part"] in ("air_cooler", "aio_pump")), None)
        sources = [m for m in mounts if m["cfm"] > 0 and m["orient"] == "intake"]
        sinks = [m for m in mounts if m["cfm"] > 0 and m["orient"] == "exhaust"]
        tot_sink = sum(m["cfm"] for m in sinks) or 1.0
        flows: list[dict] = []
        for s_m in sources:
            s_cy = _num(s_m["y"]) + _num(s_m["h"]) / 2
            for k_m in sinks:
                is_top = _num(k_m["y"]) > H * 0.8 and _num(k_m["w"]) > _num(k_m["h"])
                raw = s_m["cfm"] * (k_m["cfm"] / tot_sink)
                res = 0.0
                heat: list[float] = []
                if gpu_box is not None:
                    gy0, gy1 = gpu_box["y"], gpu_box["y"] + gpu_box["h"]
                    k_cy = H if is_top else _num(k_m["y"]) + _num(k_m["h"]) / 2
                    lo, hi = min(s_cy, k_cy), max(s_cy, k_cy)
                    if lo < gy1 + 40 and hi > gy0 - 40:
                        res += 0.35
                        heat.append(round((gpu_box["x"] + gpu_box["w"] / 2) / D, 2))
                if cooler_box is not None and (is_top or s_cy > H * 0.35):
                    res += 0.2
                    heat.append(round((cooler_box["x"] + cooler_box["w"] / 2) / D, 2))
                eff = raw * (1 - min(0.5, res * 0.6))
                flows.append({
                    "from": {"x": _num(s_m["x"]) + _num(s_m["w"]), "y": s_cy, "h": _num(s_m["h"])},
                    "to": ({"x": _num(k_m["x"]), "y": H, "w": _num(k_m["w"]), "side": "top"}
                           if is_top else
                           {"x": _num(k_m["x"]), "y": _num(k_m["y"]) + _num(k_m["h"]) / 2, "h": _num(k_m["h"]),
                            "side": "rear"}),
                    "cfm": round(eff, 1),
                    "heat_at": sorted(set(heat)) or [0.55],
                })
        max_flow = max((f["cfm"] for f in flows), default=0.0) or 1.0
        for f in flows:
            f["intensity"] = round(f["cfm"] / max_flow, 2)

        geometry = {
            "unit": "mm",
            "note": "estimativa dimensional — ficha técnica aproximada + padrões de form factor",
            "case": {"depth_mm": D, "height_mm": H, "shroud_h_mm": SHROUD_H},
            "mounts": mounts,
            "placements": placements,
            "flows": flows,
        }

    return {
        "method": "zone_graph_estimate",
        "case": {
            "name": case.name if case else None,
            "form_factor": cs.get("form_factor"),
            "airflow_class": cs.get("airflow_class"),
            "max_gpu_length_mm": max_gpu or None,
            "max_cooler_height_mm": max_cooler or None,
        },
        "parts": {
            "cpu": {"name": cpu.name if cpu else None, "tdp_w": cpu_w},
            "gpu": {"name": gpu.name if gpu else None, "length_mm": gpu_len, "tdp_w": gpu_w},
            "cooler": {"name": cooler.name if cooler else None, "height_mm": cooler_h},
        },
        "clearances": clearances,
        "airflow": {
            "score": score,
            "pressure_balance": pressure,
            "cfm": round(effective),
            "intake_cfm": intake,
            "exhaust_cfm": exhaust,
            "fans": fans,
            "heat": {"cpu_w": cpu_w, "gpu_w": gpu_w, "total_w": total_w},
            "zones": zones,
        },
        "geometry": geometry,
    }
