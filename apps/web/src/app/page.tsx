import Link from 'next/link'
import { getMockRepository } from '@/lib/repositories'
import { getLiveBuilds } from '@/lib/live-server'
import BuildCard from '@/components/BuildCard'

export const dynamic = 'force-dynamic'

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function HomePage() {
  // Live engine first; fall back to mock only if the API is unreachable.
  const builds = (await getLiveBuilds()) ?? (await getMockRepository().builds.getAll())

  // Tronos: 4 builds por faixa + Rei Absoluto.
  const reiR3k = builds.find((b) => b.tier === 'r3k' && !b.is_rei_absoluto)
  const reiR5k = builds.find((b) => b.tier === 'r5k')
  const reiR8k = builds.find((b) => b.tier === 'r8k')
  const reiR12k = builds.find((b) => b.tier === 'r12k_plus' && !b.is_rei_absoluto)
  const reiAbsoluto = builds.find((b) => b.is_rei_absoluto)

  return (
    <div>
      {/* Hero */}
      <section className="text-center py-16">
        <h1
          className="text-5xl md:text-6xl mb-4"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif', letterSpacing: '-0.02em' }}
        >
          Qual PC dá mais FPS pelo seu dinheiro?
        </h1>
        <p
          className="text-xl md:text-2xl mb-2"
          style={{ color: 'var(--text-mono)', fontFamily: 'var(--font-plex-mono), monospace' }}
        >
          R$ por FPS — a conta aberta
        </p>
        <p className="text-secondary mb-8 max-w-xl mx-auto">
          Comparamos builds brasileiros por custo/performance. Sem banco de testes
          próprio — cruzamos benchmarks públicos e dizemos a margem.
        </p>
        <Link href="/wizard" className="btn-gold text-lg">
          Montar meu build →
        </Link>
      </section>

      {/* Tronos */}
      <section id="tronos" className="py-12 scroll-mt-20">
        <div className="text-center mb-8">
          <h2
            className="text-3xl mb-2"
            style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
          >
            Os Tronos
          </h2>
          <p className="text-secondary text-sm">
            O melhor R$/FPS de cada faixa. A Harpia decreta — e quem discordar, mostra os números.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {reiR3k && (
            <BuildCard build={reiR3k} variant="rei" />
          )}
          {reiR5k && (
            <BuildCard build={reiR5k} variant="rei" />
          )}
          {reiR8k && (
            <BuildCard build={reiR8k} variant="rei" />
          )}
          {reiR12k && (
            <BuildCard build={reiR12k} variant="rei" />
          )}
        </div>

        {reiAbsoluto && (
          <div className="mt-6">
            <BuildCard build={reiAbsoluto} />
          </div>
        )}
      </section>

      {/* Como funciona */}
      <section className="py-16">
        <div className="text-center mb-10">
          <h2
            className="text-3xl mb-2"
            style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
          >
            Como funciona
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { n: 1, t: 'Diz o orçamento', d: 'De R$ 2k a R$ 20k. Slider de R$ 500 em R$ 500.' },
            { n: 2, t: 'Escolhe os jogos', d: 'Multi-seleção. Cruzamos com nosso banco de FPS.' },
            { n: 3, t: 'A Harpia decreta', d: '3 builds ranqueados: o Rei, o Equilibrado, o Arrojado.' },
          ].map((step) => (
            <div key={step.n} className="card text-center">
              <div
                className="num-mono text-4xl font-bold mb-3"
                style={{ color: 'var(--accent-gold)' }}
              >
                {String(step.n).padStart(2, '0')}
              </div>
              <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
                {step.t}
              </h3>
              <p className="text-sm text-secondary">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEO comparativos */}
      <section className="py-12">
        <div className="text-center mb-8">
          <h2
            className="text-3xl mb-2"
            style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
          >
            Comparativos da semana
          </h2>
          <p className="text-secondary text-sm">
            “X vs o Rei” — toda build nova é medida contra o trono da sua faixa.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { x: 'i5-13400F + RTX 4060', rei: 'Rei dos R$ 5k', verdict: 'perde em 18 FPS no CS2' },
            { x: 'Ryzen 7 5800X3D + RX 6700 XT', rei: 'Rei dos R$ 8k', verdict: 'CPU forte, GPU fraca — perde 35 FPS' },
            { x: 'i5-14600K + RTX 4070', rei: 'Rei dos R$ 8k', verdict: 'empate técnico no 1440p' },
          ].map((c, i) => (
            <Link
              key={i}
              href={`/${c.x.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-vs-${c.rei.toLowerCase().replace(/\s+/g, '-').replace(/\+/g, 'plus')}`}
              className="card hover:border-gold transition-colors"
            >
              <div className="text-xs uppercase tracking-wider text-secondary mb-1">
                {c.rei}
              </div>
              <h3 className="text-lg mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
                {c.x}
              </h3>
              <p className="text-sm text-secondary">
                <span style={{ color: 'var(--accent-orange)' }}>vs</span> {c.rei} — {c.verdict}.
              </p>
              <div className="mt-3 text-xs" style={{ color: 'var(--accent-gold)' }}>
                ler comparativo →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 text-center">
        <p className="text-secondary mb-4">
          Pronto pra saber quanto FPS cada real compra?
        </p>
        <Link href="/wizard" className="btn-gold text-lg">
          Montar meu build →
        </Link>
      </section>
    </div>
  )
}