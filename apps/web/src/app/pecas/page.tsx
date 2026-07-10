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
export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

type Product = {
  id: number; sku: string; name: string; category: string
  brand: string | null; specs: Record<string, unknown>
}
type Fps = { game_slug: string; fps: number; confidence_band_pct: number | null; method: string }

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

function spec(p: Product, key: string): string {
  const v = p.specs?.[key]
  return v === undefined || v === null ? '—' : String(v)
}

export default async function PecasPage() {
  const gpus = await jget<Product[]>('/products/?category=gpu&limit=50', [])
  const cpus = await jget<Product[]>('/products/?category=cpu&limit=50', [])
  const ref = cpus.find((c) => c.sku === 'cpu-r7-9800x3d') ?? cpus[0]

  // FPS ao vivo: CPU de referência × cada GPU (lista completa por par).
  const fpsByGpu: Record<number, Record<string, number>> = {}
  if (ref) {
    await Promise.all(
      gpus.map(async (g) => {
        const rows = await jget<Fps[]>(`/fps/?cpu=${ref.id}&gpu=${g.id}&res=1080p`, [])
        const m: Record<string, number> = {}
        for (const r of rows) m[r.game_slug] = r.fps
        fpsByGpu[g.id] = m
      }),
    )
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
          Catálogo e banco de performance da Harpia, servidos ao vivo pelo motor.
          Preços entram quando as parcerias de afiliado abrirem.
        </p>
      </section>

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
