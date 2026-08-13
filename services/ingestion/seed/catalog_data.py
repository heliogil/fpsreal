"""Canonical catalog seed data — Rei do FPS."""
from __future__ import annotations

from .geometry_data import CASE_GEOMETRY, COOLER_GEOMETRY

# ── soquetes suportados por cooler ───────────────────────────────────────────
# FATO DE ENGENHARIA, não estimativa: é o que o kit de montagem que vem na caixa
# suporta. Sem isto, um cooler que NÃO monta no soquete passa limpo pela engine
# de compatibilidade (falha dura, invisível). AM4 e AM5 partilham a furação, por
# isso quase todo cooler moderno cobre os dois.
# FONTE: página de compatibilidade do próprio fabricante. Rever ao adicionar
# cooler novo — ver tarefa T-02 no roadmap.
COOLER_SOCKETS = {
    "cooler-stock-amd": ["AM4", "AM5"],
    "cooler-ak400":     ["AM4", "AM5", "LGA1700", "LGA1200", "LGA1151"],
    "cooler-pa120":     ["AM4", "AM5", "LGA1700", "LGA1200", "LGA1151"],
    "cooler-lt520":     ["AM4", "AM5", "LGA1700", "LGA1200", "LGA1151"],
    "cooler-lf3-360":   ["AM4", "AM5", "LGA1700", "LGA1851"],
}

# ── que formatos de placa cada formato de gabinete aceita ────────────────────
# FATO FÍSICO de contenção: um gabinete maior aceita placa menor (a furação ATX
# é um superconjunto). Derivado do form_factor do gabinete em vez de digitado
# peça a peça — não há o que errar e não precisa de curadoria.
# ATENÇÃO: comparar `motherboard.form_factor == case.form_factor` seria ERRADO
# (reprovaria mATX em gabinete ATX, que cabe perfeitamente).
FORM_FACTOR_ACCEPTS = {
    "ATX":       ["ATX", "mATX", "Micro-ATX", "ITX", "Mini-ITX"],
    "mATX":      ["mATX", "Micro-ATX", "ITX", "Mini-ITX"],
    "Micro-ATX": ["mATX", "Micro-ATX", "ITX", "Mini-ITX"],
    "ITX":       ["ITX", "Mini-ITX"],
    "Mini-ITX":  ["ITX", "Mini-ITX"],
}

# ── folga de RAM sob a torre do cooler (T-03) ────────────────────────────────
# Altura máxima de módulo de RAM que cabe sob o primeiro fan da torre sem ter
# de erguê-lo. Config de fábrica (dual-fan), fonte: ficha do fabricante.
# AIO e cooler stock (top-down, não é torre) NÃO têm esse problema — de propósito
# ausentes daqui, e o campo fica OMITIDO no specs (não é "0mm", é "não se aplica").
COOLER_RAM_CLEARANCE_MM = {
    "cooler-ak400": 43,  # DeepCool, config dual-fan de fábrica
    "cooler-pa120": 42,  # Thermalright, config dual-fan de fábrica
}

# ── folga de cooler medida pela Noctua (T-07) ────────────────────────────────
# A Noctua mediu à mão 100+ gabinetes e achou desvio relevante em 56 (post de
# 07/08/2026). Só os 2 abaixo têm medição própria da Noctua confirmada por nós
# (consulta pontual, não scraping em massa — ver restrição T-07 no roadmap); os
# outros 2 gabinetes do catálogo ficam só com a ficha do fabricante.
NOCTUA_MEASURED_COOLER_HEIGHT_MM = {
    "case-4000d":   180,  # ficha diz 170 — Noctua mede 170+10mm de folga real
    "case-h5-flow": 176,  # ficha diz 165 — Noctua mede 165+11mm de folga real
}

