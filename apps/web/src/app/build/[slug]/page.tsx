import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getLiveBuilds,
  getLiveFpsByBuild,
  checkLiveCompatibility,
  getLiveProduct,
  getLiveBestOffer,
  getLiveInterior,
} from '@/lib/live-server'
import type { LiveProduct } from '@/lib/live-server'
import GabineteVivo from '@/components/interior/GabineteVivo'
import FpsBadge from '@/components/FpsBadge'
import type { BuildComponents, CuratedBuild, GameSlug } from '@/lib/repositories/types'
import { gameLabel } from '@/lib/labels'

export const revalidate = 3600  // ISR: renderiza na 1a request, cacheia por 1h

const VALID_RES = ['1080p', '1440p', '4k'] as const
type Res = (typeof VALID_RES)[number]

interface PageProps {
  params: { slug: string }
  searchParams: { res?: string }
}

const RANK: GameSlug[] = ['valorant', 'cs2', 'fortnite', 'gta-v'] as GameSlug[]
const TIER_LABEL: Record<string, string> = { r3k: 'R$ 3k', r5k: 'R$ 5k', r8k: 'R$ 8k', r12k_plus: 'R$ 12k+' }

const fmtR = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const fmtCpf = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SLOTS: Array<{ key: keyof BuildComponents; slot: string; label: string }> = [
  { key: 'cpu_id', slot: 'cpu', label: 'Processador' },
  { key: 'motherboard_id', slot: 'motherboard', label: 'Placa-mãe' },
  { key: 'ram_id', slot: 'ram', label: 'Memória RAM' },
  { key: 'gpu_id', slot: 'gpu', label: 'Placa de vídeo' },
  { key: 'storage_id', slot: 'storage', label: 'Armazenamento' },
  { key: 'psu_id', slot: 'psu', label: 'Fonte' },
  { key: 'case_id', slot: 'case', label: 'Gabinete' },
  { key: 'cooler_id', slot: 'cooler', label: 'Cooler' },
]


const SITE = 'https://reidofps.com.br'

export async function generateMetadata({ params }: PageProps) {
  const builds = await getLiveBuilds()
  const build = builds?.find((b) => b.slug === params.slug)
  if (!build) return { title: 'Build | Rei do FPS' }
  const tierLabel = TIER_LABEL[build.tier] ?? build.tier
  return {
    title: `${build.title} — ${tierLabel} | Rei do FPS`,
    description:
      build.subtitle ||
      `Build gamer ${tierLabel} com melhor custo/FPS. ${build.description || 'Componentes compatíveis, FPS estimado com fonte.'}`,
    openGraph: {
      title: `${build.title} — Rei do FPS`,
      description: build.subtitle || `Build ${tierLabel} com melhor custo/FPS`,
      url: `${SITE}/build/${params.slug}`,
    },
  }
}

async function cpfOf(b: CuratedBuild): Promise<number> {
  const rows = await getLiveFpsByBuild(b.components.cpu_id, b.components.gpu_id, '1080p')
  const picked = rows.filter((r) => RANK.includes(r.game_slug))
  if (!picked.length || b.total_price_brl <= 0) return 0
  const avg = picked.reduce((s, r) => s + r.fps, 0) / picked.length
  return avg > 0 ? b.total_price_brl / avg : 0
}

