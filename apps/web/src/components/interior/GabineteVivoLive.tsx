'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LiveCaseOption, LiveInterior, LiveProduct } from '@/lib/live-server'
import GabineteVivo from './GabineteVivo'
import TrocaPeca, { brl, cpfFmt, priceDeltaText, type SwapAlt, type SwapResponse } from './TrocaPeca'

/**
 * GabineteVivoLive — camada de ESTADO do viewer (o desenho é do GabineteVivo).
 *
 * Duas interações, ambas resolvidas pelo MESMO motor do backend (o cliente
 * nunca recalcula fluxo — só pede outra estimativa):
 *  1. "e se eu puser uma ventoinha aqui?" → POST /interior/estimate com
 *     `what_if_fans`; o score/pressão/CFM voltam recalculados.
 *  2. "e nesse outro gabinete?" → mesma build, `case_id` trocado, render
 *     lado a lado para comparar folgas e fluxo.
 *  3. "e se eu trocar a placa de vídeo?" (passo 6) → POST /upgrade/swap lista as
 *     placas com FPS/preço/custo-FPS desta build; escolher uma troca o `gpu_id`
 *     e o desenho, o fluxo e o veredicto passam a ser os da build trocada.
 *
 * O fetch vai a `/api/...` (nginx faz proxy p/ a API interna) — mesmo padrão
 * já usado em /meu-pc, evitando CORS.
 */

type Products = Partial<Record<'gpu' | 'cooler' | 'ram' | 'psu' | 'storage' | 'motherboard' | 'case', LiveProduct | null>>

const PRESSAO: Record<string, string> = { positive: 'positiva', negative: 'negativa', neutral: 'neutra' }

type Suggestion = { id: number; name: string; score: number; offerId: number | null; price: number | null; demo: boolean }

async function bestOffer(productId: number): Promise<{ id: number; price_brl: number; merchant: { name: string } } | null> {
  try {
    const r = await fetch(`/api/offers/best?product=${productId}`)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

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

export type ViewerOffers = Record<string, { id: number; price_brl: number; demo: boolean }>

async function fetchSwap(
  components: Record<string, number>, totalBrl?: number, currentPrice?: number,
): Promise<SwapResponse | null> {
  try {
    const r = await fetch('/api/upgrade/swap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components, slot: 'gpu',
        ...(totalBrl && totalBrl > 0 ? { total_brl: totalBrl } : {}),
        ...(currentPrice && currentPrice > 0 ? { current_price_brl: currentPrice } : {}),
      }),
    })
    if (!r.ok) return null
    return (await r.json()) as SwapResponse
  } catch {
    return null
  }
}

