"""Compatibility check endpoint — price-independent build validation.

POST /compatibility/check  {"components": {"cpu_id": .., "gpu_id": .., ...}}

Evaluates the seeded ``compatibility_rules`` against the two products'
``specs`` JSONB, computes physical clearances (GPU/cooler vs case) and a PSU
headroom warning. Airflow scoring is a later sprint → returned empty for now
(honest: we don't claim an airflow verdict we haven't computed).

Response matches the web contract (``api.ts`` LiveCompatibilityRepo):
    { errors: string[], warnings: string[],
      clearances: { <slot>: {remaining_mm, is_tight} },
      airflow: BuildAirflowZoneState[] }
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import get_db
from models import CompatibilityRule, Product

router = APIRouter(tags=["compatibility"])

TIGHT_MM = 15.0  # remaining clearance below this is flagged "tight"


class CheckRequest(BaseModel):
    components: Dict[str, Optional[int]]


def _category_from_key(key: str) -> str:
    # "cpu_id" -> "cpu"
    return key[:-3] if key.endswith("_id") else key


def _num(v: Any) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _passes(op: str, a: Any, b: Any) -> bool:
    if op == "equals":
        return str(a) == str(b)
    if op == "in":
        return a in b if isinstance(b, (list, tuple)) else False
    if op == "not_in":
        return a not in b if isinstance(b, (list, tuple)) else True
    na, nb = _num(a), _num(b)
    if na is None or nb is None:
        return True  # can't compare → don't raise a false error
    if op == "gte":
        return na >= nb
    if op == "lte":
        return na <= nb
    return True


def _fmt(template: Optional[str], a_p: Product, a_val: Any, b_p: Product, b_val: Any) -> str:
    if not template:
        return f"{a_p.name} incompatível com {b_p.name}"
    try:
        return template.format(a_name=a_p.name, a_val=a_val, b_name=b_p.name, b_val=b_val)
    except Exception:
        return f"{a_p.name} incompatível com {b_p.name}"


@router.post("/check", response_model=None)
async def check_build(body: CheckRequest, db: AsyncSession = Depends(get_db)):
    # Load selected products, keyed by category
    ids = [v for v in body.components.values() if v]
    by_cat: Dict[str, Product] = {}
    if ids:
        rows = (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars().all()
        prod_by_id = {p.id: p for p in rows}
        for key, pid in body.components.items():
            if pid and pid in prod_by_id:
                by_cat[_category_from_key(key)] = prod_by_id[pid]

    errors: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []  # structured, for the visual diagram

    rule_label = {
        "socket_match": "soquete",
        "ram_type_match": "tipo de RAM",
        "gpu_case_clearance": "GPU cabe",
        "cooler_case_clearance": "cooler cabe",
        "cooler_tdp_headroom": "cooler dá conta",
    }

    rules = (
        await db.execute(select(CompatibilityRule).where(CompatibilityRule.is_active.is_(True)))
    ).scalars().all()
    for r in rules:
        pa, pb = by_cat.get(r.category_a), by_cat.get(r.category_b)
        if pa is None or pb is None:
            continue
        a_val = (pa.specs or {}).get(r.attribute_a)
        b_val = (pb.specs or {}).get(r.attribute_b)
        if a_val is None or b_val is None:
            continue
        ok = _passes(r.operator, a_val, b_val)
        status = "ok" if ok else ("error" if r.severity == "error" else "warning")
        msg = None if ok else _fmt(r.message_template, pa, a_val, pb, b_val)
        if not ok:
            (errors if r.severity == "error" else warnings).append(msg)
        checks.append({
            "a": r.category_a, "b": r.category_b,
            "label": rule_label.get(r.rule_type, r.rule_type),
            "status": status, "message": msg,
        })

    # Physical clearances (GPU / cooler vs case)
    clearances: Dict[str, dict] = {}
    case = by_cat.get("case")
    if case:
        cspecs = case.specs or {}
        gpu = by_cat.get("gpu")
        if gpu:
            rem = _num(cspecs.get("max_gpu_length_mm"))
            glen = _num((gpu.specs or {}).get("length_mm"))
            if rem is not None and glen is not None:
                remaining = round(rem - glen, 1)
                clearances["gpu"] = {"remaining_mm": remaining, "is_tight": 0 <= remaining < TIGHT_MM}
        cooler = by_cat.get("cooler")
        if cooler:
            rem = _num(cspecs.get("max_cooler_height_mm"))
            chgt = _num((cooler.specs or {}).get("height_mm"))
            if rem is not None and chgt is not None:
                remaining = round(rem - chgt, 1)
                clearances["cooler"] = {"remaining_mm": remaining, "is_tight": 0 <= remaining < TIGHT_MM}

    # PSU headroom (computed): recommend >= 1.25x total board power
    psu = by_cat.get("psu")
    if psu:
        watts = _num((psu.specs or {}).get("watts"))
        total = 0.0
        for cat in ("cpu", "gpu"):
            p = by_cat.get(cat)
            if p:
                total += _num((p.specs or {}).get("tdp_w")) or 0.0
        total += 100.0  # board + drives + fans overhead
        if watts is not None and total > 0:
            tight = watts < total * 1.25
            if tight:
                warnings.append(
                    f"A fonte {psu.name} ({int(watts)}W) tem margem apertada para ~{int(total)}W de consumo. "
                    f"Recomendado ≥ {int(total * 1.25)}W."
                )
            checks.append({
                "a": "psu", "b": "system", "label": "potência",
                "status": "warning" if tight else "ok",
                "message": (f"{int(watts)}W p/ ~{int(total)}W (recomendado ≥{int(total * 1.25)}W)" if tight else None),
            })

    return {"errors": errors, "warnings": warnings, "clearances": clearances, "checks": checks, "airflow": []}
