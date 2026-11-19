import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getLiveFpsByBuild, getLiveProduct, getLiveBestOffer, getLiveInterior, getLiveCases,
} from '@/lib/live-server'
import type { LiveProduct } from '@/lib/live-server'
import GabineteVivoLive from '@/components/interior/GabineteVivoLive'
import { REFERENCE_GAMES } from '@/lib/metrics'
import { gameLabel } from '@/lib/labels'
import { budgetSlug, fmtBudget, getBudgetPicks, groupPicks, mesAno, parseBudgetSlug } from '@/lib/melhor'

export const revalidate = 3600

const SITE = 'https://reidofps.com.br'
const fmtR = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const fmtCpf = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SLOTS = [
  { key: 'cpu_id', slot: 'cpu', label: 'Processador' },
  { key: 'gpu_id', slot: 'gpu', label: 'Placa de vídeo' },
  { key: 'motherboard_id', slot: 'motherboard', label: 'Placa-mãe' },
  { key: 'ram_id', slot: 'ram', label: 'Memória RAM' },
  { key: 'storage_id', slot: 'storage', label: 'Armazenamento' },
  { key: 'psu_id', slot: 'psu', label: 'Fonte' },
  { key: 'case_id', slot: 'case', label: 'Gabinete' },
  { key: 'cooler_id', slot: 'cooler', label: 'Cooler' },
] as const

interface PageProps { params: Promise<{ faixa: string }> }

async function load(faixa: string) {
  const budget = parseBudgetSlug(faixa)
  if (budget === null) return null
  const picks = await getBudgetPicks()
  const groups = groupPicks(picks)
  const gi = groups.findIndex((g) => budget >= g.from && budget <= g.to)
  if (gi < 0) return null
  const pick = picks.find((p) => p.budget_brl === budget)
  if (!pick) return null
  return { budget, pick, group: groups[gi], prev: groups[gi - 1] ?? null, next: groups[gi + 1] ?? null }
}

export async function generateMetadata(props: PageProps) {
  const { faixa } = await props.params
  const d = await load(faixa)
  if (!d) return { title: 'Melhor PC gamer | Rei do FPS' }
  const quando = mesAno(d.pick.computed_at)
  const canonical = `${SITE}/melhor-pc-gamer/${budgetSlug(d.group.from)}`
  return {
    title: `Melhor PC gamer até ${fmtBudget(d.budget)} (${quando}) — Rei do FPS`,
    description: `Com até ${fmtBudget(d.budget)}, a build com mais FPS hoje é ${d.pick.cpu_name} + ${d.pick.gpu_name}: ${fmtR(d.pick.total_brl)}, ${Math.round(d.pick.avg_fps)} FPS de média em 1080p. Peças compatíveis e fluxo de ar aprovado.`,
    alternates: { canonical },
    openGraph: { title: `Melhor PC gamer até ${fmtBudget(d.budget)}`, url: canonical },
  }
}

