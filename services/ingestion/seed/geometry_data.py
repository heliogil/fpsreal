"""Geometria paramétrica dos gabinetes — Rei do FPS.

Vista LATERAL (corte 2D): origem no canto frontal-inferior do INTERIOR;
x cresce para a traseira, y cresce para cima. Tudo em mm.

Cada gabinete declara:
  - interior_mm: volume útil do corte (depth × height)
  - mounts: previsões de montagem do próprio gabinete — cada uma com posição,
    tamanho, o que aceita (fan120/fan140/fan160/rad240/rad360), orientação
    padrão (intake/exhaust) e se vem ocupada de fábrica (stock=True).

O motor de vento e o desenho derivam TUDO daqui: fans stock recebem o CFM do
gabinete dividido pelos mounts; um AIO ocupa o primeiro mount compatível com o
radiador dele; mounts vazios aparecem como previsão disponível. Peça nova ou
gabinete novo = adicionar dados, nunca desenhar caso a caso.

Dimensões: aproximações honestas de ficha técnica (±10mm) — rotuladas como
estimativa dimensional no payload, nunca como medição.
"""
from __future__ import annotations

CASE_GEOMETRY: dict[str, dict] = {
    "case-lancool-216": {
        "interior_mm": {"depth": 425, "height": 400},
        "mounts": [
            {"id": "front_bottom", "kind": "fan160", "accepts": ["fan140", "fan160"],
             "x": 0, "y": 55, "w": 28, "h": 160, "orient": "intake", "stock": True},
            {"id": "front_top", "kind": "fan160", "accepts": ["fan140", "fan160"],
             "x": 0, "y": 225, "w": 28, "h": 160, "orient": "intake", "stock": True},
            {"id": "rear", "kind": "fan120", "accepts": ["fan120"],
             "x": 397, "y": 250, "w": 28, "h": 120, "orient": "exhaust", "stock": True},
            {"id": "top_bay", "kind": "rad_bay", "accepts": ["fan120", "rad240", "rad360"],
             "x": 20, "y": 372, "w": 400, "h": 28, "orient": "exhaust", "stock": False},
        ],
    },
    "case-h5-flow": {
        "interior_mm": {"depth": 400, "height": 370},
        "mounts": [
            {"id": "front_bottom", "kind": "fan120", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 70, "w": 28, "h": 120, "orient": "intake", "stock": True},
            {"id": "front_top", "kind": "fan120", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 200, "w": 28, "h": 120, "orient": "intake", "stock": True},
            {"id": "rear", "kind": "fan120", "accepts": ["fan120"],
             "x": 372, "y": 225, "w": 28, "h": 120, "orient": "exhaust", "stock": True},
            {"id": "top_bay", "kind": "rad_bay", "accepts": ["fan120", "rad240"],
             "x": 50, "y": 342, "w": 290, "h": 28, "orient": "exhaust", "stock": False},
        ],
    },
    "case-4000d": {
        "interior_mm": {"depth": 410, "height": 380},
        "mounts": [
            {"id": "front_bottom", "kind": "fan120", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 75, "w": 28, "h": 120, "orient": "intake", "stock": True},
            {"id": "front_top", "kind": "fan120", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 205, "w": 28, "h": 120, "orient": "intake", "stock": True},
            {"id": "rear", "kind": "fan120", "accepts": ["fan120"],
             "x": 382, "y": 235, "w": 28, "h": 120, "orient": "exhaust", "stock": True},
            {"id": "top_bay", "kind": "rad_bay", "accepts": ["fan120", "rad240"],
             "x": 45, "y": 352, "w": 300, "h": 28, "orient": "exhaust", "stock": False},
        ],
    },
    "case-air-903": {
        "interior_mm": {"depth": 420, "height": 395},
        "mounts": [
            {"id": "front_bottom", "kind": "fan140", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 45, "w": 28, "h": 140, "orient": "intake", "stock": True},
            {"id": "front_mid", "kind": "fan140", "accepts": ["fan120", "fan140"],
             "x": 0, "y": 195, "w": 28, "h": 140, "orient": "intake", "stock": True},
            {"id": "rear", "kind": "fan140", "accepts": ["fan120", "fan140"],
             "x": 392, "y": 245, "w": 28, "h": 140, "orient": "exhaust", "stock": True},
            {"id": "top_bay", "kind": "rad_bay", "accepts": ["fan120", "rad240", "rad360"],
             "x": 15, "y": 367, "w": 400, "h": 28, "orient": "exhaust", "stock": False},
        ],
    },
}

# Dimensões visuais/físicas por tipo de cooler (complementa specs do catálogo).
# AIOs: height_mm do catálogo é a ESPESSURA do radiador; comprimento vem daqui.
COOLER_GEOMETRY: dict[str, dict] = {
    "cooler-stock-amd": {"body_w_mm": 80},
    "cooler-ak400":     {"body_w_mm": 100},
    "cooler-pa120":     {"body_w_mm": 125},
    "cooler-lt520":     {"rad_class": "rad240", "radiator_mm": 282, "fan_count": 2},
    "cooler-lf3-360":   {"rad_class": "rad360", "radiator_mm": 398, "fan_count": 3},
}

# Constantes de form factor (padrões da indústria, usados quando a spec não declara)
FORM_FACTOR_MM = {
    "atx_mobo": {"w": 244, "h": 305},
    "matx_mobo": {"w": 244, "h": 244},
    "psu_atx": {"w": 150, "h": 86},
    "fan_thickness": 25,
    "ram_stick": {"w": 8, "h": 45},
    "m2_ssd": {"w": 80, "h": 9},
    "gpu_thickness": 55,
    "pump_block": {"w": 68, "h": 68},
}
