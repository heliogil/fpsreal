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


def _passes(op: str, a: Any, b: Any) -> Optional[bool]:
    """True/False if comparable, None if the data can't support a verdict.

    None must never be treated as "ok" — a missing or non-coercible value
    means we don't know, not that the build is fine. Callers surface this as
    a distinct "unknown" status instead of silently passing.
    """
    if a is None or b is None:
        return None
    if op == "equals":
        return str(a) == str(b)
    if op == "in":
        return a in b if isinstance(b, (list, tuple)) else None
    if op == "not_in":
        return a not in b if isinstance(b, (list, tuple)) else None
    na, nb = _num(a), _num(b)
    if na is None or nb is None:
        return None  # non-numeric where a number was expected → can't compare
    if op == "gte":
        return na >= nb
    if op == "lte":
        return na <= nb
    return None


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
        "cooler_socket_match": "cooler monta",
        "mobo_case_form_factor": "placa cabe",
        "psu_case_fit": "fonte cabe",
    }

    rules = (
        await db.execute(select(CompatibilityRule).where(CompatibilityRule.is_active.is_(True)))
    ).scalars().all()
    for r in rules:
        pa, pb = by_cat.get(r.category_a), by_cat.get(r.category_b)
        if pa is None or pb is None:
            continue  # component not picked yet — nothing to check, not a data gap
        a_val = (pa.specs or {}).get(r.attribute_a)
        b_val = (pb.specs or {}).get(r.attribute_b)
        result = _passes(r.operator, a_val, b_val)
        if result is None:
            missing = [
                f"{pa.name}: {r.attribute_a}" if a_val is None else None,
                f"{pb.name}: {r.attribute_b}" if b_val is None else None,
            ]
            missing = [m for m in missing if m]
            checks.append({
                "a": r.category_a, "b": r.category_b,
                "label": rule_label.get(r.rule_type, r.rule_type),
                "status": "unknown",
                "message": (
                    f"Não foi possível verificar — falta dado ({', '.join(missing)})."
                    if missing else "Não foi possível verificar — dado em formato inesperado."
                ),
            })
            continue
        ok = result
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
            # T-07/Sprint 4: usa a medição da Noctua quando ela existe pra esse
            # gabinete, em vez da ficha do fabricante — dado melhor, não só rótulo.
            src = cspecs.get("cooler_height_source") or "ficha"
            measured = _num(cspecs.get("max_cooler_height_measured_mm"))
            rem = measured if (src == "medido_noctua" and measured is not None) else _num(cspecs.get("max_cooler_height_mm"))
            chgt = _num((cooler.specs or {}).get("height_mm"))
            if rem is not None and chgt is not None:
                remaining = round(rem - chgt, 1)
                clearances["cooler"] = {"remaining_mm": remaining, "is_tight": 0 <= remaining < TIGHT_MM, "source": src}

    # PSU headroom (computed): < 1.0x total = pode desligar sob pico → erro;
    # 1.0x–1.25x = liga, mas sem folga para transientes de GPU → aviso; ≥1.25x = ok.
    psu = by_cat.get("psu")
    if psu:
        watts = _num((psu.specs or {}).get("watts"))
        total = 0.0
        missing_tdp: list[str] = []
        for cat in ("cpu", "gpu"):
            p = by_cat.get(cat)
            if p:
                tdp = _num((p.specs or {}).get("tdp_w"))
                if tdp is None:
                    missing_tdp.append(p.name)
                else:
                    total += tdp
        total += 100.0  # board + drives + fans overhead

        if watts is None:
            checks.append({
                "a": "psu", "b": "system", "label": "potência",
                "status": "unknown",
                "message": f"{psu.name} não informa wattagem — não dá para verificar a margem.",
            })
        elif missing_tdp:
            checks.append({
                "a": "psu", "b": "system", "label": "potência",
                "status": "unknown",
                "message": f"Falta TDP de: {', '.join(missing_tdp)} — não dá para estimar o consumo total.",
            })
        else:
            ratio = watts / total
            severity = "error" if ratio < 1.0 else ("warning" if ratio < 1.25 else "ok")
            msg = None
            if severity != "ok":
                verb = "não aguenta com folga" if severity == "error" else "tem margem apertada para"
                msg = (
                    f"A fonte {psu.name} ({int(watts)}W) {verb} ~{int(total)}W de consumo estimado. "
                    f"Recomendado ≥ {int(total * 1.25)}W."
                )
                (errors if severity == "error" else warnings).append(msg)
            checks.append({
                "a": "psu", "b": "system", "label": "potência",
                "status": severity,
                "message": (f"{int(watts)}W p/ ~{int(total)}W (recomendado ≥{int(total * 1.25)}W)" if severity != "ok" else None),
            })

    # RAM × folga do cooler (T-13): só coolers-torre têm esse problema. AIO e o
    # cooler stock (top-down, centrado no socket) não avançam sobre o slot de
    # RAM — tratados como "ok" por construção, não "unknown" (não é falta de
    # dado, é a checagem não se aplicar a esse tipo de cooler).
    ram = by_cat.get("ram")
    cooler = by_cat.get("cooler")
    if ram and cooler:
        cspecs = cooler.specs or {}
        ctype = str(cspecs.get("cooler_type") or "")
        if ctype.startswith("aio") or ctype == "stock":
            checks.append({
                "a": "ram", "b": "cooler", "label": "folga de RAM",
                "status": "ok", "message": None,
            })
        else:
            rh = _num((ram.specs or {}).get("height_mm"))
            rc = _num(cspecs.get("ram_clearance_mm"))
            if rh is None or rc is None:
                missing = [
                    f"{ram.name}: height_mm" if rh is None else None,
                    f"{cooler.name}: ram_clearance_mm" if rc is None else None,
                ]
                checks.append({
                    "a": "ram", "b": "cooler", "label": "folga de RAM",
                    "status": "unknown",
                    "message": f"Não foi possível verificar — falta dado ({', '.join(m for m in missing if m)}).",
                })
            else:
                ok = rh <= rc
                msg = None if ok else (
                    f"A {ram.name} tem {rh:g}mm de altura; o cooler {cooler.name} só dá {rc:g}mm de folga sob a torre."
                )
                if not ok:
                    errors.append(msg)
                checks.append({
                    "a": "ram", "b": "cooler", "label": "folga de RAM",
                    "status": "ok" if ok else "error", "message": msg,
                })

    # Radiador do AIO × mounts do gabinete (T-13): usa case.mounts[].accepts,
    # não geometria fina — é o que o roadmap pediu (regra de ouro: checagem
    # calculada porque precisa iterar uma lista, não cabe em comparação binária).
    if cooler and case:
        cspecs = cooler.specs or {}
        ctype = str(cspecs.get("cooler_type") or "")
        if ctype.startswith("aio"):
            rad_class = cspecs.get("rad_class")
            mounts = (case.specs or {}).get("mounts")
            if rad_class is None or not isinstance(mounts, list):
                checks.append({
                    "a": "cooler", "b": "case", "label": "radiador cabe",
                    "status": "unknown",
                    "message": "Não foi possível verificar — falta rad_class ou mapa de mounts do gabinete.",
                })
            else:
                fits = any(rad_class in (m.get("accepts") or []) for m in mounts)
                msg = None if fits else (
                    f"O radiador {rad_class} do {cooler.name} não cabe em nenhum mount do {case.name}."
                )
                if not fits:
                    errors.append(msg)
                checks.append({
                    "a": "cooler", "b": "case", "label": "radiador cabe",
                    "status": "ok" if fits else "error", "message": msg,
                })

    # Conector de força da GPU × fonte (T-13): não é comparação binária —
    # 12vhpwr nativo é ideal, sem nativo mas com 8-pin suficiente pra adaptador
    # é aviso (funciona, não é o ideal), sem conectores suficientes é erro.
    gpu = by_cat.get("gpu")
    if gpu and psu:
        conn = (gpu.specs or {}).get("power_connector")
        pspecs = psu.specs or {}
        p8 = pspecs.get("pcie_8pin_count")
        has_12v = pspecs.get("has_12vhpwr")
        needed = {"8pin": 1, "8x2": 2, "8x3": 3}.get(conn) if conn not in (None, "none", "12vhpwr") else None
        if conn is None or (conn not in ("none", "12vhpwr") and needed is None):
            checks.append({
                "a": "gpu", "b": "psu", "label": "conector de força",
                "status": "unknown",
                "message": f"Não foi possível verificar — falta power_connector em {gpu.name}.",
            })
        elif conn == "none":
            checks.append({"a": "gpu", "b": "psu", "label": "conector de força", "status": "ok", "message": None})
        elif p8 is None or has_12v is None:
            checks.append({
                "a": "gpu", "b": "psu", "label": "conector de força",
                "status": "unknown",
                "message": f"Não foi possível verificar — falta dado de conectores em {psu.name}.",
            })
        elif conn == "12vhpwr":
            if has_12v:
                checks.append({"a": "gpu", "b": "psu", "label": "conector de força", "status": "ok", "message": None})
            elif _num(p8) is not None and _num(p8) >= 2:
                msg = (f"{psu.name} não tem 12V-2x6/12VHPWR nativo — precisa do adaptador que acompanha "
                       f"a {gpu.name} (ou comprado à parte) usando 2+ conectores 8-pin.")
                warnings.append(msg)
                checks.append({"a": "gpu", "b": "psu", "label": "conector de força", "status": "warning", "message": msg})
            else:
                msg = f"{psu.name} não tem 12V-2x6/12VHPWR nem conectores 8-pin suficientes para adaptar a {gpu.name}."
                errors.append(msg)
                checks.append({"a": "gpu", "b": "psu", "label": "conector de força", "status": "error", "message": msg})
        else:
            np8 = _num(p8)
            ok = np8 is not None and np8 >= needed
            msg = None if ok else f"A {gpu.name} precisa de {needed}x conector 8-pin; {psu.name} só tem {int(np8 or 0)}."
            if not ok:
                errors.append(msg)
            checks.append({"a": "gpu", "b": "psu", "label": "conector de força", "status": "ok" if ok else "error", "message": msg})

    return {"errors": errors, "warnings": warnings, "clearances": clearances, "checks": checks, "airflow": []}