export default async function MelhorPcAte(props: PageProps) {
  const { faixa } = await props.params
  const d = await load(faixa)
  if (!d) notFound()
  const { budget, pick, prev, next } = d
  const c = pick.components
  const quando = mesAno(pick.computed_at)

  const [fps, interior, caseOptions, slotData] = await Promise.all([
    getLiveFpsByBuild(c.cpu_id, c.gpu_id, '1080p'),
    getLiveInterior(c),
    getLiveCases(),
    Promise.all(SLOTS.map(async ({ key, slot, label }) => {
      const product = await getLiveProduct(c[key])
      const offer = product ? await getLiveBestOffer(c[key]) : null
      return { slot, label, product, offer }
    })),
  ])
  const products: Record<string, LiveProduct | null> = Object.fromEntries(slotData.map((s) => [s.slot, s.product]))
  const viewerOffers = Object.fromEntries(slotData.filter((s) => s.offer).map((s) => [s.slot, {
    id: s.offer!.id, price_brl: s.offer!.price_brl, demo: s.offer!.merchant.name.toLowerCase().includes('amostra'),
  }]))
  const allDemo = slotData.every((s) => !s.offer || s.offer.merchant.name.toLowerCase().includes('amostra'))
  const ref = REFERENCE_GAMES as string[]
  const mainFps = ref.map((g) => fps.find((e) => e.game_slug === g)).filter((e): e is (typeof fps)[number] => !!e)
  const sobra = budget - pick.total_brl
  const cpf = pick.total_brl / pick.avg_fps
  const cpu = pick.cpu_name ?? 'o processador', gpu = pick.gpu_name ?? 'a placa de vídeo'
  const at144 = mainFps.filter((e) => e.fps >= 144).map((e) => gameLabel(e.game_slug))

  const answer = `Com até ${fmtBudget(budget)}, a build com mais FPS hoje é ${cpu} + ${gpu}: ${fmtR(pick.total_brl)} no total e ${Math.round(pick.avg_fps)} FPS de média em Valorant, CS2, Fortnite e GTA V (1080p, estimativa).`
  const faq: Array<[string, string]> = [
    [`Qual o melhor PC gamer até ${fmtBudget(budget)}?`, answer],
    [`Esse PC roda jogos a 144 FPS?`, at144.length
      ? `Sim em ${at144.join(', ')} (1080p, preset alto, estimativa).${at144.length < mainFps.length ? ' Nos outros fica abaixo de 144.' : ''}`
      : 'Na média dos jogos de referência fica abaixo de 144 FPS em 1080p no preset alto; baixar o preset ou usar upscaling ajuda.'],
    ['Os preços são de hoje?', allDemo
      ? 'Ainda são preços de amostra: servem para comparar as builds entre si. Os preços das lojas entram pelos feeds oficiais de afiliado, e a escolha é recalculada todo dia.'
      : 'Sim: o menor preço disponível de cada peça nas lojas parceiras, recalculado todo dia.'],
    ['Como a build é escolhida?', 'Testamos todas as combinações do catálogo e ficamos com a de mais FPS que cabe no orçamento, sem nenhum aviso de compatibilidade e com fluxo de ar de pelo menos 70 em 100. Empate de FPS: ganha a mais barata.'],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Melhor PC gamer por orçamento', item: `${SITE}/melhor-pc-gamer` },
        { '@type': 'ListItem', position: 3, name: `Até ${fmtBudget(budget)}` },
      ] },
    ],
  }

  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }
  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(24px,4vw,44px) clamp(16px,4vw,40px)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav style={{ fontSize: 13, color: 'var(--dim2)', marginBottom: 14 }}>
        <Link href="/melhor-pc-gamer" style={{ color: 'inherit' }}>← melhor PC por orçamento</Link>
      </nav>
      <h1 className="disp" style={{ fontSize: 'clamp(28px,4vw,42px)', margin: '0 0 12px', color: 'var(--strong)' }}>
        Melhor PC gamer até {fmtBudget(budget)}
      </h1>
      <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--text)', margin: '0 0 6px', maxWidth: 760 }}>
        Com até {fmtBudget(budget)}, a build com mais FPS hoje é <strong>{cpu} + {gpu}</strong>.
      </p>
      <p style={{ fontSize: 13.5, color: 'var(--dim2)', margin: '0 0 24px' }}>
        atualizado em {quando} · recalculado todo dia{allDemo ? ' · preços de amostra' : ''}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          ['total', fmtR(pick.total_brl), sobra >= 1 ? `sobram ${fmtR(sobra)}` : 'no limite'],
          ['FPS médio (1080p)', `${Math.round(pick.avg_fps)}`, '4 jogos de referência'],
          ['custo por FPS', fmtCpf(cpf), 'quanto menor, melhor'],
        ].map(([k, v, s]) => (
          <div key={k} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', marginBottom: 6 }}>{k}</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent)' }}>{v}</div>
            <div style={{ fontSize: 12, color: 'var(--dim2)', marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      <div className="build-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
        <section>
          <h2 className="disp" style={{ fontSize: 22, margin: '0 0 12px', color: 'var(--strong)' }}>FPS nos jogos de referência</h2>
          <div style={{ ...card, padding: '4px 18px 10px' }}>
            {mainFps.map((e) => {
              const lo = Math.round(e.fps * (1 - e.confidence_band_pct / 100))
              const hi = Math.round(e.fps * (1 + e.confidence_band_pct / 100))
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line2)' }}>
                  <span style={{ flex: 1 }}>{gameLabel(e.game_slug)}</span>
                  <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--strong)' }}>{Math.round(e.fps)}</span>
                  <span style={{ fontSize: 12, color: 'var(--dim2)', minWidth: 92, textAlign: 'right' }}><span className="mono">{lo}–{hi}</span> fps</span>
                </div>
              )
            })}
          </div>

          <h2 className="disp" style={{ fontSize: 22, margin: '26px 0 12px', color: 'var(--strong)' }}>As peças</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {slotData.map(({ slot, label, product, offer }) => {
              if (!product) return null
              const demo = !offer || offer.merchant.name.toLowerCase().includes('amostra')
              return (
                <div key={slot} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--dim2)', letterSpacing: '.05em' }}>{label.toUpperCase()}</div>
                    <div style={{ fontWeight: 600, color: 'var(--strong)' }}>{product.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 600 }}>{offer ? fmtR(offer.price_brl) : '—'}</div>
                    {demo
                      ? <span style={{ fontSize: 11, color: 'var(--dim2)' }}>amostra</span>
                      : <a href={`/go/${offer!.id}?utm_source=melhor&utm_medium=pecas&utm_campaign=${budgetSlug(budget)}`}
                          data-umami-event="melhor-comprar" style={{ fontSize: 12, color: 'var(--accent-2)' }}>comprar → {offer!.merchant.name}</a>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          {interior && (
            <GabineteVivoLive initial={interior} products={products} offers={viewerOffers}
              components={c} cases={caseOptions} totalBrl={pick.total_brl} />
          )}
        </section>
      </div>

      {(prev || next) && (
        <section style={{ marginTop: 32 }}>
          <h2 className="disp" style={{ fontSize: 22, margin: '0 0 12px', color: 'var(--strong)' }}>E se o orçamento mudar?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {prev && (
              <Link href={`/melhor-pc-gamer/${budgetSlug(prev.from)}`} style={{ ...card, padding: '14px 18px', color: 'var(--text)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>gastando menos · até {fmtBudget(prev.to)}</div>
                <div style={{ fontWeight: 600, margin: '4px 0' }}>{prev.pick.cpu_name} + {prev.pick.gpu_name}</div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--dim)' }}>
                  {fmtR(prev.pick.total_brl)} · {Math.round(prev.pick.avg_fps)} FPS ({Math.round(prev.pick.avg_fps - pick.avg_fps)})
                </div>
              </Link>
            )}
            {next && (
              <Link href={`/melhor-pc-gamer/${budgetSlug(next.from)}`} style={{ ...card, padding: '14px 18px', color: 'var(--text)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>com mais {fmtR(next.from - budget)} · até {fmtBudget(next.from)}</div>
                <div style={{ fontWeight: 600, margin: '4px 0' }}>{next.pick.cpu_name} + {next.pick.gpu_name}</div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--fresh)' }}>
                  {fmtR(next.pick.total_brl)} · {Math.round(next.pick.avg_fps)} FPS (+{Math.round(next.pick.avg_fps - pick.avg_fps)})
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      <section style={{ marginTop: 32, maxWidth: 760 }}>
        <h2 className="disp" style={{ fontSize: 22, margin: '0 0 8px', color: 'var(--strong)' }}>Perguntas frequentes</h2>
        {faq.map(([q, a]) => (
          <details key={q} style={{ borderTop: '1px solid var(--line2)', padding: '10px 0' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>{q}</summary>
            <p style={{ margin: '8px 0 0', color: 'var(--dim)', lineHeight: 1.55 }}>{a}</p>
          </details>
        ))}
      </section>

      <section style={{ textAlign: 'center', padding: '36px 0 8px' }}>
        <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 12 }}>Joga outros jogos ou quer priorizar outra coisa?</p>
        <Link href={`/resultados?budget=${budget}&priority=fps`} className="btn"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, padding: '12px 24px', borderRadius: 8, display: 'inline-block' }}>
          Montar com os meus jogos →
        </Link>
      </section>
    </main>
  )
}
