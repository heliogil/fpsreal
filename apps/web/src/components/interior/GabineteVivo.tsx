'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { LiveInterior, LiveProduct } from '@/lib/live-server'
import Gabinete2D from './Gabinete2D'
import { mountLabel } from '@/lib/viewer-labels'
import BottleneckNote from './BottleneckNote'
import Veredicto from './Veredicto'
import { coolerBand, bandSuffix, sourceTag, type ClearanceSource } from './clearance'

/**
 * GabineteVivo — o CARTÃO do visualizador: cabeçalho com o fluxo, veredicto,
 * cena, ficha da peça escolhida, diagnóstico, vagas e detalhes do fluxo.
 *
 * Desde a fase 3 do 3D (2026-11-19) a cena não é desenhada aqui: é o 3D
 * (Viewer3D, que o GabineteVivoLive passa em `scene`) ou o corte lateral leve
 * (Gabinete2D) — servidor, sem WebGL, comparação lado a lado e resultados do
 * assistente. O desenho 2D feito à mão (v5: mockups por tier, vista superior,
 * animação de montagem, ~2.100 linhas) saiu. A ficha da peça (specs, preço,
 * oferta, "trocar esta placa") vive aqui e serve as duas cenas.
 *
 * INTEGRIDADE: estimativa de fluxo e estimativa dimensional — nunca medição.
 */

type Products = Partial<Record<'gpu' | 'cooler' | 'ram' | 'psu' | 'storage' | 'motherboard' | 'case', LiveProduct | null>>

const ZONE_LABEL: Record<string, string> = {
  intake_front: 'entrada', cpu_zone: 'CPU', gpu_zone: 'GPU', exhaust_rear: 'saída', exhaust_top: 'topo',
}
const STATUS_PT: Record<string, { label: string; color: string; border: string }> = {
  ok: { label: 'ok', color: 'var(--fresh)', border: 'var(--fresh-b)' },
  tight: { label: 'apertado', color: 'var(--warn)', border: 'var(--warn-b)' },
  critical: { label: 'crítico', color: 'var(--danger)', border: 'var(--danger-b)' },
  dead_zone: { label: 'sem fluxo', color: 'var(--dim2)', border: 'var(--line)' },
}
// peça em foco → slot do catálogo (p/ achar a oferta)
const FOCUS_SLOT: Record<string, string> = { gpu: 'gpu', cooler: 'cooler', pump: 'cooler', rad: 'cooler', psu: 'psu', mobo: 'motherboard', ram: 'ram' }

/** O que a cena recebe para abrir a ficha de uma peça (3D ou 2D). */
export type ScenePick = { picked: string | null; onPick: (key: string | null) => void; placeholder: ReactNode }

