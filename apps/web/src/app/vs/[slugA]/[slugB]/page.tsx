import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getLiveVs } from '@/lib/live-server'

export const dynamic = 'force-dynamic'

const VALID_RES = ['1080p', '1440p', '4k'] as const
type Res = (typeof VALID_RES)[number]

interface PageProps {
  params: { slugA: string; slugB: string }
  searchParams: { res?: string }
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const res: Res = VALID_RES.includes(searchParams.res as Res)
    ? (searchParams.res as Res)
    : '1080p'
  const data = await getLiveVs(`gpu-${params.slugA}`, `gpu-${params.slugB}`, res)
  if (!data) return { title: 'GPU não encontrada | Rei do FPS' }
  const { gpu_a, gpu_b, rows } = data
  return {
    title: `${gpu_a.name} vs ${gpu_b.name} — FPS em ${rows.length} jogos | Rei do FPS`,
    description: `Comparação de FPS jogo a jogo: ${gpu_a.name} vs ${gpu_b.name} em CS2, Fortnite, Cyberpunk 2077 e mais ${rows.length - 3} jogos. CPU de referência: ${data.reference_cpu_name}. Estimativas anchor+scale.`,
  }
}

function short(name: string) {
  return name.replace('GeForce ', '').replace('Radeon ', '')
}

export default async function VsPage({ params, searchParams }: PageProps) {
  const res: Res = VALID_RES.includes(searchParams.res as Res)
    ? (searchParams.res as Res)
    : '1080p'

  const data = await getLiveVs(`gpu-${params.slugA}`, `gpu-${params.slugB}`, res)
  if (!data) return notFound()

  const {
    gpu_a, gpu_b,
    overall_winner,
    avg_fps_a, avg_fps_b, avg_delta_pct,
    rows,
    reference_cpu_name,
  } = data

  const aWins = overall_winner === 'a'
  const bWins = overall_winner === 'b'

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      {/* ── Header */}
      <div className="text-center mb-8">
        <p className="text-xs uppercase tracking-widest text-secondary mb-3">Comparação GPU</p>
        <h1
          className="text-3xl md:text-4xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          {short(gpu_a.name)}{' '}
          <span style={{ color: 'var(--text-secondary)' }}>vs</span>{' '}
          {short(gpu_b.name)}
        </h1>
        <p className="text-sm text-secondary">
          CPU de referência: {reference_cpu_name} · preset High · estimativas anchor+scale
        </p>
      </div>

      {/* ── Resolution toggle */}
      <div className="flex gap-2 justify-center mb-8">
        {VALID_RES.map((r) => (
          <a
            key={r}
            href={`?res=${r}`}
            className="text-sm px-3 py-1 rounded border transition-colors"
            style={{
              borderColor: r === res ? 'var(--accent-gold)' : 'var(--border)',
              color: r === res ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor:
                r === res ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
              textDecoration: 'none',
            }}
          >
            {r}
          </a>
        ))}
      </div>

      {/* ── GPU hero cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { gpu: gpu_a, fps: avg_fps_a, wins: aWins, side: 'A' as const },
          { gpu: gpu_b, fps: avg_fps_b, wins: bWins, side: 'B' as const },
        ].map(({ gpu, fps, wins }) => (
          <div
            key={gpu.sku}
            className="card p-6 text-center"
            style={{
              border: `2px solid ${wins ? 'var(--accent-gold)' : 'var(--border)'}`,
            }}
          >
            {wins && (
              <div
                className="text-xs uppercase tracking-wider mb-2 font-semibold"
                style={{ color: 'var(--accent-gold)' }}
              >
                Vencedor
              </div>
            )}
            <div className="font-bold text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              {gpu.brand}
            </div>
            <div
              className="text-lg font-bold mb-3"
              style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
            >
              {short(gpu.name)}
            </div>

            <div className="num-mono text-4xl font-bold mb-1" style={wins ? { color: 'var(--accent-gold)' } : {}}>
              {Math.round(fps)}
            </div>
            <div className="text-xs text-secondary mb-4">FPS médio · {res}</div>

            <div
              className="flex gap-3 justify-center text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>{gpu.vram_gb} GB VRAM</span>
              <span>{gpu.tdp_w} W TDP</span>
            </div>
            <div className="mt-2 text-xs text-secondary">
              Índice{' '}
              <span className="num-mono font-semibold">{gpu.index_value.toFixed(1)}</span>
              <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}> / 100</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Delta summary */}
      <div
        className="card p-4 mb-8 text-center"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {overall_winner === 'tie' ? (
          <p className="text-base">
            Empate — diferença menor que 2% em média a {res}
          </p>
        ) : (
          <p className="text-base">
            <strong>{aWins ? short(gpu_a.name) : short(gpu_b.name)}</strong> é{' '}
            <strong style={{ color: 'var(--accent-gold)' }}>
              {Math.abs(avg_delta_pct).toFixed(1)}%
            </strong>{' '}
            mais rápida em média a {res}
          </p>
        )}
      </div>

      {/* ── FPS table */}
      <div className="card overflow-hidden mb-10" style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm" style={{ minWidth: '480px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <th className="text-left p-3 font-medium">Jogo</th>
              <th
                className="text-right p-3 font-medium"
                style={{ color: aWins ? 'var(--accent-gold)' : 'inherit' }}
              >
                {short(gpu_a.name)}
              </th>
              <th
                className="text-right p-3 font-medium"
                style={{ color: bWins ? 'var(--accent-gold)' : 'inherit' }}
              >
                {short(gpu_b.name)}
              </th>
              <th className="text-right p-3 font-medium text-secondary">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.game_slug}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                }}
              >
                <td className="p-3">{row.game_label}</td>
                <td
                  className="p-3 text-right num-mono"
                  style={{
                    color: row.winner === 'a' ? 'var(--accent-gold)' : 'var(--text-primary)',
                    fontWeight: row.winner === 'a' ? 700 : 400,
                  }}
                >
                  {Math.round(row.fps_a)}
                </td>
                <td
                  className="p-3 text-right num-mono"
                  style={{
                    color: row.winner === 'b' ? 'var(--accent-gold)' : 'var(--text-primary)',
                    fontWeight: row.winner === 'b' ? 700 : 400,
                  }}
                >
                  {Math.round(row.fps_b)}
                </td>
                <td className="p-3 text-right num-mono text-xs">
                  {row.winner === 'tie' ? (
                    <span style={{ color: 'var(--text-secondary)' }}>empate</span>
                  ) : (
                    <span
                      style={{
                        color: row.winner === 'a' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                      }}
                    >
                      {row.delta_pct > 0 ? '+' : ''}
                      {row.delta_pct.toFixed(1)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs p-3 text-secondary">
          FPS estimado · anchor+scale · {reference_cpu_name} · preset High · ±15–25% estimativa
        </p>
      </div>

      {/* ── CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/vs" className="btn-ghost flex-1 text-center text-sm">
          ← Mais comparações
        </Link>
        <Link href="/meu-pc" className="btn-ghost flex-1 text-center text-sm">
          Conselheiro de upgrade →
        </Link>
        <Link href="/" className="btn-ghost flex-1 text-center text-sm">
          Ver builds recomendadas →
        </Link>
      </div>
    </main>
  )
}