# ── conector de força de cada GPU (T-05) ─────────────────────────────────────
# Placa de referência/Founders Edition — algumas AIB variam (ex.: RTX 5070 tem
# versão AIB com 2x8pin em vez de 12vhpwr), mas o catálogo é representativo por
# tier, não por SKU de AIB específico (mesmo padrão do resto do arquivo).
# ATENÇÃO: chaveado por SKU, não por posição no tuple — cobre também os 3 GPUs
# (gpu-rtx-5050, gpu-rx-9050, gpu-rx-9070-gre) que existem no banco de produção
# mas NÃO estão na lista GPUS abaixo (divergência pré-existente, provavelmente
# de um script de reconciliação de specs em andamento — ver spec/aib_adapter.py
# não commitado; não mexi nisso, só documento).
GPU_POWER_CONNECTOR = {
    "gpu-rtx-5090": "12vhpwr", "gpu-rtx-5080": "12vhpwr",
    "gpu-rtx-5070-ti": "12vhpwr", "gpu-rtx-5070": "12vhpwr",
    "gpu-rtx-5060-ti": "8pin", "gpu-rtx-5060": "8pin", "gpu-rtx-5050": "8pin",
    "gpu-rtx-4090": "12vhpwr", "gpu-rtx-4070-super": "12vhpwr",
    "gpu-rtx-4060-ti": "8pin", "gpu-rtx-4060": "8pin", "gpu-rtx-3060": "8pin",
    "gpu-rx-9070-xt": "8x2", "gpu-rx-9070-gre": "8x2", "gpu-rx-9050": "8pin",
    "gpu-rx-7900-xtx": "8x2", "gpu-rx-7800-xt": "8x2", "gpu-rx-7700-xt": "8x2",
    "gpu-rx-7600": "8pin", "gpu-rx-6600": "8pin",
}

# fps_1080p_agg = aggregate 1080p high/ultra FPS used as the raw signal for
# performance_index. Source: thepcbottleneckcalculator.com/gpu-benchmarks-2026/
# NOTE: RTX 5070 Ti corrected to 180 (was 145 — wrongly below RTX 4070 SUPER).
# Real-world: 5070 Ti ≈ 4080 range, ~20% above 4070 SUPER. Audit 2026-07-11.
# fps (col 8, auditoria 2026-08-13): recalibrado contra Tom's Hardware GPU
# Benchmarks Hierarchy 2026 (atualizado 24/06/2026) — média geométrica real de
# 11 jogos em 1080p Ultra, MESMA bancada (Ryzen 7 9800X3D) pra toda placa, sem
# a mistura de CPU que inutilizou a tentativa de calibrar por jogo individual
# (ver ROADMAP-FPS-CALIBRACAO.md). Antes vinha de thepcbottleneckcalculator.com
# (metodologia não documentada) — os dois concordavam na maioria das placas
# (diferença de 1-6 pontos), exceto a RX 9070 XT, que a fonte antiga subestimava
# em ~20 pontos (quase uma faixa inteira). Ver seed/performance_data.py pro
# rastro completo da fonte.
GPUS = [
    # slots = nº de slots PCIe ocupados (dado de catálogo publicado pelo fabricante,
    # como o comprimento). A espessura em mm é DERIVADA: passo do slot PCIe = 20,32 mm
    # (constante física), então thickness ≈ slots × 20,32. Representativo por tier.
    # sku,                name,                         brand,    tdp, len,  vram, bus,        fps, slots
    ("gpu-rtx-5090",      "GeForce RTX 5090",           "NVIDIA", 575, 304, 32, "PCIe 5.0", 204, 3.5),
    ("gpu-rtx-5080",      "GeForce RTX 5080",           "NVIDIA", 360, 304, 16, "PCIe 5.0", 167, 3.0),
    ("gpu-rtx-5070-ti",   "GeForce RTX 5070 Ti",        "NVIDIA", 300, 300, 16, "PCIe 5.0", 155, 2.5),
    ("gpu-rtx-5070",      "GeForce RTX 5070",           "NVIDIA", 250, 250, 12, "PCIe 5.0", 133, 2.0),
    ("gpu-rtx-5060-ti",   "GeForce RTX 5060 Ti 16GB",   "NVIDIA", 180, 242, 16, "PCIe 5.0", 105, 2.0),
    ("gpu-rtx-5060",      "GeForce RTX 5060",           "NVIDIA", 145, 242,  8, "PCIe 5.0",  89, 2.0),
    ("gpu-rtx-4090",      "GeForce RTX 4090",           "NVIDIA", 450, 304, 24, "PCIe 4.0", 184, 3.5),
    ("gpu-rtx-4070-super","GeForce RTX 4070 SUPER",     "NVIDIA", 220, 244, 12, "PCIe 4.0", 127, 2.5),
    ("gpu-rtx-4060-ti",   "GeForce RTX 4060 Ti 8GB",    "NVIDIA", 160, 242,  8, "PCIe 4.0",  88, 2.0),
    ("gpu-rtx-4060",      "GeForce RTX 4060",           "NVIDIA", 115, 242,  8, "PCIe 4.0",  72, 2.0),
    ("gpu-rtx-3060",      "GeForce RTX 3060 12GB",      "NVIDIA", 170, 242, 12, "PCIe 4.0",  62, 2.0),
    ("gpu-rx-9070-xt",    "Radeon RX 9070 XT",          "AMD",    304, 320, 16, "PCIe 5.0", 157, 3.0),
    ("gpu-rx-7900-xtx",   "Radeon RX 7900 XTX",         "AMD",    355, 287, 24, "PCIe 4.0", 162, 2.5),
    ("gpu-rx-7800-xt",    "Radeon RX 7800 XT",          "AMD",    263, 267, 16, "PCIe 4.0", 118, 2.5),
    ("gpu-rx-7700-xt",    "Radeon RX 7700 XT",          "AMD",    245, 267, 12, "PCIe 4.0", 103, 2.5),
    ("gpu-rx-7600",       "Radeon RX 7600",             "AMD",    165, 204,  8, "PCIe 4.0",  70, 2.0),
    ("gpu-rx-6600",       "Radeon RX 6600",             "AMD",    132, 190,  8, "PCIe 4.0",  52, 2.0),
]

