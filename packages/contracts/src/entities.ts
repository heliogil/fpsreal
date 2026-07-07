/**
 * Database entity types for pc-builder-br (Rei do FPS).
 * Mirrors the 17 tables defined in db/schema.sql.
 * No `any` — strict typing throughout.
 */

// BuildComponents is a composite shape owned by repositories.ts; import it
// here so BuildSession.components can reference it without a cycle.
import type { BuildComponents } from './repositories.js'

// ============================================================
// ENUMS (string literal unions matching CHECK constraints)
// ============================================================

/** Categories of PC components in the catalog. */
export type ProductCategory =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'motherboard'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooler'
  | 'fan'

/** Budget tiers used for the "Tronos" (price-range thrones). */
export type BudgetTier = 'r3k' | 'r5k' | 'r8k' | 'r12k_plus'

/** Cooler tiers (drives thermal rule resolution). */
export type CoolerType = 'stock' | 'tower_65w' | 'tower_125w' | 'aio_240' | 'aio_360'

/** Airflow simulation status for a zone or whole build. */
export type AirflowStatus = 'ok' | 'tight' | 'critical' | 'dead_zone'

/** Case pressure balance (sum of intake vs. exhaust CFM). */
export type PressureBalance = 'positive' | 'neutral' | 'negative'

/** Benchmark families used by the performance engine. */
export type BenchmarkType =
  | 'gaming_1080p'
  | 'gaming_1440p'
  | 'gaming_4k'
  | 'rendering'
  | 'compute'

/** Common resolutions used by FPS estimates and the wizard. */
export type Resolution = '1080p' | '1440p' | '4k'

/** Graphics presets referenced by FPS estimates. */
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra'

/** Operators supported by compatibility_rules.operator. */
export type CompatibilityOperator = 'equals' | 'gte' | 'lte' | 'in' | 'not_in'

/** Severity levels emitted by the compatibility engine. */
export type CompatibilitySeverity = 'error' | 'warning' | 'info'

/** Minimum airflow requirement for a thermal rule. */
export type AirflowRequirement = 'passive' | 'low' | 'medium' | 'high'

/** Zone classification inside a case airflow model. */
export type AirflowZoneType = 'intake' | 'exhaust' | 'internal' | 'dead'

/** Build session kind. */
export type SessionType = 'new' | 'upgrade'

/** How merchant data is ingested. */
export type DataSource = 'api' | 'feed' | 'scraper'

// ============================================================
// CATALOG (5 tables)
// ============================================================

/** Top-level product master record (mirrors `products`). */
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

/** A SKU variant under a product (mirrors `variants`). */
export interface Variant {
  id: number
  product_id: number
  variant_name: string | null
  ean: string | null
  is_active: boolean
  created_at: string
}

/** A partner merchant / store (mirrors `merchants`). */
export interface Merchant {
  id: number
  slug: string
  name: string
  affiliate_base_url: string | null
  data_source: DataSource | null
  is_active: boolean
  last_sync_at: string | null
}

/** A live price offer from a merchant (mirrors `offers`). */
export interface Offer {
  id: number
  variant_id: number
  merchant_id: number
  external_id: string | null
  url: string
  price_brl: number
  is_available: boolean
  affiliate_url: string | null
  last_seen_at: string
  created_at: string
}

/** Historical price point for a single offer (mirrors `price_history`). */
export interface PriceHistory {
  id: number
  offer_id: number
  price_brl: number
  is_available: boolean
  recorded_at: string
}

// ============================================================
// PERFORMANCE ENGINE (2 tables)
// ============================================================

