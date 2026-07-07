import Link from 'next/link'
import { getMockRepository } from '@/lib/repositories'
import BuildCard from '@/components/BuildCard'
import type { BuildResult } from '@/lib/repositories/types'

interface PageProps {
  searchParams: { budget?: string; games?: string; priority?: string }
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

export const metadata = {
  title: 'Resultados — Rei do FPS',
}

export default async function ResultadosPage({ searchParams }: PageProps) {
  const repo = getMockRepository()
  const budget = parseBudget(searchParams.budget)
  const games = parseGames(searchParams.games)
  const priority = (searchParams.priority as 'fps' | 'budget' | 'quiet' | 'future_proof') || 'budget'

  // Chama o wizard do repo. Garante fallback se a chamada falhar.
  let results: BuildResult[] = []
  try {
    results = await repo.builds.runWizard({
      budget_brl: budget,
      games: games as never,
      priority,
      resolution: '1080p',
      session_type: 'new',
    })
  } catch {
    results = []
  }

  // Fallback final: usar os 3 primeiros Tronos.
  if (results.length === 0) {
    const all = await repo.builds.getAll()
    results = all.slice(0, 3).map((b) => ({
      build: b,
      fps_estimates: [],
      offers: [],
      compatibility_warnings: [],
      airflow_summary: { pressure_balance: 'neutral' as const, zone_scores: [], warnings: [], confidence: '' },
      clearance_warnings: [],
    }))
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          A Harpia decreta
        </h1>
        <p className="text-secondary">
          Para {budget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} com prioridade em{' '}
          <span style={{ color: 'var(--text-mono)' }}>{priority}</span> · jogos: {games.join(', ') || '—'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map((r, i) => (
          <BuildCard
            key={r.build.id}
            build={r.build}
            variant={i === 0 ? 'rei' : i === 1 ? 'equilibrado' : 'arrojado'}
          />
        ))}
      </div>

      <div className="text-center mt-10">
        <Link href="/wizard" className="btn-ghost">
          ← Refazer o wizard
        </Link>
      </div>
    </div>
  )
}