CPUS = [
    # sku,               name,                       brand,   socket,   tdp, cores, threads, igpu,  tier
    ("cpu-r7-9800x3d",   "Ryzen 7 9800X3D",          "AMD",   "AM5",    120,  8, 16, False, "flagship"),
    ("cpu-r7-7800x3d",   "Ryzen 7 7800X3D",          "AMD",   "AM5",    120,  8, 16, False, "flagship"),
    ("cpu-r7-9700x",     "Ryzen 7 9700X",            "AMD",   "AM5",     65,  8, 16, True,  "high"),
    ("cpu-r5-7600",      "Ryzen 5 7600",             "AMD",   "AM5",     65,  6, 12, True,  "mid"),
    ("cpu-r5-5600",      "Ryzen 5 5600",             "AMD",   "AM4",     65,  6, 12, False, "budget"),
    ("cpu-i5-14600kf",   "Core i5-14600KF",          "Intel", "LGA1700",125, 14, 20, False, "high"),
    ("cpu-i5-13400f",    "Core i5-13400F",           "Intel", "LGA1700", 65, 10, 16, False, "budget"),
]

# height_mm = altura do módulo COM dissipador (fonte: ficha do fabricante).
# Vengeance LPX é a linha *low-profile* da Corsair (LPX = Low Profile eXtreme);
# as outras duas são dissipador padrão (não-RGB), não confundir com kits altos.
RAM = [
    ("ram-ddr5-6000-32", "Corsair Vengeance 32GB (2x16) DDR5-6000", "Corsair",  "DDR5", 6000, 32, "2x16", 35),
    ("ram-ddr5-6000-16", "Kingston Fury Beast 16GB (2x8) DDR5-6000","Kingston", "DDR5", 6000, 16, "2x8",  35),
    ("ram-ddr4-3600-16", "Corsair Vengeance LPX 16GB (2x8) DDR4-3600","Corsair","DDR4", 3600, 16, "2x8",  34),
]

# m2_slots/ram_slots/max_ram_speed_mts: ficha oficial do fabricante (T-06).
MOBOS = [
    ("mb-b650-tuf",      "ASUS TUF Gaming B650-PLUS",   "ASUS",    "AM5",     "DDR5", "ATX", 3, 4, 7600),
    ("mb-b650-tomahawk", "MSI B650 Tomahawk WiFi",      "MSI",     "AM5",     "DDR5", "ATX", 3, 4, 7600),
    ("mb-b760-gaming-x", "Gigabyte B760 Gaming X DDR5", "Gigabyte","LGA1700", "DDR5", "ATX", 3, 4, 7600),
    ("mb-b550-steel",    "ASRock B550 Steel Legend",    "ASRock",  "AM4",     "DDR4", "ATX", 2, 4, 4733),
]

