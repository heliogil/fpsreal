"""Canonical catalog seed data — Rei do FPS."""
from __future__ import annotations

from .geometry_data import CASE_GEOMETRY, COOLER_GEOMETRY

# fps_1080p_agg = aggregate 1080p high/ultra FPS used as the raw signal for
# performance_index. Source: thepcbottleneckcalculator.com/gpu-benchmarks-2026/
# NOTE: RTX 5070 Ti corrected to 180 (was 145 — wrongly below RTX 4070 SUPER).
# Real-world: 5070 Ti ≈ 4080 range, ~20% above 4070 SUPER. Audit 2026-07-11.
GPUS = [
    # sku,                name,                         brand,    tdp, len,  vram, bus,        fps_1080p_agg
    ("gpu-rtx-5090",      "GeForce RTX 5090",           "NVIDIA", 575, 304, 32, "PCIe 5.0", 240),
    ("gpu-rtx-5080",      "GeForce RTX 5080",           "NVIDIA", 360, 304, 16, "PCIe 5.0", 200),
    ("gpu-rtx-5070-ti",   "GeForce RTX 5070 Ti",        "NVIDIA", 300, 300, 16, "PCIe 5.0", 180),
    ("gpu-rtx-5070",      "GeForce RTX 5070",           "NVIDIA", 250, 250, 12, "PCIe 5.0", 140),
    ("gpu-rtx-5060-ti",   "GeForce RTX 5060 Ti 16GB",   "NVIDIA", 180, 242, 16, "PCIe 5.0", 110),
    ("gpu-rtx-5060",      "GeForce RTX 5060",           "NVIDIA", 145, 242,  8, "PCIe 5.0",  90),
    ("gpu-rtx-4090",      "GeForce RTX 4090",           "NVIDIA", 450, 304, 24, "PCIe 4.0", 220),
    ("gpu-rtx-4070-super","GeForce RTX 4070 SUPER",     "NVIDIA", 220, 244, 12, "PCIe 4.0", 150),
    ("gpu-rtx-4060-ti",   "GeForce RTX 4060 Ti 8GB",    "NVIDIA", 160, 242,  8, "PCIe 4.0", 100),
    ("gpu-rtx-4060",      "GeForce RTX 4060",           "NVIDIA", 115, 242,  8, "PCIe 4.0",  85),
    ("gpu-rtx-3060",      "GeForce RTX 3060 12GB",      "NVIDIA", 170, 242, 12, "PCIe 4.0",  60),
    ("gpu-rx-9070-xt",    "Radeon RX 9070 XT",          "AMD",    304, 320, 16, "PCIe 5.0", 135),
    ("gpu-rx-7900-xtx",   "Radeon RX 7900 XTX",         "AMD",    355, 287, 24, "PCIe 4.0", 190),
    ("gpu-rx-7800-xt",    "Radeon RX 7800 XT",          "AMD",    263, 267, 16, "PCIe 4.0", 135),
    ("gpu-rx-7700-xt",    "Radeon RX 7700 XT",          "AMD",    245, 267, 12, "PCIe 4.0", 115),
    ("gpu-rx-7600",       "Radeon RX 7600",             "AMD",    165, 204,  8, "PCIe 4.0",  80),
    ("gpu-rx-6600",       "Radeon RX 6600",             "AMD",    132, 190,  8, "PCIe 4.0",  52),
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

RAM = [
    ("ram-ddr5-6000-32", "Corsair Vengeance 32GB (2x16) DDR5-6000", "Corsair",  "DDR5", 6000, 32, "2x16"),
    ("ram-ddr5-6000-16", "Kingston Fury Beast 16GB (2x8) DDR5-6000","Kingston", "DDR5", 6000, 16, "2x8"),
    ("ram-ddr4-3600-16", "Corsair Vengeance LPX 16GB (2x8) DDR4-3600","Corsair","DDR4", 3600, 16, "2x8"),
]

MOBOS = [
    ("mb-b650-tuf",      "ASUS TUF Gaming B650-PLUS",   "ASUS",    "AM5",     "DDR5", "ATX"),
    ("mb-b650-tomahawk", "MSI B650 Tomahawk WiFi",      "MSI",     "AM5",     "DDR5", "ATX"),
    ("mb-b760-gaming-x", "Gigabyte B760 Gaming X DDR5", "Gigabyte","LGA1700", "DDR5", "ATX"),
    ("mb-b550-steel",    "ASRock B550 Steel Legend",    "ASRock",  "AM4",     "DDR4", "ATX"),
]

STORAGE = [
    ("ssd-nv2-1tb",   "Kingston NV2 1TB NVMe",     "Kingston", "PCIe 4.0 NVMe", 1000),
    ("ssd-sn770-1tb", "WD Black SN770 1TB NVMe",   "Western Digital", "PCIe 4.0 NVMe", 1000),
    ("ssd-990pro-2tb","Samsung 990 Pro 2TB NVMe",  "Samsung",  "PCIe 4.0 NVMe", 2000),
]

PSUS = [
    ("psu-cx550",   "Corsair CX550",       "Corsair", 550,  "80+ Bronze", False),
    ("psu-rm650",   "Corsair RM650",       "Corsair", 650,  "80+ Gold",   True),
    ("psu-rm750e",  "Corsair RM750e",      "Corsair", 750,  "80+ Gold",   True),
    ("psu-rm850",   "Corsair RM850",       "Corsair", 850,  "80+ Gold",   True),
    ("psu-a1000g",  "MSI MPG A1000G",      "MSI",     1000, "80+ Gold",   True),
]

CASES = [
    ("case-lancool-216", "Lian Li Lancool 216",     "Lian Li", "ATX", 392, 180, "high",   180, 75),
    ("case-h5-flow",     "NZXT H5 Flow",            "NZXT",    "ATX", 365, 165, "medium",  70, 65),
    ("case-4000d",       "Corsair 4000D Airflow",   "Corsair", "ATX", 360, 170, "high",    75, 65),
    ("case-air-903",     "Montech Air 903 MAX",     "Montech", "ATX", 400, 175, "high",   170, 62),
]

COOLERS = [
    ("cooler-stock-amd",  "AMD Wraith Stealth (stock)",       "AMD",          "stock",      65,  70),
    ("cooler-ak400",      "DeepCool AK400",                   "DeepCool",     "tower_65w",  220, 155),
    ("cooler-pa120",      "Thermalright Peerless Assassin 120","Thermalright","tower_125w", 245, 157),
    ("cooler-lt520",      "DeepCool LT520 240mm AIO",         "DeepCool",     "aio_240",    260, 27),
    ("cooler-lf3-360",    "Arctic Liquid Freezer III 360",    "Arctic",       "aio_360",    350, 38),
]


def build_products() -> list[dict]:
    products: list[dict] = []

    for sku, name, brand, tdp, length, vram, bus, fps in GPUS:
        products.append({
            "sku": sku, "name": name, "category": "gpu", "brand": brand,
            "specs": {"tdp_w": tdp, "length_mm": length, "vram_gb": vram,
                      "bus": bus, "fps_1080p_agg": fps},
            "footprint": {"length_mm": length, "installed_thickness_mm": 55,
                          "slot_type_required": "pcie_x16", "airflow_zone": "gpu_zone",
                          "airflow_resistance_factor": 0.35},
        })
    for sku, name, brand, socket, tdp, cores, threads, igpu, tier in CPUS:
        products.append({
            "sku": sku, "name": name, "category": "cpu", "brand": brand,
            "specs": {"socket": socket, "tdp_w": tdp, "cores": cores,
                      "threads": threads, "igpu": igpu, "game_tier": tier},
            "footprint": None,
        })
    for sku, name, brand, mem_type, speed, cap, layout in RAM:
        products.append({
            "sku": sku, "name": name, "category": "ram", "brand": brand,
            "specs": {"type": mem_type, "speed_mts": speed, "capacity_gb": cap,
                      "layout": layout},
            "footprint": None,
        })
    for sku, name, brand, socket, ram_type, ff in MOBOS:
        products.append({
            "sku": sku, "name": name, "category": "motherboard", "brand": brand,
            "specs": {"socket": socket, "ram_type": ram_type, "form_factor": ff},
            "footprint": None,
        })
    for sku, name, brand, iface, cap in STORAGE:
        products.append({
            "sku": sku, "name": name, "category": "storage", "brand": brand,
            "specs": {"interface": iface, "capacity_gb": cap},
            "footprint": None,
        })
    for sku, name, brand, watts, eff, modular in PSUS:
        products.append({
            "sku": sku, "name": name, "category": "psu", "brand": brand,
            "specs": {"watts": watts, "efficiency": eff, "modular": modular},
            "footprint": None,
        })
    for sku, name, brand, ff, max_gpu, max_cooler, airflow_class, intake_cfm, exhaust_cfm in CASES:
        # Geometria paramétrica (interior_mm + mounts) entra no specs JSONB — é
        # ela que alimenta a volumetria e o motor de vento composicional.
        geo = CASE_GEOMETRY.get(sku, {})
        products.append({
            "sku": sku, "name": name, "category": "case", "brand": brand,
            "specs": {"form_factor": ff, "max_gpu_length_mm": max_gpu,
                      "max_cooler_height_mm": max_cooler, "airflow_class": airflow_class,
                      "intake_cfm": intake_cfm, "exhaust_cfm": exhaust_cfm,
                      **geo},
            "footprint": None,
        })
    for sku, name, brand, cooler_type, tdp_rating, height in COOLERS:
        geo = COOLER_GEOMETRY.get(sku, {})
        products.append({
            "sku": sku, "name": name, "category": "cooler", "brand": brand,
            "specs": {"cooler_type": cooler_type, "tdp_rating_w": tdp_rating,
                      "height_mm": height, **geo},
            "footprint": None,
        })

    return products
