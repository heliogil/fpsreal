import type {
  RootRepository,
  BuildRepository,
  ProductRepository,
  OfferRepository,
  FpsRepository,
  CompatibilityRepository,
  TrackingRepository,
  Product,
  ProductCategory,
  CuratedBuild,
  BudgetTier,
  Offer,
  Merchant,
  FpsEstimate,
  GameSlug,
  Resolution,
  BuildComponents,
  BuildResult,
  WizardInput,
  BuildAirflowZoneState,
  PressureBalance,
} from './types'
import {
  products as fixtureProducts,
  getProductById,
  getProductsByCategory,
  builds as fixtureBuilds,
  getBuildBySlug,
  getBuildByTier,
  getReiAbsoluto,
  offers as fixtureOffers,
  merchants as fixtureMerchants,
  getOfferById,
  getMerchantById,
  getBestOfferForProduct,
  fpsEstimates,
  getFpsEstimate,
  getFpsByBuild,
  getAirflowBySlug,
  type AirflowProfile,
} from '../fixtures'

/**
 * Implementação mock — usa fixtures locais.
 * Mantém um state interno para tracking de cliques (in-memory).
 */
export class MockRepository implements RootRepository {
  products: ProductRepository = new MockProductRepo()
  builds: BuildRepository = new MockBuildRepo()
  offers: OfferRepository = new MockOfferRepo()
  fps: FpsRepository = new MockFpsRepo()
  compatibility: CompatibilityRepository = new MockCompatibilityRepo()
  tracking: TrackingRepository = new MockTrackingRepo()
}

class MockProductRepo implements ProductRepository {
  async getById(id: number): Promise<Product | null> {
    return getProductById(id) ?? null
  }
  async getByCategory(category: ProductCategory): Promise<Product[]> {
    return getProductsByCategory(category)
  }
  async search(query: string): Promise<Product[]> {
    const q = query.toLowerCase()
    return fixtureProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    )
  }
}

class MockBuildRepo implements BuildRepository {
  async getAll(): Promise<CuratedBuild[]> {
    return fixtureBuilds.filter((b) => b.is_active)
  }
  async getByTier(tier: BudgetTier): Promise<CuratedBuild | null> {
    return getBuildByTier(tier) ?? null
  }
  async getReiAbsoluto(): Promise<CuratedBuild | null> {
    return getReiAbsoluto() ?? null
  }
  async getBySlug(slug: string): Promise<CuratedBuild | null> {
    return getBuildBySlug(slug) ?? null
  }

  async runWizard(input: WizardInput): Promise<BuildResult[]> {
    // Heurística simples: escolhe builds baseado no budget_brl.
    // r3k=2950, r5k=4890, r8k=7750, r12k_plus=11900.
    const ordered = [...fixtureBuilds].sort(
      (a, b) => a.total_price_brl - b.total_price_brl,
    )

    let chosen: CuratedBuild
    if (input.budget_brl < 4000) chosen = ordered[0]
    else if (input.budget_brl < 6500) chosen = ordered[1]
    else if (input.budget_brl < 10000) chosen = ordered[2]
    else chosen = ordered[3]

    // Variações: Build Equilibrado (mesmo tier, +1 nível GPU) e Arrojado (+2 GPU).
    const getAlt = (delta: number): CuratedBuild | null => {
      const all = ordered.filter((b) => !b.is_rei_absoluto)
      const idx = all.findIndex((b) => b.tier === chosen.tier)
      if (idx === -1) return null
      const targetIdx = Math.min(all.length - 1, idx + delta)
      return all[targetIdx]
    }

    const buildRei = chosen
    const buildEquilibrado = (getAlt(1) && getAlt(1)!.id !== chosen.id) ? getAlt(1)! : chosen
    const buildArrojado = (getAlt(2) && getAlt(2)!.id !== chosen.id && getAlt(2)!.id !== buildEquilibrado.id)
      ? getAlt(2)!
      : chosen

    return [buildRei, buildEquilibrado, buildArrojado].map((b) => buildResultFor(b))
  }
}

class MockOfferRepo implements OfferRepository {
  async getByVariant(variant_id: number): Promise<Array<Offer & { merchant: Merchant }>> {
    const offer = fixtureOffers.find((o) => o.variant_id === variant_id)
    if (!offer) return []
    const merchant = getMerchantById(offer.merchant_id)
    if (!merchant) return []
    return [{ ...offer, merchant }]
  }
  async getBestOffer(product_id: number): Promise<(Offer & { merchant: Merchant }) | null> {
    const offer = getBestOfferForProduct(product_id)
    if (!offer) return null
    const merchant = getMerchantById(offer.merchant_id)
    if (!merchant) return null
    return { ...offer, merchant }
  }
  async getPriceHistory(offer_id: number): Promise<Array<{ ts: string; price_brl: number }>> {
    const offer = getOfferById(offer_id)
    if (!offer) return []
    // Mock: variação pequena em torno do preço atual
    const base = offer.price_brl
    const now = new Date('2026-01-15')
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - i))
      const wobble = 1 + Math.sin(i * 0.7) * 0.04
      return {
        ts: d.toISOString(),
        price_brl: Math.round(base * wobble),
      }
    })
  }
}

