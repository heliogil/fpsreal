/**
 * /pecas — Explorador de peças e FPS AO VIVO (dados reais do pcb_api).
 *
 * Server component: busca à API interna no SSR, por isso o HTML já vem com os
 * dados reais (nada de fetch client-side, nada de CORS). É a superfície viva do
 * catálogo + banco de FPS — INDEPENDENTE de preço, que ainda depende dos feeds
 * de afiliado. Tronos/wizard continuam no mock até haver preço.
 *
 * Integridade: FPS é sempre "estimativa", com fonte/data/confiança. Nunca medido.
 */
export const revalidate = 300

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

type Product = {
  id: number; sku: string; name: string; category: string
  brand: string | null; specs: Record<string, unknown>
}
type Fps = { game_slug: string; fps: number; confidence_band_pct: number | null; method: string }
type Build = {
  slug: string; name: string; budget_tier: string; is_rei: boolean
  total_price_brl: number | null; fps_per_brl: number | null
  seo_description: string | null
  components: Record<string, { id: number; name: string; category: string }>
}

async function jget<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${API}${path}`, { cache: 'no-store' })
    if (!r.ok) return fallback
    return (await r.json()) as T
  } catch {
    return fallback
  }
}

const syne = { fontFamily: 'var(--font-syne), Syne, sans-serif' }
const mono = { fontFamily: 'var(--font-plex-mono), monospace' }

const TIER_LABEL: Record<string, string> = {
  r3k: 'R$ 3k', r5k: 'R$ 5k', r8k: 'R$ 8k', r12k_plus: 'R$ 12k+',
}
const TIER_ORDER: Record<string, number> = { r3k: 0, r5k: 1, r8k: 2, r12k_plus: 3 }
function brl(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function spec(p: Product, key: string): string {
  const v = p.specs?.[key]
  return v === undefined || v === null ? '—' : String(v)
}

export default async function PecasPage() {
  const gpus = await jget<Product[]>('/products/?category=gpu&limit=50', [])
  const cpus = await jget<Product[]>('/products/?category=cpu&limit=50', [])
  const builds = await jget<Build[]>('/builds/', [])
  const ref = cpus.find((c) => c.sku === 'cpu-r7-9800x3d') ?? cpus[0]

  const tronos = builds
    .filter((b) => b.is_rei)
    .sort((a, b) => (TIER_ORDER[a.budget_tier] ?? 9) - (TIER_ORDER[b.budget_tier] ?? 9))
  const absoluto = builds.find((b) => b.slug === 'rei-absoluto')

  // FPS ao vivo: CPU de referência × cada GPU (lista completa por par).
  // /fps/by-cpu: 1 query retorna todos pares cpu+gpu em vez de N fetches paralelos
  const fpsByGpu: Record<number, Record<string, number>> = {}
  if (ref) {
    const bulk = await jget<Record<string, Record<string, number>>>(
      `/fps/by-cpu?cpu=${ref.id}&res=1080p`,
      {},
    )
    for (const [gpuId, games] of Object.entries(bulk)) {
      fpsByGpu[Number(gpuId)] = games
    }
  }

  const isLive = gpus.length > 0
  const games: [string, string][] = [
    ['cs2', 'CS2'],
    ['valorant', 'Valorant'],
    ['fortnite', 'Fortnite'],
    ['cyberpunk-2077', 'Cyberpunk'],
    ['elden-ring', 'Elden Ring'],
  ]

  return (
    <div className="py-12">
      <section className="text-center mb-10">
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--accent-gold)' }}>
          {isLive ? '● dados ao vivo' : '○ backend offline — a mostrar vazio honesto'}
        </div>
        <h1 className="text-4xl md:text-5xl mb-3" style={syne}>Peças & FPS</h1>
        <p className="text-secondary max-w-2xl mx-auto">
          Catálogo, banco de performance e ranking de custo/FPS da Harpia, servidos ao vivo
          pelo motor. Os preços abaixo são <strong>de amostra</strong> — serão substituídos
          pelos feeds oficiais de afiliado sem mudar o pipeline.
        </p>
      </section>

      {/* Tronos por faixa (preços de amostra) */}
      {tronos.length > 0 && (
        <section className="mb-14">
          <h2 className="text-2xl mb-1" style={syne}>Os Tronos — melhor R$/FPS por faixa</h2>
          <p className="text-sm text-secondary mb-4">
            Ranking ao vivo por <strong>custo por FPS</strong>.{' '}
            <span style={{ color: 'var(--accent-gold)' }}>Preços de amostra (demo)</span> — a lógica
            e o pipeline são reais; só faltam os feeds oficiais.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tronos.map((b) => (
              <div key={b.slug} className="card">
                <div className="flex justify-between items-baseline mb-1">
                  <span style={syne}>{b.name}</span>
                  <span className="text-xs num-mono" style={{ ...mono, color: 'var(--accent-gold)' }}>
                    {TIER_LABEL[b.budget_tier] ?? b.budget_tier}
                  </span>
                </div>
                <div className="text-xs text-secondary mb-2">
                  {b.components?.cpu?.name} · {b.components?.gpu?.name}
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="num-mono" style={{ ...mono, color: 'var(--text-mono)' }}>{brl(b.total_price_brl)}</span>
                  <span className="text-xs num-mono" style={mono}>
                    {b.fps_per_brl ? `${(b.fps_per_brl * 1000).toFixed(1)} FPS / R$1k` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {absoluto && (
            <div className="card mt-3" style={{ borderColor: 'var(--accent-gold)' }}>
              <div className="flex justify-between items-baseline">
                <span style={{ ...syne, color: 'var(--accent-gold)' }}>👑 {absoluto.name}</span>
                <span className="num-mono" style={{ ...mono, color: 'var(--text-mono)' }}>{brl(absoluto.total_price_brl)}</span>
              </div>
              <div className="text-xs text-secondary mt-1">
                {absoluto.components?.cpu?.name} · {absoluto.components?.gpu?.name} — {absoluto.seo_description}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Banco de FPS ao vivo */}
      <section className="mb-14">
        <h2 className="text-2xl mb-1" style={syne}>Banco de FPS — estimativas a 1080p</h2>
        <p className="text-sm text-secondary mb-4">
          CPU de referência: <strong>{ref?.name ?? '—'}</strong>. Valores são{' '}
          <strong>estimativas</strong> (método âncora+escala), não medições. Fonte pública + banda de
          confiança ±18%. <a href="/como-medimos" style={{ color: 'var(--accent-gold)' }}>como medimos →</a>
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #333)' }}>
                <th className="text-left py-2 pr-4" style={syne}>GPU</th>
                {games.map(([, label]) => (
                  <th key={label} className="text-right py-2 px-3" style={mono}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gpus.map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                  <td className="py-2 pr-4">{g.name}</td>
                  {games.map(([slug]) => {
                    const v = fpsByGpu[g.id]?.[slug]
                    return (
                      <td key={slug} className="text-right py-2 px-3 num-mono" style={mono}>
                        {v !== undefined ? `${Math.round(v)}` : '—'}
                        <span className="text-secondary" style={{ fontSize: '0.7em' }}> fps</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Catálogo */}
      <section>
        <h2 className="text-2xl mb-4" style={syne}>No catálogo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gpus.map((g) => (
            <div key={g.id} className="card flex justify-between items-center">
              <div>
                <div style={syne}>{g.name}</div>
                <div className="text-xs text-secondary">{g.brand} · {spec(g, 'vram_gb')}GB · {spec(g, 'tdp_w')}W</div>
              </div>
              <div className="text-xs num-mono" style={{ ...mono, color: 'var(--text-mono)' }}>
                {spec(g, 'length_mm')}mm
              </div>
            </div>
          ))}
          {cpus.map((c) => (
            <div key={c.id} className="card flex justify-between items-center">
              <div>
                <div style={syne}>{c.name}</div>
                <div className="text-xs text-secondary">{c.brand} · {spec(c, 'socket')} · {spec(c, 'cores')}c/{spec(c, 'threads')}t</div>
              </div>
              <div className="text-xs num-mono" style={{ ...mono, color: 'var(--text-mono)' }}>
                {spec(c, 'tdp_w')}W
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
