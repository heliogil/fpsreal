'use client'

import { useMemo, useState } from 'react'
import { gameLabel } from '@/lib/labels'

/**
 * TrocaPeca — passo 6 do visualizador: "e se eu trocar a placa de vídeo?"
 *
 * Lista as placas do catálogo com a MESMA build em volta, vindas de
 * POST /api/upgrade/swap (o servidor faz tudo: FPS com esta CPU, preço da
 * oferta, custo/FPS da build trocada e se cabe/liga pelas mesmas regras da
 * página). Escolher uma placa aplica-a ao desenho (GabineteVivoLive pede outra
 * estimativa do interior), por isso o efeito aparece no gabinete, no fluxo de
 * ar e no veredicto, não só numa tabela.
 *
 * INTEGRIDADE: tudo é estimativa; preço de amostra vem marcado.
 */

export type SwapAlt = {
  product_id: number
  sku: string
  name: string
  brand: string | null
  length_mm: number | null
  tdp_w: number | null
  offer_id: number
  price_brl: number
  demo: boolean
  avg_fps: number
  delta_fps: number
  delta_pct: number
  delta_price_brl: number | null
  total_brl: number | null
  rs_per_fps: number | null
  delta_rs_per_fps: number | null
  fits: boolean
  blocker: string | null
  warning: string | null
}

export type SwapResponse = {
  current: {
    product_id: number; name: string; price_brl: number | null; avg_fps: number | null
    total_brl: number | null; rs_per_fps: number | null
  } | null
  games: string[]
  resolution: string
  alternatives: SwapAlt[]
}

type Sort = 'cpf' | 'fps' | 'preco'
const SORTS: Array<[Sort, string]> = [['cpf', 'melhor custo/FPS'], ['fps', 'mais FPS'], ['preco', 'mais barato']]

export const brl = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
export const cpfFmt = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function priceDeltaText(d: number | null): string | null {
  if (d == null || Math.round(d) === 0) return d == null ? null : 'mesmo preço'
  return d < 0 ? `${brl(-d)} mais barato` : `+${brl(d)}`
}

/** O aviso do motor é longo; na lista basta o essencial. */
function shortWarn(w: string): string {
  if (w.includes('12V-2x6') || w.includes('12VHPWR')) return 'precisa do adaptador de força'
  if (w.includes('recomendado')) return 'fonte no limite'
  return w
}
function shortBlock(b: string): string {
  if (b.includes('recomendado')) return 'a fonte não aguenta'
  if (b.includes('conector')) return 'a fonte não tem o conector'
  if (/cabe|comprimento|mm/i.test(b)) return 'não cabe no gabinete'
  return b
}

