import type { Metadata } from 'next'
import Link from 'next/link'
import { getLiveBuilds, getLiveFpsByBuild, getLiveInterior, getLiveProduct } from '@/lib/live-server'
import HeroGabinete from '@/components/home/HeroGabinete'
import { budgetSlug, fmtBudget, getBudgetPicks, groupPicks } from '@/lib/melhor'
import { getMockRepository } from '@/lib/repositories'
import type { CuratedBuild, GameSlug } from '@/lib/repositories/types'

export const revalidate = 300  // ISR: regenera a landing a cada 5 minutos

export const metadata: Metadata = {
  title: 'Rei do FPS — O PC com mais FPS pelo seu dinheiro',
  description: 'Diga o orçamento: montamos a build, conferimos se cabe, calculamos o fluxo de ar e mostramos o FPS em 3D, com a margem de erro de cada número. Recalculado todo dia.',
  openGraph: {
    title: 'Rei do FPS — Melhor build gamer para o seu orçamento',
    description: 'Compare builds gamer por custo/FPS para o mercado brasileiro. Estimativas de FPS com fonte pública e banda de confiança.',
    url: 'https://reidofps.com.br',
    siteName: 'Rei do FPS',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rei do FPS',
    description: 'Melhor FPS pelo seu dinheiro. Builds curadas para o mercado brasileiro.',
  },
}

// Ranking games for the cost/FPS headline (1080p) — matches the handoff hero.
const RANK: { slug: GameSlug; name: string }[] = [
  { slug: 'valorant' as GameSlug, name: 'Valorant' },
  { slug: 'cs2' as GameSlug, name: 'CS2' },
  { slug: 'fortnite' as GameSlug, name: 'Fortnite' },
  { slug: 'gta-v' as GameSlug, name: 'GTA V' },
]

import { TIER_LABEL as TIER_LABEL_BY_KEY } from '@/lib/tiers'
import AdSlot from '@/components/ads/AdSlot'
import Patrocinado from '@/components/ads/Patrocinado'
import { adsConfig } from '@/lib/ads'
const TIER_LABEL: Record<string, string> = TIER_LABEL_BY_KEY

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
      prov: `estimativa ${r?.method ?? 'anchor_scale'} · ±${conf}% · fonte pública, ago/2026`,
    }
  }).filter((g) => g.fps > 0)
  const maxFps = Math.max(...games.map((g) => g.fps), 1)
  // custo/FPS e média vêm da fonte única (lib/metrics.ts via live-server) — iguais à página da build
  const avg = b.avg_fps
  const cpf = b.rs_per_fps
  return { b, avg, cpf, games: games.map((g) => ({ ...g, pct: `${Math.round((g.fps / maxFps) * 100)}%` })) }
}

