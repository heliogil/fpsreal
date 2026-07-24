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

import json
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from airflow_field import solve_flow_field
from deps import get_db
from models import Product

router = APIRouter(tags=["interior"])

TIGHT_MM = 15.0
PSU_OVERHEAD_W = 60.0
# Tuning: a high-airflow case (~200 CFM) on a ~345 W build lands ~80 (healthy).
SCORE_K = 0.75


class InteriorRequest(BaseModel):
    components: Dict[str, Optional[int]]
    # Simulação "e se eu puser uma ventoinha aqui?": ids de mounts livres do
    # gabinete. O MOTOR é um só — o cliente não recalcula nada, só pede.
    what_if_fans: Optional[List[str]] = None


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# CFM nominal por classe de ventoinha (estimativa de catálogo, não medição).
FAN_CFM_BY_KIND = {"fan120": 55.0, "fan140": 70.0, "fan160": 80.0}


def _what_if_fan_cfm(mount: dict) -> float:
    """CFM de UMA ventoinha adicionada neste mount (estimativa)."""
    kind = str(mount.get("kind") or "")
    if kind in FAN_CFM_BY_KIND:
        return FAN_CFM_BY_KIND[kind]
    # baia genérica: do maior tamanho que a baia aceita
    accepts = [str(a) for a in (mount.get("accepts") or [])]
    for k in ("fan160", "fan140", "fan120"):
        if k in accepts:
            return FAN_CFM_BY_KIND[k]
    return FAN_CFM_BY_KIND["fan120"]