export default function TrocaPeca({
  data, loading, failed, appliedId, applyingId, onApply, onClose,
}: {
  data: SwapResponse | null
  loading: boolean
  failed: boolean
  appliedId: number | null
  applyingId: number | null
  onApply: (alt: SwapAlt) => void
  onClose: () => void
}) {
  const [sort, setSort] = useState<Sort>('cpf')
  const [all, setAll] = useState(false)

  const alts = data?.alternatives ?? []
  // Placas diferentes com o MESMO FPS médio no topo = é a CPU que segura
  // (modelo de gargalo da API). Dizer isso evita "paguei mais e não ganhei".
  const capFps = useMemo(() => {
    if (!alts.length) return null
    const top = Math.max(...alts.map((a) => a.avg_fps))
    return alts.filter((a) => a.avg_fps >= top - 0.5).length >= 2 ? top : null
  }, [alts])

  const sorted = useMemo(() => {
    const fit = alts.filter((a) => a.fits)
    const no = alts.filter((a) => !a.fits)
    const by: Record<Sort, (a: SwapAlt, b: SwapAlt) => number> = {
      cpf: (a, b) => (a.rs_per_fps ?? 1e9) - (b.rs_per_fps ?? 1e9),
      fps: (a, b) => b.avg_fps - a.avg_fps || a.price_brl - b.price_brl,
      preco: (a, b) => a.price_brl - b.price_brl,
    }
    return [...fit.sort(by[sort]), ...no.sort(by[sort])]
  }, [alts, sort])
  const shown = all ? sorted : sorted.slice(0, 6)
  const cur = data?.current

  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent-dim)' : 'var(--line)'}`,
    background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--dim)',
    fontWeight: on ? 600 : 400,
  })

  return (
    <section aria-label="Trocar a placa de vídeo" style={{
      border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', overflow: 'hidden',
    }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line2)' }}>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15, color: 'var(--text)' }}>Trocar a placa de vídeo</strong>
          <div style={{ fontSize: 11.5, color: 'var(--dim2)', marginTop: 2, lineHeight: 1.45 }}>
            mesma build, só a placa muda · FPS médio em{' '}
            {(data?.games ?? []).map((g) => gameLabel(g)).join(', ') || 'jogos de referência'}
            {' '}({data?.resolution ?? '1080p'}) · estimativa
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar a troca de placa"
          style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--line)', background: 'transparent', color: 'var(--dim)' }}>
          fechar
        </button>
      </header>

      {loading && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--dim)' }}>testando as placas do catálogo nesta build…</div>}
      {failed && !loading && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--warn)' }}>não deu para carregar as alternativas agora.</div>}

      {data && !loading && (
        <>
          {cur && (
            <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--dim)', borderBottom: '1px solid var(--line2)' }}>
              atual: <span style={{ color: 'var(--text)' }}>{cur.name}</span>
              {cur.avg_fps != null && <> · {Math.round(cur.avg_fps)} FPS</>}
              {cur.rs_per_fps != null && <> · {cpfFmt(cur.rs_per_fps)}/FPS</>}
            </div>
          )}
          <div role="group" aria-label="Ordenar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 4px' }}>
            {SORTS.map(([k, label]) => (
              <button key={k} type="button" style={chip(sort === k)} aria-pressed={sort === k}
                onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: '4px 8px 8px' }}>
            {shown.map((a) => {
              const applied = a.product_id === appliedId
              const better = a.delta_rs_per_fps != null && a.delta_rs_per_fps < 0
              const pd = priceDeltaText(a.delta_price_brl)
              const capped = capFps != null && a.avg_fps >= capFps - 0.5
              return (
                <li key={a.product_id}>
                  <button type="button" disabled={!a.fits || applyingId != null}
                    data-umami-event="viewer-trocar-gpu"
                    onClick={() => onApply(a)}
                    aria-pressed={applied}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', gap: '4px 14px', flexWrap: 'wrap', alignItems: 'baseline',
                      padding: '10px 10px', margin: '2px 0', borderRadius: 10, cursor: a.fits ? 'pointer' : 'not-allowed',
                      border: `1px solid ${applied ? 'var(--accent-dim)' : 'transparent'}`,
                      background: applied ? 'var(--accent-soft)' : 'transparent', color: 'var(--text)',
                      opacity: a.fits ? 1 : 0.55, font: 'inherit',
                    }}
                    className="gv-swap-row">
                    <span style={{ flex: '1 1 180px', fontSize: 14, fontWeight: 600 }}>
                      {a.name}
                      {applied && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>no desenho</span>}
                      {applyingId === a.product_id && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--dim)' }}>montando…</span>}
                    </span>
                    <span className="mono" style={{ fontSize: 12.5, color: a.delta_fps > 0 ? 'var(--fresh)' : a.delta_fps < 0 ? 'var(--warn)' : 'var(--dim)' }}>
                      {Math.round(a.avg_fps)} FPS ({a.delta_pct > 0 ? '+' : ''}{a.delta_pct}%)
                    </span>
                    {pd && <span className="mono" style={{ fontSize: 12.5, color: 'var(--dim)' }}>{pd}</span>}
                    {a.rs_per_fps != null && (
                      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: better ? 'var(--fresh)' : 'var(--danger)' }}>
                        {cpfFmt(a.rs_per_fps)}/FPS
                      </span>
                    )}
                    <span style={{ flexBasis: '100%', fontSize: 11, color: 'var(--dim2)' }}>
                      {!a.fits && a.blocker && <span style={{ color: 'var(--danger)' }}>✕ {shortBlock(a.blocker)} · </span>}
                      {a.fits && a.warning && <span style={{ color: 'var(--warn)' }} title={a.warning}>⚠ {shortWarn(a.warning)} · </span>}
                      {capped && <span title="Com esta CPU, placas mais fortes não passam deste FPS (a CPU é o gargalo).">travado na CPU · </span>}
                      {a.length_mm ? `${Math.round(a.length_mm)}mm` : ''}
                      {a.total_brl != null && ` · build ${brl(a.total_brl)}`}
                      {a.demo && ' · preço de amostra'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {sorted.length > 6 && (
            <div style={{ padding: '0 16px 12px' }}>
              <button type="button" onClick={() => setAll((v) => !v)} style={chip(false)}>
                {all ? 'mostrar menos' : `ver todas (${sorted.length})`}
              </button>
            </div>
          )}
          {!alts.length && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--dim)' }}>sem alternativas com preço e FPS para esta build.</div>}
        </>
      )}
    </section>
  )
}
