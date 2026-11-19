'use client'

import type { KeyboardEvent } from 'react'
import { mountLabel } from '@/lib/viewer-labels'
import type { GeoMount, InteriorGeometry, LiveInterior } from '@/lib/live-server'

/**
 * Gabinete2D — o corte lateral LEVE (fase 3 do 3D, 2026-11-19).
 *
 * Substitui o desenho 2D feito à mão (GabineteVivo v5 + PartMockups +
 * TopDownInset, ~2.100 linhas). A vista principal passou a ser o 3D; o 2D
 * fica para o que o 3D não cobre: o HTML que o servidor entrega (Google,
 * navegador sem JS), navegador sem WebGL, a comparação lado a lado e a lista
 * de resultados do assistente. Por isso é só geometria: retângulos em mm das
 * placements do motor, ventoinhas pela face do mount, vagas livres, linhas do
 * campo de fluxo e as duas medidas que decidem compra. Nada é desenhado caso a
 * caso — gabinete ou peça nova = dados novos, mesmo código.
 *
 * Mesmo viewBox (720×430) e proporção da cena 3D: trocar 2D↔3D não salta.
 */

const VW = 720, VH = 430
const PART_KEY: Record<string, string> = {
  gpu: 'gpu', air_cooler: 'cooler', aio_pump: 'pump', aio_radiator: 'rad', aio_fans: 'rad',
  psu: 'psu', motherboard: 'mobo', ram: 'ram',
}
const PART_NAME: Record<string, string> = {
  gpu: 'placa de vídeo', air_cooler: 'cooler', aio_pump: 'bomba do AIO', aio_radiator: 'radiador',
  aio_fans: 'ventoinhas do radiador', psu: 'fonte', motherboard: 'placa-mãe', ram: 'memória', m2_ssd: 'SSD M.2',
  cpu_socket: 'processador',
}

function faceOf(m: GeoMount, H: number): string {
  if (m.face) return m.face
  return m.y > H * 0.8 && m.w > m.h ? 'top' : 'front'
}

