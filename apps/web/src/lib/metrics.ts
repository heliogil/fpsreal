import type { GameSlug } from './repositories/types'

/**
 * A métrica-mãe do site: CUSTO POR FPS = preço total ÷ FPS médio nos jogos de
 * referência, em 1080p. "Médio" = média GEOMÉTRICA: o FPS de cada jogo vive numa
 * escala diferente (Valorant/CS2 nas centenas, Fortnite/GTA V nas dezenas) e a
 * aritmética deixava os eSports mandarem no número. A geométrica pesa cada jogo
 * por igual — é o que o Tom's Hardware usa no agregado de 11 jogos e o que a API
 * usa (services/ingestion/fps_math.py).
 *
 * Fonte ÚNICA. A página da build, a home, a og:image, os cards e as páginas
 * "X vs Rei" leem todos `CuratedBuild.rs_per_fps` / `avg_fps`, calculados aqui
 * a partir das mesmas linhas da API. Antes cada sítio fazia a sua conta (a
 * og:image usava só o CS2, a home arredondava cada jogo antes da média) e o
 * mesmo build aparecia com três números diferentes.
 */
export const REFERENCE_GAMES: GameSlug[] = ['valorant', 'cs2', 'fortnite', 'gta-v'] as GameSlug[]
export const REFERENCE_RES = '1080p'

/** Média geométrica dos valores > 0; 0 se nenhum. */
export function geomean(values: number[]): number {
  const v = values.filter((x) => x > 0)
  if (!v.length) return 0
  return Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length)
}

/** FPS médio (geométrico, sem arredondar) nos jogos de referência presentes em `rows`; 0 se nenhum. */
export function avgReferenceFps(rows: { game_slug: string; fps: number }[]): number {
  return geomean(rows.filter((r) => (REFERENCE_GAMES as string[]).includes(r.game_slug)).map((r) => r.fps))
}

export function costPerFps(totalBrl: number, avgFps: number): number {
  return totalBrl > 0 && avgFps > 0 ? totalBrl / avgFps : 0
}
