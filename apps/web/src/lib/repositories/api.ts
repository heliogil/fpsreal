import type {
  RootRepository,
  ProductRepository,
  BuildRepository,
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
} from './types'

/**
 * Implementação live — fala HTTP com o pcb_api (porta 8100).
 * Por enquanto faz fallback gracioso para o mock quando a API não responde.
 */

const API_BASE: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8100'

async function safeJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export class LiveRepository implements RootRepository {
  products: ProductRepository = new LiveProductRepo()
  builds: BuildRepository = new LiveBuildRepo()
  offers: OfferRepository = new LiveOfferRepo()
  fps: FpsRepository = new LiveFpsRepo()
  compatibility: CompatibilityRepository = new LiveCompatibilityRepo()
  tracking: TrackingRepository = new LiveTrackingRepo()
}

class LiveProductRepo implements ProductRepository {
  async getById(id: number): Promise<Product | null> {
    return safeJson<Product | null>(`${API_BASE}/products/${id}`, null)
  }
  async getByCategory(category: ProductCategory): Promise<Product[]> {
    return safeJson<Product[]>(`${API_BASE}/products?category=${category}`, [])
  }
  async search(query: string): Promise<Product[]> {
    return safeJson<Product[]>(
      `${API_BASE}/products/search?q=${encodeURIComponent(query)}`,
      [],
    )
  }
}

class LiveBuildRepo implements BuildRepository {
  async getAll(): Promise<CuratedBuild[]> {
    return safeJson<CuratedBuild[]>(`${API_BASE}/builds`, [])
  }
  async getByTier(tier: BudgetTier): Promise<CuratedBuild | null> {
    return safeJson<CuratedBuild | null>(`${API_BASE}/builds?tier=${tier}`, null)
  }
  async getReiAbsoluto(): Promise<CuratedBuild | null> {
    return safeJson<CuratedBuild | null>(`${API_BASE}/builds/absoluto`, null)
  }
  async getBySlug(slug: string): Promise<CuratedBuild | null> {
    return safeJson<CuratedBuild | null>(`${API_BASE}/builds/slug/${slug}`, null)
  }
  async runWizard(input: WizardInput): Promise<BuildResult[]> {
    try {
      const res = await fetch(`${API_BASE}/wizard/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) return []
      return (await res.json()) as BuildResult[]
    } catch {
      return []
    }
  }
}

class LiveOfferRepo implements OfferRepository {
  async getByVariant(variant_id: number): Promise<Array<Offer & { merchant: Merchant }>> {
    return safeJson<Array<Offer & { merchant: Merchant }>>(
      `${API_BASE}/offers?variant=${variant_id}`,
      [],
    )
  }
  async getBestOffer(product_id: number): Promise<(Offer & { merchant: Merchant }) | null> {
    return safeJson<(Offer & { merchant: Merchant }) | null>(
      `${API_BASE}/offers/best?product=${product_id}`,
      null,
    )
  }
  async getPriceHistory(offer_id: number, days = 30): Promise<Array<{ ts: string; price_brl: number }>> {
    return safeJson<Array<{ ts: string; price_brl: number }>>(
      `${API_BASE}/offers/${offer_id}/history?days=${days}`,
      [],
    )
  }
}

class LiveFpsRepo implements FpsRepository {
  async getEstimate(
    cpu_id: number,
    gpu_id: number,
    game_slug: GameSlug,
    resolution: Resolution,
  ): Promise<FpsEstimate | null> {
    return safeJson<FpsEstimate | null>(
      `${API_BASE}/fps?cpu=${cpu_id}&gpu=${gpu_id}&game=${game_slug}&res=${resolution}`,
      null,
    )
  }
  async getByBuild(cpu_id: number, gpu_id: number): Promise<FpsEstimate[]> {
    return safeJson<FpsEstimate[]>(`${API_BASE}/fps?cpu=${cpu_id}&gpu=${gpu_id}`, [])
  }
}

class LiveCompatibilityRepo implements CompatibilityRepository {
  async checkBuild(components: Partial<BuildComponents>): Promise<{
    errors: string[]
    warnings: string[]
    clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
    airflow: BuildAirflowZoneState[]
  }> {
    try {
      const res = await fetch(`${API_BASE}/compatibility/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components }),
      })
      if (!res.ok) {
        return { errors: [], warnings: [], clearances: {}, airflow: [] }
      }
      return (await res.json()) as {
        errors: string[]
        warnings: string[]
        clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
        airflow: BuildAirflowZoneState[]
      }
    } catch {
      return { errors: [], warnings: [], clearances: {}, airflow: [] }
    }
  }
}

class LiveTrackingRepo implements TrackingRepository {
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
    try {
      await fetch(`${API_BASE}/track/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id, ...context, ts: new Date().toISOString() }),
      })
    } catch {
      // fire-and-forget
    }
  }
}