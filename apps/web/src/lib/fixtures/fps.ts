import type { FpsEstimate } from '../repositories/types'

/**
 * Estimativas de FPS por par (CPU, GPU), jogo e resolução.
 * Banda de confiança: 15% (modelo v1 — anchor_scale).
 * Fontes: TechPowerUp, PassMark, Cinebench (cruzamento de benchmarks relativos).
 *
 * IMPORTANTE: estes números são ESTIMATIVAS, não medições próprias.
 * Sempre exibir com `confidence_band_pct`, `method` e `sources`.
 */

export const fpsEstimates: FpsEstimate[] = [
  // ============ Rei dos R$3k — Ryzen 5 5600 + RX 6600 (cpu_id=1, gpu_id=10) ============
  { id: 1, cpu_id: 1, gpu_id: 10, game_slug: 'cs2', resolution: '1080p', preset: 'high', fps: 145, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com', 'passmark.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 2, cpu_id: 1, gpu_id: 10, game_slug: 'cs2', resolution: '1440p', preset: 'high', fps: 105, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 3, cpu_id: 1, gpu_id: 10, game_slug: 'valorant', resolution: '1080p', preset: 'high', fps: 200, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 4, cpu_id: 1, gpu_id: 10, game_slug: 'fortnite', resolution: '1080p', preset: 'high', fps: 110, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 5, cpu_id: 1, gpu_id: 10, game_slug: 'cyberpunk-2077', resolution: '1080p', preset: 'ultra', fps: 52, confidence_band_pct: 18, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 6, cpu_id: 1, gpu_id: 10, game_slug: 'cyberpunk-2077', resolution: '1440p', preset: 'ultra', fps: 38, confidence_band_pct: 18, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 7, cpu_id: 1, gpu_id: 10, game_slug: 'gta-v', resolution: '1080p', preset: 'high', fps: 95, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },

  // ============ Rei dos R$5k — Ryzen 5 7600 + RTX 4060 Ti (cpu_id=2, gpu_id=12) ============
  { id: 10, cpu_id: 2, gpu_id: 12, game_slug: 'cs2', resolution: '1080p', preset: 'high', fps: 210, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com', 'passmark.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 11, cpu_id: 2, gpu_id: 12, game_slug: 'cs2', resolution: '1440p', preset: 'high', fps: 165, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 12, cpu_id: 2, gpu_id: 12, game_slug: 'valorant', resolution: '1080p', preset: 'high', fps: 290, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 13, cpu_id: 2, gpu_id: 12, game_slug: 'cyberpunk-2077', resolution: '1080p', preset: 'ultra', fps: 88, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 14, cpu_id: 2, gpu_id: 12, game_slug: 'cyberpunk-2077', resolution: '1440p', preset: 'ultra', fps: 65, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 15, cpu_id: 2, gpu_id: 12, game_slug: 'fortnite', resolution: '1080p', preset: 'high', fps: 165, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 16, cpu_id: 2, gpu_id: 12, game_slug: 'gta-v', resolution: '1080p', preset: 'high', fps: 145, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },

  // ============ Rei dos R$8k — Ryzen 7 7700X + RTX 4070 Super (cpu_id=3, gpu_id=14) ============
  { id: 20, cpu_id: 3, gpu_id: 14, game_slug: 'cs2', resolution: '1080p', preset: 'high', fps: 285, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com', 'passmark.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 21, cpu_id: 3, gpu_id: 14, game_slug: 'cs2', resolution: '1440p', preset: 'high', fps: 230, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 22, cpu_id: 3, gpu_id: 14, game_slug: 'valorant', resolution: '1440p', preset: 'high', fps: 380, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 23, cpu_id: 3, gpu_id: 14, game_slug: 'cyberpunk-2077', resolution: '1440p', preset: 'ultra', fps: 95, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 24, cpu_id: 3, gpu_id: 14, game_slug: 'cyberpunk-2077', resolution: '4k', preset: 'ultra', fps: 52, confidence_band_pct: 15, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 25, cpu_id: 3, gpu_id: 14, game_slug: 'fortnite', resolution: '1440p', preset: 'high', fps: 230, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },

  // ============ Rei dos R$12k+ — Ryzen 9 7900X + RTX 4080 Super (cpu_id=4, gpu_id=17) ============
  { id: 30, cpu_id: 4, gpu_id: 17, game_slug: 'cs2', resolution: '1080p', preset: 'high', fps: 380, confidence_band_pct: 8, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 31, cpu_id: 4, gpu_id: 17, game_slug: 'cs2', resolution: '1440p', preset: 'high', fps: 320, confidence_band_pct: 8, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 32, cpu_id: 4, gpu_id: 17, game_slug: 'cyberpunk-2077', resolution: '1440p', preset: 'ultra', fps: 130, confidence_band_pct: 10, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 33, cpu_id: 4, gpu_id: 17, game_slug: 'cyberpunk-2077', resolution: '4k', preset: 'ultra', fps: 78, confidence_band_pct: 12, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 34, cpu_id: 4, gpu_id: 17, game_slug: 'valorant', resolution: '1440p', preset: 'high', fps: 510, confidence_band_pct: 8, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },

  // ============ Rei Absoluto — 9800X3D + RTX 4090 (cpu_id=5, gpu_id=19) ============
  { id: 40, cpu_id: 5, gpu_id: 19, game_slug: 'cs2', resolution: '1080p', preset: 'high', fps: 420, confidence_band_pct: 6, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 41, cpu_id: 5, gpu_id: 19, game_slug: 'cs2', resolution: '1440p', preset: 'high', fps: 360, confidence_band_pct: 6, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 42, cpu_id: 5, gpu_id: 19, game_slug: 'cyberpunk-2077', resolution: '4k', preset: 'ultra', fps: 95, confidence_band_pct: 8, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
  { id: 43, cpu_id: 5, gpu_id: 19, game_slug: 'cyberpunk-2077', resolution: '1440p', preset: 'ultra', fps: 155, confidence_band_pct: 8, method: 'anchor_scale', sources: ['techpowerup.com'], created_at: '2026-01-15T00:00:00Z' },
]

export function getFpsEstimate(
  cpuId: number,
  gpuId: number,
  gameSlug: string,
  resolution: string,
): FpsEstimate | undefined {
  return fpsEstimates.find(
    (e) =>
      e.cpu_id === cpuId &&
      e.gpu_id === gpuId &&
      e.game_slug === gameSlug &&
      e.resolution === resolution,
  )
}

export function getFpsByBuild(cpuId: number, gpuId: number): FpsEstimate[] {
  return fpsEstimates.filter((e) => e.cpu_id === cpuId && e.gpu_id === gpuId)
}