"""Compatibility & thermal rule seed — Rei do FPS.

Engineering facts, not estimates. ``compatibility_rules`` are evaluated by the
compatibility engine by reading the two products' ``specs`` JSONB attributes;
``thermal_rules`` map a CPU TDP band to a minimum cooler class + case airflow.
"""
from __future__ import annotations

# rule_type, cat_a, attr_a, operator, cat_b, attr_b, severity, message_template
COMPATIBILITY_RULES = [
    ("socket_match", "cpu", "socket", "equals", "motherboard", "socket", "error",
     "O CPU {a_name} usa soquete {a_val}, mas a placa-mãe {b_name} é {b_val}. Incompatíveis."),
    ("ram_type_match", "ram", "type", "equals", "motherboard", "ram_type", "error",
     "A memória {a_name} é {a_val}, mas a placa-mãe {b_name} aceita {b_val}."),
    ("gpu_case_clearance", "gpu", "length_mm", "lte", "case", "max_gpu_length_mm", "error",
     "A {a_name} tem {a_val}mm; o gabinete {b_name} comporta até {b_val}mm de GPU."),
    ("cooler_case_clearance", "cooler", "height_mm", "lte", "case", "max_cooler_height_mm", "error",
     "O cooler {a_name} tem {a_val}mm de altura; o gabinete {b_name} comporta até {b_val}mm."),
    ("cooler_tdp_headroom", "cooler", "tdp_rating_w", "gte", "cpu", "tdp_w", "warning",
     "O cooler {a_name} dissipa ~{a_val}W; o CPU {b_name} tem TDP {b_val}W. Margem térmica apertada."),
]

# TDP band (min, max) -> min_cooler_type, min_case_airflow. product_id NULL = generic band.
# tdp_max_w = None means open-ended (highest band).
THERMAL_RULES = [
    (0,   65,  "stock",      "low",    "Até 65W: cooler de fábrica é suficiente com fluxo de ar básico."),
    (66,  105, "tower_65w",  "low",    "66–105W: torre de entrada resolve; 1 exaustor recomendado."),
    (106, 150, "tower_125w", "medium", "106–150W: torre robusta + fluxo médio (2–3 fans)."),
    (151, 250, "aio_240",    "medium", "151–250W: AIO 240 ou torre topo; fluxo médio-alto."),
    (251, None,"aio_360",    "high",   "251W+: AIO 360 recomendado; gabinete de alto fluxo."),
]
