import Link from 'next/link'
import { budgetSlug, fmtBudget, getBudgetPicks, groupPicks, mesAno } from '@/lib/melhor'

export const revalidate = 3600

const SITE = 'https://reidofps.com.br'

export async function generateMetadata() {
  const picks = await getBudgetPicks()
  const quando = mesAno(picks[0]?.computed_at)
  return {
    title: `Melhor PC gamer por orçamento (${quando}) — Rei do FPS`,
    description:
      'A build com mais FPS para cada orçamento, de R$ 2.000 a R$ 20.000: peças compatíveis, fluxo de ar aprovado e FPS estimado com margem de erro. Recalculado todo dia.',
    alternates: { canonical: `${SITE}/melhor-pc-gamer` },
  }
}

const fmtR = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')

export default async function MelhorPcIndex() {
  const groups = groupPicks(await getBudgetPicks())
  const quando = mesAno(groups[0]?.pick.computed_at)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Melhor PC gamer por orçamento',
    itemListElement: groups.map((g, i) => ({
      '@type': 'ListItem', position: i + 1, name: `Melhor PC gamer até ${fmtBudget(g.from)}`,
      url: `${SITE}/melhor-pc-gamer/${budgetSlug(g.from)}`,
    })),
  }
  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(28px,4vw,48px) clamp(16px,4vw,40px)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <h1 className="disp" style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '0 0 10px', color: 'var(--strong)' }}>
        Melhor PC gamer por orçamento
      </h1>
      <p style={{ color: 'var(--dim)', fontSize: 16, lineHeight: 1.55, margin: '0 0 24px', maxWidth: 680 }}>
        Para cada orçamento, a build com <strong>mais FPS</strong> que cabe nele, com peças compatíveis e fluxo de
        ar aprovado. É a mesma regra que escolhe o Rei de cada faixa. Atualizado em {quando}.
      </p>

      {groups.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>A lista está a ser recalculada. Volte daqui a pouco.</p>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {groups.map((g) => (
            <Link key={g.from} href={`/melhor-pc-gamer/${budgetSlug(g.from)}`} className="rowh"
              style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--line2)', color: 'var(--text)' }}>
              <span style={{ minWidth: 170, fontWeight: 600, color: 'var(--strong)' }}>
                até {fmtBudget(g.from)}{g.to > g.from ? ` a ${fmtBudget(g.to)}` : ''}
              </span>
              <span style={{ flex: '1 1 240px', color: 'var(--dim)' }}>{g.pick.cpu_name} + {g.pick.gpu_name}</span>
              <span className="mono" style={{ fontWeight: 600 }}>{Math.round(g.pick.avg_fps)} FPS</span>
              <span className="mono" style={{ color: 'var(--dim)', minWidth: 90, textAlign: 'right' }}>{fmtR(g.pick.total_brl)}</span>
            </Link>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--dim2)', marginTop: 14, lineHeight: 1.6 }}>
        FPS médio em Valorant, CS2, Fortnite e GTA V em 1080p (estimativa) · faixas com a mesma build estão juntas ·
        preços de amostra até entrarem os feeds das lojas ·{' '}
        <Link href="/como-medimos" style={{ color: 'var(--accent-2)' }}>como medimos →</Link>
      </p>
    </main>
  )
}
