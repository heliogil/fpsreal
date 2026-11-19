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

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from airflow_field import solve_flow_field
from case_mounts import (FAN_CFM_BY_KIND, fan_capacity as _mount_fan_capacity,  # noqa: F401
                         normalize_mounts, stock_cfm, what_if_fan_cfm as _what_if_fan_cfm)
from gltf_builder import build_gltf
from deps import get_db
from models import Product

router = APIRouter(tags=["interior"])

TIGHT_MM = 15.0
PSU_OVERHEAD_W = 60.0
# Tuning: a high-airflow case (~200 CFM) on a ~345 W build lands ~80 (healthy).
SCORE_K = 0.75
# Pressão muito positiva (2026-11-19): acima de POS_RATIO × a exaustão, a
# entrada a mais não varre calor na mesma medida — sobe a pressão interna e o ar
# sai pelas frestas/mesh sem passar pelas peças com a mesma força. O excedente
# conta EXCESS_WEIGHT. Regra explicável, NÃO medida: 3:1 fica acima de todos os
# gabinetes do catálogo com CFM agregado (o mais alto é 2,7:1), por isso só
# morde onde a soma por ventoinha dá entrada muito maior que a saída.
POS_RATIO = 3.0
EXCESS_WEIGHT = 0.5


def _useful_intake(intake_eff: float, exhaust: float) -> float:
    """Entrada que conta para o fluxo, com o excedente de pressão descontado."""
    if exhaust <= 0:
        return intake_eff          # armadilha de calor: o teto de 40 trata disso
    cap = POS_RATIO * exhaust
    return intake_eff if intake_eff <= cap else cap + EXCESS_WEIGHT * (intake_eff - cap)


