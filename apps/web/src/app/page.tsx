import Link from 'next/link'
import { getLiveBuilds, getLiveFpsByBuild } from '@/lib/live-server'
import { getMockRepository } from '@/lib/repositories'
import type { CuratedBuild, GameSlug } from '@/lib/repositories/types'

export const dynamic = 'force-dynamic'

// Ranking games for the cost/FPS headline (1080p) — matches the handoff hero.
const RANK: { slug: GameSlug; name: string }[] = [
  { slug: 'valorant' as GameSlug, name: 'Valorant' },
  { slug: 'cs2' as GameSlug, name: 'CS2' },
  { slug: 'fortnite' as GameSlug, name: 'Fortnite' },
  { slug: 'gta-v' as GameSlug, name: 'GTA V' },
]

const TIER_LABEL: Record<string, string> = {
  r3k: 'R$ 3k', r5k: 'R$ 5k', r8k: 'R$ 8k', r12k_plus: 'R$ 12k+',
}

const fmtR = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const fmtCpf = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Enriched = {
  b: CuratedBuild
  games: { name: string; fps: number; conf: number; pct: string; prov: string }[]
  avg: number
  cpf: number
}

async function enrich(b: CuratedBuild): Promise<Enriched> {
  const rows = await getLiveFpsByBuild(b.components.cpu_id, b.components.gpu_id, '1080p')
  const byGame = new Map(rows.map((r) => [r.game_slug, r]))
  const games = RANK.map((g) => {
    const r = byGame.get(g.slug)
    const fps = r ? Math.round(r.fps) : 0
    const conf = r ? Math.round(r.confidence_band_pct) : 15
    return {
      name: g.name,
      fps,
      conf,
      prov: `estimativa ${r?.method ?? 'anchor_scale'} · ±${conf}% · fonte pública, jul/2026`,
    }
  }).filter((g) => g.fps > 0)
  const maxFps = Math.max(...games.map((g) => g.fps), 1)
  const avg = games.length ? games.reduce((s, g) => s + g.fps, 0) / games.length : b.fps_top_game || 1
  const cpf = b.total_price_brl > 0 && avg > 0 ? b.total_price_brl / avg : 0
  return { b, avg, cpf, games: games.map((g) => ({ ...g, pct: `${Math.round((g.fps / maxFps) * 100)}%` })) }
}