class MockFpsRepo implements FpsRepository {
  async getEstimate(
    cpu_id: number,
    gpu_id: number,
    game_slug: GameSlug,
    resolution: Resolution,
  ): Promise<FpsEstimate | null> {
    return getFpsEstimate(cpu_id, gpu_id, game_slug, resolution) ?? null
  }
  async getByBuild(cpu_id: number, gpu_id: number): Promise<FpsEstimate[]> {
    return getFpsByBuild(cpu_id, gpu_id)
  }
}

class MockCompatibilityRepo implements CompatibilityRepository {
  async checkBuild(components: Partial<BuildComponents>): Promise<{
    errors: string[]
    warnings: string[]
    clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
    airflow: BuildAirflowZoneState[]
  }> {
    const warnings: string[] = []
    const errors: string[] = []
    const clearances: Record<string, { remaining_mm: number; is_tight: boolean }> = {}

    // Checagem GPU vs case (clearance).
    if (components.gpu_id && components.case_id) {
      const gpu = fixtureProducts.find((p) => p.id === components.gpu_id)
      const cs = fixtureProducts.find((p) => p.id === components.case_id)
      if (gpu && cs) {
        const gpuLen = (gpu.specs as { length_mm?: number }).length_mm ?? 0
        const caseMax = (cs.specs as { max_gpu_length_mm?: number }).max_gpu_length_mm ?? 0
        const remaining = caseMax - gpuLen
        clearances.gpu = { remaining_mm: remaining, is_tight: remaining < 20 }
        if (remaining < 0) {
          errors.push(`GPU ${gpu.name} (${gpuLen}mm) não cabe no case ${cs.name} (max ${caseMax}mm)`)
        } else if (remaining < 20) {
          warnings.push(`GPU com folga de apenas ${remaining}mm no case — apertado`)
        }
      }
    }

    // TDP vs cooler.
    if (components.cpu_id && components.cooler_id) {
      const cpu = fixtureProducts.find((p) => p.id === components.cpu_id)
      if (cpu) {
        const tdp = (cpu.specs as { tdp_w?: number }).tdp_w ?? 0
        if (tdp > 95) {
          warnings.push(`CPU ${cpu.name} tem TDP ${tdp}W — cooler robusto recomendado`)
        }
      }
    }

    // Airflow placeholder (será preenchido via fixture real no detail page).
    const airflow: BuildAirflowZoneState[] = []

    return { errors, warnings, clearances, airflow }
  }
}

class MockTrackingRepo implements TrackingRepository {
  private clicks: Array<{
    offer_id: number
    context: Record<string, unknown>
    ts: string
  }> = []

  async recordClick(
    offer_id: number,
    context: {
      build_id?: number
      utm_source?: string
      utm_medium?: string
      utm_campaign?: string
      referer?: string
    },
  ): Promise<void> {
    this.clicks.push({
      offer_id,
      context,
      ts: new Date().toISOString(),
    })
    // No-op no mock — apenas acumula em memória.
    // Em produção, isso seria um POST para o endpoint /track/click.
    if (typeof window !== 'undefined' && (window as { __reidofps_clicks?: unknown[] }).__reidofps_clicks) {
      ;(window as unknown as { __reidofps_clicks: unknown[] }).__reidofps_clicks.push({ offer_id, context })
    }
  }
}

/**
 * Helper: monta um BuildResult completo a partir de um CuratedBuild.
 * Junta FPS estimates + offers + airflow do fixture.
 */
function buildResultFor(build: CuratedBuild): BuildResult {
  const { cpu_id, gpu_id } = build.components
  const fps = getFpsByBuild(cpu_id, gpu_id)

  // Offers: um por componente principal (cpu, gpu, case).
  const offerComponentIds = [cpu_id, gpu_id, build.components.case_id]
  const offersWithMerchant = offerComponentIds
    .map((pid) => {
      const offer = getBestOfferForProduct(pid)
      if (!offer) return null
      const merchant = getMerchantById(offer.merchant_id)
      if (!merchant) return null
      return { ...offer, merchant }
    })
    .filter((o): o is Offer & { merchant: Merchant } => o !== null)

  const airflowProfile: AirflowProfile | undefined = getAirflowBySlug(build.slug)

  return {
    build,
    fps_estimates: fps,
    offers: offersWithMerchant,
    compatibility_warnings: [],
    airflow_summary: {
      pressure_balance: (airflowProfile?.pressure_balance ?? 'neutral') as PressureBalance,
      zone_scores: airflowProfile?.zones ?? [],
      warnings: airflowProfile?.warnings ?? [],
      confidence: airflowProfile?.confidence ?? 'estimativa v1',
    },
    clearance_warnings: [],
  }
}