def _airflow_score(intake_eff: float, exhaust: float, total_w: float,
                   gpu_thick_pen: float, side_pen: float) -> int:
    """Score 0–100 — o MESMO cálculo para a build e para a simulação sugerida."""
    effective = _useful_intake(intake_eff, exhaust) + 0.5 * exhaust
    if effective <= 0 or total_w <= 0:
        return 0
    score = int(max(0, min(100, round(100 * effective / (total_w * SCORE_K)))))
    if exhaust <= 0 and intake_eff > 0:  # heat trap: no way out
        score = min(score, 40)
    # hit da GPU grossa: pesa sobretudo o aperto lateral (placa gorda em caixa
    # larga quase não penaliza; colada na tampa penaliza)
    if gpu_thick_pen > 0 and score > 0:
        score = int(round(score * (1.0 - 0.18 * gpu_thick_pen * (0.3 + 0.7 * side_pen))))
    return score


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
    # T-07/Sprint 4: quando a Noctua mediu esse gabinete à mão (2/4 hoje), usa
    # o número medido em vez da ficha do fabricante — é dado melhor, não só
    # rótulo. `cooler_height_source` sempre existe (T-07 grava nos 4); o valor
    # medido só existe nos 2 confirmados.
    cooler_height_source = cs.get("cooler_height_source") or "ficha"
    max_cooler_measured = _num(cs.get("max_cooler_height_measured_mm"))
    max_cooler_effective = max_cooler_measured if (cooler_height_source == "medido_noctua" and max_cooler_measured) else max_cooler
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
    if max_cooler_effective and cooler_h:
        rem = round(max_cooler_effective - cooler_h, 1)
        clearances["cooler"] = {"remaining_mm": rem, "is_tight": 0 <= rem < TIGHT_MM,
                                 "source": cooler_height_source}
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

    # ---- mounts em 3D (case_mounts): face, posição na largura, nº de fans ----
    # O CFM de fábrica passa a ser a SOMA mount a mount quando o gabinete traz a
    # ficha de cada ventoinha; senão continua o agregado do catálogo dividido.
    _interior_mm = cs.get("interior_mm")
    _mounts_raw = cs.get("mounts")
    mounts_norm: List[dict] = []
    stock_per_mount: Dict[str, float] = {}
    cfm_method = {"intake": "agregado", "exhaust": "agregado"}
    if isinstance(_interior_mm, dict) and isinstance(_mounts_raw, list) and _mounts_raw:
        mounts_norm = normalize_mounts(_mounts_raw, _num(_interior_mm.get("depth")),
                                       _num(_interior_mm.get("height")), case_width)
        intake, exhaust, stock_per_mount, cfm_method = stock_cfm(mounts_norm, intake, exhaust)
    # entrada que NÃO passa pelo painel frontal (cobertura da fonte, lateral,
    # topo em entrada): a resistência do frontal não se aplica a ela
    intake_nonfront = sum(stock_per_mount.get(str(m["id"]), 0.0) for m in mounts_norm
                          if m.get("stock") and m.get("orient") == "intake" and m["face"] != "front")
    # CFM base do gabinete (ventoinhas de fábrica) — guardado antes do what-if
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
    if _wi_counts and mounts_norm:
        for _m in mounts_norm:
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
    intake_eff = (intake - intake_nonfront) * front_factor + intake_nonfront

    # Fresh cool air over the parts is the driver; exhaust helps evacuate heat.
    # A entrada útil desconta o excedente de pressão muito positiva.
    intake_useful = _useful_intake(intake_eff, exhaust)
    pressure_discount = round(intake_eff - intake_useful, 1)
    effective = intake_useful + 0.5 * exhaust
    balance = intake - exhaust
    pressure = "positive" if balance > 30 else ("negative" if balance < -30 else "neutral")
    fans = {"intake": max(0, round(intake / 75)), "exhaust": max(0, round(exhaust / 75))}

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
    score = _airflow_score(intake_eff, exhaust, total_w, gpu_thick_pen, side_pen)

    zones = [
        {"zone": "intake_front", "type": "intake", "status": "ok" if intake > 0 else "dead_zone"},
        {"zone": "cpu_zone", "type": "internal", "status": _zone_status(effective, cpu_w, 1.4)},
        # front intake alimenta a GPU direto — o painel frontal restringe e a
        # placa grossa tapa parte do que passa
        {"zone": "gpu_zone", "type": "internal", "status": _zone_status(intake_useful * gpu_flow_factor, gpu_w, 0.7)},
        {"zone": "exhaust_rear", "type": "exhaust", "status": "ok" if exhaust > 0 else "dead_zone"},
    ]

    # ---- Geometria paramétrica (volumetria + motor de vento composicional) ----
    # Vista lateral em mm: origem no canto frontal-inferior do interior;
    # x → traseira, y → cima. Tudo deriva dos dados: mounts do gabinete
    # (intake/exhaust, stock, o que aceitam), dimensões das peças (specs +
    # padrões de form factor) e composição de fluxo por mount ocupado.
    geometry = None
    if mounts_norm:
        D = _num(_interior_mm.get("depth"))
        H = _num(_interior_mm.get("height"))
        mounts = [dict(m) for m in mounts_norm]

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
        # what-if: só ocupa o que continua livre depois do stock e do radiador
        for m in mounts:
            if m["occupied_by"] is None and str(m["id"]) in what_if_ids:
                m["occupied_by"] = "what_if_fan"

        # CFM por mount: o de fábrica vem de stock_cfm (ficha por mount ou
        # agregado dividido); a ventoinha simulada leva o CFM dela própria; AIO
        # soma exaustão.
        for m in mounts:
            if m["occupied_by"] == "stock_fan":
                m["cfm"] = stock_per_mount.get(str(m["id"]), 0.0)
                m["fan_count"] = m["stock_fans"]
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
            # ATENÇÃO (fidelidade): a altura de desenho usa a espessura REAL
            # da placa (gpu_thick, já calculada dos slots/specs) em vez de um
            # 55.0 fixo — uma 3.5-slot desenha visivelmente mais grossa que
            # uma 2-slot. Clampada dinamicamente pro que cabe entre o slot
            # PCIe e o topo da PSU sem colidir — checado contra H=350/395/450
            # (case pequeno aperta mais: uma 4-slot em H=350 desenha só 43mm,
            # menos que a espessura real, mas nunca menos que 35mm nem invade
            # a PSU). 4mm de margem de segurança.
            gpu_max_h = max(20.0, gpu_slot_y - (6.0 + 86.0) - 4.0)  # 6.0+86.0 = topo da PSU
            gpu_draw_h = max(35.0, min(gpu_thick or 55.0, 85.0, gpu_max_h))
            placements.append({"part": "gpu", "x": gpu_x, "y": gpu_slot_y - gpu_draw_h,
                               "w": gpu_len, "h": gpu_draw_h, "source": "spec"})
        placements.append({"part": "m2_ssd", "x": sock_cx - 60, "y": gpu_slot_y + 18, "w": 80.0, "h": 9.0,
                           "source": "form_factor_default"})
        placements.append({"part": "psu", "x": D - 165.0, "y": 6.0, "w": 150.0, "h": 86.0,
                           "source": "form_factor_default"})
        for m in mounts:
            # ventoinha desenhada: a de fábrica e também a SIMULADA (what-if),
            # marcada com `simulated` p/ o viewer a distinguir visualmente.
            if m["occupied_by"] in ("stock_fan", "what_if_fan"):
                # deitada (topo / cobertura da fonte) vs em pé (frente / traseira)
                _wide = m["face"] in ("top", "bottom") or (m["face"] != "side" and _num(m["w"]) > _num(m["h"]))
                placements.append({"part": "case_fan", "face": m["face"], "orient": m["orient"],
                                   "z": m["z"], "d": m["d"],
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
            s_bottom = s_m["face"] == "bottom"
            for k_m in sinks:
                is_top = k_m["face"] == "top"
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
                    "from": ({"x": _num(s_m["x"]), "y": _num(s_m["y"]) + _num(s_m["h"]), "w": _num(s_m["w"]),
                              "h": _num(s_m["h"]), "side": "bottom"}
                             if s_bottom else
                             {"x": _num(s_m["x"]) + _num(s_m["w"]), "y": s_cy, "h": _num(s_m["h"]),
                              "side": s_m["face"]}),
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
        _open = lambda m: {"x": _num(m["x"]), "y": _num(m["y"]), "face": m["face"],
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
            _ns = _airflow_score((_ni - intake_nonfront) * front_factor + intake_nonfront, _ne,
                                 total_w, gpu_thick_pen, side_pen)
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
            "max_cooler_height_measured_mm": max_cooler_measured or None,
            "cooler_height_source": cooler_height_source,
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
            # "por_mount" = soma das fichas de cada ventoinha; "agregado" = total
            # do catálogo para o gabinete, dividido pelos mounts
            "cfm_method": cfm_method,
            # CFM de entrada descontado por pressão muito positiva (> POS_RATIO × saída)
            "pressure_discount_cfm": pressure_discount,
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


@router.post("/model.gltf", response_model=None)
async def model_gltf(body: InteriorRequest, db: AsyncSession = Depends(get_db)):
    """O gabinete em glTF 2.0, gerado a partir DESTA mesma geometria.

    Não há um segundo gerador de dimensão: a malha são as placements em mm que
    desenham a vista 2D. Por isso o 3D não pode divergir do que o site afirma.
    """
    est = await estimate_interior(body, db)
    try:
        gltf = build_gltf(est)
    except ValueError as e:
        return Response(content=json.dumps({"detail": str(e)}), status_code=422,
                        media_type="application/json")
    return Response(
        content=json.dumps(gltf, ensure_ascii=False),
        media_type="model/gltf+json",
        headers={"Content-Disposition": 'attachment; filename="gabinete.gltf"'},
    )
