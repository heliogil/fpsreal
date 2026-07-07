/**
 * Repository types — subset local dos contracts.
 * Mantém o web app self-contained (não depende do pacote @pcb/contracts instalado).
 * Quando o pacote estiver disponível via workspace, podemos trocar para
 * `import type { ... } from '@pcb/contracts/repositories'` sem mudar consumidores.
 */

// ============================================================
// ENUMS (subset)
// ============================================================

export type ProductCategory =
  | 'cpu' | 'gpu' | 'ram' | 'motherboard' | 'storage'
  | 'psu' | 'case' | 'cooler' | 'fan'

export type BudgetTier = 'r3k' | 'r5k' | 'r8k' | 'r12k_plus'
export type Resolution = '1080p' | '1440p' | '4k'
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra'
export type AirflowStatus = 'ok' | 'tight' | 'critical' | 'dead_zone'
export type PressureBalance = 'positive' | 'neutral' | 'negative'
export type GameSlug =
  | 'cs2' | 'valorant' | 'fortnite' | 'apex-legends' | 'gta-v'
  | 'hogwarts-legacy' | 'cyberpunk-2077' | 'rdr2' | 'elden-ring'
  | 'league-of-legends' | 'minecraft' | 'the-sims-4' | 'call-of-duty-warzone'

// ============================================================
// ENTITY SHAPES (subset usado pela UI)
// ============================================================

export interface Product {
  id: number
  sku: string
  name: string
  category: ProductCategory
  brand: string | null
  specs: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Merchant {
  id: number
  name: string
  slug: string
  affiliate_base_url: string
  affiliate_param: string
  is_active: boolean
  created_at: string
}

export interface Offer {
  id: number
  variant_id: number
  merchant_id: number
  price_brl: number
  in_stock: boolean
  url: string
  last_checked_at: string
}

export interface FpsEstimate {
  id: number
  cpu_id: number
  gpu_id: number
  game_slug: GameSlug
  resolution: Resolution
  preset: GraphicsPreset
  fps: number
  confidence_band_pct: number
  method: string
  sources: string[]
  created_at: string
}

export interface BuildComponents {
  cpu_id: number
  gpu_id: number
  ram_id: number
  motherboard_id: number
  storage_id: number
  psu_id: number
  case_id: number
  cooler_id: number
}

export interface CuratedBuild {
  id: number
  slug: string
  tier: BudgetTier
  title: string
  subtitle: string
  description: string
  components: BuildComponents
  total_price_brl: number
  rs_per_fps_top_game: number
  fps_top_game: number
  top_game_slug: GameSlug
  is_rei_absoluto: boolean
  is_active: boolean
  crowned_at: string
  created_at: string
  updated_at: string
}

export interface BuildAirflowZoneState {
  zone: string
  score: number
  status: AirflowStatus
}

export interface CompatibilityRule {
  id: number
  name: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

// ============================================================
// WIZARD
// ============================================================

export type WizardStep = 'budget' | 'games' | 'priority' | 'results'

export interface WizardInput {
  budget_brl: number
  games: GameSlug[]
  priority: 'fps' | 'budget' | 'quiet' | 'future_proof'
  resolution: Resolution
  session_type: 'new' | 'upgrade'
  existing_components?: Partial<BuildComponents>
}

export interface BuildResult {
  build: CuratedBuild
  fps_estimates: FpsEstimate[]
  offers: Array<Offer & { merchant: Merchant }>
  compatibility_warnings: Array<{ rule: CompatibilityRule; message: string }>
  airflow_summary: {
    pressure_balance: PressureBalance
    zone_scores: BuildAirflowZoneState[]
    warnings: string[]
    confidence: string
  }
  clearance_warnings: Array<{ slot: string; remaining_mm: number; is_tight: boolean }>
}

// ============================================================
// REPOSITORY INTERFACES
// ============================================================

export interface ProductRepository {
  getById(id: number): Promise<Product | null>
  getByCategory(category: ProductCategory): Promise<Product[]>
  search(query: string): Promise<Product[]>
}

export interface BuildRepository {
  getAll(): Promise<CuratedBuild[]>
  getByTier(tier: BudgetTier): Promise<CuratedBuild | null>
  getReiAbsoluto(): Promise<CuratedBuild | null>
  getBySlug(slug: string): Promise<CuratedBuild | null>
  runWizard(input: WizardInput): Promise<BuildResult[]>
}

export interface OfferRepository {
  getByVariant(variant_id: number): Promise<Array<Offer & { merchant: Merchant }>>
  getBestOffer(product_id: number): Promise<(Offer & { merchant: Merchant }) | null>
  getPriceHistory(offer_id: number, days?: number): Promise<Array<{ ts: string; price_brl: number }>>
}

export interface FpsRepository {
  getEstimate(
    cpu_id: number,
    gpu_id: number,
    game_slug: GameSlug,
    resolution: Resolution,
  ): Promise<FpsEstimate | null>
  getByBuild(cpu_id: number, gpu_id: number): Promise<FpsEstimate[]>
}

export interface CompatibilityRepository {
  checkBuild(components: Partial<BuildComponents>): Promise<{
    errors: string[]
    warnings: string[]
    clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
    airflow: BuildAirflowZoneState[]
  }>
}

export interface TrackingRepository {
  recordClick(
    offer_id: number,
    context: {
      build_id?: number
      utm_source?: string
      utm_medium?: string
      utm_campaign?: string
      referer?: string
    },
  ): Promise<void>
}

export interface RootRepository {
  products: ProductRepository
  builds: BuildRepository
  offers: OfferRepository
  fps: FpsRepository
  compatibility: CompatibilityRepository
  tracking: TrackingRepository
}