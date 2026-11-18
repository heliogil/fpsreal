"""Recalcula ``fps_estimates`` NO SÍTIO com a fórmula atual (``estimate_fps``).

Porquê um script à parte em vez de ``run_seed``:
- ``run_seed`` regera a matriz a partir de ``catalog_data.GPUS`` (17 GPUs), mas
  a produção tem linhas para 19 — a RTX 5050 e a RX 9070 GRE foram
  acrescentadas direto no banco (ver docs/FPS-CALIBRACAO.md). Rodar o seed
  deixaria essas duas na fórmula antiga.
- ``run_seed`` também reescreve ``products.specs`` a partir do catálogo, que
  está atrás do banco em alguns campos (comprimentos de GPU corrigidos pelo
  ``specs/aib_adapter.py``).

Este script só ATUALIZA linhas que já existem (mesma cobertura, nada criado
nem apagado), lendo o ``fps_1080p_agg`` de cada GPU do próprio banco e o fator
de CPU de ``performance_data`` (calibrado ou heurístico, com a mesma fonte).

    python -m seed.recompute_fps            # simulação: mostra o antes/depois
    python -m seed.recompute_fps --apply    # grava (uma transação)
"""
from __future__ import annotations

import json
import sys

from .catalog_data import CPUS
from .performance_data import (
    ANCHOR_GPU_SKU,
    BOTTLENECK_NOTE,
    GAME_CALIBRATION,
    GAMES,
    RES_CALIBRATION_NOTE,
    RES_SCALE,
    PERF_SOURCE_URL,
    _cpu_factor_and_sources,
    estimate_fps,
)
from .run_seed import _connect

REFERENCE_GAMES = ("valorant", "cs2", "fortnite", "gta-v")  # mesma média do site (apps/web/src/lib/metrics.ts)


def main() -> None:
    apply = "--apply" in sys.argv
    games = {slug: (demand, cap) for slug, demand, cap in GAMES}
    cpu_tier = {row[0]: row[-1] for row in CPUS}

    conn = _connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, sku, (specs->>'fps_1080p_agg')::float FROM products WHERE category = 'gpu'"
            )
            gpu = {pid: (sku, agg) for pid, sku, agg in cur.fetchall()}
            anchor_agg = next(agg for sku, agg in gpu.values() if sku == ANCHOR_GPU_SKU)
            cur.execute("SELECT id, sku FROM products WHERE category = 'cpu'")
            cpu = dict(cur.fetchall())

            cur.execute(
                "SELECT id, cpu_id, gpu_id, game_slug, resolution, fps_estimate "
                "FROM fps_estimates WHERE is_crowdsourced = false"
            )
            rows = cur.fetchall()

            updated = skipped = 0
            for rid, cpu_id, gpu_id, game, res, old in rows:
                gsku, gagg = gpu.get(gpu_id, (None, None))
                csku = cpu.get(cpu_id)
                if gagg is None or csku not in cpu_tier or game not in games or res not in RES_SCALE:
                    skipped += 1
                    continue
                demand, cap = games[game]
                cpu_factor, cpu_sources, cpu_band_delta = _cpu_factor_and_sources(csku, cpu_tier[csku])
                res_mult, base_band = RES_SCALE[res]
                calibration_note, game_band_delta = GAME_CALIBRATION.get(
                    game, ("per-game demand: heuristic prior pending real-data calibration", 0)
                )
                band = base_band + game_band_delta + cpu_band_delta
                fps = round(estimate_fps(gagg, anchor_agg, demand, cpu_factor, res_mult, cap), 1)
                fps_low = round(fps * (1 - band / 100.0), 1)
                res_note = RES_CALIBRATION_NOTE.get(res)
                sources = [PERF_SOURCE_URL, BOTTLENECK_NOTE, calibration_note] + cpu_sources + (
                    [res_note] if res_note else []
                )
                cur.execute(
                    "UPDATE fps_estimates SET fps_estimate=%s, fps_low_1pct=%s, confidence_band_pct=%s, "
                    "sources=%s::jsonb, updated_at=NOW() WHERE id=%s",
                    (fps, fps_low, band, json.dumps(sources), rid),
                )
                updated += 1

            # resumo por trono: FPS médio de referência em 1080p, antes do commit
            cur.execute(
                """
                SELECT b.slug, b.total_price_brl,
                       AVG(f.fps_estimate) FILTER (WHERE f.game_slug = ANY(%s))
                FROM curated_builds b
                JOIN fps_estimates f
                  ON f.cpu_id = b.cpu_id
                 AND f.gpu_id = b.gpu_id
                 AND f.resolution = '1080p'
                WHERE b.is_active
                GROUP BY b.slug, b.total_price_brl
                ORDER BY b.total_price_brl
                """,
                (list(REFERENCE_GAMES),),
            )
            print(f"linhas recalculadas: {updated} · ignoradas: {skipped} · âncora {ANCHOR_GPU_SKU}={anchor_agg}")
            for slug, total, avg in cur.fetchall():
                if avg:
                    print(f"  {slug:14} FPS médio {avg:6.1f} · R$/FPS {float(total) / float(avg):6.2f}")

        if apply:
            conn.commit()
            print("COMMIT — fps_estimates atualizado")
        else:
            conn.rollback()
            print("simulação — nada gravado (use --apply)")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
