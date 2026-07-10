import Link from 'next/link'
import { getMockRepository } from '@/lib/repositories'
import { runLiveWizard } from '@/lib/live-server'
import BuildCard from '@/components/BuildCard'
import type { CuratedBuild, GameSlug } from '@/lib/repositories/types'
import { gameLabel, priorityLabel } from '@/lib/labels'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { budget?: string; games?: string; priority?: string; resolution?: string }
}

function parseResolution(s?: string): '1080p' | '1440p' | '4k' {
  return s === '1440p' || s === '4k' ? s : '1080p'
}
function parseBudget(s?: string): number {
  if (!s) return 5000
  const n = parseInt(s, 10)
  return isFinite(n) && n >= 2000 ? n : 5000
}
function parseGames(s?: string): string[] {
  if (!s) return ['cs2']
  return s.split(',').filter(Boolean)
}

export const metadata = { title: 'Resultados — Rei do FPS' }

export default async function ResultadosPage({ searchParams }: PageProps) {
  const budget = parseBudget(searchParams.budget)
  const games = parseGames(searchParams.games)
  const resolution = parseResolution(searchParams.resolution)
  const priority = (searchParams.priority as 'fps' | 'budget' | 'quiet' | 'future_proof') || 'budget'

  // Live engine first (real, budget-respecting, deduped, mode-ranked builds).
  // null => transport failure (fall back to mock); [] => honest "nothing fit".
  const liveResult = await runLiveWizard({
    budget_brl: budget,
    games: games as GameSlug[],
    priority,
    resolution,
    session_type: 'new',
  })
  const live = liveResult !== null
  let builds: CuratedBuild[] = liveResult ?? []

  // Fallback to mock only if the live engine was unreachable.
  if (!live) {
    const repo = getMockRepository()
    try {
      const results = await repo.builds.runWizard({
        budget_brl: budget,
        games: games as never,
        priority,
        resolution,
        session_type: 'new',
      })
      builds = results.map((r) => r.build)
    } catch {
      builds = []
    }
    if (builds.length === 0) {
      const all = await repo.builds.getAll()
      builds = all.slice(0, 3)
    }
  }

  const variants = ['rei', 'equilibrado', 'arrojado'] as const

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          A Harpia decreta
        </h1>
        <p className="text-secondary">
          Para {budget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ·{' '}
          <span style={{ color: 'var(--text-mono)' }}>{resolution}</span> · prioridade{' '}
          <span style={{ color: 'var(--text-mono)' }}>{priorityLabel(priority)}</span> · jogos:{' '}
          {games.map(gameLabel).join(', ') || '—'}
        </p>
        {live && (
          <p className="text-xs mt-2" style={{ color: 'var(--accent-gold)' }}>
            ● ranking ao vivo por custo/FPS · preços de amostra (demo) até os feeds oficiais
          </p>
        )}
      </div>

      {builds.length === 0 ? (
        <div className="card text-center text-secondary">
          Nenhuma build completa coube nesse orçamento com essa prioridade. Tente subir o orçamento.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {builds.map((b, i) => (
            <BuildCard
              key={b.id}
              build={b}
              variant={variants[i] ?? 'default'}
              detailHref={live ? null : undefined}
              resolution={resolution}
            />
          ))}
        </div>
      )}

      <div className="text-center mt-10">
        <Link href="/wizard" className="btn-ghost">
          ← Refazer o wizard
        </Link>
      </div>
    </div>
  )
}
