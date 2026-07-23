'use client'

import { useCallback, useMemo, useState } from 'react'
import type { LiveCaseOption, LiveInterior, LiveProduct } from '@/lib/live-server'
import GabineteVivo from './GabineteVivo'

/**
 * GabineteVivoLive — camada de ESTADO do viewer (o desenho é do GabineteVivo).
 *
 * Duas interações, ambas resolvidas pelo MESMO motor do backend (o cliente
 * nunca recalcula fluxo — só pede outra estimativa):
 *  1. "e se eu puser uma ventoinha aqui?" → POST /interior/estimate com
 *     `what_if_fans`; o score/pressão/CFM voltam recalculados.
 *  2. "e nesse outro gabinete?" → mesma build, `case_id` trocado, render
 *     lado a lado para comparar folgas e fluxo.
 *
 * O fetch vai a `/api/...` (nginx faz proxy p/ a API interna) — mesmo padrão
 * já usado em /meu-pc, evitando CORS.
 */

type Products = Partial<Record<'gpu' | 'cooler' | 'ram' | 'psu' | 'storage' | 'motherboard' | 'case', LiveProduct | null>>

async function estimate(
  components: Record<string, number>,
  whatIfFans: string[],
): Promise<LiveInterior | null> {
  try {
    const r = await fetch('/api/interior/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components,
        ...(whatIfFans.length ? { what_if_fans: whatIfFans } : {}),
      }),
    })
    if (!r.ok) return null
    return (await r.json()) as LiveInterior
  } catch {
    return null
  }
}

export default function GabineteVivoLive({
  initial, products, components, cases = [],
}: {
  initial: LiveInterior
  products: Products
  components: Record<string, number>
  cases?: LiveCaseOption[]
}) {
  const [interior, setInterior] = useState<LiveInterior>(initial)
  const [whatIf, setWhatIf] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const [compareId, setCompareId] = useState<number | null>(null)
  const [compare, setCompare] = useState<LiveInterior | null>(null)
  const [comparePending, setComparePending] = useState(false)

  const baseScore = initial.airflow.score
  const delta = interior.airflow.score - baseScore

  const refetch = useCallback(async (fans: string[]) => {
    setPending(true); setFailed(false)
    const next = await estimate(components, fans)
    if (next) { setInterior(next); setWhatIf(fans) } else { setFailed(true) }
    setPending(false)
  }, [components])

  const toggleFan = useCallback((mountId: string) => {
    const next = whatIf.includes(mountId) ? whatIf.filter((m) => m !== mountId) : [...whatIf, mountId]
    void refetch(next)
  }, [whatIf, refetch])

  const clearWhatIf = useCallback(() => { void refetch([]) }, [refetch])

  const pickCase = useCallback(async (id: number | null) => {
    setCompareId(id)
    if (id == null) { setCompare(null); return }
    setComparePending(true)
    const next = await estimate({ ...components, case_id: id }, [])
    setCompare(next)
    setComparePending(false)
  }, [components])

  const otherCases = useMemo(
    () => cases.filter((c) => c.id !== components.case_id),
    [cases, components.case_id],
  )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* barra de controlo */}
      <div className="mono" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--dim2)' }}>
        {whatIf.length > 0 && (
          <span style={{
            padding: '3px 10px', borderRadius: 99, border: '1px solid var(--accent-dim)',
            background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600,
          }}>
            simulação: {whatIf.length} ventoinha{whatIf.length > 1 ? 's' : ''} ·{' '}
            {delta > 0 ? `fluxo +${delta}` : delta < 0 ? `fluxo ${delta}` : 'fluxo igual'}
            {' '}(de {baseScore} p/ {interior.airflow.score})
          </span>
        )}
        {failed && <span style={{ color: 'var(--warn)' }}>não deu p/ recalcular agora — mostrando o último estado</span>}

        {otherCases.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <label htmlFor="cmp-case">comparar com:</label>
            <select id="cmp-case" value={compareId ?? ''}
              onChange={(e) => void pickCase(e.target.value ? Number(e.target.value) : null)}
              className="mono"
              style={{
                background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)',
                borderRadius: 8, padding: '4px 8px', fontSize: 11,
              }}>
              <option value="">— nenhum —</option>
              {otherCases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {comparePending && <span>carregando…</span>}
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: compare ? 'repeat(auto-fit, minmax(340px, 1fr))' : '1fr',
      }}>
        <GabineteVivo
          interior={interior}
          products={products}
          whatIfFans={whatIf}
          onToggleFan={toggleFan}
          onClearWhatIf={clearWhatIf}
          pending={pending}
          compact={!!compare}
        />
        {compare && (
          <GabineteVivo
            interior={compare}
            products={{ ...products, case: null }}
            pending={comparePending}
            compact
          />
        )}
      </div>

      {/* resumo da comparação */}
      {compare && (
        <div className="mono" style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--dim)',
          border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', background: 'var(--card)',
        }}>
          <strong style={{ color: 'var(--text)' }}>comparação</strong>
          <span>fluxo: {interior.airflow.score} vs {compare.airflow.score}</span>
          <span>pressão: {interior.airflow.pressure_balance} vs {compare.airflow.pressure_balance}</span>
          {interior.clearances.gpu && compare.clearances.gpu && (
            <span>folga GPU: {Math.round(interior.clearances.gpu.remaining_mm)}mm vs {Math.round(compare.clearances.gpu.remaining_mm)}mm</span>
          )}
          {interior.clearances.cooler && compare.clearances.cooler && (
            <span>folga cooler: {Math.round(interior.clearances.cooler.remaining_mm)}mm vs {Math.round(compare.clearances.cooler.remaining_mm)}mm</span>
          )}
          <span style={{ color: 'var(--dim2)' }}>mesma build, gabinete trocado · estimativa</span>
        </div>
      )}
    </div>
  )
}