def _mount_fan_capacity(mount: dict) -> int:
    """Quantas ventoinhas cabem neste mount. Um bay de fan = 1; um rad_bay
    (ex.: 360) aceita várias — quantas cabem na largura."""
    kind = str(mount.get("kind") or "")
    if kind in FAN_CFM_BY_KIND:
        return 1
    w = _num(mount.get("w"))
    return max(1, int(w // 120)) if w else 1


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

    # ---- aparência por peça (ingestor de modelos) ---------------------------
    # SÓ descritores APROVADOS entram. Sem descritor, o campo não vem e o viewer
    # desenha pela variante de TIER — regressão zero por construção.
    visuals: Dict[str, dict] = {}
    if ids:
        _vr = (await db.execute(text(
            "SELECT v.category, v.descriptor, v.source, v.confidence "
            "FROM product_visuals v "
            "WHERE v.product_id = ANY(:ids) AND v.reviewed_at IS NOT NULL"
        ), {"ids": ids})).all()
        for _cat, _desc, _src, _conf in _vr:
            # JSONB via text() pode voltar como str (depende do codec asyncpg);
            # normaliza para dict — o viewer espera um objeto, nunca uma string.
            if isinstance(_desc, str):
                try:
                    _desc = json.loads(_desc)
                except (ValueError, TypeError):
                    continue
            visuals[str(_cat)] = {"descriptor": _desc, "source": _src,
                                  "confidence": float(_conf or 0)}

    cpu, gpu, case, cooler = (by_cat.get(k) for k in ("cpu", "gpu", "case", "cooler"))
    cs = (case.specs or {}) if case else {}
    gs = (gpu.specs or {}) if gpu else {}
    ks = (cooler.specs or {}) if cooler else {}
    cps = (cpu.specs or {}) if cpu else {}

    max_gpu = _num(cs.get("max_gpu_length_mm"))
    max_cooler = _num(cs.get("max_cooler_height_mm"))
    gpu_len = _num(gs.get("length_mm"))
    cooler_h = _num(ks.get("height_mm"))
    # espessura da GPU: dado real do catálogo (nº de slots × passo do slot).
    # A largura útil do gabinete é DERIVADA da altura máx. de cooler (o mesmo
    # vão bandeja→tampa). Ambos servem a folga lateral da GPU na vista superior.
    gpu_slots = _num(gs.get("slots"))
    gpu_thick = _num(gs.get("thickness_mm")) or (round(gpu_slots * 20.32) if gpu_slots else 0.0)
    case_width = max_cooler or 170.0

    clearances: Dict[str, dict] = {}
    if max_gpu and gpu_len:
        rem = round(max_gpu - gpu_len, 1)
        clearances["gpu"] = {"remaining_mm": rem, "is_tight": 0 <= rem < TIGHT_MM}
    if max_cooler and cooler_h:
        rem = round(max_cooler - cooler_h, 1)
        clearances["cooler"] = {"remaining_mm": rem, "is_tight": 0 <= rem < TIGHT_MM}
    # folga da GPU até à tampa lateral (a espessura come da largura útil) — é a
    # medida que só a vista superior mostra: placa 3.5-slot em gabinete estreito.
    if gpu_thick and case_width:
        rem = round(case_width - gpu_thick, 1)
        clearances["gpu_side"] = {"remaining_mm": rem, "is_tight": 0 <= rem < 12.0}

    # ---- Airflow (zone-graph estimate, Phase 2: real intake/exhaust fans) ----
    cpu_w = _num(cps.get("tdp_w"))
    gpu_w = _num(gs.get("tdp_w"))
    total_w = cpu_w + gpu_w + PSU_OVERHEAD_W

    intake = _num(cs.get("intake_cfm"))
    exhaust = _num(cs.get("exhaust_cfm"))
    if intake <= 0 and exhaust <= 0:  # backward-compat with Phase-1 base_cfm
        intake = exhaust = _num(cs.get("base_cfm"))
    # CFM base do gabinete (ventoinhas de fábrica) — guardado antes do what-if
    # porque a divisão por mount stock usa o valor de fábrica.
    base_intake, base_exhaust = intake, exhaust

    # ---- what-if: ventoinhas que o utilizador pediu para simular -------------
    # O contrato agora CONTA repetições: `["top_bay","top_bay"]` = 2 ventoinhas
    # naquele bay (empilhamento), limitado pela capacidade física do mount.
    _wi_counts: Dict[str, int] = {}
    for _i in (body.what_if_fans or []):
        _wi_counts[str(_i)] = _wi_counts.get(str(_i), 0) + 1
    what_if_ids = set(_wi_counts)
    wi_n: Dict[str, int] = {}           # nº efetivo (após cap) por mount
    wi_intake = wi_exhaust = 0.0
    wi_applied: List[str] = []
    _mounts_raw = cs.get("mounts")
    if _wi_counts and isinstance(_mounts_raw, list):
        for _m in _mounts_raw:
            mid = str(_m.get("id"))
            if mid in _wi_counts and not _m.get("stock"):
                n = min(_wi_counts[mid], _mount_fan_capacity(_m))
                add = _what_if_fan_cfm(_m) * n
                if str(_m.get("orient")) == "intake":
                    wi_intake += add
                else:
                    wi_exhaust += add
                wi_n[mid] = n
                wi_applied.append(mid)
    intake += wi_intake
    exhaust += wi_exhaust

    # ---- resistência do PAINEL FRONTAL --------------------------------------
    # Um frontal sólido restringe a entrada: a ventoinha empurra, mas o painel
    # estrangula. `airflow_class` já classifica isto (o mesmo dado que escolhe
    # mesh vs sólido no desenho) — agora ele MEXE no fluxo, não só na textura.
    # É a entrada EFETIVA (o que passa) que cai; o CFM nominal do fan é o mesmo.
    _aclass = str(cs.get("airflow_class") or "").lower()
    front_factor = 1.0 if _aclass == "high" else (0.9 if _aclass == "medium" else 0.8)
    intake_eff = intake * front_factor

    # Fresh cool air over the parts is the driver; exhaust helps evacuate heat.
    effective = intake_eff + 0.5 * exhaust
    balance = intake - exhaust
    pressure = "positive" if balance > 30 else ("negative" if balance < -30 else "neutral")
    fans = {"intake": max(0, round(intake / 75)), "exhaust": max(0, round(exhaust / 75))}

    if effective > 0 and total_w > 0:
        score = int(max(0, min(100, round(100 * effective / (total_w * SCORE_K)))))
    else:
        score = 0
    if exhaust <= 0 and intake > 0:  # heat trap: no way out
        score = min(score, 40)

    # ---- Obstrução da GPU sobre a PRÓPRIA zona (elo que faltava) -------------
    # A placa grossa (nº de slots) tapa a câmara inferior, e pior ainda colada
    # na tampa (gabinete estreito). Isto NÃO muda o CFM total do gabinete — ele
    # é o mesmo; muda a DISTRIBUIÇÃO: menos do ar de entrada atravessa a zona da
    # GPU. Por isso mexe no STATUS da gpu_zone (que a pessoa lê no chip) e dá um
    # hit modesto no score só quando a placa está de facto apertada.
    # Regra explicável de propósito: é estimativa, não CFD.
    gpu_thick_pen = min(1.0, gpu_thick / 71.0) if gpu_thick else 0.0
    _side = clearances.get("gpu_side")
    side_pen = 0.0
    if _side is not None:
        _rem = _side["remaining_mm"]
        side_pen = 1.0 if _rem < 8 else (max(0.0, (35.0 - _rem) / 35.0) if _rem < 35 else 0.0)
    # fração do ar de entrada que efetivamente passa pela zona da GPU
    gpu_flow_factor = max(0.5, 1.0 - 0.35 * gpu_thick_pen * (0.7 + 0.6 * side_pen))
    # hit no score: pesa sobretudo o aperto lateral (placa gorda em caixa larga
    # quase não penaliza; colada na tampa penaliza)
    if gpu_thick_pen > 0 and score > 0:
        score = int(round(score * (1.0 - 0.18 * gpu_thick_pen * (0.3 + 0.7 * side_pen))))

    zones = [
        {"zone": "intake_front", "type": "intake", "status": "ok" if intake > 0 else "dead_zone"},
        {"zone": "cpu_zone", "type": "internal", "status": _zone_status(effective, cpu_w, 1.4)},
        # front intake alimenta a GPU direto — o painel frontal restringe e a
        # placa grossa tapa parte do que passa
        {"zone": "gpu_zone", "type": "internal", "status": _zone_status(intake_eff * gpu_flow_factor, gpu_w, 0.7)},
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
            m["capacity"] = _mount_fan_capacity(m)  # quantas ventoinhas cabem
        if is_aio:
            for m in mounts:
                acc = m.get("accepts") or []
                if m["occupied_by"] is None and (rad_class in acc or any(a.startswith("rad") for a in acc)):
                    if rad_class in acc or rad_class == "":
                        m["occupied_by"] = "aio_radiator"
                        rad_mount = m
                        break
        # what-if: só ocupa o que continua livre depois do stock e do radiador
        for m in mounts:
            if m["occupied_by"] is None and str(m["id"]) in what_if_ids:
                m["occupied_by"] = "what_if_fan"

        # CFM por mount: agregado de FÁBRICA dividido pelos fans stock; a
        # ventoinha simulada leva o CFM dela própria; AIO soma exaustão.
        stock_in = [m for m in mounts if m["occupied_by"] == "stock_fan" and m["orient"] == "intake"]
        stock_out = [m for m in mounts if m["occupied_by"] == "stock_fan" and m["orient"] == "exhaust"]
        if stock_in and base_intake > 0:
            for m in stock_in:
                m["cfm"] = round(base_intake / len(stock_in), 1)
        if stock_out and base_exhaust > 0:
            for m in stock_out:
                m["cfm"] = round(base_exhaust / len(stock_out), 1)
        for m in mounts:
            if m["occupied_by"] == "what_if_fan":
                m["fan_count"] = wi_n.get(str(m["id"]), 1)
                m["cfm"] = round(_what_if_fan_cfm(m) * m["fan_count"], 1)
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
        mobo_y = SHROUD_H + 8
        mobo_h = min(mobo_h, H - mobo_y - 6)  # não estourar o teto em gabinetes baixos
        mobo = {"part": "motherboard", "x": mobo_x1 - mobo_w, "y": mobo_y, "w": mobo_w, "h": mobo_h,
                "source": "form_factor_default"}
        placements.append(mobo)

        board_top = mobo["y"] + mobo_h
        # socket da CPU: ~95 mm abaixo do topo do board, ~150 mm da traseira
        sock_cx = mobo["x"] + mobo_w - 150.0
        sock_cy = board_top - 95.0
        placements.append({"part": "cpu_socket", "x": sock_cx - 22, "y": sock_cy - 5, "w": 44.0, "h": 10.0,
                           "source": "form_factor_default"})

        if cooler is not None:
            if is_aio:
                # water block compacto, centrado no socket; fica ABAIXO do stack
                # do radiador p/ os tubos terem curso visível (sem sobrepor)
                PUMP = 60.0
                rad_stack_bottom = (H - rad_th - FAN_TH) if rad_mount is not None else H
                pump_y = min(sock_cy - PUMP / 2, rad_stack_bottom - 8 - PUMP)
                pump_y = max(pump_y, SHROUD_H + 8)
                placements.append({"part": "aio_pump", "x": sock_cx - PUMP / 2, "y": pump_y,
                                   "w": PUMP, "h": PUMP, "source": "form_factor_default"})
                if rad_mount is not None:
                    rx = _num(rad_mount["x"]) + max(0.0, (_num(rad_mount["w"]) - rad_len) / 2)
                    # radiador encostado no teto; fila de fans logo abaixo —
                    # o stack (rad+fan) invade o interior: é o tradeoff da build
                    placements.append({"part": "aio_radiator", "x": rx, "y": H - rad_th, "w": rad_len, "h": rad_th,
                                       "source": "spec"})
                    placements.append({"part": "aio_fans", "x": rx, "y": H - rad_th - FAN_TH, "w": rad_len,
                                       "h": FAN_TH, "fan_count": aio_fan_count, "source": "form_factor_default"})
            else:
                # ATENÇÃO (fidelidade): `height_mm` do catálogo é a folga
                # PERPENDICULAR à placa (bandeja→tampa) — NÃO é a altura do
                # corpo nesta vista lateral. Usá-la aqui fazia a torre furar o
                # teto. A altura de DESENHO vem do corpo (torre ≈ tão alta
                # quanto profunda); a medida de spec vive na vista superior.
                body_w = _num(ks.get("body_w_mm")) or 90.0
                is_low_profile = 0 < cooler_h < 100
                body_h = 55.0 if is_low_profile else max(110.0, min(body_w * 1.15, 150.0))
                # a torre é CENTRADA no socket (a CPU fica a meia altura do
                # bloco de aletas), e presa dentro do volume interior
                body_y = sock_cy - body_h / 2
                body_y = max(SHROUD_H + 8, min(body_y, H - body_h - 8))
                placements.append({"part": "air_cooler", "x": sock_cx - body_w / 2, "y": body_y,
                                   "w": body_w, "h": body_h,
                                   "source": "spec" if cooler_h else "form_factor_default"})

        placements.append({"part": "ram", "x": sock_cx + 58, "y": sock_cy + 5, "w": 26.0, "h": 45.0,
                           "sticks": 2, "source": "form_factor_default"})

        gpu_slot_y = board_top - 205.0  # slot PCIe do topo, abaixo do socket
        if gpu is not None and gpu_len:
            gpu_x = max(4.0, mobo_x1 - 8 - gpu_len)  # não escapar pela frente do desenho
            placements.append({"part": "gpu", "x": gpu_x, "y": gpu_slot_y - 55.0,
                               "w": gpu_len, "h": 55.0, "source": "spec"})
        placements.append({"part": "m2_ssd", "x": sock_cx - 60, "y": gpu_slot_y + 18, "w": 80.0, "h": 9.0,
                           "source": "form_factor_default"})
        placements.append({"part": "psu", "x": D - 165.0, "y": 6.0, "w": 150.0, "h": 86.0,
                           "source": "form_factor_default"})
        for m in mounts:
            # ventoinha desenhada: a de fábrica e também a SIMULADA (what-if),
            # marcada com `simulated` p/ o viewer a distinguir visualmente.
            if m["occupied_by"] in ("stock_fan", "what_if_fan"):
                _wide = _num(m["w"]) > _num(m["h"])   # baia horizontal (topo) vs parede
                placements.append({"part": "case_fan",
                                   "x": _num(m["x"]), "y": _num(m["y"]),
                                   "w": (_num(m["w"]) if _wide else FAN_TH),
                                   "h": (FAN_TH if _wide else _num(m["h"])),
                                   "mount": m["id"], "wide": _wide,
                                   "simulated": m["occupied_by"] == "what_if_fan",
                                   "fan_count": int(m.get("fan_count") or 1),
                                   "source": "spec"})

        # ---- fluxos: cada fonte (intake) alimenta cada dreno (exhaust) ----
        # Motor CONSCIENTE DE OBSTRUÇÃO: cada caminho perde vazão para o que
        # fisicamente o atravessa. Já não é um fator fixo — a resistência da GPU
        # escala com a ESPESSURA (nº de slots) e um radiador no topo restringe a
        # saída superior (o ar tem de passar pelo core). Cada fluxo devolve a
        # lista do que o obstrui, para o viewer e o diagnóstico poderem explicar.
        gpu_box = next((p for p in placements if p["part"] == "gpu"), None)
        cooler_box = next((p for p in placements if p["part"] in ("air_cooler", "aio_pump")), None)
        # 2-slot (~41mm) mal estorva; 3.5-slot (~71mm) afoga a câmara inferior.
        gpu_res = round(0.18 + 0.5 * min(1.0, gpu_thick / 71.0), 2) if gpu_thick else 0.3
        rad_in_top = any(m.get("occupied_by") == "aio_radiator" for m in mounts)
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
                obstr: list[dict] = []
                if gpu_box is not None:
                    gy0, gy1 = gpu_box["y"], gpu_box["y"] + gpu_box["h"]
                    k_cy = H if is_top else _num(k_m["y"]) + _num(k_m["h"]) / 2
                    lo, hi = min(s_cy, k_cy), max(s_cy, k_cy)
                    if lo < gy1 + 40 and hi > gy0 - 40:
                        res += gpu_res
                        obstr.append({"part": "gpu", "factor": gpu_res})
                        heat.append(round((gpu_box["x"] + gpu_box["w"] / 2) / D, 2))
                if cooler_box is not None and (is_top or s_cy > H * 0.35):
                    res += 0.2
                    obstr.append({"part": cooler_box["part"], "factor": 0.2})
                    heat.append(round((cooler_box["x"] + cooler_box["w"] / 2) / D, 2))
                if is_top and rad_in_top:
                    res += 0.25
                    obstr.append({"part": "aio_radiator", "factor": 0.25})
                eff = raw * (1 - min(0.6, res * 0.6))
                flows.append({
                    "from": {"x": _num(s_m["x"]) + _num(s_m["w"]), "y": s_cy, "h": _num(s_m["h"])},
                    "to": ({"x": _num(k_m["x"]), "y": H, "w": _num(k_m["w"]), "side": "top"}
                           if is_top else
                           {"x": _num(k_m["x"]), "y": _num(k_m["y"]) + _num(k_m["h"]) / 2, "h": _num(k_m["h"]),
                            "side": "rear"}),
                    "cfm": round(eff, 1),
                    "heat_at": sorted(set(heat)) or [0.55],
                    "obstructions": obstr,
                })
        max_flow = max((f["cfm"] for f in flows), default=0.0) or 1.0
        for f in flows:
            f["intensity"] = round(f["cfm"] / max_flow, 2)

        # ---- campo de fluxo por potencial sobre o mapa REAL de obstáculos ----
        # Substitui as béziers heurísticas: as linhas contornam as peças porque
        # a condição de fluxo-nulo na parede da peça as torna tangentes a ela.
        # A PLACA-MÃE não entra — é o plano de fundo desta vista, não obstrui;
        # tratá-la como sólida muraria o interior inteiro.
        _SOLID = {"gpu", "air_cooler", "aio_pump", "aio_radiator", "aio_fans",
                  "ram", "psu"}
        _obst = [{"x": p["x"], "y": p["y"], "w": p["w"], "h": p["h"]}
                 for p in placements if p["part"] in _SOLID]
        _open = lambda m: {"x": _num(m["x"]), "y": _num(m["y"]),
                           "w": _num(m["w"]), "h": _num(m["h"]), "cfm": m["cfm"]}
        _heat = []
        if gpu_box is not None and gpu_w > 0:
            _heat.append({"x": gpu_box["x"], "y": gpu_box["y"], "w": gpu_box["w"],
                          "h": gpu_box["h"], "watts": gpu_w})
        if cooler_box is not None and cpu_w > 0:
            _heat.append({"x": cooler_box["x"], "y": cooler_box["y"],
                          "w": cooler_box["w"], "h": cooler_box["h"], "watts": cpu_w})
        try:
            flow_field = solve_flow_field(
                D, H, SHROUD_H, _obst,
                [_open(m) for m in sources], [_open(m) for m in sinks], _heat)
        except Exception:   # o campo é enriquecimento visual: nunca derruba a estimativa
            flow_field = None

        geometry = {
            "unit": "mm",
            "note": "estimativa dimensional — ficha técnica aproximada + padrões de form factor",
            # width_mm é DERIVADO: a altura máx. de cooler é, por definição, o
            # vão útil da bandeja da placa até à tampa lateral. Serve a vista
            # superior — onde a altura do cooler é a dimensão que está no plano.
            "case": {"depth_mm": D, "height_mm": H, "shroud_h_mm": SHROUD_H,
                     "width_mm": (max_cooler if max_cooler > 0 else 170.0),
                     "width_is_derived": True},
            "mounts": mounts,
            "placements": placements,
            "flows": flows,
            # campo resolvido (estimativa): linhas de corrente reais + térmico
            "flow_field": flow_field,
        }

    # ---- diagnóstico: QUAL é o gargalo? -------------------------------------
    # O score sozinho é um número; isto diz o que o está a segurar, com os
    # números que sustentam a afirmação. A UI compõe a frase — daqui sai só
    # estrutura, para o texto/idioma viver na camada de apresentação.
    # A regra é simples e explicável DE PROPÓSITO: isto é uma estimativa, e um
    # diagnóstico que não se consegue explicar não serve para decidir compra.
    worst_zone = (next((z["zone"] for z in zones if z["status"] == "critical"), None)
                  or next((z["zone"] for z in zones if z["status"] == "tight"), None))
    gpu_zone_status = next((z["status"] for z in zones if z["zone"] == "gpu_zone"), "ok")
    # a GPU é a CAUSA quando a placa grossa estrangula a própria zona e o resto
    # do gabinete está razoável (fans não são o problema — a placa é)
    gpu_is_cause = (gpu_flow_factor < 0.82 and gpu_zone_status in ("critical", "tight")
                    and intake > 0 and exhaust > 0)

    if intake <= 0:
        diag_code, need_orient = "no_intake", "intake"
    elif exhaust <= 0:
        diag_code, need_orient = "no_exhaust", "exhaust"   # armadilha de calor
    elif score >= 70:
        diag_code, need_orient = "ok", None
    elif exhaust < intake * 0.6:
        diag_code, need_orient = "exhaust_limited", "exhaust"
    elif intake < exhaust * 0.6:
        diag_code, need_orient = "intake_limited", "intake"
    elif gpu_is_cause:
        # fans equilibrados mas a placa grossa ainda estrangula a zona → a
        # placa É a causa (e o conselho honesto não é "mais uma ventoinha")
        diag_code, need_orient = "gpu_obstructed", "intake"
    else:
        diag_code, need_orient = "airflow_low", "intake"

    # sugestão acionável: um mount LIVRE do lado que falta — liga o diagnóstico
    # ao what-if, para o utilizador ver o problema e simular a solução no mesmo
    # sítio, sem ter de adivinhar onde pôr a ventoinha.
    suggest_mount = None
    if need_orient and geometry:
        suggest_mount = next(
            (m["id"] for m in geometry["mounts"]
             if m["occupied_by"] is None and m["orient"] == need_orient), None)
        if suggest_mount is None:  # sem vaga do lado ideal: qualquer uma ajuda
            suggest_mount = next(
                (m["id"] for m in geometry["mounts"] if m["occupied_by"] is None), None)

    # QUANTIFICA a sugestão: roda o what-if internamente e diz de quanto o fluxo
    # sobe — o CTA deixa de ser genérico ("simule") e passa a ter número
    # ("+1 ventoinha ≈ +8 no fluxo"). Mesmo motor, sem duplicar matemática.
    suggest_delta = None
    if suggest_mount and geometry:
        _sm = next((m for m in geometry["mounts"] if m["id"] == suggest_mount), None)
        if _sm is not None:
            _add = _what_if_fan_cfm(_sm)
            _ni = intake + (_add if _sm["orient"] == "intake" else 0.0)
            _ne = exhaust + (_add if _sm["orient"] == "exhaust" else 0.0)
            _eff = _ni * front_factor + 0.5 * _ne
            _ns = int(max(0, min(100, round(100 * _eff / (total_w * SCORE_K))))) if total_w > 0 else 0
            if gpu_thick_pen > 0 and _ns > 0:
                _ns = int(round(_ns * (1.0 - 0.18 * gpu_thick_pen * (0.3 + 0.7 * side_pen))))
            if _ne <= 0 and _ni > 0:
                _ns = min(_ns, 40)
            suggest_delta = _ns - score

    return {
        "method": "zone_graph_estimate",
        "diagnosis": {
            "code": diag_code,
            "worst_zone": worst_zone,
            "intake_cfm": round(intake, 1),
            "exhaust_cfm": round(exhaust, 1),
            "total_w": round(total_w),
            "suggest_mount": suggest_mount,
            "suggest_orient": need_orient,
            "suggest_delta": suggest_delta,
            "gpu_slots": gpu_slots or None,
        },
        "case": {
            "name": case.name if case else None,
            "form_factor": cs.get("form_factor"),
            "airflow_class": cs.get("airflow_class"),
            "max_gpu_length_mm": max_gpu or None,
            "max_cooler_height_mm": max_cooler or None,
        },
        "parts": {
            "cpu": {"name": cpu.name if cpu else None, "tdp_w": cpu_w},
            "gpu": {"name": gpu.name if gpu else None, "length_mm": gpu_len, "tdp_w": gpu_w,
                    "slots": gpu_slots or None, "thickness_mm": gpu_thick or None},
            "cooler": {"name": cooler.name if cooler else None, "height_mm": cooler_h},
        },
        "visuals": visuals,
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
        # Eco do what-if: a UI rotula "simulado" e mostra o delta vs fábrica.
        "what_if": {
            "fans": sorted(wi_applied),
            "counts": wi_n,                       # nº por mount (empilhamento)
            "added_intake_cfm": round(wi_intake, 1),
            "added_exhaust_cfm": round(wi_exhaust, 1),
            "base_intake_cfm": base_intake,
            "base_exhaust_cfm": base_exhaust,
        },
        "geometry": geometry,
    }