STORAGE = [
    ("ssd-nv2-1tb",   "Kingston NV2 1TB NVMe",     "Kingston", "PCIe 4.0 NVMe", 1000),
    ("ssd-sn770-1tb", "WD Black SN770 1TB NVMe",   "Western Digital", "PCIe 4.0 NVMe", 1000),
    ("ssd-990pro-2tb","Samsung 990 Pro 2TB NVMe",  "Samsung",  "PCIe 4.0 NVMe", 2000),
]

# length_mm = comprimento físico da fonte (ficha do fabricante). CX/RMe usam o
# chassi compacto de 140mm; RM (2021, não-e) usa o chassi de 160mm; a MSI A1000G
# tem chassi próprio de 150mm.
# pcie_8pin_count/has_12vhpwr/atx_version (T-05): conectores nativos além de
# qualquer cabo 12v-2x6. CX550/RM650/RM850 são unidades pré-ATX3.0 (nenhuma
# fonte encontrada afirma selo ATX3.0/3.1 pra elas, ao contrário de RM750e/
# A1000G que anunciam explicitamente) — atx_version="2.4" é inferido por
# ausência de selo mais novo, não uma ficha que diga o número exato.
PSUS = [
    ("psu-cx550",   "Corsair CX550",       "Corsair", 550,  "80+ Bronze", False, 140, 2, False, "2.4"),
    ("psu-rm650",   "Corsair RM650",       "Corsair", 650,  "80+ Gold",   True,  160, 4, False, "2.4"),
    ("psu-rm750e",  "Corsair RM750e",      "Corsair", 750,  "80+ Gold",   True,  140, 2, True,  "3.1"),
    ("psu-rm850",   "Corsair RM850",       "Corsair", 850,  "80+ Gold",   True,  160, 4, False, "2.4"),
    ("psu-a1000g",  "MSI MPG A1000G",      "MSI",     1000, "80+ Gold",   True,  150, 4, True,  "3.1"),
]

# max_psu_length_mm = ficha oficial do fabricante do gabinete (T-04). Conferido:
# é sempre >= a maior fonte do catálogo (160mm), senão nenhuma build fecharia.
CASES = [
    ("case-lancool-216", "Lian Li Lancool 216",     "Lian Li", "ATX", 392, 180, "high",   180, 75, 220),
    ("case-h5-flow",     "NZXT H5 Flow",            "NZXT",    "ATX", 365, 165, "medium",  70, 65, 200),
    ("case-4000d",       "Corsair 4000D Airflow",   "Corsair", "ATX", 360, 170, "high",    75, 65, 220),
    ("case-air-903",     "Montech Air 903 MAX",     "Montech", "ATX", 400, 175, "high",   170, 62, 240),
]

# tdp_rating_w (auditoria 2026-08-12, alimenta a regra ativa cooler_tdp_headroom):
# AK400/PA120/stock-amd conferidos contra ficha oficial, batem. LT520 estava
# errado (260W cadastrado, ficha real da DeepCool é 280W em múltiplas fontes
# de varejo/oficiais, corrigido). LF3-360: a Arctic NÃO publica TDP oficial
# pra esse modelo (só pro "Pro") — 350W não tinha fonte; baixado pra 300W,
# apoiado em teste real (GamersNexus: delta térmico de 23,1°C a 300W,
# desempenho ainda saudável) em vez de um número inventado.
COOLERS = [
    ("cooler-stock-amd",  "AMD Wraith Stealth (stock)",       "AMD",          "stock",      65,  70),
    ("cooler-ak400",      "DeepCool AK400",                   "DeepCool",     "tower_65w",  220, 155),
    ("cooler-pa120",      "Thermalright Peerless Assassin 120","Thermalright","tower_125w", 245, 157),
    ("cooler-lt520",      "DeepCool LT520 240mm AIO",         "DeepCool",     "aio_240",    280, 27),
    ("cooler-lf3-360",    "Arctic Liquid Freezer III 360",    "Arctic",       "aio_360",    300, 38),
]


