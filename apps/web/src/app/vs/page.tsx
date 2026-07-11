import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Comparar GPUs — FPS por jogo | Rei do FPS',
  description:
    'Compare o desempenho de GPUs jogo a jogo. Estimativas anchor+scale com CPU de referência Ryzen 5 7600. Veja qual GPU entrega mais FPS no seu orçamento.',
}

const GPU_NAMES: Record<string, string> = {
  'rtx-5090':      'RTX 5090',
  'rtx-5080':      'RTX 5080',
  'rtx-5070-ti':   'RTX 5070 Ti',
  'rtx-5070':      'RTX 5070',
  'rtx-5060-ti':   'RTX 5060 Ti 16GB',
  'rtx-5060':      'RTX 5060',
  'rtx-4090':      'RTX 4090',
  'rtx-4070-super':'RTX 4070 SUPER',
  'rtx-4060-ti':   'RTX 4060 Ti 8GB',
  'rtx-4060':      'RTX 4060',
  'rtx-3060':      'RTX 3060 12GB',
  'rx-9070-xt':    'RX 9070 XT',
  'rx-7900-xtx':   'RX 7900 XTX',
  'rx-7800-xt':    'RX 7800 XT',
  'rx-7700-xt':    'RX 7700 XT',
  'rx-7600':       'RX 7600',
  'rx-6600':       'RX 6600',
}

interface Pair { a: string; b: string; desc?: string }
interface Group { title: string; pairs: Pair[] }

const GROUPS: Group[] = [
  {
    title: 'Nova geração vs anterior',
    pairs: [
      { a: 'rtx-5070-ti',   b: 'rtx-4070-super', desc: 'O salto da série 50 vale o preço?' },
      { a: 'rtx-5070',      b: 'rtx-4070-super'                                              },
      { a: 'rtx-5060-ti',   b: 'rtx-4060-ti',    desc: 'Mesma faixa, nova geração'          },
      { a: 'rtx-4060',      b: 'rtx-3060',        desc: 'Vale a pena atualizar da série 30?' },
    ],
  },
  {
    title: 'NVIDIA vs AMD',
    pairs: [
      { a: 'rtx-4070-super', b: 'rx-9070-xt',   desc: 'Briga acirrada no mid-high'  },
      { a: 'rtx-4060',       b: 'rx-7600',       desc: 'Entrada de linha head-to-head' },
      { a: 'rtx-4060-ti',    b: 'rx-7700-xt'                                          },
      { a: 'rtx-5070-ti',    b: 'rx-7900-xtx',  desc: 'Nova NVIDIA vs topo AMD'      },
    ],
  },
  {
    title: 'Topo de linha',
    pairs: [
      { a: 'rtx-5090', b: 'rtx-4090',     desc: 'O rei vs o seu antecessor'          },
      { a: 'rtx-5080', b: 'rtx-4090',     desc: 'Série 50 mid-top vs 40 topo'        },
      { a: 'rx-7900-xtx', b: 'rtx-4070-super', desc: 'AMD flagship vs NVIDIA mid-high' },
    ],
  },
]

function CompareCard({ a, b, desc }: Pair) {
  const nameA = GPU_NAMES[a] ?? a
  const nameB = GPU_NAMES[b] ?? b
  return (
    <Link
      href={`/vs/${a}/${b}`}
      className="card card-hover block p-5"
      style={{ textDecoration: 'none' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">{nameA}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>vs</span>
        <span className="font-semibold text-sm">{nameB}</span>
      </div>
      {desc && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
      )}
      <p
        className="text-xs mt-2"
        style={{ color: 'var(--accent-gold)', opacity: 0.8 }}
      >
        Ver comparação →
      </p>
    </Link>
  )
}

export default function VsIndexPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-secondary mb-3">Comparações GPU</p>
        <h1
          className="text-3xl font-bold mb-3"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          Qual GPU entrega mais FPS?
        </h1>
        <p className="text-secondary text-sm max-w-xl">
          Comparações jogo a jogo com CPU de referência Ryzen 5 7600 (mid-tier). Estimativas
          anchor+scale — não medições em hardware.
        </p>
      </div>

      <div className="space-y-10">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2
              className="text-xs uppercase tracking-widest mb-4"
              style={{ color: 'var(--accent-gold)' }}
            >
              {group.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.pairs.map((pair) => (
                <CompareCard key={`${pair.a}-${pair.b}`} {...pair} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs text-secondary text-center">
          Não encontrou a comparação que procura?{' '}
          <Link href="/pecas" style={{ color: 'var(--accent-gold)' }}>
            Ver todas as GPUs →
          </Link>
        </p>
      </div>
    </main>
  )
}
