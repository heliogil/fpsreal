import type { GameSlug } from './repositories/types'

/**
 * A métrica-mãe do site: CUSTO POR FPS = preço total ÷ FPS médio nos jogos de
 * referência, em 1080p.
 *
 * Fonte ÚNICA. A página da build, a home, a og:image, os cards e as páginas
 * "X vs Rei" leem todos `CuratedBuild.rs_per_fps` / `avg_fps`, calculados aqui
 * a partir das mesmas linhas da API. Antes cada sítio fazia a sua conta (a
 * og:image usava só o CS2, a home arredondava cada jogo antes da média) e o
 * mesmo build aparecia com três números diferentes.
 */
export const REFERENCE_GAMES: GameSlug[] = ['valorant', 'cs2', 'fortnite', 'gta-v'] as GameSlug[]
export const REFERENCE_RES = '1080p'

/** FPS médio (sem arredondar) nos jogos de referência presentes em `rows`; 0 se nenhum. */
export function avgReferenceFps(rows: { game_slug: string; fps: number }[]): number {
  const picked = rows.filter((r) => (REFERENCE_GAMES as string[]).includes(r.game_slug) && r.fps > 0)
  if (!picked.length) return 0
  return picked.reduce((s, r) => s + r.fps, 0) / picked.length
}

export function costPerFps(totalBrl: number, avgFps: number): number {
  return totalBrl > 0 && avgFps > 0 ? totalBrl / avgFps : 0
}