def build_products() -> list[dict]:
    products: list[dict] = []

    PCIE_SLOT_MM = 20.32  # passo do slot PCIe — constante física
    for sku, name, brand, tdp, length, vram, bus, fps, slots in GPUS:
        thickness = round(slots * PCIE_SLOT_MM)
        products.append({
            "sku": sku, "name": name, "category": "gpu", "brand": brand,
            "specs": {"tdp_w": tdp, "length_mm": length, "vram_gb": vram,
                      "bus": bus, "fps_1080p_agg": fps,
                      "slots": slots, "thickness_mm": thickness,
                      "power_connector": GPU_POWER_CONNECTOR.get(sku)},
            "footprint": {"length_mm": length, "installed_thickness_mm": thickness,
                          "slot_type_required": "pcie_x16", "airflow_zone": "gpu_zone",
                          # a resistência ao ar já não é fixa: uma placa 3.5-slot
                          # obstrui a câmara inferior muito mais que uma 2-slot
                          "airflow_resistance_factor": round(0.18 + 0.09 * slots, 2)},
        })
    for sku, name, brand, socket, tdp, cores, threads, igpu, tier in CPUS:
        products.append({
            "sku": sku, "name": name, "category": "cpu", "brand": brand,
            "specs": {"socket": socket, "tdp_w": tdp, "cores": cores,
                      "threads": threads, "igpu": igpu, "game_tier": tier},
            "footprint": None,
        })
    for sku, name, brand, mem_type, speed, cap, layout, height_mm in RAM:
        products.append({
            "sku": sku, "name": name, "category": "ram", "brand": brand,
            "specs": {"type": mem_type, "speed_mts": speed, "capacity_gb": cap,
                      "layout": layout, "height_mm": height_mm},
            "footprint": None,
        })
    for sku, name, brand, socket, ram_type, ff, m2_slots, ram_slots, max_ram_speed_mts in MOBOS:
        products.append({
            "sku": sku, "name": name, "category": "motherboard", "brand": brand,
            "specs": {"socket": socket, "ram_type": ram_type, "form_factor": ff,
                      "m2_slots": m2_slots, "ram_slots": ram_slots,
                      "max_ram_speed_mts": max_ram_speed_mts},
            "footprint": None,
        })
    for sku, name, brand, iface, cap in STORAGE:
        products.append({
            "sku": sku, "name": name, "category": "storage", "brand": brand,
            "specs": {"interface": iface, "capacity_gb": cap},
            "footprint": None,
        })
    for sku, name, brand, watts, eff, modular, length_mm, pcie_8pin, has_12vhpwr, atx_version in PSUS:
        products.append({
            "sku": sku, "name": name, "category": "psu", "brand": brand,
            "specs": {"watts": watts, "efficiency": eff, "modular": modular,
                      "length_mm": length_mm, "pcie_8pin_count": pcie_8pin,
                      "has_12vhpwr": has_12vhpwr, "atx_version": atx_version},
            "footprint": None,
        })
    for sku, name, brand, ff, max_gpu, max_cooler, airflow_class, intake_cfm, exhaust_cfm, max_psu_length_mm in CASES:
        # Geometria paramétrica (interior_mm + mounts) entra no specs JSONB — é
        # ela que alimenta a volumetria e o motor de vento composicional.
        geo = CASE_GEOMETRY.get(sku, {})
        measured = NOCTUA_MEASURED_COOLER_HEIGHT_MM.get(sku)
        products.append({
            "sku": sku, "name": name, "category": "case", "brand": brand,
            "specs": {"form_factor": ff, "max_gpu_length_mm": max_gpu,
                      "max_cooler_height_mm": max_cooler, "airflow_class": airflow_class,
                      "intake_cfm": intake_cfm, "exhaust_cfm": exhaust_cfm,
                      "max_psu_length_mm": max_psu_length_mm,
                      "cooler_height_source": "medido_noctua" if measured else "ficha",
                      # lista, não igualdade: gabinete ATX também aceita mATX/ITX
                      "supported_form_factors": FORM_FACTOR_ACCEPTS.get(ff, [ff]),
                      **({"max_cooler_height_measured_mm": measured} if measured else {}),
                      **geo},
            "footprint": None,
        })
    for sku, name, brand, cooler_type, tdp_rating, height in COOLERS:
        geo = COOLER_GEOMETRY.get(sku, {})
        ram_clearance = COOLER_RAM_CLEARANCE_MM.get(sku)
        products.append({
            "sku": sku, "name": name, "category": "cooler", "brand": brand,
            "specs": {"cooler_type": cooler_type, "tdp_rating_w": tdp_rating,
                      "height_mm": height,
                      "sockets": COOLER_SOCKETS.get(sku, []),
                      **({"ram_clearance_mm": ram_clearance} if ram_clearance is not None else {}),
                      **geo},
            "footprint": None,
        })

    return products