export default function Gabinete2D({
  interior, onPick, picked, onToggleFan, compact = false,
}: {
  interior: LiveInterior
  /** tocar numa peça abre a ficha dela (preço, oferta) no GabineteVivo */
  onPick?: (key: string) => void
  picked?: string | null
  /** tocar numa vaga livre simula uma ventoinha ali */
  onToggleFan?: (mountId: string) => void
  compact?: boolean
}) {
  const g = interior.geometry as InteriorGeometry
  const D = g.case.depth_mm, H = g.case.height_mm
  const PAD = 34
  const s = Math.min((VW - PAD * 2) / D, (VH - PAD * 2) / H)
  const ox = (VW - D * s) / 2
  const oy = (VH - H * s) / 2
  const X = (x: number) => ox + x * s
  const Y = (y: number) => oy + (H - y) * s
  const bx = (p: { x: number; y: number; w: number; h: number }) => ({ x: X(p.x), y: Y(p.y + p.h), w: p.w * s, h: p.h * s })
  const score = interior.airflow.score
  const tone = score >= 70 ? 'var(--fresh)' : score >= 45 ? 'var(--warn)' : 'var(--danger)'
  const gClr = interior.clearances.gpu
  const cClr = interior.clearances.cooler

  const parts = g.placements.filter((p) => p.part !== 'case_fan')
  const fans = g.placements.filter((p) => p.part === 'case_fan')
  const order = ['motherboard', 'psu', 'm2_ssd', 'cpu_socket', 'ram', 'air_cooler', 'aio_pump', 'gpu', 'aio_radiator', 'aio_fans']
  parts.sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part))
  const gpu = parts.find((p) => p.part === 'gpu')
  const cooler = parts.find((p) => p.part === 'air_cooler')

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img" className={compact ? 'gv-compact' : undefined}
      aria-label={`Corte lateral do ${interior.case.name ?? 'gabinete'}: fluxo estimado ${score} de 100`}
      style={{ display: 'block', width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="g2d-air" gradientUnits="userSpaceOnUse" x1={X(0)} y1="0" x2={X(D)} y2="0">
          <stop offset="0" style={{ stopColor: 'var(--fresh)' }} />
          <stop offset="0.6" style={{ stopColor: 'var(--warn)' }} />
          <stop offset="1" style={{ stopColor: 'var(--danger)' }} />
        </linearGradient>
      </defs>

      {/* casca + cobertura da fonte */}
      <rect x={X(0)} y={Y(H)} width={D * s} height={H * s} rx={10} fill="var(--panel)" stroke="var(--line)" strokeWidth={2} />
      {g.case.shroud_h_mm > 0 && (
        <line x1={X(0)} y1={Y(g.case.shroud_h_mm)} x2={X(D)} y2={Y(g.case.shroud_h_mm)} stroke="var(--line)" strokeWidth={1.5} />
      )}

      {/* linhas do campo de fluxo (o mesmo campo que o 3D mostra) */}
      {g.flow_field?.streamlines.map((sl, i) => sl.pts.length > 2 && (
        <polyline key={`sl${i}`} points={sl.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}
          fill="none" stroke="url(#g2d-air)" strokeWidth={1.6} strokeOpacity={0.55} strokeLinecap="round" />
      ))}

      {/* peças */}
      {parts.map((p, i) => {
        const b = bx(p)
        const key = PART_KEY[p.part]
        const isGpu = p.part === 'gpu'
        const on = key && picked === key
        const clickable = !!(key && onPick)
        return (
          <rect key={`p${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={p.part === 'cpu_socket' ? 1 : 4}
            fill={p.part === 'motherboard' ? 'color-mix(in srgb, var(--fresh) 7%, var(--panel))' : 'var(--panel2)'}
            stroke={on ? 'var(--accent)' : isGpu ? tone : 'var(--line)'} strokeWidth={on ? 2.4 : isGpu ? 1.8 : 1.2}
            style={clickable ? { cursor: 'pointer' } : undefined}
            onClick={clickable ? () => onPick!(key!) : undefined}
            {...(clickable ? { role: 'button', tabIndex: 0, 'aria-label': `ver ficha: ${PART_NAME[p.part] ?? p.part}`,
              onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick!(key!) } } } : {})}>
            <title>{PART_NAME[p.part] ?? p.part}</title>
          </rect>
        )
      })}

      {/* ventoinhas instaladas (fábrica e simuladas), pela face do mount */}
      {fans.map((f, i) => {
        const b = bx(f)
        const wide = f.wide === true
        const n = Math.max(1, f.fan_count ?? 1)
        const col = f.simulated ? 'var(--accent)' : f.orient === 'exhaust' ? 'var(--warn)' : 'var(--fresh)'
        const r = Math.max(3, Math.min((wide ? b.w / n : b.h / n) * 0.36, 9))
        return (
          <g key={`f${i}`} onClick={f.simulated && onToggleFan && f.mount ? () => onToggleFan(f.mount!) : undefined}
            style={f.simulated && onToggleFan ? { cursor: 'pointer' } : undefined}>
            <title>{f.simulated ? 'ventoinha simulada — toque para tirar' : 'ventoinha de fábrica'}</title>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel2)" stroke={col} strokeWidth={1.4}
              strokeDasharray={f.simulated ? '4 3' : undefined} />
            {Array.from({ length: n }, (_, k) => {
              const t = (k + 0.5) / n
              return <circle key={k} cx={wide ? b.x + b.w * t : b.x + b.w / 2} cy={wide ? b.y + b.h / 2 : b.y + b.h * t}
                r={r} fill="none" stroke={col} strokeWidth={1.2} />
            })}
          </g>
        )
      })}

      {/* vagas livres: tracejado na face; com simulação, um "+" tocável */}
      {g.mounts.filter((m) => m.occupied_by === null).map((m) => {
        const face = faceOf(m, H)
        const horiz = face === 'top' || face === 'bottom'
        const ys = face === 'top' ? Y(H) : face === 'bottom' ? Y(m.y + m.h) : 0
        const xw = face === 'rear' ? X(D) : X(0)
        const mid = horiz ? { x: X(m.x + m.w / 2), y: ys } : { x: xw, y: Y(m.y + m.h / 2) }
        const label = `${mountLabel(m.id)} · vaga livre${onToggleFan ? ' — toque para simular uma ventoinha' : ''}`
        return (
          <g key={`m${m.id}`} onClick={onToggleFan ? () => onToggleFan(m.id) : undefined}
            style={onToggleFan ? { cursor: 'pointer' } : undefined}
            {...(onToggleFan ? { role: 'button', tabIndex: 0, 'aria-label': label,
              onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleFan(m.id) } } } : {})}>
            <title>{label}</title>
            {horiz
              ? <line x1={X(m.x)} y1={ys} x2={X(m.x + m.w)} y2={ys} stroke="var(--dim2)" strokeWidth={2} strokeDasharray="5 5" />
              : <line x1={xw} y1={Y(m.y + m.h)} x2={xw} y2={Y(m.y)} stroke="var(--dim2)" strokeWidth={2} strokeDasharray="5 5" />}
            {onToggleFan && (
              <>
                <circle cx={mid.x} cy={mid.y} r={9} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.2} />
                <path d={`M${mid.x - 4},${mid.y}h8M${mid.x},${mid.y - 4}v8`} stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" />
              </>
            )}
          </g>
        )
      })}

      {/* as duas medidas que decidem compra */}
      {!compact && gpu && (
        <text x={X(gpu.x + gpu.w / 2)} y={Y(gpu.y + gpu.h) - 7} textAnchor="middle" className="gv-cota" fontFamily="var(--font-plex-mono), monospace"
          fill={gClr?.is_tight ? 'var(--warn)' : 'var(--fresh)'} pointerEvents="none">
          GPU {Math.round(interior.parts.gpu.length_mm)}mm{gClr ? ` · folga ${Math.round(gClr.remaining_mm)}mm` : ''}
        </text>
      )}
      {!compact && cooler && (
        <text x={X(cooler.x + cooler.w / 2)} y={Y(cooler.y + cooler.h) - 7} textAnchor="middle" className="gv-cota" fontFamily="var(--font-plex-mono), monospace"
          fill={cClr?.is_tight ? 'var(--warn)' : 'var(--fresh)'} pointerEvents="none">
          cooler {Math.round(interior.parts.cooler.height_mm)}mm{cClr ? ` · folga ${Math.round(cClr.remaining_mm)}mm` : ''}
        </text>
      )}
      <text x={X(0) + 4} y={Y(0) + 20} className="gv-note" fontFamily="var(--font-plex-mono), monospace" fill="var(--dim2)" pointerEvents="none">
        corte lateral · estimativa, não medição
      </text>
    </svg>
  )
}
