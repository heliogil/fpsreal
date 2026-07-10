/**
 * Server-side adapter: maps the live pcb_api into the web's CuratedBuild shape.
 *
 * Used by server components (SSR) to render the real engine instead of mock
 * fixtures. Fetches the internal API (no CORS). Returns [] on any failure so
 * callers can fall back to mock gracefully.
 *
 * NOTE: while prices come from the 'amostra' (demo) merchant, these builds are
 * sample-priced — the caller should label them as such.
 */
import type { CuratedBuild, GameSlug, WizardInput } from './repositories/types'
import { priorityLabel } from './labels'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

type WizComponent = { category: string; product_id: number; name: string; cheapest_price_brl: number }
type WizFig = {
  game_slug: string
  fps_estimate: number
  confidence_band_pct: number | null
  method: string
  sources: string[]
}
type WizCandidate = {
  cpu_id: number
  gpu_id: number
  total_price_brl: number
  total_tdp_w: number
  avg_fps: number
  fps_per_brl: number
  fps_figures: WizFig[]
  components: WizComponent[]
}
type WizResponse = { priority: string; resolution: string; candidates: WizCandidate[] }

function candidateToBuild(
  c: WizCandidate,
  idx: number,
  priority: string,
  resolution: string,
): CuratedBuild {
  const byCat: Record<string, WizComponent> = Object.fromEntries(
    c.components.map((x) => [x.category, x]),
  )
  const cpu = byCat['cpu']
  const gpu = byCat['gpu']
  const top = c.fps_figures[0]
  const now = new Date().toISOString()
  return {
    id: idx + 1,
    slug: '', // dynamic build — no detail page
    tier: 'r5k',
    title: `${cpu?.name ?? 'CPU'} + ${gpu?.name ?? 'GPU'}`,
    subtitle: `Montado para ${priorityLabel(priority)} · ${resolution}`,
    description: '',
    components: {
      cpu_id: c.cpu_id,
      gpu_id: c.gpu_id,
      ram_id: byCat['ram']?.product_id ?? 0,
      motherboard_id: byCat['motherboard']?.product_id ?? 0,
      storage_id: byCat['storage']?.product_id ?? 0,
      psu_id: byCat['psu']?.product_id ?? 0,
      case_id: byCat['case']?.product_id ?? 0,
      cooler_id: byCat['cooler']?.product_id ?? 0,
    },
    total_price_brl: c.total_price_brl,
    rs_per_fps_top_game: c.avg_fps > 0 ? c.total_price_brl / c.avg_fps : 0,
    fps_top_game: top ? Math.round(top.fps_estimate) : Math.round(c.avg_fps),
    top_game_slug: (top?.game_slug ?? 'cs2') as GameSlug,
    is_rei_absoluto: false,
    is_active: true,
    crowned_at: now,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Runs the live wizard. Returns `null` on transport/parse failure (caller
 * should fall back to mock), or an array (possibly empty) when the API
 * responded — an empty array is an honest "nothing fit the budget".
 */
export async function runLiveWizard(input: WizardInput): Promise<CuratedBuild[] | null> {
  try {
    const res = await fetch(`${API}/wizard/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        budget_brl: input.budget_brl,
        games: input.games,
        resolution: input.resolution,
        preset: 'high',
        priority: input.priority,
      }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as WizResponse
    return (data.candidates ?? []).map((c, i) =>
      candidateToBuild(c, i, data.priority ?? input.priority, data.resolution ?? input.resolution),
    )
  } catch {
    return null
  }
}