export default async function HomePage() {
  const ads = adsConfig()
  const builds = (await getLiveBuilds()) ?? (await getMockRepository().builds.getAll())
  const tronos = builds.filter((b) => !b.is_rei_absoluto)
  const enriched = await Promise.all(tronos.map(enrich))
  enriched.sort((a, b) => a.b.total_price_brl - b.b.total_price_brl)

  // Herói = o melhor custo/FPS de hoje (o Rei de referência do site)
  const hero = [...enriched].filter((e) => e.cpf > 0).sort((a, b) => a.cpf - b.cpf)[0] ?? enriched[0]
  const bestSlug = hero?.b.slug
  const comps = (b: CuratedBuild) => b.components as unknown as Record<string, number>

  const [interior, names, picks] = await Promise.all([
    hero ? getLiveInterior(comps(hero.b)) : Promise.resolve(null),
    Promise.all(enriched.map(async (e) => {
      const [cpu, gpu] = await Promise.all([getLiveProduct(e.b.components.cpu_id), getLiveProduct(e.b.components.gpu_id)])
      return [e.b.slug, { cpu: cpu?.name ?? '', gpu: gpu?.name ?? '' }] as const
    })).then((rows) => Object.fromEntries(rows) as Record<string, { cpu: string; gpu: string }>),
    getBudgetPicks(),
  ])
  const groups = groupPicks(picks)
  // atalhos de orçamento: só os que têm página (a canónica do grupo)
  const quick = [5000, 7000, 11000, 20000]
    .map((v) => ({ v, g: groups.find((g) => v >= g.from && v <= g.to) }))
    .filter((x): x is { v: number; g: (typeof groups)[number] } => !!x.g)
  const heroNames = hero ? names[hero.b.slug] : null

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 600, padding: '9px 14px', borderRadius: 99,
    border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--card) 80%, transparent)', color: 'var(--text)',
  }

  return (
    <main>
      {/* ============ HERÓI: o gabinete do Rei é o protagonista ============ */}
      <section className="hero-grid home-hero" style={{ position: 'relative', overflow: 'hidden', alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 0, zIndex: 1 }}>
          {hero && heroNames?.gpu && (
            <Link href={`/build/${hero.b.slug}`} className="rv" style={{
              display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--dim)', marginBottom: 20,
              border: '1px solid var(--accent-dim)', borderRadius: 99, padding: '5px 12px', background: 'var(--accent-soft)',
            }}>
              <span style={{ color: 'var(--accent)' }}>♛</span> Rei do custo/FPS hoje: <strong style={{ color: 'var(--text)' }}>{heroNames.gpu}</strong>
            </Link>
          )}
          <h1 className="disp rv" style={{ fontWeight: 700, fontSize: 'clamp(36px,5.6vw,60px)', lineHeight: 1.04, letterSpacing: '-1px', margin: 0, color: 'var(--strong)', animationDelay: '.08s' }}>
            O PC com mais FPS pelo seu dinheiro.
          </h1>
          <p className="rv" style={{ fontSize: 'clamp(15px,2vw,17.5px)', lineHeight: 1.6, color: 'var(--dim)', maxWidth: 520, margin: '20px 0 26px', animationDelay: '.14s' }}>
            Diga quanto quer gastar. A gente monta a build, confere se tudo cabe, calcula o fluxo de ar e mostra o
            FPS em 3D, com a margem de erro de cada número.
          </p>

          {quick.length > 0 && (
            <div className="rv" style={{ animationDelay: '.2s' }}>
              <div style={{ fontSize: 13, color: 'var(--dim2)', marginBottom: 10 }}>Quanto quer gastar?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                {quick.map(({ v, g }) => (
                  <Link key={v} href={`/melhor-pc-gamer/${budgetSlug(g.from)}`} className="hovcard" style={chip}
                    data-umami-event="home-orcamento">até R$ {v / 1000} mil</Link>
                ))}
                <Link href="/wizard" style={{ ...chip, color: 'var(--accent-2)', borderStyle: 'dashed' }}>outro valor →</Link>
              </div>
            </div>
          )}

          <div className="rv" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', animationDelay: '.26s' }}>
            <Link className="btn" href="/wizard" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 15, padding: '13px 24px', borderRadius: 8, boxShadow: 'var(--shadow-sm)' }}>
              Montar com os meus jogos →
            </Link>
            <Link className="btn" href="/como-medimos" style={{ border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontSize: 14, padding: '12px 20px', borderRadius: 8 }}>
              Como medimos
            </Link>
          </div>
          <div className="rv" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 26, fontSize: 13, color: 'var(--dim2)', animationDelay: '.32s' }}>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> FPS com margem de erro</span>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> fluxo de ar calculado</span>
            <span><span style={{ color: 'var(--accent-2)' }}>✓</span> recalculado todo dia</span>
          </div>
        </div>

        {/* direita — o gabinete do Rei, com a ficha a flutuar por cima */}
        {hero && (
          <div className="hero-panel home-visual" style={{ position: 'relative', minWidth: 0 }}>
            <div aria-hidden className="home-glow" />
            {interior
              ? <HeroGabinete components={comps(hero.b)} interior={interior} />
              : <div style={{ aspectRatio: '1 / 0.82' }} />}
            <Link href={`/build/${hero.b.slug}`} className="home-card hovcard" data-umami-event="home-rei-card">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-2)', letterSpacing: '.03em' }}>
                ♛ O REI · {(TIER_LABEL[hero.b.tier] ?? hero.b.tier).toUpperCase()}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)', margin: '6px 0 10px' }}>
                {heroNames?.cpu ? `${heroNames.cpu} + ${heroNames.gpu}` : hero.b.title}
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, color: 'var(--accent)' }}>
                {fmtCpf(hero.cpf)}<span style={{ fontSize: 13, color: 'var(--dim)' }}> /FPS</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 10, fontSize: 13, color: 'var(--dim)' }}>
                <span className="mono" style={{ color: 'var(--text)' }}>{fmtR(hero.b.total_price_brl)}</span>
                <span>·</span>
                <span><span className="mono" style={{ color: 'var(--text)' }}>{Math.round(hero.avg)}</span> FPS médios</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: 'var(--accent-2)', fontWeight: 600 }}>ver →</span>
              </div>
            </Link>
          </div>
        )}
      </section>

      {/* ============ O REI DE CADA FAIXA ============ */}
      <section id="challengers" style={{ padding: 'clamp(36px,5vw,52px) clamp(16px,4vw,40px)', scrollMarginTop: 80 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 22, flexWrap: 'wrap', gap: 8 }}>
          <h2 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(24px,3vw,30px)', margin: 0, color: 'var(--strong)' }}>O Rei de cada faixa</h2>
          <span style={{ fontSize: 13, color: 'var(--dim2)' }}>o máximo de FPS que cabe em cada orçamento · preços de amostra</span>
        </div>
        <div className="stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(205px,1fr))', gap: 16 }}>
          {enriched.map(({ b, cpf, avg }) => {
            const best = b.slug === bestSlug
            const n = names[b.slug]
            return (
              <Link key={b.slug} href={`/build/${b.slug}`} className="hovcard rv"
                style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--card)', border: `1px solid ${best ? 'var(--accent-dim)' : 'var(--line)'}`, borderRadius: 12, padding: '18px 20px', position: 'relative' }}>
                {best && (
                  <div style={{ position: 'absolute', top: -9, left: 18, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99 }}>
                    ♛ melhor custo/FPS
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dim)' }}>{TIER_LABEL[b.tier] ?? b.tier}</span>
                <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--strong)', minHeight: 44 }}>
                  {n?.gpu ? <>{n.gpu}<span style={{ display: 'block', fontSize: 13, fontWeight: 400, color: 'var(--dim)' }}>{n.cpu}</span></> : b.title}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
                  <span className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, color: 'var(--accent)' }}>{Math.round(avg)}</span>
                  <span style={{ fontSize: 13, color: 'var(--dim)' }}>FPS médios</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line2)', fontSize: 13 }}>
                  <span className="mono" style={{ color: 'var(--text)' }}>{fmtR(b.total_price_brl)}</span>
                  <span className="mono" style={{ color: 'var(--dim)' }}>{fmtCpf(cpf)}/FPS</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ============ POR ORÇAMENTO ============ */}
      {groups.length > 0 && (
        <section style={{ padding: '0 clamp(16px,4vw,40px) clamp(36px,5vw,52px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h2 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(20px,2.6vw,24px)', margin: 0, color: 'var(--strong)' }}>Melhor PC por orçamento</h2>
            <Link href="/melhor-pc-gamer" style={{ fontSize: 13, color: 'var(--accent-2)' }}>ver a lista completa →</Link>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {groups.map((g) => (
              <Link key={g.from} href={`/melhor-pc-gamer/${budgetSlug(g.from)}`} className="hovcard" style={{ ...chip, fontWeight: 500, fontSize: 13.5 }}>
                até {fmtBudget(g.from)}
                <span className="mono" style={{ color: 'var(--dim)', marginLeft: 8 }}>{Math.round(g.pick.avg_fps)} FPS</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ============ COMO A GENTE TRABALHA (curto) ============ */}
      <section style={{ borderTop: '1px solid var(--line2)', padding: 'clamp(32px,4vw,40px) clamp(16px,4vw,40px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 22 }}>
          {[
            ['FPS com margem de erro', 'Todo número vem com fonte pública e margem. Estimativa nunca é vendida como medição.'],
            ['Preço velho não é preço', 'Quando os preços vierem das lojas, cada oferta mostra quando foi conferida. Até lá, aparecem marcados como amostra.'],
            ['Sem dado, sem número', 'Peça sem teste confiável fica “em análise”. A gente não chuta.'],
          ].map(([t, d]) => (
            <div key={t}>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)', marginBottom: 6 }}>{t}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--dim)' }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* espaço patrocinado e anúncio: depois das builds, nunca no meio do ranking */}
      <div style={{ padding: '0 clamp(16px,4vw,40px)' }}>
        <Patrocinado placement="home" />
        <AdSlot client={ads?.client} slot={ads?.slots.home_meio} />
      </div>
    </main>
  )
}
