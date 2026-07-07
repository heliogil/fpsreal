/**
 * Repository contracts for pc-builder-br (Rei do FPS).
 *
 * These interfaces define the boundary between the application
 * layer (UI / API / wizard engine) and the data layer. The mock-first
 * architecture swaps between MockXRepository and LiveXRepository
 * via the `NEXT_PUBLIC_DATA_SOURCE` env flag, without the consumers
 * noticing.
 */

import type {
  AirflowStatus,
  BudgetTier,
  BuildAirflowZoneState,
  BuildClearance,
  CompatibilityRule,
  CuratedBuild,
  FpsEstimate,
  Merchant,
  Offer,
  PressureBalance,
  PriceHistory,
  Product,
  ProductCategory,
  Resolution,
} from './entities.js'

// WizardInput and GameSlug are owned by wizard.ts (the canonical place for
// user-facing input shapes). Re-export them here so consumers that import
// only from repositories still get a complete type surface.
export type { WizardInput, GameSlug } from './wizard.js'

// ============================================================
// COMPOSITE TYPES USED BY REPOSITORIES
// ============================================================

/** The eight components that make up a complete PC build. */
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

/** Complete wizard output — three ranked builds with full diagnostics. */
export interface BuildResult {
  build: CuratedBuild
  fps_estimates: FpsEstimate[]
  offers: Array<Offer & { merchant: Merchant }>
  compatibility_warnings: Array<{
    rule: CompatibilityRule
    message: string
  }>
  airflow_summary: {
    pressure_balance: PressureBalance
    zone_scores: Array<{ zone: string; score: number; status: AirflowStatus }>
    warnings: string[]
    confidence: string
  }
  clearance_warnings: Array<{
    slot: string
    remaining_mm: number
    is_tight: boolean
  }>
}

// ============================================================
// PRODUCT CATALOG REPOSITORY
// ============================================================

/** Read access to the products master table. */
export interface ProductRepository {
  getById(id: number): Promise<Product | null>
  getByCategory(category: ProductCategory): Promise<Product[]>
  search(query: string): Promise<Product[]>
}

// ============================================================
// CURATED BUILDS / TRONOS REPOSITORY
// ============================================================

/** Read access to the curated-builds table — the "Tronos" of each tier. */
export interface BuildRepository {
  getAll(): Promise<CuratedBuild[]>
  /** Returns the current "Rei" (crowned build) for a single tier, or null. */
  getByTier(tier: BudgetTier): Promise<CuratedBuild | null>
  /** Returns the current overall Rei Absoluto (9800X3D tier), or null. */
  getReiAbsoluto(): Promise<CuratedBuild | null>
  getBySlug(slug: string): Promise<CuratedBuild | null>
  /** Runs the wizard and returns up to three ranked builds. */
  runWizard(input: import('./wizard.js').WizardInput): Promise<BuildResult[]>
}

// ============================================================
// OFFERS + PRICES REPOSITORY
// ============================================================

/** Read access to live offers and historical prices. */
export interface OfferRepository {
  getByVariant(variant_id: number): Promise<Array<Offer & { merchant: Merchant }>>
  /** Returns the cheapest currently-available offer for a product, or null. */
  getBestOffer(product_id: number): Promise<(Offer & { merchant: Merchant }) | null>
  /** Returns price history for an offer; defaults to last 30 days. */
  getPriceHistory(offer_id: number, days?: number): Promise<PriceHistory[]>
}

// ============================================================
// FPS ESTIMATES REPOSITORY
// ============================================================

/** Read access to FPS estimates produced by the performance engine. */
export interface FpsRepository {
  getEstimate(
    cpu_id: number,
    gpu_id: number,
    game_slug: string,
    resolution: Resolution,
  ): Promise<FpsEstimate | null>
  /** Returns every FPS estimate that exists for a CPU+GPU pair. */
  getByBuild(cpu_id: number, gpu_id: number): Promise<FpsEstimate[]>
}

// ============================================================
// COMPATIBILITY + AIRFLOW REPOSITORY
// ============================================================

/** Compatibility + clearance + airflow evaluation for a candidate build. */
export interface CompatibilityRepository {
  checkBuild(components: Partial<BuildComponents>): Promise<{
    errors: string[]
    warnings: string[]
    clearances: Record<string, BuildClearance>
    airflow: BuildAirflowZoneState[]
  }>
}

// ============================================================
// AFFILIATE CLICK TRACKING
// ============================================================

/** Records affiliate click events for revenue attribution. */
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

// ============================================================
// ROOT REPOSITORY
// ============================================================

/** The root repository exposes every domain repository. The frontend gets
 * one of these (mock or live) at boot and dispatches through it. */
export interface RootRepository {
  products: ProductRepository
  builds: BuildRepository
  offers: OfferRepository
  fps: FpsRepository
  compatibility: CompatibilityRepository
  tracking: TrackingRepository
}