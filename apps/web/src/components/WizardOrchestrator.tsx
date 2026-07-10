'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameSlug, WizardStep } from '@/lib/repositories/types'
import {
  gameLabel,
  RESOLUTIONS,
  RESOLUTION_LABELS,
  RESOLUTION_FPS_MULT,
  type ResolutionKey,
} from '@/lib/labels'

interface GameOption {
  slug: GameSlug
  name: string
}

const GAME_OPTIONS: GameOption[] = [
  { slug: 'cs2', name: 'Counter-Strike 2' },
  { slug: 'valorant', name: 'Valorant' },
  { slug: 'fortnite', name: 'Fortnite' },
  { slug: 'apex-legends', name: 'Apex Legends' },
  { slug: 'gta-v', name: 'GTA V' },
  { slug: 'cyberpunk-2077', name: 'Cyberpunk 2077' },
  { slug: 'hogwarts-legacy', name: 'Hogwarts Legacy' },
  { slug: 'rdr2', name: 'Red Dead Redemption 2' },
  { slug: 'elden-ring', name: 'Elden Ring' },
  { slug: 'call-of-duty-warzone', name: 'Warzone' },
  { slug: 'league-of-legends', name: 'League of Legends' },
  { slug: 'minecraft', name: 'Minecraft' },
]

const PRIORITY_OPTIONS = [
  { key: 'fps', label: 'Máximo FPS', icon: '⚡', desc: 'Sem concessões — quero todos os frames' },
  { key: 'budget', label: 'Melhor custo', icon: '💰', desc: 'Cada real tem que virar FPS' },
  { key: 'quiet', label: 'Silencioso', icon: '🤫', desc: 'Coolers robustos, fluxo de ar ok' },
  { key: 'future_proof', label: 'Durar muito', icon: '🛡️', desc: 'AM5/DDR5 pra sobreviver a 2 ciclos' },
] as const

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function estimateFpsForBudget(budget: number): number {
  // Heurística simples — espelha os Tronos reais
  if (budget < 4000) return 145
  if (budget < 6500) return 210
  if (budget < 10000) return 285
  if (budget < 15000) return 380
  return 420
}