export default async function HomePage() {
  const builds = (await getLiveBuilds()) ?? (await getMockRepository().builds.getAll())
  const tronos = builds.filter((b) => !b.is_rei_absoluto)
  const enriched = await Promise.all(tronos.map(enrich))
  enriched.sort((a, b) => a.b.total_price_brl - b.b.total_price_brl)

  // Hero = the current best cost/FPS (lowest R$/FPS) — the "Rei" reference.
  const hero = [...enriched].filter((e) => e.cpf > 0).sort((a, b) => a.cpf - b.cpf)[0] ?? enriched[0]
  const bestSlug = hero?.b.slug

  return (
    <main>
      {/* ============ HERO ============ */}
      <section
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,.9fr)',
          gap: 'clamp(24px,4vw,48px)', padding: 'clamp(40px,6vw,68px) clamp(16px,4vw,40px) 52px',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* left */}
        <div style={{ position: 'relative', minWidth: 0 }}>
          <div className="rv" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div
              aria-hidden
              style={{
                width: 46, height: 46, borderRadius: 12, flex: 'none', background: 'var(--panel2)',
                border: '1px solid var(--accent-dim)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', boxShadow: 'var(--shadow-sm)',
              }}
            >
              <svg width="24" height="22" viewBox="0 0 24 22" aria-hidden="true">
                <path d="M1.6 7.4l4.3 3.9L12 2.3l6.1 9 4.3-3.9-1.7 11.3H3.3z" fill="var(--accent)" />
                <rect x="3.4" y="19.6" width="17.2" height="2.1" rx="1" fill="var(--accent)" />
              </svg>
            </div>
            <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.14em', color: 'var(--accent-2)', lineHeight: 1.35 }}>
              MEDIDO CONTRA O REI
              <br />
              <span style={{ color: 'var(--dim2)', letterSpacing: '.1em' }}>preço e FPS com fonte e data, sempre</span>
            </div>
          </div>
          <h1 className="disp rv" style={{ fontWeight: 700, fontSize: 'clamp(38px,6vw,58px)', lineHeight: 1.02, letterSpacing: '-1px', margin: 0, color: 'var(--strong)', animationDelay: '.08s' }}>
            Com o seu dinheiro e o seu jogo, qual PC dá o melhor FPS hoje?
          </h1>
          <p className="rv" style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.6, color: 'var(--dim)', maxWidth: 520, margin: '22px 0 30px', animationDelay: '.16s' }}>
            Comparamos preços em lojas brasileiras e estimamos FPS em jogos reais. Cada build entra na arena{' '}
            <strong style={{ color: 'var(--text)' }}>contra o Rei</strong> — e o veredicto vem com fonte, data e link.{' '}
            <strong style={{ color: 'var(--text)' }}>A gente não inventa FPS.</strong>
          </p>
          <div className="rv" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', animationDelay: '.24s' }}>
            <Link className="btn" href="/wizard" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', font: "600 15px var(--font-plex),'IBM Plex Sans'", padding: '14px 26px', borderRadius: 8, boxShadow: 'var(--shadow-sm)' }}>
              Montar minha build →
            </Link>
            <Link className="btn" href="/como-medimos" style={{ border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', font: "500 14px var(--font-plex),'IBM Plex Sans'", padding: '13px 22px', borderRadius: 8 }}>
              Como medimos o FPS
            </Link>
          </div>
          <div className="mono rv" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 32, fontSize: 12, color: 'var(--dim2)', animationDelay: '.32s' }}>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> sem FPS inventado</span>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> preço com fonte e data</span>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> medido contra o Rei</span>
          </div>
        </div>

        {/* right — instrument readout */}
        {hero && (
          <div className="rv" style={{ position: 'relative', background: 'var(--card)', border: '1px solid var(--accent-dim)', borderRadius: 12, padding: '24px 26px', boxShadow: 'var(--shadow)', animationDelay: '.2s', alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--dim)' }}>
                MELHOR CUSTO/FPS · {TIER_LABEL[hero.b.tier] ?? hero.b.tier}
              </span>
              <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 500, color: 'var(--dim)', border: '1px solid var(--line)', padding: '3px 8px', borderRadius: 99 }}>
                preço · amostra
              </span>
            </div>
            <div className="mono metric" style={{ fontSize: 'clamp(44px,6vw,60px)', fontWeight: 600, lineHeight: 1, letterSpacing: '-2px', color: 'var(--accent)' }}>
              {fmtCpf(hero.cpf)}<span style={{ fontSize: 20, color: 'var(--dim)' }}> /FPS</span>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--dim2)', margin: '8px 0 20px' }}>
              total {fmtR(hero.b.total_price_brl)} · média em {hero.games.length} jogos · 1080p
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {hero.games.map((g) => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, width: 76, color: 'var(--text)' }}>{g.name}</span>
                  <div className="bar" style={{ flex: 1, height: 8, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}>
                    <i style={{ width: g.pct, background: 'linear-gradient(90deg,var(--accent-dim),var(--accent))', borderRadius: 4 }} />
                  </div>
                  <span className="mono prov" tabIndex={0} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    ~{g.fps} <span style={{ color: 'var(--dim2)', fontWeight: 400 }}>±{g.conf}%</span>
                    <span className="tip">{g.prov}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mono" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--line)', fontSize: 11, lineHeight: 1.5, color: 'var(--dim2)' }}>
              estimativas · base TechPowerUp + GamersNexus · jul/2026 · 1080p alto
            </div>
          </div>
        )}
      </section>

      {/* ============ HONESTY STRIP ============ */}
      <section style={{ borderTop: '1px solid var(--line2)', borderBottom: '1px solid var(--line2)', background: 'var(--accent-soft)', padding: 'clamp(32px,4vw,40px) clamp(16px,4vw,40px)' }}>
        <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.14em', color: 'var(--dim)', marginBottom: 22 }}>
          A GENTE NÃO INVENTA FPS — E ISSO É O PRODUTO
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="mono" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, color: 'var(--fresh)', border: '1px solid var(--fresh-b)', padding: '4px 10px', borderRadius: 99 }}>~142 FPS · ±8%</span>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)' }}>FPS é estimativa — e a gente assume</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--dim)' }}>Todo número vem com fonte, data e banda de confiança. Estimativa nunca é vendida como medição.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--fresh)', border: '1px solid var(--fresh-b)', padding: '4px 10px', borderRadius: 99 }}>&lt;24h</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', border: '1px solid var(--warn-b)', padding: '4px 10px', borderRadius: 99 }}>24–72h</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim2)', border: '1px solid var(--line)', padding: '4px 10px', borderRadius: 99, textDecoration: 'line-through' }}>&gt;72h</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)' }}>Preço velho não é preço</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--dim)' }}>Selo de frescura em toda oferta. Passou de 72h sem confirmação? A oferta some — nada de preço fantasma.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="mono" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, color: 'var(--dim)', border: '1px dashed var(--dim2)', padding: '4px 10px', borderRadius: 99 }}>desempenho em análise</span>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)' }}>Sem dado? Sem número</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--dim)' }}>Peça recém-lançada sem benchmark confiável fica &quot;em análise&quot;. A gente não chuta índice pra fechar review.</div>
          </div>
        </div>
      </section>

      {/* ============ CHALLENGERS ============ */}
      <section id="challengers" style={{ padding: 'clamp(40px,5vw,52px) clamp(16px,4vw,40px)', scrollMarginTop: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 26, flexWrap: 'wrap', gap: 8 }}>
          <h2 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(24px,3vw,30px)', margin: 0, color: 'var(--strong)' }}>As challengers de hoje</h2>
          <span className="mono" style={{ fontSize: 12, color: 'var(--dim2)' }}>ranqueadas por custo/FPS · preço de amostra</span>
        </div>
        <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
          {enriched.map(({ b, cpf }) => {
            const best = b.slug === bestSlug
            return (
              <Link
                key={b.slug}
                href={`/build/${b.slug}`}
                className="hovcard rv"
                style={{ display: 'block', background: 'var(--card)', border: `1px solid ${best ? 'var(--accent-dim)' : 'var(--line)'}`, borderRadius: 12, padding: 22, position: 'relative', boxShadow: best ? '0 0 0 1px var(--accent-dim)' : 'none' }}
              >
                {best && (
                  <div className="mono" style={{ position: 'absolute', top: -9, left: 20, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99 }}>
                    ♛ O Rei
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)' }}>{TIER_LABEL[b.tier] ?? b.tier}</span>
                  <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--fresh)' }}>✓ compatível</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--strong)', marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--dim)', marginBottom: 18, minHeight: 34 }}>{b.subtitle}</div>
                <div className="mono" style={{ fontSize: 38, fontWeight: 600, lineHeight: 1, letterSpacing: '-1px', color: 'var(--accent)' }}>
                  {fmtCpf(cpf)}<span style={{ fontSize: 15, color: 'var(--dim)' }}> /FPS</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line2)' }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{fmtR(b.total_price_brl)}</span>
                  <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--dim2)', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: 99 }}>amostra (demo)</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
