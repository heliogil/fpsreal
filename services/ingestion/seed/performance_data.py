"""Performance & FPS estimate seed — Rei do FPS.

INTEGRITY CONTRACT (non-negotiable, per project rules):
- We NEVER claim FPS was *measured* on hardware. Every ``fps_estimates`` row
  is produced by the documented anchor+scale method and labelled
  ``method='anchor_scale'`` with a confidence band.
- ``performance_index`` carries an explicit source, source_url, source_date
  and confidence so every number is auditable.

Method (cold-start strategy #1 — âncora + escala):
    fps(gpu, game, cpu) = gpu_1080p_aggregate_fps
                          * game_demand_factor
                          * cpu_scale_factor
    bounded by an optional per-game engine FPS cap.

The aggregate 1080p signal is sourced; the per-game demand factors and the
CPU scale factors are HEURISTIC priors, clearly flagged in ``sources`` and
carrying a wide confidence band (±18%). They are the seed for the
crowdsourced calibration loop (strategy #3), not a claim of precision.
"""
from __future__ import annotations

from datetime import date

from .catalog_data import GPUS, CPUS

# ---------------------------------------------------------------------------
# Sourcing metadata (auditable)
# ---------------------------------------------------------------------------
PERF_SOURCE = "thepcbottleneckcalculator.com — GPU Benchmarks 2026 (aggregate 1080p high/ultra FPS)"
PERF_SOURCE_URL = "https://thepcbottleneckcalculator.com/gpu-benchmarks-2026/"
PERF_SOURCE_DATE = date(2026, 7, 9)
PERF_CONFIDENCE = 0.70  # aggregate cross-game signal, pending per-title calibration

ANCHOR_GPU_SKU = "gpu-rtx-5090"  # index 100

# ---------------------------------------------------------------------------
# Games — GameSlug (must match web types.ts) → demand factor vs the aggregate
# 1080p signal, and an optional hard engine FPS cap.
# Factor > 1: lighter than average (esports); < 1: heavier (AAA).
# These are heuristic priors, flagged as such in every row's ``sources``.
# ---------------------------------------------------------------------------
GAMES = [
    # slug,                    demand_factor, engine_fps_cap
    ("cs2",                    1.9,  None),
    ("valorant",               2.6,  None),
    ("league-of-legends",      3.0,  None),
    ("fortnite",               1.4,  None),
    ("apex-legends",           1.5,  300),   # engine caps at 300
    ("call-of-duty-warzone",   1.1,  None),
    ("gta-v",                  1.6,  None),
    ("minecraft",              1.7,  None),
    ("the-sims-4",             2.2,  None),
    ("hogwarts-legacy",        0.75, None),
    ("rdr2",                   0.85, None),
    ("cyberpunk-2077",         0.60, None),
    ("elden-ring",             1.0,  60),    # hard-capped at 60 FPS by the engine
]

# ---------------------------------------------------------------------------
# CPU scale factor at 1080p by gaming tier. At 1080p the CPU is a real
# bottleneck, hence the spread. Flagship X3D = reference (1.0).
# ---------------------------------------------------------------------------
CPU_TIER_FACTOR = {
    "flagship": 1.00,
    "high":     0.96,
    "mid":      0.92,
    "budget":   0.86,
}

# CPUs used to populate the FPS matrix (one representative per tier keeps the
# matrix legible; the engine supports every CPU via its tier factor).
FPS_MATRIX_CPUS = ["cpu-r7-9800x3d", "cpu-r5-7600", "cpu-r5-5600"]

CONFIDENCE_BAND_PCT = 18.0


def _gpu_by_sku() -> dict[str, dict]:
    out = {}
    for sku, name, brand, tdp, length, vram, bus, fps in GPUS:
        out[sku] = {"name": name, "fps_1080p_agg": fps}
    return out


def _cpu_by_sku() -> dict[str, dict]:
    out = {}
    for sku, name, brand, socket, tdp, cores, threads, igpu, tier in CPUS:
        out[sku] = {"name": name, "tier": tier}
    return out


def build_performance_index() -> list[dict]:
    """One gaming_1080p index row per GPU, normalized to the anchor = 100."""
    gpus = _gpu_by_sku()
    anchor_fps = gpus[ANCHOR_GPU_SKU]["fps_1080p_agg"]
    rows: list[dict] = []
    for sku, g in gpus.items():
        index_value = round(g["fps_1080p_agg"] / anchor_fps * 100.0, 2)
        rows.append({
            "product_sku": sku,
            "benchmark_type": "gaming_1080p",
            "index_value": index_value,
            "anchor_product_sku": ANCHOR_GPU_SKU,
            "source": PERF_SOURCE,
            "source_url": PERF_SOURCE_URL,
            "source_date": PERF_SOURCE_DATE,
            "confidence": PERF_CONFIDENCE,
            "notes": "Normalized aggregate 1080p high/ultra FPS. Recalibrate against TechPowerUp relative-performance on next data pull.",
        })
    return rows


# resolution -> (fps multiplier vs 1080p, confidence band %). Higher res = more
# GPU-bound and more uncertain, so the band widens.
RES_SCALE = {
    "1080p": (1.00, CONFIDENCE_BAND_PCT),
    "1440p": (0.68, CONFIDENCE_BAND_PCT + 4),
    "4k": (0.42, CONFIDENCE_BAND_PCT + 7),
}


def build_fps_estimates() -> list[dict]:
    """Anchor+scale FPS matrix: GPU x game x representative CPU x resolution, high preset."""
    gpus = _gpu_by_sku()
    cpus = _cpu_by_sku()
    rows: list[dict] = []
    for gpu_sku, g in gpus.items():
        base = g["fps_1080p_agg"]
        for game_slug, demand, cap in GAMES:
            for cpu_sku in FPS_MATRIX_CPUS:
                tier = cpus[cpu_sku]["tier"]
                cpu_factor = CPU_TIER_FACTOR[tier]
                base_fps = base * demand * cpu_factor
                for resolution, (res_mult, band) in RES_SCALE.items():
                    fps = base_fps * res_mult
                    if cap is not None:
                        fps = min(fps, cap)  # engine FPS caps apply at every resolution
                    fps = round(fps, 1)
                    fps_low = round(fps * (1 - band / 100.0), 1)
                    rows.append({
                        "cpu_sku": cpu_sku,
                        "gpu_sku": gpu_sku,
                        "game_slug": game_slug,
                        "resolution": resolution,
                        "preset": "high",
                        "fps_estimate": fps,
                        "fps_low_1pct": fps_low,
                        "confidence_band_pct": band,
                        "method": "anchor_scale",
                        "sources": [
                            PERF_SOURCE_URL,
                            "per-game demand + resolution scale: heuristic prior pending crowdsourced calibration",
                        ],
                        "is_crowdsourced": False,
                    })
    return rows
