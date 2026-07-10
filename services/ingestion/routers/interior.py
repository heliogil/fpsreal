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
    }
