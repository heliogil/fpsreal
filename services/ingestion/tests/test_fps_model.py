"""Unit tests for the FPS formula (seed.performance_data.estimate_fps).

Guards the bottleneck model introduced 2026-11-18: the CPU factor (measured
with an RTX 5090 at 1080p) must only cap FPS when the CPU is actually the
limit — before, it was multiplied into every row and made cheap, GPU-bound
builds look ~40% slower than reality.
"""
from seed.performance_data import ANCHOR_GPU_SKU, build_fps_estimates, estimate_fps

ANCHOR = 204.0  # RTX 5090 1080p aggregate


def test_gpu_bound_card_ignores_cpu_factor():
    # RTX 4060 (72) with a 0.63 CPU: GPU limit 72 < CPU ceiling 204*0.63=128.5
    assert estimate_fps(72, ANCHOR, 1.0, 0.63, 1.0) == 72
    assert estimate_fps(72, ANCHOR, 1.0, 1.00, 1.0) == 72


def test_cpu_bound_combo_is_capped_by_cpu_ceiling():
    # RTX 5090 with a 0.63 CPU: the CPU ceiling wins
    assert estimate_fps(204, ANCHOR, 1.0, 0.63, 1.0) == ANCHOR * 0.63


def test_resolution_only_scales_the_gpu_side():
    # at 4K the GPU limit drops; the CPU ceiling does not
    fps_4k = estimate_fps(204, ANCHOR, 1.0, 0.63, 0.37)
    assert fps_4k == 204 * 0.37


def test_engine_cap_applies():
    assert estimate_fps(204, ANCHOR, 1.0, 1.0, 1.0, cap=60) == 60


def test_faster_gpu_never_loses_with_same_cpu():
    rows = build_fps_estimates()
    by = {(r["cpu_sku"], r["gpu_sku"], r["game_slug"], r["resolution"]): r["fps_estimate"] for r in rows}
    for (cpu, gpu, game, res), fps in by.items():
        anchor = by[(cpu, ANCHOR_GPU_SKU, game, res)]
        assert fps <= anchor + 1e-6, f"{gpu} beats the anchor on {cpu}/{game}/{res}"


def test_matrix_rows_are_labelled_with_the_model():
    rows = build_fps_estimates()
    assert rows and all(r["method"] == "anchor_scale" for r in rows)
    assert all(any("bottleneck model" in s for s in r["sources"]) for r in rows)
