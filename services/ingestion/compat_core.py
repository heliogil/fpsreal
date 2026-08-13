"""Compatibility evaluation — single source of truth.

Usado por `/compatibility/check` (compatibility.py, relatório completo de uma
build já montada) E pelo wizard (wizard.py, que valida cada peça ANTES de
oferecê-la). As duas leituras tinham lógicas independentes até 2026-08-12 —
o wizard nunca sabia que um cooler AMD não monta num CPU Intel, por exemplo,
porque tinha seu próprio filtro simplificado que nunca foi tocado pelos
sprints de compatibilidade. Essa duplicação é exatamente o que causou aquele
bug: **nunca mais** escrever uma regra/checagem em dois lugares. Tudo que
compara duas peças entra aqui, uma vez, e os dois chamadores reusam.

`evaluate()` devolve o mesmo formato que o endpoint sempre devolveu
(`errors`, `warnings`, `clearances`, `checks`) — quem quiser só saber "essa
combinação é válida?" olha `len(resultado["errors"]) == 0` (avisos não
bloqueiam, nem aqui nem na tela de detalhe da build).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol

TIGHT_MM = 15.0

RULE_LABEL = {
    "socket_match": "soquete",
    "ram_type_match": "tipo de RAM",
    "gpu_case_clearance": "GPU cabe",
    "cooler_case_clearance": "cooler cabe",
    "cooler_tdp_headroom": "cooler dá conta",
    "cooler_socket_match": "cooler monta",
    "mobo_case_form_factor": "placa cabe",
    "psu_case_fit": "fonte cabe",
    "ram_speed_headroom": "velocidade da RAM",
}


@dataclass(frozen=True)
class Part:
    """Forma mínima que o núcleo precisa — desacoplada do ORM e dos dicts do wizard."""
    name: str
    specs: dict


class RuleLike(Protocol):
    rule_type: str
    category_a: str
    attribute_a: str
    operator: str
    category_b: str
    attribute_b: str
    severity: str
    message_template: Optional[str]


def _num(v: Any) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _passes(op: str, a: Any, b: Any) -> Optional[bool]:
    """True/False se comparável, None se o dado não sustenta um veredito.

    None nunca deve virar "ok" — dado ausente ou não-coercível significa que
    não sabemos, não que a build está boa. Quem chama expõe isso como um
    status "unknown" distinto, nunca um passe silencioso.
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
        return None
    if op == "gte":
        return na >= nb
    if op == "lte":
        return na <= nb
    return None


def _fmt(template: Optional[str], a_p: Part, a_val: Any, b_p: Part, b_val: Any) -> str:
    if not template:
        return f"{a_p.name} incompatível com {b_p.name}"
    try:
        return template.format(a_name=a_p.name, a_val=a_val, b_name=b_p.name, b_val=b_val)
    except Exception:
        return f"{a_p.name} incompatível com {b_p.name}"


def evaluate(by_cat: Dict[str, Part], rules: List[RuleLike]) -> dict:
    """Roda as regras de tabela + as checagens calculadas contra `by_cat`.

    `by_cat` só precisa ter as categorias já escolhidas — checagens que
    dependem de uma categoria ausente são simplesmente puladas (componente
    ainda não escolhido, não é lacuna de dado). Devolve
    ``{errors, warnings, clearances, checks}`` — sem a chave ``airflow``,
    que é responsabilidade só do endpoint (não é comparação entre peças).
    """
    errors: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []

    for r in rules:
        pa, pb = by_cat.get(r.category_a), by_cat.get(r.category_b)
        if pa is None or pb is None:
            continue  # componente não escolhido ainda — nada a checar
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
                "label": RULE_LABEL.get(r.rule_type, r.rule_type),
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
            "label": RULE_LABEL.get(r.rule_type, r.rule_type),
            "status": status, "message": msg,
        })

    # Folgas físicas (GPU / cooler vs gabinete)
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
            # T-07/Sprint 4: usa a medição da Noctua quando existe pra esse
            # gabinete, em vez da ficha do fabricante — dado melhor, não só rótulo.
            src = cspecs.get("cooler_height_source") or "ficha"
            measured = _num(cspecs.get("max_cooler_height_measured_mm"))
            rem = measured if (src == "medido_noctua" and measured is not None) else _num(cspecs.get("max_cooler_height_mm"))
            chgt = _num((cooler.specs or {}).get("height_mm"))
            if rem is not None and chgt is not None:
                remaining = round(rem - chgt, 1)
                clearances["cooler"] = {"remaining_mm": remaining, "is_tight": 0 <= remaining < TIGHT_MM, "source": src}

    # Margem da fonte (calculada): < 1.0x total = pode desligar sob pico → erro;
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
        total += 100.0  # placa + drives + fans

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

    # RAM × folga do cooler: só coolers-torre têm esse problema. AIO e o
    # cooler stock (top-down, centrado no socket) não avançam sobre o slot
    # de RAM — tratados como "ok" por construção, não "unknown" (a checagem
    # genuinamente não se aplica a esse tipo de cooler, não é falta de dado).
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

    # Radiador do AIO × mounts do gabinete: usa case.mounts[].accepts, não
    # geometria fina — checagem calculada porque precisa iterar uma lista,
    # não cabe em comparação binária.
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

    # Conector de força da GPU × fonte: não é comparação binária — 12vhpwr
    # nativo é ideal, sem nativo mas com 8-pin suficiente pra adaptador é
    # aviso (funciona, não é o ideal), sem conectores suficientes é erro.
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

    return {"errors": errors, "warnings": warnings, "clearances": clearances, "checks": checks}
