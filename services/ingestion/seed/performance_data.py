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

The aggregate 1080p signal is sourced. The per-game demand factors and CPU
scale factors are calibrated against real data where a source exists (see
GAME_CALIBRATION / CPU_CALIBRATION below) and fall back to HEURISTIC priors
otherwise — every row's ``sources`` says which, with a confidence band that
narrows for calibrated entries and stays at the full ±18% baseline for
heuristic ones. They are the seed for the crowdsourced calibration loop
(strategy #3), not a claim of precision.
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
# bottleneck, hence the spread. Flagship X3D = reference (1.0). Fallback for
# any sku not covered by CPU_CALIBRATION below (no real data found).
# ---------------------------------------------------------------------------
CPU_TIER_FACTOR = {
    "flagship": 1.00,
    "high":     0.96,
    "mid":      0.92,
    "budget":   0.86,
}

CPU_PERF_SOURCE_URL = "https://www.tomshardware.com/reviews/cpu-hierarchy,4312.html"

# Direct per-CPU overrides, calibrated 2026-08-13 against Tom's Hardware's own
# CPU Benchmarks Hierarchy 2026 (Gaming CPU Benchmarks Rankings — RTX 5090 FE,
# 17-game 1080p geomean, every CPU on ONE fixed GPU: the CPU-side mirror of
# the GPU-hierarchy calibration, same publisher/methodology discipline).
# Falls back to CPU_TIER_FACTOR for any sku not listed here (no real data or
# no safe proxy found — cpu-r7-9700x and cpu-i5-13400f aren't on either of
# Tom's Hardware's CPU tables at all).
#
# cpu-r7-9800x3d/cpu-r7-7800x3d are read straight off that table (97.0% /
# 85.6%), normalized so 9800X3D=1.00 — consistent with fps_1080p_agg's own
# anchor, since 9800X3D is literally the GPU-hierarchy's test rig, not a
# second independent anchor.
#
# cpu-i5-14600kf has no own listing; the 14600K (same cores/clocks, KF just
# drops the iGPU — a well-documented zero-difference-in-gaming substitution)
# is used as a same-table proxy: 72.8% / 97.0%.
#
# cpu-r5-7600 and cpu-r5-5600 aren't on the 2026 (RTX 5090/Zen5-era) table at
# all — bridged from Tom's Hardware's own SEPARATE 2020-2022 legacy CPU table
# (different GPU/game suite) via the one CPU present on BOTH tables
# (i9-13900K: 76.8% on the 2026 table vs 100% — its own anchor — on the
# legacy table), a x0.768 normalization factor. Cross-checked against two
# other CPUs present on both tables (13600K, 13700K): the bridged value lands
# within ~2 points of their real 2026-table score, so the bridge is trusted
# within that error band — reflected in a smaller confidence tightening than
# the direct reads. cpu-r5-5600 itself isn't on the legacy table either; its
# close sibling 5600X (slightly higher boost clock) is used as the nearest
# proxy, so it's a mild upper-bound estimate stacked on top of the bridge,
# not a direct reading — smallest confidence tightening of the five.
CPU_CALIBRATION = {
    "cpu-r7-9800x3d": (
        1.00,
        "Tom's Hardware CPU Benchmarks Hierarchy 2026, Gaming CPU Benchmarks Rankings — "
        "anchor: this is the exact CPU used as the GPU-hierarchy's test rig.",
        0,
    ),
    "cpu-r7-7800x3d": (
        0.88,
        "Tom's Hardware CPU Benchmarks Hierarchy 2026, Gaming CPU Benchmarks Rankings — "
        "85.6% vs 9800X3D's 97.0%, both read directly off the same table.",
        -4,
    ),
    "cpu-i5-14600kf": (
        0.75,
        "Tom's Hardware CPU Benchmarks Hierarchy 2026 — no direct 14600KF listing; "
        "the 14600K (identical cores/clocks, KF just drops the iGPU) used as a "
        "same-table proxy — 72.8% vs 9800X3D's 97.0%.",
        -3,
    ),
    "cpu-r5-7600": (
        0.63,
        "No 2026-table listing. Bridged from Tom's Hardware's separate 2020-2022 "
        "legacy CPU table (79.74%, different GPU/game suite) via the i9-13900K "
        "datapoint present on both tables (x0.768 normalization). Cross-checked "
        "within ~2 points against two other shared CPUs (13600K, 13700K).",
        -2,
    ),
    "cpu-r5-5600": (
        0.53,
        "Same legacy-table bridge as the 7600, but the 5600 itself isn't listed "
        "there either — its sibling 5600X (slightly higher boost clock) used as "
        "the nearest proxy, so this is a mild upper-bound estimate, not a direct "
        "reading.",
        -1,
    ),
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


def _cpu_factor_and_sources(cpu_sku: str, tier: str) -> tuple[float, list[str], int]:
    """CPU 1080p scale factor + its sourcing, preferring a real per-CPU
    calibration over the tier heuristic when one exists."""
    if cpu_sku in CPU_CALIBRATION:
        factor, note, band_delta = CPU_CALIBRATION[cpu_sku]
        return factor, [CPU_PERF_SOURCE_URL, note], band_delta
    return (
        CPU_TIER_FACTOR[tier],
        ["per-CPU-tier factor: heuristic prior pending real-data calibration"],
        0,
    )


def build_fps_estimates() -> list[dict]:
    """Anchor+scale FPS matrix: GPU x game x representative CPU x resolution, high preset."""
    gpus = _gpu_by_sku()
    cpus = _cpu_by_sku()
    rows: list[dict] = []
    for gpu_sku, g in gpus.items():
        base = g["fps_1080p_agg"]
        for game_slug, demand, cap in GAMES:
            calibration_note, game_band_delta = GAME_CALIBRATION.get(
                game_slug,
                ("per-game demand: heuristic prior pending real-data calibration", 0),
            )
            for cpu_sku in FPS_MATRIX_CPUS:
                tier = cpus[cpu_sku]["tier"]
                cpu_factor, cpu_sources, cpu_band_delta = _cpu_factor_and_sources(cpu_sku, tier)
                base_fps = base * demand * cpu_factor
                for resolution, (res_mult, base_band) in RES_SCALE.items():
                    band = base_band + game_band_delta + cpu_band_delta
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
                        ] + cpu_sources,
                        "is_crowdsourced": False,
                    })
    return rows