/** Normalised performance index for a single product (mirrors `performance_index`). */
export interface PerformanceIndex {
  id: number
  product_id: number
  benchmark_type: BenchmarkType
  index_value: number
  anchor_product_id: number | null
  source: string | null
  source_url: string | null
  source_date: string | null
  /** 0.00–1.00 — confidence of the index value. */
  confidence: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** Per-game FPS estimate for a CPU+GPU pair (mirrors `fps_estimates`). */
export interface FpsEstimate {
  id: number
  cpu_id: number
  gpu_id: number
  game_slug: string
  resolution: Resolution
  preset: GraphicsPreset | null
  fps_estimate: number
  fps_low_1pct: number | null
  /** Width of the confidence band, as a percentage. */
  confidence_band_pct: number | null
  method: string
  sources: string[]
  is_crowdsourced: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// COMPATIBILITY ENGINE (2 tables)
// ============================================================

/** Declarative rule that the compatibility engine evaluates (mirrors `compatibility_rules`). */
export interface CompatibilityRule {
  id: number
  rule_type: string
  category_a: string
  attribute_a: string
  operator: CompatibilityOperator
  category_b: string
  attribute_b: string
  severity: CompatibilitySeverity
  message_template: string | null
  is_active: boolean
}

/** Rule that maps TDP ranges to minimum cooler/airflow requirements (mirrors `thermal_rules`). */
export interface ThermalRule {
  id: number
  product_id: number | null
  tdp_min_w: number | null
  tdp_max_w: number | null
  min_cooler_type: CoolerType
  min_case_airflow: AirflowRequirement | null
  notes: string | null
}

// ============================================================
// SLOT MODEL (2 tables)
// ============================================================

/** A physical slot inside a chassis, with propagation hints (mirrors `case_slots`). */
export interface CaseSlot {
  id: number
  case_product_id: number
  slot_name: string
  slot_type: string
  axis: 'x' | 'y' | 'z'
  position_front_mm: number | null
  position_top_mm: number | null
  position_right_mm: number | null
  base_capacity_mm: number
  affects_slots: string[]
}

/** Physical footprint + 3D model reference for a component (mirrors `component_footprints`). */
export interface ComponentFootprint {
  id: number
  product_id: number
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  installed_thickness_mm: number | null
  slot_type_required: string | null
  airflow_zone: string | null
  /** 0.00–1.00 — resistance to airflow produced by this component. */
  airflow_resistance_factor: number
  model_gltf_path: string | null
  model_generated_at: string | null
  dimensions_source: string
  updated_at: string
}

// ============================================================
// AIRFLOW SIMULATION (1 table)
// ============================================================

/** A node in the case airflow graph (mirrors `case_airflow_zones`). */
export interface CaseAirflowZone {
  id: number
  case_product_id: number
  zone_name: string
  zone_type: AirflowZoneType | null
  base_flow_capacity_cfm: number | null
  connects_to: string[]
  heat_source_slots: string[]
}

// ============================================================
// CURATED BUILDS + TRONOS (2 tables)
// ============================================================

/** A curated PC build — and the per-tier throne (mirrors `curated_builds`). */
export interface CuratedBuild {
  id: number
  slug: string
  name: string
  budget_tier: BudgetTier | null
  is_rei: boolean
  cpu_id: number | null
  gpu_id: number | null
  ram_id: number | null
  motherboard_id: number | null
  storage_id: number | null
  psu_id: number | null
  case_id: number | null
  cooler_id: number | null
  total_price_brl: number | null
  /** The central metric — FPS per BRL. */
  fps_per_brl: number | null
  seo_description: string | null
  is_active: boolean
  crowned_at: string
  dethroned_at: string | null
  created_at: string
}

/** Tracked affiliate click (mirrors `affiliate_clicks`). */
export interface AffiliateClick {
  id: number
  offer_id: number
  build_id: number | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referer: string | null
  user_agent: string | null
  ip_hash: string | null
  clicked_at: string
}

// ============================================================
// BUILD SESSIONS (3 tables)
// ============================================================

/** A wizard session, holding input + computed state (mirrors `build_sessions`). */
export interface BuildSession {
  /** UUID. */
  id: string
  session_type: SessionType
  budget_brl: number | null
  games: string[]
  priority: string | null
  components: Partial<BuildComponents>
  clearances: Record<string, BuildClearance>
  airflow_state: Record<string, BuildAirflowZoneState>
  created_at: string
  updated_at: string
}

/** Per-slot clearance result inside a session (mirrors `build_clearances`). */
export interface BuildClearance {
  slot_name: string
  base_capacity_mm: number
  used_mm: number
  remaining_mm: number
  constraint_sources: Array<{
    component_id: number
    component_name: string
    used_mm: number
  }>
  is_tight: boolean
  is_blocked: boolean
}

/** Per-zone airflow state inside a session (mirrors `build_airflow_state`). */
export interface BuildAirflowZoneState {
  zone_name: string
  source_cfm: number
  exhaust_cfm: number
  effective_flow_cfm: number
  heat_generation_w: number
  pressure_balance: PressureBalance | null
  /** 0–100 score. */
  airflow_score: number
  status: AirflowStatus
}