import type { CuratedBuild, FpsEstimate, GameSlug, WizardInput } from './repositories/types'
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
    slug: '',
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

// ---------------------------------------------------------------------------
// Curated builds (Tronos) + detail page data
// ---------------------------------------------------------------------------

type BuildOut = {
  id: number
  slug: string
  name: string
  budget_tier: string
  is_rei: boolean
  total_price_brl: number | null
  fps_per_brl: number | null
  seo_description: string | null
  is_active: boolean
  crowned_at: string | null
  components: Record<string, { id: number; name: string; category: string }>
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

function compId(b: BuildOut, cat: string): number {
  return b.components[cat]?.id ?? 0
}

async function buildOutToCurated(b: BuildOut): Promise<CuratedBuild> {
  const cpuId = compId(b, 'cpu')
  const gpuId = compId(b, 'gpu')
  const total = b.total_price_brl ?? 0
  const fpb = b.fps_per_brl ?? 0
  const cs2 = await getJson<FpsEstimate | null>(
    `/fps/?cpu=${cpuId}&gpu=${gpuId}&game=cs2&res=1080p`,
  )
  const fpsTop = cs2?.fps ?? Math.round(fpb * total)
  const now = new Date().toISOString()
  return {
    id: b.id,
    slug: b.slug,
    tier: b.budget_tier as CuratedBuild['tier'],
    title: b.name,
    subtitle: b.seo_description ?? '',
    description: b.seo_description ?? '',
    components: {
      cpu_id: cpuId,
      gpu_id: gpuId,
      ram_id: compId(b, 'ram'),
      motherboard_id: compId(b, 'motherboard'),
      storage_id: compId(b, 'storage'),
      psu_id: compId(b, 'psu'),
      case_id: compId(b, 'case'),
      cooler_id: compId(b, 'cooler'),
    },
    total_price_brl: total,
    rs_per_fps_top_game: fpsTop > 0 ? total / fpsTop : 0,
    fps_top_game: Math.round(fpsTop),
    top_game_slug: 'cs2' as GameSlug,
    is_rei_absoluto: b.slug === 'rei-absoluto',
    is_active: b.is_active,
    crowned_at: b.crowned_at ?? now,
    created_at: b.crowned_at ?? now,
    updated_at: now,
  }
}

export async function getLiveBuilds(): Promise<CuratedBuild[] | null> {
  const builds = await getJson<BuildOut[]>('/builds/')
  if (builds === null) return null
  return Promise.all(builds.map(buildOutToCurated))
}

export async function getLiveBuildBySlug(slug: string): Promise<CuratedBuild | null> {
  const all = await getLiveBuilds()
  return all?.find((b) => b.slug === slug) ?? null
}

export type LiveProduct = {
  id: number
  sku: string
  name: string
  brand: string | null
  /** JSONB de specs do catálogo (tdp_w, length_mm, watts, ram_type, …) — usado p/ escolher a variante visual da peça. */
  specs?: Record<string, unknown>
}
export async function getLiveProduct(id: number): Promise<LiveProduct | null> {
  if (!id) return null
  return getJson<LiveProduct>(`/products/${id}`)
}

// Fix 3: accepts optional resolution param (default 1080p)
export async function getLiveFpsByBuild(
  cpuId: number,
  gpuId: number,
  res = '1080p',
): Promise<FpsEstimate[]> {
  const rows = await getJson<FpsEstimate[]>(`/fps/?cpu=${cpuId}&gpu=${gpuId}&res=${res}`)
  return rows ?? []
}

export type LiveOffer = { id: number; price_brl: number; url: string; merchant: { name: string } }
export async function getLiveBestOffer(productId: number): Promise<LiveOffer | null> {
  if (!productId) return null
  return getJson<LiveOffer>(`/offers/best?product=${productId}`)
}

export type CompatCheck = { a: string; b: string; label: string; status: string; message: string | null }
export type LiveCompat = {
  errors: string[]
  warnings: string[]
  clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
  checks?: CompatCheck[]
  airflow: unknown[]
}
export async function checkLiveCompatibility(
  components: Record<string, number>,
): Promise<LiveCompat | null> {
  return postJson<LiveCompat>('/compatibility/check', { components })
}

// ---------------------------------------------------------------------------
// Case interior
// ---------------------------------------------------------------------------

export type InteriorZone = { zone: string; type: string; status: string }

/** Geometria paramétrica (mm, vista lateral) — volumetria + motor de vento composicional. */
export type GeoMount = {
  id: string
  kind: string
  accepts: string[]
  x: number; y: number; w: number; h: number
  orient: 'intake' | 'exhaust'
  stock: boolean
  occupied_by: 'stock_fan' | 'aio_radiator' | null
  cfm: number
}
export type GeoPlacement = {
  part: string
  x: number; y: number; w: number; h: number
  source: 'spec' | 'form_factor_default'
  fan_count?: number
  sticks?: number
  mount?: string
}
export type GeoFlow = {
  from: { x: number; y: number; h: number }
  to: { x: number; y: number; w?: number; h?: number; side: 'rear' | 'top' }
  cfm: number
  intensity: number
  heat_at: number[]
}
export type InteriorGeometry = {
  unit: 'mm'
  note: string
  case: { depth_mm: number; height_mm: number; shroud_h_mm: number }
  mounts: GeoMount[]
  placements: GeoPlacement[]
  flows: GeoFlow[]
}

export type LiveInterior = {
  method: string
  case: {
    name: string | null
    form_factor: string | null
    airflow_class: string | null
    max_gpu_length_mm: number | null
    max_cooler_height_mm: number | null
  }
  parts: {
    cpu: { name: string | null; tdp_w: number }
    gpu: { name: string | null; length_mm: number; tdp_w: number }
    cooler: { name: string | null; height_mm: number }
  }
  clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
  airflow: {
    score: number
    pressure_balance: string
    cfm: number
    intake_cfm?: number
    exhaust_cfm?: number
    fans?: { intake: number; exhaust: number }
    heat: { cpu_w: number; gpu_w: number; total_w: number }
    zones: InteriorZone[]
  }
  geometry: InteriorGeometry | null
}

export async function getLiveInterior(
  components: Record<string, number>,
): Promise<LiveInterior | null> {
  return postJson<LiveInterior>('/interior/estimate', { components })
}

// ---------------------------------------------------------------------------
// GPU head-to-head comparison
// ---------------------------------------------------------------------------

export type VsGpuSpec = {
  id: number
  sku: string
  name: string
  brand: string
  tdp_w: number
  vram_gb: number
  length_mm: number
  fps_1080p_agg: number
  index_value: number
}

export type VsGameRow = {
  game_slug: string
  game_label: string
  fps_a: number
  fps_b: number
  delta_pct: number
  winner: 'a' | 'b' | 'tie'
}

export type VsData = {
  gpu_a: VsGpuSpec
  gpu_b: VsGpuSpec
  resolution: string
  reference_cpu_name: string
  reference_cpu_sku: string
  overall_winner: 'a' | 'b' | 'tie'
  avg_fps_a: number
  avg_fps_b: number
  avg_delta_pct: number
  rows: VsGameRow[]
}

export async function getLiveVs(
  skuA: string,
  skuB: string,
  res = '1080p',
): Promise<VsData | null> {
  return getJson<VsData>(`/vs/${skuA}/${skuB}?res=${res}`)
}