export default function WizardOrchestrator() {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>('budget')
  const [budget, setBudget] = useState(5000)
  const [resolution, setResolution] = useState<ResolutionKey>('1080p')
  const [games, setGames] = useState<GameSlug[]>([])
  const [priority, setPriority] = useState<'fps' | 'budget' | 'quiet' | 'future_proof'>('budget')

  const toggleGame = (slug: GameSlug) => {
    setGames((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug],
    )
  }

  const estimatedFps = Math.round(estimateFpsForBudget(budget) * RESOLUTION_FPS_MULT[resolution])
  const primaryGame = games[0] ?? 'cs2'

  const canAdvance = () => {
    if (step === 'budget') return budget >= 2000
    if (step === 'games') return games.length > 0
    if (step === 'priority') return !!priority
    return false
  }

  const next = () => {
    if (step === 'budget') setStep('games')
    else if (step === 'games') setStep('priority')
    else if (step === 'priority') {
      // Navega para /resultados com querystring
      const params = new URLSearchParams({
        budget: String(budget),
        resolution,
        games: games.join(','),
        priority,
      })
      router.push(`/resultados?${params.toString()}`)
    }
  }

  const back = () => {
    if (step === 'games') setStep('budget')
    else if (step === 'priority') setStep('games')
  }

  const stepIndex = step === 'budget' ? 1 : step === 'games' ? 2 : step === 'priority' ? 3 : 4
  const stepLabels: Record<WizardStep, string> = {
    budget: 'Orçamento',
    games: 'Jogos',
    priority: 'Prioridade',
    results: 'Resultados',
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-secondary">
            Passo {stepIndex} de 3
          </span>
          <span className="text-xs text-secondary">
            {stepLabels[step]}
          </span>
        </div>
        <div className="h-1 bg-elevated rounded overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${(stepIndex / 3) * 100}%`,
              backgroundColor: 'var(--accent-gold)',
            }}
          />
        </div>
      </div>

      {/* Estimativa em tempo real */}
      <div className="card mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-secondary">Estimativa em tempo real</div>
          <div className="text-sm">
            <span className="num-mono text-2xl font-bold">~{estimatedFps}</span>
            <span className="text-secondary text-sm ml-2">
              FPS médio · {gameLabel(primaryGame)} · {RESOLUTION_LABELS[resolution]}
            </span>
          </div>
          <div className="text-xs text-secondary">
            para {formatBRL(budget)} · estimativa (±15%), não medição
          </div>
        </div>
      </div>

      {/* Step 1 — Orçamento */}
      {step === 'budget' && (
        <div className="card">
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            Quanto quer gastar?
          </h2>
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="num-mono text-3xl font-bold">{formatBRL(budget)}</span>
              <span className="text-sm text-secondary">R$ 2.000 – R$ 20.000</span>
            </div>
            <input
              type="range"
              min={2000}
              max={20000}
              step={500}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: 'var(--accent-gold)' }}
              aria-label="Orçamento em R$"
            />
            <div className="flex justify-between text-xs text-secondary mt-1">
              <span>R$ 2k</span>
              <span>R$ 5k</span>
              <span>R$ 8k</span>
              <span>R$ 12k</span>
              <span>R$ 20k</span>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Resolução do monitor</div>
            <div className="flex gap-2" role="group" aria-label="Resolução do monitor">
              {RESOLUTIONS.map((r) => {
                const selected = resolution === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setResolution(r)}
                    className="flex-1 py-2 rounded-md border text-sm transition-colors"
                    style={{
                      borderColor: selected ? 'var(--accent-gold)' : 'var(--border)',
                      backgroundColor: selected ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                      color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                    aria-pressed={selected}
                  >
                    {RESOLUTION_LABELS[r]}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-secondary mt-2">
              Muda muito o R$/FPS: 1440p e 4K exigem bem mais GPU.
            </p>
          </div>
        </div>
      )}

      {/* Step 2 — Jogos */}
      {step === 'games' && (
        <div className="card">
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            O que você joga?
          </h2>
          <p className="text-sm text-secondary mb-4">
            Selecione um ou mais. Vamos cruzar com nosso banco de FPS estimado.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GAME_OPTIONS.map((g) => {
              const selected = games.includes(g.slug)
              return (
                <button
                  key={g.slug}
                  onClick={() => toggleGame(g.slug)}
                  className="text-left px-3 py-3 rounded-md border transition-colors"
                  style={{
                    borderColor: selected ? 'var(--accent-gold)' : 'var(--border)',
                    backgroundColor: selected ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                  }}
                  type="button"
                >
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-xs text-secondary mt-0.5">
                    {selected ? '✓ selecionado' : 'toque para selecionar'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 3 — Prioridade */}
      {step === 'priority' && (
        <div className="card">
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            O que importa mais?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRIORITY_OPTIONS.map((p) => {
              const selected = priority === p.key
              return (
                <button
                  key={p.key}
                  onClick={() => setPriority(p.key)}
                  className="text-left p-4 rounded-md border transition-colors"
                  style={{
                    borderColor: selected ? 'var(--accent-gold)' : 'var(--border)',
                    backgroundColor: selected ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                  }}
                  type="button"
                >
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <div className="font-semibold mb-1">{p.label}</div>
                  <div className="text-xs text-secondary">{p.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between mt-6">
        <button
          onClick={back}
          disabled={step === 'budget'}
          className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
          type="button"
        >
          ← Voltar
        </button>
        <button
          onClick={next}
          disabled={!canAdvance()}
          className="btn-gold disabled:opacity-30 disabled:cursor-not-allowed"
          type="button"
        >
          {step === 'priority' ? 'Decretar meus builds →' : 'Próximo →'}
        </button>
      </div>
    </div>
  )
}