export default function GabineteVivoLive({
  initial, products, offers, components: buildComponents, cases = [], totalBrl,
}: {
  initial: LiveInterior
  products: Products
  offers?: ViewerOffers
  components: Record<string, number>
  cases?: LiveCaseOption[]
  /** preço total da build como a página mostra (base do custo/FPS da troca) */
  totalBrl?: number
}) {
  // ── troca de placa (passo 6) ─────────────────────────────────────────────
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapData, setSwapData] = useState<SwapResponse | null>(null)
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapFailed, setSwapFailed] = useState(false)
  const [swapped, setSwapped] = useState<SwapAlt | null>(null)
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  // a build "em cena": a original ou com a placa trocada
  const components = useMemo(
    () => (swapped ? { ...buildComponents, gpu_id: swapped.product_id } : buildComponents),
    [buildComponents, swapped],
  )
  const viewProducts: Products = useMemo(
    () => (swapped ? { ...products, gpu: { id: swapped.product_id, sku: swapped.sku, name: swapped.name, brand: swapped.brand } } : products),
    [products, swapped],
  )
  const viewOffers: ViewerOffers | undefined = useMemo(
    () => (swapped ? { ...(offers ?? {}), gpu: { id: swapped.offer_id, price_brl: swapped.price_brl, demo: swapped.demo } } : offers),
    [offers, swapped],
  )
  // estado SEM ventoinhas simuladas da build em cena (base do "+N de fluxo")
  const [baseline, setBaseline] = useState<LiveInterior>(initial)

  const [interior, setInterior] = useState<LiveInterior>(initial)
  const [whatIf, setWhatIf] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const [compareId, setCompareId] = useState<number | null>(null)
  const [compare, setCompare] = useState<LiveInterior | null>(null)
  const [comparePending, setComparePending] = useState(false)

  const baseScore = baseline.airflow.score
  const delta = interior.airflow.score - baseScore

  const refetch = useCallback(async (fans: string[]) => {
    setPending(true); setFailed(false)
    const next = await estimate(components, fans)
    if (next) { setInterior(next); setWhatIf(fans) } else { setFailed(true) }
    setPending(false)
  }, [components])

  const toggleFan = useCallback((mountId: string) => {
    // clicar num mount livre = +1 (primeira ventoinha); num já simulado = zera
    const next = whatIf.includes(mountId) ? whatIf.filter((m) => m !== mountId) : [...whatIf, mountId]
    void refetch(next)
  }, [whatIf, refetch])

  // +1/−1 no mesmo mount (empilhamento em baias largas) — repetições no array
  const fanDelta = useCallback((mountId: string, d: number) => {
    let next = [...whatIf]
    if (d > 0) next.push(mountId)
    else { const i = next.lastIndexOf(mountId); if (i >= 0) next.splice(i, 1) }
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

  // #11: só compara com gabinetes onde a build CABE. Os incompatíveis não são
  // escondidos (o utilizador pode querer saber) — vêm marcados e desabilitados.
  const gpuLen = baseline.parts.gpu.length_mm || 0
  const coolerH = baseline.parts.cooler.height_mm || 0
  const otherCases = useMemo(
    () => cases
      .filter((c) => c.id !== components.case_id)
      .map((c) => {
        const gpuOk = !c.max_gpu_length_mm || !gpuLen || c.max_gpu_length_mm >= gpuLen
        const coolerOk = !c.max_cooler_height_mm || !coolerH || c.max_cooler_height_mm >= coolerH
        return { ...c, fits: gpuOk && coolerOk }
      })
      .sort((a, b) => Number(b.fits) - Number(a.fits)),
    [cases, components.case_id, gpuLen, coolerH],
  )

  // Passo 4 do viewer: quando o fluxo está apertado, procurar NO CATÁLOGO o
  // gabinete onde esta mesma build respira melhor — com o mesmo motor
  // (/interior/estimate) e o preço da oferta. Só sugere se o ganho for real
  // (≥ 10 pontos); empate decide pelo preço. Nada é inventado no cliente.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const currentPrice = offers?.case?.price_brl ?? null
  useEffect(() => {
    setSuggestion(null)
    if (baseScore >= 70) return
    const candidates = otherCases.filter((c) => c.fits)
    if (!candidates.length) return
    let cancelled = false
    ;(async () => {
      const scored = await Promise.all(candidates.map(async (c) => {
        const [est, off] = await Promise.all([estimate({ ...components, case_id: c.id }, []), bestOffer(c.id)])
        return est ? {
          id: c.id, name: c.name, score: est.airflow.score,
          offerId: off?.id ?? null, price: off?.price_brl ?? null,
          demo: !!off && off.merchant.name.toLowerCase().includes('amostra'),
        } : null
      }))
      const good = scored.filter((x): x is Suggestion => !!x && x.score >= baseScore + 10)
      good.sort((a, b) => b.score - a.score || (a.price ?? 1e9) - (b.price ?? 1e9))
      if (!cancelled) setSuggestion(good[0] ?? null)
    })()
    return () => { cancelled = true }
  }, [baseScore, otherCases, components])

  const openSwap = useCallback(async () => {
    setSwapOpen(true)
    if (swapData || swapLoading) return
    setSwapLoading(true); setSwapFailed(false)
    const d = await fetchSwap(buildComponents, totalBrl, offers?.gpu?.price_brl)
    if (d) setSwapData(d); else setSwapFailed(true)
    setSwapLoading(false)
  }, [swapData, swapLoading, buildComponents, totalBrl, offers])

  const applySwap = useCallback(async (alt: SwapAlt) => {
    if (alt.product_id === swapped?.product_id) return
    setApplyingId(alt.product_id)
    const next = await estimate({ ...buildComponents, gpu_id: alt.product_id }, [])
    setApplyingId(null)
    if (!next) { setFailed(true); return }
    setFailed(false)
    setSwapped(alt); setInterior(next); setBaseline(next); setWhatIf([])
    setCompareId(null); setCompare(null)
    // no celular a lista fica abaixo do desenho: volta ao desenho p/ ver o efeito
    const top = topRef.current?.getBoundingClientRect().top
    if (top != null && top < 0) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [buildComponents, swapped])

  const undoSwap = useCallback(() => {
    setSwapped(null); setInterior(initial); setBaseline(initial); setWhatIf([])
    setCompareId(null); setCompare(null)
  }, [initial])

  const cur = swapData?.current
  const priceDelta = suggestion?.price != null && currentPrice != null ? suggestion.price - currentPrice : null

  return (
    <div ref={topRef} style={{ display: 'grid', gap: 12, scrollMarginTop: 12 }}>
      {/* barra de controlo */}
      <div className="mono" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--dim2)' }}>
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
        {swapped && (
          <span style={{
            display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            padding: '3px 10px', borderRadius: 99, border: '1px solid var(--accent-dim)',
            background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600,
          }}>
            <span>
              troca: {swapped.name} no lugar da {cur?.name ?? products.gpu?.name ?? 'placa atual'}
              {cur?.avg_fps != null && <> · FPS {Math.round(cur.avg_fps)} → {Math.round(swapped.avg_fps)}</>}
              {cur?.rs_per_fps != null && swapped.rs_per_fps != null && <> · {cpfFmt(cur.rs_per_fps)} → {cpfFmt(swapped.rs_per_fps)}/FPS</>}
              {swapped.total_brl != null && <> · build {brl(swapped.total_brl)}</>}
            </span>
            <button type="button" onClick={undoSwap} data-umami-event="viewer-trocar-desfazer" className="mono"
              style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--accent-dim)', background: 'transparent', color: 'var(--accent)' }}>
              desfazer
            </button>
          </span>
        )}
        {failed && <span style={{ color: 'var(--warn)' }}>não deu p/ recalcular agora — mostrando o último estado</span>}

        {otherCases.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <label htmlFor="cmp-case">comparar com:</label>
            <select id="cmp-case" data-umami-event="viewer-comparar-gabinete" value={compareId ?? ''}
              onChange={(e) => void pickCase(e.target.value ? Number(e.target.value) : null)}
              className="mono"
              style={{
                background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)',
                borderRadius: 8, padding: '4px 8px', fontSize: 12,
              }}>
              <option value="">— nenhum —</option>
              {otherCases.some((c) => c.fits) && (
                <optgroup label="cabem nesta build">
                  {otherCases.filter((c) => c.fits).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )}
              {otherCases.some((c) => !c.fits) && (
                <optgroup label="não cabem (GPU/cooler)">
                  {otherCases.filter((c) => !c.fits).map((c) => <option key={c.id} value={c.id} disabled>{c.name} ✕</option>)}
                </optgroup>
              )}
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
          products={viewProducts}
          offers={viewOffers}
          onSwapGpu={() => void openSwap()}
          whatIfFans={whatIf}
          onToggleFan={toggleFan}
          onFanDelta={fanDelta}
          onClearWhatIf={clearWhatIf}
          pending={pending}
          compact={!!compare}
        />
        {compare && (
          <GabineteVivo
            interior={compare}
            products={{ ...viewProducts, case: null }}
            pending={comparePending}
            compact
          />
        )}
      </div>

      {!swapOpen && products.gpu && (
        <button type="button" onClick={() => void openSwap()} data-umami-event="viewer-trocar-abrir" className="mono"
          style={{
            justifySelf: 'start', fontSize: 12.5, padding: '7px 14px', borderRadius: 99, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)',
          }}>
          ↻ trocar a placa de vídeo e ver o FPS e o custo/FPS
        </button>
      )}
      {swapOpen && (
        <TrocaPeca
          data={swapData} loading={swapLoading} failed={swapFailed}
          appliedId={swapped?.product_id ?? null} applyingId={applyingId}
          onApply={(a) => void applySwap(a)}
          onClose={() => setSwapOpen(false)}
        />
      )}
      {swapped && (
        <div className="mono" style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5,
          border: '1px solid var(--line)', borderRadius: 12, padding: '10px 16px', background: 'var(--card)',
        }}>
          <span style={{ flex: '1 1 220px', color: 'var(--dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{swapped.name}</strong> · {brl(swapped.price_brl)}
            {priceDeltaText(swapped.delta_price_brl) && <> ({priceDeltaText(swapped.delta_price_brl)})</>}
            {swapped.demo && ' · preço de amostra'}
          </span>
          <a data-umami-event="viewer-trocar-oferta" href={`/go/${swapped.offer_id}?utm_source=build&utm_medium=viewer_troca`}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ver oferta da placa →
          </a>
        </div>
      )}

      {suggestion && compareId !== suggestion.id && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          border: '1px solid var(--fresh-b)', borderRadius: 12, padding: '12px 16px',
          background: 'color-mix(in srgb, var(--fresh) 6%, var(--card))',
        }}>
          <div style={{ flex: '1 1 240px', fontSize: 14, lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--fresh)' }}>Gabinete que resolve:</strong>{' '}
            <span style={{ color: 'var(--text)' }}>{suggestion.name}</span>
            <span className="mono" style={{ display: 'block', fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
              fluxo de ar {baseScore} → {suggestion.score}
              {priceDelta != null && priceDelta !== 0 && (
                <> · {priceDelta < 0 ? 'R$ ' + Math.abs(priceDelta).toLocaleString('pt-BR') + ' mais barato' : '+R$ ' + priceDelta.toLocaleString('pt-BR')}</>
              )}
              {suggestion.demo && ' · preço de amostra'}
            </span>
          </div>
          <button type="button" data-umami-event="viewer-sugestao-comparar" onClick={() => void pickCase(suggestion.id)} className="mono"
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}>
            comparar lado a lado
          </button>
          {suggestion.offerId != null && (
            <a data-umami-event="viewer-sugestao-oferta" href={`/go/${suggestion.offerId}?utm_source=build&utm_medium=viewer_sugestao`} className="mono"
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              ver oferta →
            </a>
          )}
        </div>
      )}

      {/* resumo da comparação */}
      {compare && (
        <div className="mono" style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--dim)',
          border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', background: 'var(--card)',
        }}>
          <strong style={{ color: 'var(--text)' }}>comparação</strong>
          <span>fluxo: {interior.airflow.score} vs {compare.airflow.score}</span>
          <span>pressão: {PRESSAO[interior.airflow.pressure_balance] ?? interior.airflow.pressure_balance} vs {PRESSAO[compare.airflow.pressure_balance] ?? compare.airflow.pressure_balance}</span>
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
