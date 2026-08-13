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
#
# 5 of these (cs2, apex-legends, fortnite, cyberpunk-2077, gta-v) were
# recalibrated 2026-08-13 against Tom's Hardware's individual game charts
# (same page/rig as PERF_SOURCE — see the "GPU BENCHMARKS: INDIVIDUAL GAME
# CHARTS" section, 1080p gallery). Method: per game, read each current-gen
# GPU's real FPS off the chart, divide by that GPU's 11-game raster
# aggregate (img_02 in the sourcing set, matches fps_1080p_agg's source),
# average the ratio across ~15 GPUs. Apex Legends' saturated cards (RTX 5070
# Ti/5090/etc. all pinned near the 300 cap) were excluded from the average —
# only uncapped mid/low cards give a real ratio there. GTA V Enhanced only
# has an RT chart on Tom's Hardware (no pure-raster entry) and its ranking
# is visibly non-monotonic by GPU tier (RTX 5080 beats the 5090) — i.e. it's
# CPU-bound on their Ryzen 7 9800X3D rig at 1080p, so its factor carries more
# noise than the other four; kept anyway since it's still real measured data,
# not a guess. The other 8 games have no Tom's Hardware equivalent and
# remain heuristic priors, flagged as such in every row's ``sources``.
# ---------------------------------------------------------------------------
GAMES = [
    # slug,                    demand_factor, engine_fps_cap
    ("cs2",                    3.8,  None),   # was 1.9 (heuristic) — real data ~2x higher
    ("valorant",               2.6,  None),
    ("league-of-legends",      3.0,  None),
    ("fortnite",               1.0,  None),   # was 1.4 (heuristic)
    ("apex-legends",           2.8,  300),    # was 1.5 (heuristic); cap confirmed by real data
    ("call-of-duty-warzone",   1.1,  None),
    ("gta-v",                  0.95, None),   # was 1.6 (heuristic); noisy/CPU-bound source, see note above
    ("minecraft",              1.7,  None),
    ("the-sims-4",             2.2,  None),
    ("hogwarts-legacy",        0.75, None),
    ("rdr2",                   0.85, None),
    ("cyberpunk-2077",         0.8,  None),   # was 0.60 (heuristic)
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

# Every CPU in the catalog gets FPS rows (scaled by its tier factor), so any
# build's CPU has real estimates — no tier-mapping hack downstream.
FPS_MATRIX_CPUS = [row[0] for row in CPUS]

CONFIDENCE_BAND_PCT = 18.0


def _gpu_by_sku() -> dict[str, dict]:
    out = {}
    for sku, name, brand, tdp, length, vram, bus, fps, *_ in GPUS:
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

# Per-game demand_factor sourcing, for the 5 games recalibrated 2026-08-13
# against Tom's Hardware's individual game charts (see the GAMES comment
# above for method). Slugs not listed here still use the plain heuristic
# note and the full CONFIDENCE_BAND_PCT. band_delta tightens the confidence
# band for calibrated games (real per-game data narrows the uncertainty);
# gta-v gets a smaller tightening since its source chart is CPU-bound/noisy.
GAME_CALIBRATION = {
    "cs2": (
        "Tom's Hardware individual game chart (Counter-Strike 2, DX11, High) — "
        "avg. ratio to the 11-game raster aggregate across 15 current-gen GPUs.",
        -6,
    ),
    "apex-legends": (
        "Tom's Hardware individual game chart (Apex Legends, DX12, Very High) — "
        "engine-capped GPUs (saturated near 300 FPS) excluded from the ratio average.",
        -6,
    ),
    "fortnite": (
        "Tom's Hardware individual game chart (Fortnite, DX12, High Lumen+Nanite) — "
        "avg. ratio to the 11-game raster aggregate across 15 current-gen GPUs.",
        -6,
    ),
    "cyberpunk-2077": (
        "Tom's Hardware individual game chart (Cyberpunk 2077, DX12, Ultra, no RT) — "
        "avg. ratio to the 11-game raster aggregate across 15 current-gen GPUs.",
        -6,
    ),
    "gta-v": (
        "Tom's Hardware individual game chart (GTA V Enhanced, DXR, Maximum RT — "
        "only RT chart exists for this title). Ranking is non-monotonic by GPU tier "
        "(CPU-bound at 1080p on their rig), so this factor is noisier than the other four.",
        -2,
    ),
}


def build_fps_estimates() -> list[dict]:
    """Anchor+scale FPS matrix: GPU x game x representative CPU x resolution, high preset."""
    gpus = _gpu_by_sku()
    cpus = _cpu_by_sku()
    rows: list[dict] = []
    for gpu_sku, g in gpus.items():
        base = g["fps_1080p_agg"]
        for game_slug, demand, cap in GAMES:
            calibration_note, band_delta = GAME_CALIBRATION.get(
                game_slug,
                ("per-game demand: heuristic prior pending real-data calibration", 0),
            )
            for cpu_sku in FPS_MATRIX_CPUS:
                tier = cpus[cpu_sku]["tier"]
                cpu_factor = CPU_TIER_FACTOR[tier]
                base_fps = base * demand * cpu_factor
                for resolution, (res_mult, base_band) in RES_SCALE.items():
                    band = base_band + band_delta
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
                            calibration_note,
                        ],
                        "is_crowdsourced": False,
                    })
    return rows