export default async function BuildDetailPage({ params, searchParams }: PageProps) {
  const builds = await getLiveBuilds()
  const build = builds?.find((b) => b.slug === params.slug)
  if (!build) notFound()

  const res: Res = VALID_RES.includes(searchParams.res as Res) ? (searchParams.res as Res) : '1080p'

  const components = build.components as unknown as Record<string, number>

  const [fpsEstimates, compatRaw, interior, cpfs, slotData] = await Promise.all([
    getLiveFpsByBuild(build.components.cpu_id, build.components.gpu_id, res),
    checkLiveCompatibility(components),
    getLiveInterior(components),
    Promise.all((builds ?? []).map(async (b) => ({ slug: b.slug, cpf: await cpfOf(b), absoluto: b.is_rei_absoluto }))),
    Promise.all(
      SLOTS.map(async ({ key, slot, label }) => {
        const productId = build.components[key]
        const product = await getLiveProduct(productId)
        const offer = product ? await getLiveBestOffer(productId) : null
        return { slot, label, product, offer }
      }),
    ),
  ])

  const compat = compatRaw ?? { errors: [], warnings: [], clearances: {}, checks: [], airflow: [] }
  const products: Record<string, LiveProduct | null> = Object.fromEntries(slotData.map((s) => [s.slot, s.product]))

  // custo/FPS desta build + o Rei da arena
  const mine = cpfs.find((c) => c.slug === build.slug)?.cpf ?? 0
  const contenders = cpfs.filter((c) => c.cpf > 0 && !c.absoluto)
  const rei = contenders.length ? contenders.reduce((a, b) => (a.cpf <= b.cpf ? a : b)) : null
  const souORei = rei?.slug === build.slug
  const reiBuild = rei ? builds?.find((b) => b.slug === rei.slug) : null
  const avgFps = mine > 0 ? build.total_price_brl / mine : 0

  const checks = compat.checks ?? []
  const allOk = compat.errors.length === 0 && compat.warnings.length === 0
  const statusTone = (st: string) =>
    st === 'ok' || st === 'pass'
      ? { icon: '✓', color: 'var(--fresh)' }
      : st.startsWith('warn')
        ? { icon: '⚠', color: 'var(--warn)' }
        : { icon: '✕', color: 'var(--danger)' }

  const allDemo = slotData.every((e) => !e.offer || e.offer.merchant.name.toLowerCase().includes('amostra'))


  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: build.title,
        description: build.subtitle || `Build gamer ${TIER_LABEL[build.tier] ?? build.tier}`,
        ...(build.total_price_brl > 0 ? {
          offers: {
            '@type': 'Offer',
            price: Math.round(build.total_price_brl),
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            url: `${SITE}/build/${build.slug}`,
          },
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Builds curadas', item: `${SITE}/#challengers` },
          { '@type': 'ListItem', position: 3, name: build.title },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <main style={{ padding: '28px clamp(16px,4vw,40px) 0' }}>
      <Link href="/#challengers" className="mono navlink" style={{ fontSize: 12, color: 'var(--dim2)' }}>
        ← voltar às builds
      </Link>

      {/* header editorial */}
      <header style={{ margin: '18px 0 26px' }}>
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 600, letterSpacing: '.12em', color: 'var(--dim)' }}>
          {souORei && (
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', padding: '3px 10px', borderRadius: 99, letterSpacing: '.06em' }}>♛ O REI</span>
          )}
          {build.is_rei_absoluto && (
            <span style={{ border: '1px solid var(--accent-dim)', color: 'var(--accent-2)', padding: '3px 10px', borderRadius: 99, letterSpacing: '.06em' }}>♛ REI ABSOLUTO</span>
          )}
          <span>{TIER_LABEL[build.tier] ?? build.tier}</span>
          <span style={{ color: 'var(--dim2)' }}>·</span>
          <span>custo-benefício</span>
        </div>
        <h1 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(30px,4.5vw,44px)', letterSpacing: '-.8px', margin: '10px 0 6px', color: 'var(--strong)' }}>
          {build.title}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--dim)', margin: 0, maxWidth: 560 }}>{build.subtitle}</p>
      </header>

      {/* ── grid principal: métricas à esquerda · GABINETE VIVO em destaque à direita ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.92fr) minmax(0,1.08fr)', gap: 'clamp(18px,3vw,30px)', alignItems: 'start' }}>
        {/* esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* custo por FPS */}
          <div className="rv" style={{ background: 'var(--card)', border: '1px solid var(--accent-dim)', borderRadius: 12, padding: '22px 24px', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--dim)', marginBottom: 10 }}>
              CUSTO POR FPS · MÉDIA 1080p
            </div>
            <div className="mono metric" style={{ fontSize: 'clamp(40px,5vw,56px)', fontWeight: 600, lineHeight: 1, letterSpacing: '-2px', color: 'var(--accent)' }}>
              {mine > 0 ? fmtCpf(mine) : '—'}
              <span style={{ fontSize: 18, color: 'var(--dim)' }}> /FPS</span>
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', marginTop: 14 }}>
              <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--strong)' }}>{fmtR(build.total_price_brl)}</span>
              {avgFps > 0 && <span className="mono" style={{ fontSize: 12, color: 'var(--dim2)' }}>{Math.round(avgFps)} FPS médios</span>}
            </div>
            {allDemo && (
              <div className="mono" style={{ marginTop: 10, fontSize: 10.5, color: 'var(--dim2)' }}>preço de amostra · afiliados em breve</div>
            )}
          </div>

          {/* esta build vs o Rei */}
          <div className="rv" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px', animationDelay: '.08s' }}>
            <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--accent-2)', marginBottom: 14 }}>
              ♛ ESTA BUILD vs O REI
            </div>
            {souORei ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
                Esta build <strong style={{ color: 'var(--accent-2)' }}>é o Rei da arena</strong> — o melhor custo por FPS entre as builds curadas hoje. O trono se defende no empate: challenger só destrona com vantagem ≥5%.
              </p>
            ) : rei && reiBuild && mine > 0 ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--dim2)', marginBottom: 6 }}>ESTA BUILD</div>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{fmtCpf(mine)}<span style={{ fontSize: 11, color: 'var(--dim)' }}>/FPS</span></div>
                  </div>
                  <div style={{ border: '1px solid var(--accent-dim)', borderRadius: 8, padding: '12px 14px', background: 'var(--accent-soft)' }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--accent-2)', marginBottom: 6 }}>♛ {reiBuild.title.toUpperCase()}</div>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>{fmtCpf(rei.cpf)}<span style={{ fontSize: 11, color: 'var(--dim)' }}>/FPS</span></div>
                  </div>
                </div>
                <p className="mono" style={{ margin: '12px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--dim)' }}>
                  o Rei entrega {Math.round((mine / rei.cpf - 1) * 100)}% mais FPS por real ·{' '}
                  <Link href={`/build/${rei.slug}`} style={{ color: 'var(--accent-2)' }}>ver o Rei →</Link>
                </p>
              </div>
            ) : (
              <p className="mono" style={{ margin: 0, fontSize: 12, color: 'var(--dim2)' }}>comparação indisponível</p>
            )}
          </div>

          {/* compatibilidade — checklist com margens (handoff screenshot 04) */}
          <div className="rv" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '20px 24px', animationDelay: '.16s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--strong)' }}>Compatibilidade</span>
              <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 99, color: allOk ? 'var(--fresh)' : 'var(--warn)', border: `1px solid ${allOk ? 'var(--fresh-b)' : 'var(--warn-b)'}` }}>
                {allOk ? '✓ tudo certo' : `⚠ ${compat.errors.length + compat.warnings.length} aviso(s)`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {checks.map((c, i) => {
                const t = statusTone(c.status)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line2)' }}>
                    <span style={{ color: t.color, fontSize: 12, flex: 'none' }}>{t.icon}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{c.label}</span>
                    {c.message && <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim)', textAlign: 'right' }}>{c.message}</span>}
                  </div>
                )
              })}
              {compat.clearances.gpu && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line2)' }}>
                  <span style={{ color: compat.clearances.gpu.is_tight ? 'var(--warn)' : 'var(--fresh)', fontSize: 12 }}>{compat.clearances.gpu.is_tight ? '⚠' : '✓'}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>Folga da GPU no gabinete</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim)' }}>{Math.round(compat.clearances.gpu.remaining_mm)}mm restantes</span>
                </div>
              )}
              {compat.clearances.cooler && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line2)' }}>
                  <span style={{ color: compat.clearances.cooler.is_tight ? 'var(--warn)' : 'var(--fresh)', fontSize: 12 }}>{compat.clearances.cooler.is_tight ? '⚠' : '✓'}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>Altura do cooler</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim)' }}>{Math.round(compat.clearances.cooler.remaining_mm)}mm restantes</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* direita — O MOAT: gabinete vivo em destaque */}
        <div className="rv" style={{ animationDelay: '.1s' }}>
          {interior ? (
            <GabineteVivo interior={interior} products={products} />
          ) : (
            <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--dim2)' }}>interior em análise — sem dados do gabinete</span>
            </div>
          )}
        </div>
      </div>

      {/* ── FPS estimado ── */}
      <section style={{ marginTop: 'clamp(28px,4vw,44px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <h2 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(20px,2.6vw,26px)', margin: 0, color: 'var(--strong)' }}>FPS estimado</h2>
          <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Resolução">
            {VALID_RES.map((r) => (
              <a key={r} href={`?res=${r}`} className="mono seg" aria-current={r === res ? 'true' : undefined} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: `1px solid ${r === res ? 'var(--accent-dim)' : 'var(--line)'}`, color: r === res ? 'var(--accent-2)' : 'var(--dim)', background: r === res ? 'var(--accent-soft)' : 'transparent' }}>
                {r}
              </a>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '6px 20px 14px', overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr className="mono" style={{ textAlign: 'left', fontSize: 10.5, letterSpacing: '.1em', color: 'var(--dim2)' }}>
                <th style={{ padding: '12px 16px 8px 0', fontWeight: 600 }}>JOGO</th>
                <th style={{ padding: '12px 16px 8px 0', fontWeight: 600 }}>PRESET</th>
                <th style={{ padding: '12px 0 8px' }}>FPS ESTIMADO · BANDA</th>
              </tr>
            </thead>
            <tbody>
              {fpsEstimates.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 18, textAlign: 'center', color: 'var(--dim)' }}>Sem estimativas para este par CPU+GPU em {res}.</td></tr>
              )}
              {fpsEstimates.map((e) => (
                <tr key={e.id} className="rowh" style={{ borderTop: '1px solid var(--line2)' }}>
                  <td style={{ padding: '10px 16px 10px 0', color: 'var(--text)' }}>{gameLabel(e.game_slug)}</td>
                  <td className="mono" style={{ padding: '10px 16px 10px 0', fontSize: 11.5, color: 'var(--dim)' }}>{e.preset}</td>
                  <td style={{ padding: '10px 0' }}><FpsBadge estimate={e} showBand size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mono" style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--dim2)', margin: '12px 0 4px' }}>
            estimativas anchor_scale v1 · benchmarks públicos cruzados · sem bancada própria — a gente não inventa FPS ·{' '}
            <Link href="/como-medimos" style={{ color: 'var(--accent-2)' }}>a conta aberta →</Link>
          </p>
        </div>
      </section>

      {/* ── componentes ── */}
      <section style={{ marginTop: 'clamp(28px,4vw,44px)' }}>
        <h2 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(20px,2.6vw,26px)', margin: '0 0 16px', color: 'var(--strong)' }}>Peças desta build</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slotData.map(({ slot, label, product, offer }) => {
            if (!product) return null
            const demo = !offer || offer.merchant.name.toLowerCase().includes('amostra')
            return (
              <div key={slot} className="hovcard" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--dim2)', marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--strong)' }}>{product.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{offer ? fmtR(offer.price_brl) : '—'}</div>
                  {demo ? (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--dim2)', border: '1px solid var(--line)', padding: '1px 7px', borderRadius: 99 }}>amostra</span>
                  ) : (
                    <a href={`/go/${offer!.id}?utm_source=build&utm_medium=detalhe&utm_campaign=${build.slug}`} className="mono" style={{ fontSize: 11, color: 'var(--accent-2)' }}>
                      comprar → {offer!.merchant.name}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '40px 0 8px' }}>
        <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 14 }}>Quer isso adaptado ao SEU orçamento e aos SEUS jogos?</p>
        <Link href="/wizard" className="btn" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', font: "600 15px var(--font-plex),'IBM Plex Sans'", padding: '13px 26px', borderRadius: 8, display: 'inline-block' }}>
          Montar minha build →
        </Link>
      </section>
    </main>
    </>
  )
}