export default function GabineteVivo({
  interior, products, offers, whatIfFans = [], onToggleFan, onFanDelta, onClearWhatIf, onSwapGpu, pending = false, compact = false,
  scene,
}: {
  interior: LiveInterior
  products: Products
  /** oferta por peça (slot) — a ficha em foco mostra preço e link */
  offers?: Record<string, { id: number; price_brl: number; demo: boolean }>
  /** ids de mounts simulados (estado visual dos botões) */
  whatIfFans?: string[]
  /** tocar num mount livre pede a simulação ao motor */
  onToggleFan?: (mountId: string) => void
  /** +1/−1 ventoinha num mount (empilhamento em baias largas) */
  onFanDelta?: (mountId: string, delta: number) => void
  onClearWhatIf?: () => void
  /** a ficha da GPU oferece "trocar" (abre a lista no GabineteVivoLive) */
  onSwapGpu?: () => void
  pending?: boolean
  /** comparação lado a lado / resultados: cartão enxuto */
  compact?: boolean
  /** cena 3D no lugar do corte leve; recebe como abrir a ficha da peça */
  scene?: (pick: ScenePick) => ReactNode
}) {
  const [focused, setFocused] = useState<string | null>(null)

  // Esc fecha a ficha venha de onde vier (teclado, leitor de ecrã)
  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocused(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused])

  const g = interior.geometry
  const score = interior.airflow.score
  const scoreTone = score >= 70 ? 'var(--fresh)' : score >= 45 ? 'var(--warn)' : 'var(--danger)'
  const pressao = interior.airflow.pressure_balance === 'positive' ? 'positiva' : interior.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'
  const simulated = (interior.what_if?.fans?.length ?? 0) > 0

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>{interior.case.name ?? 'gabinete'}</span>
      {pending && <span style={{ fontSize: 12, color: 'var(--dim2)' }}>recalculando…</span>}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 13, color: 'var(--dim)' }}>fluxo de ar{simulated ? ' (simulado)' : ''}</span>
      <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: scoreTone }}>{score}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99, border: `1px solid ${scoreTone}`, color: scoreTone }}>
        {score >= 70 ? 'bom' : score >= 45 ? 'apertado' : 'fraco'}
      </span>
    </div>
  )

  if (!g) {
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        {header}
        <div style={{ borderTop: '1px solid var(--line2)', padding: 48, textAlign: 'center' }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--dim2)' }}>
            geometria do gabinete em análise — visualização paramétrica indisponível
          </span>
        </div>
      </div>
    )
  }

  /* ── ficha da peça: todas as specs vêm do `interior` — nada é inventado ── */
  const P = (part: string) => g.placements.find((p) => p.part === part)
  const gpu = P('gpu'), airCooler = P('air_cooler'), pump = P('aio_pump'), rad = P('aio_radiator')
  const radFans = P('aio_fans'), psu = P('psu'), mobo = P('motherboard'), ram = P('ram')
  const gpuClr = interior.clearances.gpu
  const coolerClr = interior.clearances.cooler
  const coolerSrc: ClearanceSource = (coolerClr?.source as ClearanceSource) ?? 'ficha'
  const coolerRealH = interior.parts.cooler.height_mm || 0
  const mm = (n: number) => `${Math.round(n)}mm`
  type Ficha = { label: string; specs: Array<[string, string]> }
  const fichas: Record<string, Ficha> = {}
  if (gpu) fichas.gpu = {
    label: 'Placa de vídeo',
    specs: [
      ['modelo', products.gpu?.name ?? interior.parts.gpu.name ?? '—'],
      ['comprimento', mm(gpu.w)],
      ...(interior.parts.gpu.thickness_mm ? [['espessura', `${interior.parts.gpu.slots ?? '?'}-slot · ~${mm(interior.parts.gpu.thickness_mm)} típico`] as [string, string]] : []),
      ['TDP', `${Math.round(interior.parts.gpu.tdp_w)} W`],
      ...(gpuClr ? [['folga até a frente', mm(gpuClr.remaining_mm) + (gpuClr.is_tight ? ' (apertado)' : '')] as [string, string]] : []),
    ],
  }
  if (airCooler) fichas.cooler = {
    label: 'Cooler da CPU',
    specs: [
      ['modelo', products.cooler?.name ?? interior.parts.cooler.name ?? '—'],
      ['altura (spec)', mm(coolerRealH)],
      // a ficha do fabricante erra (Noctua: até −3,5mm no lado perigoso) —
      // a folga leva a ressalva da margem. Ver ./clearance.
      ...(coolerClr ? [['folga até a tampa', mm(coolerClr.remaining_mm) + bandSuffix(coolerBand(coolerClr.remaining_mm, coolerSrc)) + sourceTag(coolerSrc)] as [string, string]] : []),
    ],
  }
  if (pump) fichas.pump = {
    label: 'Bomba do AIO (water block)',
    specs: [
      ['modelo', products.cooler?.name ?? interior.parts.cooler.name ?? '—'],
      ['CPU', `${interior.parts.cpu.name ?? '—'} · ${Math.round(interior.parts.cpu.tdp_w)} W`],
    ],
  }
  if (rad) fichas.rad = {
    label: 'Radiador do AIO',
    specs: [
      ['comprimento', mm(rad.w)],
      ['espessura', mm(rad.h)],
      ...(radFans ? [['stack rad+fans', mm(rad.h + radFans.h)] as [string, string], ['ventoinhas', String(radFans.fan_count ?? 3)] as [string, string]] : []),
    ],
  }
  if (psu) fichas.psu = { label: 'Fonte', specs: [['modelo', products.psu?.name ?? '—']] }
  if (mobo) fichas.mobo = {
    label: 'Placa-mãe',
    specs: [['modelo', products.motherboard?.name ?? '—'], ['formato', mobo.h >= 280 ? 'ATX' : 'mATX']],
  }
  if (ram) fichas.ram = { label: 'Memória', specs: [['modelo', products.ram?.name ?? '—'], ['pentes', String(ram.sticks ?? 2)]] }

  const ft = focused ? fichas[focused] : undefined
  const ftOffer = focused && offers ? offers[FOCUS_SLOT[focused] ?? ''] : undefined
  const onPick = (k: string | null) => setFocused(k && fichas[k] ? k : null)
  const flat = <Gabinete2D interior={interior} onPick={compact ? undefined : onPick} picked={focused}
    onToggleFan={onToggleFan} compact={compact} />
  const pick: ScenePick = { picked: focused, onPick, placeholder: flat }

  return (
    <div className="gv-card" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', opacity: pending ? 0.65 : 1, transition: 'opacity .15s ease' }}>
      {header}
      <Veredicto interior={interior} compact={compact} />

      <div style={{ position: 'relative' }}>
        {scene ? scene(pick) : flat}

        {/* ficha da peça escolhida — tocar numa peça na cena (3D ou 2D) */}
        {ft && (
          <div role="dialog" aria-label={`Ficha: ${ft.label}`} style={{
            position: 'absolute', left: 12, top: 12, zIndex: 6, maxWidth: 'min(320px, calc(100% - 24px))',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '10px 12px', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>{ft.label}</strong>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setFocused(null)} aria-label="Fechar a ficha"
                style={{
                  fontSize: 12, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'transparent', color: 'var(--dim)',
                }}>fechar</button>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12 }}>
              {ft.specs.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--dim2)' }}>{k}</dt>
                  <dd style={{ margin: 0, color: 'var(--text)' }}>{v}</dd>
                </div>
              ))}
            </dl>
            {ftOffer && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line2)' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {ftOffer.price_brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                {ftOffer.demo && <span style={{ fontSize: 10.5, color: 'var(--dim2)' }}>amostra</span>}
                <span style={{ flex: 1 }} />
                <a data-umami-event="viewer-peca-oferta" href={`/go/${ftOffer.id}?utm_source=build&utm_medium=viewer`} style={{ fontSize: 12, color: 'var(--accent-2)', whiteSpace: 'nowrap' }}>
                  ver oferta →
                </a>
              </div>
            )}
            {focused === 'gpu' && onSwapGpu && (
              <button type="button" data-umami-event="viewer-trocar-ficha"
                onClick={() => { setFocused(null); onSwapGpu() }}
                style={{
                  marginTop: 8, width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--accent-dim)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600,
                }}>
                ↻ trocar esta placa
              </button>
            )}
          </div>
        )}
      </div>

      {/* diagnóstico: o que segura o fluxo, e como simular a solução */}
      <BottleneckNote diagnosis={interior.diagnosis} onSimulate={onToggleFan} compact={compact} />

      {/* uma linha de leitura, no lugar da legenda */}
      {!compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '8px 16px 2px', alignItems: 'center', fontSize: 12, color: 'var(--dim2)', borderTop: '1px solid var(--line2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--fresh)' }} /> entra ar</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--warn)' }} /> sai ar</span>
          <span>toque numa peça para ver preço</span>
          <span style={{ flex: 1 }} />
          <span>estimativa</span>
        </div>
      )}

      {/* chips — à vista só o que pede atenção e as ações; o detalhe técnico
          (CFM por ventoinha, pressão, todas as zonas) fica recolhido */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px 6px', alignItems: 'center' }}>
        {(() => {
          const issues = interior.airflow.zones.filter((z) => z.status !== 'ok')
          if (!issues.length) {
            return (
              <span style={{ fontSize: 12.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${STATUS_PT.ok.border}`, color: STATUS_PT.ok.color }}>
                ar circulando bem
              </span>
            )
          }
          return issues.map((z) => {
            const st = STATUS_PT[z.status] ?? STATUS_PT.ok
            return (
              <span key={z.zone} style={{ fontSize: 12.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${st.border}`, color: st.color }}>
                {ZONE_LABEL[z.zone] ?? z.zone}: {st.label}
              </span>
            )
          })
        })()}
        {!compact && !scene && g.mounts.filter((m) => m.occupied_by === null).map((m) => (
          <button key={m.id} type="button"
            onClick={onToggleFan ? () => onToggleFan(m.id) : undefined}
            data-umami-event="viewer-ventoinha-mais"
            disabled={!onToggleFan}
            style={{
              fontSize: 12, padding: '3px 9px', borderRadius: 99, border: '1px dashed var(--dim2)',
              color: 'var(--dim2)', background: 'transparent',
              cursor: onToggleFan ? 'pointer' : 'default',
            }}>
            + ventoinha na {mountLabel(m.id)}
          </button>
        ))}
        {whatIfFans.length > 0 && onClearWhatIf && (
          <button type="button" onClick={onClearWhatIf}
            style={{ fontSize: 12, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)', background: 'transparent', cursor: 'pointer' }}>
            desfazer simulação
          </button>
        )}
      </div>
      {!compact && (
        <details style={{ padding: '0 16px 14px' }}>
          <summary data-umami-event="viewer-detalhes" style={{ fontSize: 12.5, color: 'var(--dim2)', cursor: 'pointer', padding: '4px 0' }}>
            detalhes
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 6, alignItems: 'center' }}>
            {interior.airflow.zones.map((z) => {
              const st = STATUS_PT[z.status] ?? STATUS_PT.ok
              return (
                <span key={z.zone} style={{ fontSize: 12.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${st.border}`, color: st.color }}>
                  {ZONE_LABEL[z.zone] ?? z.zone}: {st.label}
                </span>
              )
            })}
            <span className="mono" style={{ fontSize: 12, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)' }}>
              pressão {pressao}
            </span>
            {g.mounts.filter((m) => m.cfm > 0).map((m) => {
              const isSim = m.occupied_by === 'what_if_fan'
              const cnt = interior.what_if?.counts?.[m.id] ?? m.fan_count ?? 1
              const cap = m.capacity ?? 1
              const stepper = isSim && onFanDelta && cap > 1
              return (
                <span key={m.id} className="mono" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, padding: '3px 9px', borderRadius: 99,
                  border: `1px solid ${isSim ? 'var(--accent-dim)' : 'var(--line)'}`,
                  color: isSim ? 'var(--accent)' : 'var(--dim)',
                  background: isSim ? 'var(--accent-soft)' : 'transparent',
                }}>
                  {mountLabel(m.id)}: {m.orient === 'intake' ? 'entrada' : 'saída'} {Math.round(m.cfm)} CFM
                  {isSim && ` · ${cnt}×${stepper ? '' : ' simulado'}`}
                  {stepper && (
                    <>
                      <button type="button" aria-label="menos uma" onClick={() => onFanDelta(m.id, -1)}
                        style={{ cursor: 'pointer', border: '1px solid var(--accent-dim)', background: 'transparent', color: 'var(--accent)', borderRadius: 4, width: 16, height: 16, lineHeight: 1, padding: 0 }}>−</button>
                      <button type="button" aria-label="mais uma" disabled={cnt >= cap} onClick={() => onFanDelta(m.id, 1)}
                        style={{ cursor: cnt >= cap ? 'default' : 'pointer', border: '1px solid var(--accent-dim)', background: 'transparent', color: cnt >= cap ? 'var(--dim2)' : 'var(--accent)', borderRadius: 4, width: 16, height: 16, lineHeight: 1, padding: 0 }}>+</button>
                      <span style={{ color: 'var(--dim2)' }}>de {cap}</span>
                    </>
                  )}
                </span>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
