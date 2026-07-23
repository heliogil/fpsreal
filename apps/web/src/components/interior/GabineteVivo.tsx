'use client'

import { useEffect, useState } from 'react'
import type { GeoMount, GeoPlacement, LiveInterior, LiveProduct } from '@/lib/live-server'
import { MaterialDefs, bevel, pickVariant, renderPart } from './PartMockups'
import TopDownInset from './TopDownInset'

/**
 * GabineteVivo v5 — função da GEOMETRIA PARAMÉTRICA do backend.
 *
 * O /interior/estimate entrega, em mm, o volume interior, as PREVISÕES de
 * montagem (mounts) com orientação intake/exhaust e ocupação, as colocações de
 * cada peça e os FLUXOS compostos. Este componente converte mm→px e desenha.
 * Gabinete novo ou peça nova = dados novos, mesmo código.
 *
 * Linguagem visual: verde onde entra ar, laranja onde sai, tracejado onde há
 * previsão livre; partículas nascem fora, esquentam nas zonas de calor e saem.
 * Fans estáticos — a vida da cena é o ar.
 *
 * v5 (2026-07-23):
 *  - hover: realça a peça sob o cursor, esmaece o resto, tooltip da marca
 *    (substitui o <title> nativo, lento e sem estilo);
 *  - mounts livres CLICÁVEIS → simulação "e se eu puser uma ventoinha aqui?"
 *    (o recálculo é do MOTOR no backend; aqui só se pede e se desenha);
 *  - vista SUPERIOR acoplada: é lá que a altura do cooler está no plano;
 *  - o cooler a ar deixou de ser desenhado com a altura de spec na vertical
 *    (essa é a folga perpendicular — agora vive na vista superior).
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

/** Arco quase-fechado (≈300°) para desenhar um redemoinho de recirculação. */
function eddyArc(cx: number, cy: number, r: number): string {
  const a0 = -0.35, a1 = a0 + Math.PI * 1.72
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 1 1 ${x1.toFixed(1)},${y1.toFixed(1)}`
}

export default function GabineteVivo({
  interior, products, whatIfFans = [], onToggleFan, onClearWhatIf, pending = false, compact = false,
}: {
  interior: LiveInterior
  products: Products
  /** ids de mounts simulados (estado visual dos botões) */
  whatIfFans?: string[]
  /** clicar num mount livre pede a simulação ao motor */
  onToggleFan?: (mountId: string) => void
  onClearWhatIf?: () => void
  pending?: boolean
  /** modo comparação lado a lado: esconde inset/legenda p/ caber */
  compact?: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [focused, setFocused] = useState<string | null>(null)

  // Esc sai do modo foco venha de onde vier (teclado, leitor de ecrã)
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
      <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--dim)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 99 }}>
        visualização 2D · estimativa
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>{interior.case.name ?? 'gabinete'}</span>
      {simulated && (
        <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', border: '1px solid var(--accent-dim)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 99 }}>
          simulado
        </span>
      )}
      {pending && <span className="mono" style={{ fontSize: 10, color: 'var(--dim2)' }}>recalculando…</span>}
      <span style={{ flex: 1 }} />
      <span className="mono" style={{ fontSize: 11, color: 'var(--dim2)' }}>fluxo</span>
      <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: scoreTone }}>{score}</span>
      <span className="mono" style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 99, border: `1px solid ${scoreTone}`, color: scoreTone }}>
        {score >= 70 ? 'saudável' : score >= 45 ? 'apertado' : 'crítico'}
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

  /* ── mm → px ─────────────────────────────────────────────────────────── */
  const D = g.case.depth_mm
  const H = g.case.height_mm
  const s = Math.min(596 / D, 372 / H)
  const ox = 62 + (596 - D * s) / 2
  const oy = 22 + (372 - H * s) / 2
  const X = (x: number) => ox + x * s
  const Yc = (y: number) => oy + (H - y) * s
  const bottomY = oy + H * s
  const box = (p: { x: number; y: number; w: number; h: number }) => ({
    x: X(p.x), y: oy + (H - p.y - p.h) * s, w: p.w * s, h: p.h * s,
  })
  const center = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

  const P = (part: string): GeoPlacement | undefined => g.placements.find((p) => p.part === part)
  const caseFans = g.placements.filter((p) => p.part === 'case_fan')
  const mobo = P('motherboard')
  const gpu = P('gpu')
  const airCooler = P('air_cooler')
  const pump = P('aio_pump')
  const rad = P('aio_radiator')
  const radFans = P('aio_fans')
  const ram = P('ram')
  const m2 = P('m2_ssd')
  const psu = P('psu')
  const socket = P('cpu_socket')

  const gpuHeat = Math.min(1, (interior.parts.gpu.tdp_w || 0) / 400)
  const cpuHeat = Math.min(1, (interior.parts.cpu.tdp_w || 0) / 150)
  const gpuClr = interior.clearances.gpu
  const coolerClr = interior.clearances.cooler
  const coolerRealH = interior.parts.cooler.height_mm || 0

  /* variantes visuais por tier (cosmética; dimensões vêm da geometria) */
  const vGpu = pickVariant('gpu', { name: products.gpu?.name, sku: products.gpu?.sku, lengthMm: gpu?.w ?? 0, tdpW: interior.parts.gpu.tdp_w })
  const vMb = pickVariant('motherboard', { name: products.motherboard?.name, sku: products.motherboard?.sku })
  const vRam = pickVariant('ram', { name: products.ram?.name, sku: products.ram?.sku })
  const vPsu = pickVariant('psu', { name: products.psu?.name, sku: products.psu?.sku })
  const vAir = airCooler ? pickVariant('cooler', { name: products.cooler?.name, sku: products.cooler?.sku, heightMm: coolerRealH }) : ''
  const vFront = pickVariant('case_front', { name: interior.case.name ?? undefined, airflowClass: interior.case.airflow_class ?? undefined })

  const hasTop = g.flows.some((f) => f.to.side === 'top')

  /* ── modo foco: alvos, ficha e enquadramento ──────────────────────────────
     Todas as specs vêm do `interior` — nada é inventado aqui. No telemóvel
     este é o SUBSTITUTO do hover, que simplesmente não existe em toque. */
  type FocusTarget = { label: string; box: { x: number; y: number; w: number; h: number }; specs: Array<[string, string]> }
  const mm = (n: number) => `${Math.round(n)}mm`
  const focusTargets: Record<string, FocusTarget> = {}
  if (gpu) focusTargets.gpu = {
    label: 'Placa de vídeo', box: box(gpu),
    specs: [
      ['modelo', products.gpu?.name ?? interior.parts.gpu.name ?? '—'],
      ['comprimento', mm(gpu.w)],
      ['TDP', `${Math.round(interior.parts.gpu.tdp_w)} W`],
      ...(gpuClr ? [['folga até a frente', mm(gpuClr.remaining_mm) + (gpuClr.is_tight ? ' (apertado)' : '')] as [string, string]] : []),
    ],
  }
  if (airCooler) focusTargets.cooler = {
    label: 'Cooler da CPU', box: box(airCooler),
    specs: [
      ['modelo', products.cooler?.name ?? interior.parts.cooler.name ?? '—'],
      ['altura (spec)', mm(coolerRealH)],
      ...(coolerClr ? [['folga até a tampa', mm(coolerClr.remaining_mm) + (coolerClr.is_tight ? ' (apertado)' : '')] as [string, string]] : []),
      ['nota', 'a altura está no plano do corte superior'],
    ],
  }
  if (pump) focusTargets.pump = {
    label: 'Bomba do AIO (water block)', box: box(pump),
    specs: [
      ['modelo', products.cooler?.name ?? interior.parts.cooler.name ?? '—'],
      ['CPU', `${interior.parts.cpu.name ?? '—'} · ${Math.round(interior.parts.cpu.tdp_w)} W`],
    ],
  }
  if (rad) focusTargets.rad = {
    label: 'Radiador do AIO', box: box(rad),
    specs: [
      ['comprimento', mm(rad.w)],
      ['espessura', mm(rad.h)],
      ...(radFans ? [['stack rad+fans', mm(rad.h + radFans.h)] as [string, string], ['ventoinhas', String(radFans.fan_count ?? 3)] as [string, string]] : []),
    ],
  }
  if (psu) focusTargets.psu = {
    label: 'Fonte', box: box(psu),
    specs: [['modelo', products.psu?.name ?? '—'], ['tipo', vPsu === 'psu-modular' ? 'modular' : 'básica']],
  }
  if (mobo) focusTargets.mobo = {
    label: 'Placa-mãe', box: box(mobo),
    specs: [['modelo', products.motherboard?.name ?? '—'], ['formato', vMb === 'mb-atx' ? 'ATX' : 'mATX']],
  }
  if (ram) focusTargets.ram = {
    label: 'Memória', box: box(ram),
    specs: [['modelo', products.ram?.name ?? '—'], ['pentes', String(ram.sticks ?? 2)]],
  }

  const ft = focused ? focusTargets[focused] : undefined
  // enquadra a caixa no centro do viewBox (720×430), com limite de ampliação
  const focusTransform = (() => {
    if (!ft) return undefined
    const pad = 26
    const k = Math.min(720 / (ft.box.w + pad * 2), 430 / (ft.box.h + pad * 2), 3.2)
    const cx = ft.box.x + ft.box.w / 2
    const cy = ft.box.y + ft.box.h / 2
    return `translate(${(360 - k * cx).toFixed(1)} ${(215 - k * cy).toFixed(1)}) scale(${k.toFixed(3)})`
  })()

  /* ── hover: realce + tooltip da marca ─────────────────────────────────── */
  const hoverProps = (id: string, text: string) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => { setHovered((h) => (h === id ? null : h)); setTip(null) },
    onMouseMove: (e: React.MouseEvent<SVGGElement>) => {
      const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
      if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text })
    },
  })
  const dimOf = (id: string) => {
    if (focused) return focused === id ? 1 : 0.12
    return hovered && hovered !== id ? 0.25 : 1
  }

  /* peça clicável: hover + foco por rato e por teclado */
  const partProps = (id: string, text: string) => ({
    ...hoverProps(id, text),
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); setFocused((f) => (f === id ? null : id)) },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocused((f) => (f === id ? null : id)) }
    },
    tabIndex: 0,
    role: 'button',
    'aria-label': text,
    style: { cursor: 'pointer' as const },
  })

  const mountLine = (m: GeoMount) => {
    const occupied = m.occupied_by !== null
    const isSim = m.occupied_by === 'what_if_fan'
    const isTop = m.y > H * 0.8 && m.w > m.h
    const color = isSim ? 'var(--accent)' : m.orient === 'intake' ? 'var(--fresh)' : 'var(--warn)'
    const label = `${m.id.replace(/_/g, ' ')} · ${m.orient === 'intake' ? 'entrada' : 'saída'} · ${
      occupied ? `${Math.round(m.cfm)} CFM${isSim ? ' (simulado)' : ''}` : 'previsão livre — clique p/ simular ventoinha'
    }`
    const clickable = !occupied && !!onToggleFan
    const common = {
      stroke: occupied ? color : 'var(--dim2)',
      strokeWidth: occupied ? 3.5 : 1.6,
      strokeLinecap: 'round' as const,
      strokeDasharray: occupied ? undefined : '5 5',
      opacity: occupied ? 0.85 : 0.5,
    }
    const mid = isTop
      ? { x: X(m.x + m.w / 2), y: oy }
      : { x: m.x < D / 2 ? X(0) : X(D), y: Yc(m.y + m.h / 2) }

    return (
      <g key={m.id} {...hoverProps(`mount:${m.id}`, label)} opacity={dimOf(`mount:${m.id}`)}
        onClick={clickable ? (e) => { e.stopPropagation(); onToggleFan?.(m.id) } : undefined}
        style={{ cursor: clickable ? 'pointer' : 'help' }}>
        {isTop ? (
          <line data-vent={`${m.orient}-${m.id}`} x1={X(m.x)} y1={oy} x2={X(m.x + m.w)} y2={oy} {...common} />
        ) : (
          <line data-vent={`${m.orient}-${m.id}`} x1={mid.x} y1={Yc(m.y + m.h)} x2={mid.x} y2={Yc(m.y)} {...common} />
        )}
        {/* alvo maior p/ o clique/hover não exigir precisão */}
        {isTop
          ? <rect x={X(m.x)} y={oy - 9} width={m.w * s} height={18} fill="transparent" />
          : <rect x={mid.x - 9} y={Yc(m.y + m.h)} width={18} height={m.h * s} fill="transparent" />}
        {/* afordância "+" nos mounts livres */}
        {clickable && (
          <g pointerEvents="none">
            <circle cx={mid.x} cy={mid.y} r={8} fill="var(--panel)" stroke="var(--dim2)" strokeWidth="1" opacity={hovered === `mount:${m.id}` ? 1 : 0.75} />
            <line x1={mid.x - 3.5} y1={mid.y} x2={mid.x + 3.5} y2={mid.y} stroke="var(--dim)" strokeWidth="1.6" strokeLinecap="round" />
            <line x1={mid.x} y1={mid.y - 3.5} x2={mid.x} y2={mid.y + 3.5} stroke="var(--dim)" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}
      </g>
    )
  }

  /* fluxos → trajetos de partículas (nascem fora, saem fora) */
  type Stream = { d: string; intensity: number; heatT: number; key: string }
  const streams: Stream[] = []
  g.flows.forEach((f, fi) => {
    const sx = ox - 26
    const sy = Yc(f.from.y)
    const heatT = Math.min(0.86, 0.18 + (f.heat_at[0] ?? 0.55) * 0.6)
    if (f.to.side === 'rear') {
      const ey = Yc(f.to.y)
      streams.push({
        key: `f${fi}`,
        d: `M${sx},${sy} C${X(D * 0.3)},${sy} ${X(D * 0.72)},${(sy + ey) / 2} ${X(D) + 26},${ey}`,
        intensity: f.intensity, heatT,
      })
    } else {
      const w = f.to.w ?? 100
      const k = Math.max(2, Math.min(4, 2 + Math.round(f.intensity * 2)))
      for (let i = 0; i < k; i++) {
        const xi = X(f.to.x + (w * (i + 0.5)) / k)
        streams.push({
          key: `f${fi}-${i}`,
          d: `M${sx},${sy} C${X(D * 0.32)},${sy} ${xi},${Yc(H * 0.45)} ${xi},${oy - 14}`,
          intensity: f.intensity * (0.75 + 0.25 * (i % 2)), heatT,
        })
      }
    }
  })

  /* zonas sem fluxo → eddies de recirculação */
  const gpuC = gpu ? center(box(gpu)) : null
  const cpuC = (airCooler || pump || socket) ? center(box((airCooler ?? pump ?? socket)!)) : null
  const zonePoint: Record<string, { x: number; y: number } | null> = {
    intake_front: { x: X(0) + 26, y: Yc(H * 0.5) },
    gpu_zone: gpuC,
    cpu_zone: cpuC,
    exhaust_rear: { x: X(D) - 26, y: Yc(H * 0.5) },
    exhaust_top: { x: X(D * 0.5), y: oy + 20 },
  }
  const eddies = interior.airflow.zones
    .filter((z) => z.status === 'dead_zone' || z.status === 'critical')
    .map((z) => ({ z, pt: zonePoint[z.zone], tone: z.status === 'critical' ? 'var(--danger)' : 'var(--dim2)' }))
    .filter((e): e is { z: typeof e.z; pt: { x: number; y: number }; tone: string } => e.pt != null)

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', opacity: pending ? 0.65 : 1, transition: 'opacity .15s ease' }}>
      {header}

      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 720 430" role="img"
          aria-label={`Interior do ${interior.case.name ?? 'gabinete'}: fluxo estimado ${score} de 100, pressão ${pressao}`}
          onMouseLeave={() => { setHovered(null); setTip(null) }}
          onClick={(e) => {
            // sair do foco só quando o clique NÃO nasceu numa peça — depender
            // de stopPropagation aqui mostrou-se frágil (a peça focava e o
            // handler do fundo limpava logo a seguir, no mesmo tick)
            if (!(e.target as Element).closest('[data-part]')) setFocused(null)
          }}
          style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)', borderTop: '1px solid var(--line2)' }}>

          <defs>
            <linearGradient id="gv-back" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--panel)' }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
            </linearGradient>
            <linearGradient id="gv-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--bg)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 0.55 }} />
            </linearGradient>
            <radialGradient id="gv-heat">
              <stop offset="0" style={{ stopColor: 'var(--danger)', stopOpacity: 0.85 }} />
              <stop offset="0.45" style={{ stopColor: 'var(--danger)', stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: 'var(--danger)', stopOpacity: 0 }} />
            </radialGradient>
            <filter id="gv-lift" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" floodColor="#000" floodOpacity="0.34" />
            </filter>
            <MaterialDefs />
          </defs>

          {/* tudo o que é CENA entra neste grupo: é ele que recebe o zoom do
              modo foco. Régua e rótulo ficam de fora (ver abaixo). */}
          <g transform={focusTransform} style={{ transition: 'transform .38s cubic-bezier(.4,0,.2,1)' }}>

          {/* chassi */}
          <rect x={ox} y={oy} width={D * s} height={H * s} rx={12} fill="url(#gv-back)" stroke="var(--line)" strokeWidth="1.4" />
          <line x1={ox + 12} y1={oy + 2} x2={X(D) - 12} y2={oy + 2} stroke="var(--strong)" strokeWidth="1" opacity=".05" />
          <rect x={ox + 2} y={bottomY - 40} width={D * s - 4} height={38} fill="url(#gv-floor)" opacity={0.6} />
          <line x1={ox + 4} y1={Yc(g.case.shroud_h_mm)} x2={X(D) - 4} y2={Yc(g.case.shroud_h_mm)} stroke="var(--line2)" strokeWidth="1.2" />

          {/* parede frontal (mesh = fluxo livre · sólido = restrito) */}
          {(() => {
            const fb = box({ x: 0, y: 0, w: Math.min(14, D * 0.04), h: H })
            const t = vFront === 'front-mesh' ? 'painel frontal · mesh (fluxo livre)' : 'painel frontal · sólido (fluxo restrito)'
            return (
              <g data-part="case_front" data-variant={vFront} opacity={0.9 * dimOf('front')} {...partProps('front', t)}>
                {renderPart('case_front', vFront, fb)}
              </g>
            )
          })()}

          {/* placa-mãe */}
          {mobo && (
            <g data-part="motherboard" data-variant={vMb} filter="url(#gv-lift)" opacity={dimOf('mobo')}
              {...partProps('mobo', `placa-mãe ${vMb === 'mb-atx' ? 'ATX' : 'mATX'}`)}>
              {renderPart('motherboard', vMb, box(mobo))}
            </g>
          )}

          {/* calor: gradiente radial (pulso pelo grupo .heatpulse) */}
          {gpu && (() => { const b = box(gpu); const c = center(b); const r = Math.max(b.w, b.h) * 0.6; return <g className="heatpulse" style={{ animationDuration: `${3.2 - gpuHeat}s` }} pointerEvents="none"><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.62} fill="url(#gv-heat)" opacity={0.14 + 0.22 * gpuHeat} /></g> })()}
          {(airCooler || pump || socket) && (() => { const b = box((airCooler ?? pump ?? socket)!); const c = center(b); const r = Math.max(b.w, b.h) * 0.66; return <g className="heatpulse" style={{ animationDuration: `${3.4 - cpuHeat}s` }} pointerEvents="none"><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.66} fill="url(#gv-heat)" opacity={0.12 + 0.18 * cpuHeat} /></g> })()}

          {/* fonte */}
          {psu && (
            <g data-part="psu" data-variant={vPsu} filter="url(#gv-lift)" opacity={dimOf('psu')}
              {...partProps('psu', `fonte ${vPsu === 'psu-modular' ? 'modular' : 'básica'}`)}>
              {renderPart('psu', vPsu, box(psu))}
            </g>
          )}
          {socket && (() => { const b = box(socket); return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--panel2)" stroke="var(--line)" pointerEvents="none" /> })()}

          {/* cooler a ar — altura de DESENHO (corpo). A folga de spec vive na vista superior. */}
          {airCooler && (
            <g data-part="cooler" data-variant={vAir} filter="url(#gv-lift)" opacity={dimOf('cooler')}
              {...partProps('cooler', `cooler ${Math.round(coolerRealH)}mm de altura${coolerClr ? ` · folga ${Math.round(coolerClr.remaining_mm)}mm até a tampa` : ''} — ver corte superior`)}>
              {renderPart('cooler', vAir, box(airCooler))}
            </g>
          )}
          {pump && (
            <g data-part="cooler" data-variant="cooler-aio-pump" filter="url(#gv-lift)" opacity={dimOf('pump')}
              {...partProps('pump', 'bomba do AIO (water block sobre a CPU)')}>
              {renderPart('cooler', 'cooler-aio-pump', box(pump))}
            </g>
          )}
          {/* tubos bomba → radiador */}
          {pump && rad && (() => {
            const pb = box(pump); const rb = box(rad)
            const bx1 = pb.x + pb.w * 0.33; const bx2 = pb.x + pb.w * 0.67; const by = pb.y - 4
            const ry = rb.y + rb.h
            const anchor = Math.max(rb.x + 16, Math.min(rb.x + rb.w - 16, pb.x + pb.w / 2))
            const rx1 = anchor - 9; const rx2 = anchor + 9
            const midY = (by + ry) / 2
            const d1 = `M${bx1},${by} C${bx1 - 16},${midY} ${rx1 - 12},${midY} ${rx1},${ry}`
            const d2 = `M${bx2},${by} C${bx2 + 16},${midY} ${rx2 + 12},${midY} ${rx2},${ry}`
            return (
              <g fill="none" strokeLinecap="round" pointerEvents="none" opacity={dimOf('pump')}>
                <path d={d1} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
                <path d={d2} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
                <path d={d1} stroke="var(--dim2)" strokeWidth="3.2" />
                <path d={d2} stroke="var(--dim2)" strokeWidth="3.2" />
              </g>
            )
          })()}
          {ram && (
            <g data-part="ram" data-variant={vRam} opacity={dimOf('ram')}
              {...partProps('ram', `memória${vRam === 'ram-heatspreader' ? ' com dissipador' : ''}`)}>
              {renderPart('ram', vRam, box(ram))}
            </g>
          )}
          {gpu && (
            <g data-part="gpu" data-variant={vGpu} filter="url(#gv-lift)" opacity={dimOf('gpu')}
              {...partProps('gpu', `GPU ${Math.round(gpu.w)}mm${gpuClr ? ` · folga ${Math.round(gpuClr.remaining_mm)}mm até a frente` : ''}`)}>
              {renderPart('gpu', vGpu, box(gpu))}
            </g>
          )}
          {m2 && (
            <g data-part="storage" data-variant="ssd-m2" opacity={dimOf('m2')} {...partProps('m2', 'SSD M.2')}>
              {renderPart('storage', 'ssd-m2', box(m2))}
            </g>
          )}

          {/* ventoinhas do gabinete (fábrica e simuladas) */}
          {caseFans.map((f, i) => {
            const b = box(f)
            const sim = f.simulated === true
            const fid = `fan:${f.mount ?? i}`
            return (
              <g key={`cf${i}`} data-part="case_fan" opacity={dimOf(fid)}
                {...hoverProps(fid, sim ? 'ventoinha SIMULADA (what-if)' : 'ventoinha de fábrica')}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3}
                  fill={sim ? 'var(--accent-soft)' : 'var(--panel2)'}
                  stroke={sim ? 'var(--accent)' : 'var(--line)'} strokeWidth="1"
                  strokeDasharray={sim ? '4 3' : undefined} />
                <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={Math.min(b.w * 0.32, 5)}
                  fill="var(--panel)" stroke={sim ? 'var(--accent)' : 'var(--line)'} strokeWidth="1" />
                {bevel(b, 2, 3)}
              </g>
            )
          })}

          {/* AIO: radiador + fila de fans */}
          {rad && (() => {
            const b = box(rad)
            return (
              <g data-part="cooler-radiator" filter="url(#gv-lift)" opacity={dimOf('rad')} {...partProps('rad', 'radiador do AIO')}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
                <rect x={b.x + 4} y={b.y + 3} width={b.w - 8} height={Math.max(4, b.h - 6)} rx={2} fill="var(--line2)" />
                <rect x={b.x + 4} y={b.y + 3} width={b.w - 8} height={Math.max(4, b.h - 6)} fill="url(#mat-fins-v)" />
                {bevel(b, 2, 3)}
              </g>
            )
          })()}
          {radFans && (() => {
            const b = box(radFans)
            const nf = radFans.fan_count ?? 3
            return (
              <g data-part="aio-fans" opacity={dimOf('rad')} {...hoverProps('rad', `${nf} fans do radiador`)}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
                {Array.from({ length: nf - 1 }, (_, i) => (
                  <line key={i} x1={b.x + (b.w / nf) * (i + 1)} y1={b.y} x2={b.x + (b.w / nf) * (i + 1)} y2={b.y + b.h} stroke="var(--line)" strokeWidth="1.2" />
                ))}
                {Array.from({ length: nf }, (_, i) => (
                  <circle key={`h${i}`} cx={b.x + (b.w / nf) * (i + 0.5)} cy={b.y + b.h / 2} r={Math.min(4.5, b.h * 0.32)} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
                ))}
              </g>
            )
          })()}
          {rad && radFans && (() => {
            const rb = box(rad); const fb = box(radFans)
            const xr = Math.max(rb.x + rb.w, fb.x + fb.w) + 6
            const mm = Math.round(rad.h + radFans.h)
            return (
              <g pointerEvents="none">
                <line x1={xr} y1={rb.y} x2={xr} y2={fb.y + fb.h} stroke="var(--dim2)" strokeWidth="1" />
                <line x1={xr - 4} y1={rb.y} x2={xr + 4} y2={rb.y} stroke="var(--dim2)" strokeWidth="1" />
                <line x1={xr - 4} y1={fb.y + fb.h} x2={xr + 4} y2={fb.y + fb.h} stroke="var(--dim2)" strokeWidth="1" />
                <text x={xr + 7} y={(rb.y + fb.y + fb.h) / 2 + 3} className="gv-note" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">~{mm}mm</text>
              </g>
            )
          })()}

          {/* cota de folga da GPU */}
          {gpu && gpuClr && (() => {
            const b = box(gpu)
            const frontInner = X(28)
            const yMid = b.y + b.h / 2
            return (
              <g pointerEvents="none">
                <line x1={frontInner} y1={yMid} x2={b.x - 3} y2={yMid} stroke={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} strokeWidth="1" strokeDasharray="4 4" />
                <text x={frontInner + 4} y={yMid - 7} className="gv-cota" fill={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontFamily="var(--font-plex-mono), monospace">
                  folga {Math.round(gpuClr.remaining_mm)}mm
                </text>
                <text x={b.x + 6} y={b.y - 6} className="gv-cota" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">GPU {Math.round(gpu.w)}mm</text>
              </g>
            )
          })()}

          {/* paredes: verde entra · laranja sai · tracejado = previsão livre (clicável) */}
          {g.mounts.map(mountLine)}
          <text x={ox - 54} y={Yc(H * 0.62)} className="gv-label gv-hide-sm" fill="var(--fresh)" fontFamily="var(--font-plex-mono), monospace">entrada</text>
          <text x={ox - 54} y={Yc(H * 0.62) + 12} className="gv-micro gv-hide-sm" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">intake</text>
          <text x={716} y={Yc(H * 0.68)} textAnchor="end" className="gv-label gv-hide-sm" fill="var(--warn)" fontFamily="var(--font-plex-mono), monospace">saída</text>
          <text x={716} y={Yc(H * 0.68) + 12} textAnchor="end" className="gv-micro gv-hide-sm" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">exhaust</text>
          {hasTop && (
            <text x={X(D) - 4} y={oy - 8} textAnchor="end" className="gv-note" fill="var(--warn)" fontFamily="var(--font-plex-mono), monospace">saída pelo radiador</text>
          )}

          {/* streamlines */}
          <g fill="none" strokeLinecap="round" pointerEvents="none">
            {streams.map((st) => (
              <path key={`rail-${st.key}`} d={st.d} stroke="var(--dim2)" strokeWidth={0.8 + st.intensity * 0.8} opacity={0.06 + st.intensity * 0.16} />
            ))}
          </g>

          {/* eddies de recirculação */}
          {eddies.map((e, i) => {
            const d = eddyArc(e.pt.x, e.pt.y, 13)
            return (
              <g key={`eddy-${i}`} {...hoverProps(`eddy${i}`, `${ZONE_LABEL[e.z.zone] ?? e.z.zone}: ${STATUS_PT[e.z.status]?.label ?? e.z.status} — ar recircula sem sair`)}>
                <path d={d} fill="none" stroke={e.tone} strokeWidth="1.4" strokeLinecap="round" opacity={0.5} />
                <g className="flowdots" pointerEvents="none">
                  <circle r={2.1} fill={e.tone}>
                    <animateMotion dur="2.6s" repeatCount="indefinite" path={d} rotate="auto" />
                    <animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.1;.85;1" dur="2.6s" repeatCount="indefinite" />
                  </circle>
                </g>
              </g>
            )
          })}

          {/* FLUXO — RASTROS de vento.
              Eram círculos de tamanho fixo, que liam como "pontinhos". Agora é
              uma gota afilada com `rotate="auto"`: o animateMotion alinha o eixo
              +x com a direção do trajeto, então a cabeça vai à frente e a cauda
              fica para trás — lê como VENTO, que é a coisa que o produto vende.
              Comprimento e opacidade ∝ intensidade (velocidade); contagem menor
              porque rastro longo diz mais que muitos pontos — e pesa menos. */}
          <g className="flowdots" pointerEvents="none">
            {streams.map((st, si) => {
              const dur = Math.max(3, 6.6 - st.intensity * 2.4) + (si % 3) * 0.35
              const trails = 2 + Math.round(st.intensity * 3)
              const pre = Math.max(0.05, st.heatT - 0.12).toFixed(2)
              const L = 5 + st.intensity * 9      // comprimento do rastro
              const w = 1.3 + st.intensity * 1.1  // meia-largura da cabeça
              const peak = (0.45 + 0.4 * st.intensity).toFixed(2)
              const d = `M${-L},0 C${(-L * 0.6).toFixed(1)},${-w} ${-w},${-w} 0,0 C${-w},${w} ${(-L * 0.6).toFixed(1)},${w} ${-L},0 Z`
              return Array.from({ length: trails }, (_, di) => {
                const begin = `${-((di / trails) * dur + si * 0.5).toFixed(2)}s`
                return (
                  <path key={`${st.key}-${di}`} className={di >= 2 ? 'gv-dot-extra' : undefined} d={d} fill="#A0A0A0" opacity={peak}>
                    <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={st.d} rotate="auto" />
                    <animate attributeName="fill" values="#A0A0A0;#A0A0A0;#E0A93B;#C85348" keyTimes={`0;${pre};${st.heatT.toFixed(2)};1`} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                    <animate attributeName="opacity" values={`0;${peak};${peak};0`} keyTimes="0;.04;.97;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                  </path>
                )
              })
            })}
          </g>
          </g>{/* ── fim da cena com zoom ── */}

          {/* Régua ESCONDIDA no modo foco: com a cena ampliada a escala deixa
              de bater, e uma régua errada é pior do que régua nenhuma. */}
          {!focused && (() => {
            const ry = bottomY + 12
            const ticks: number[] = []
            for (let mm = 0; mm <= D + 1; mm += 50) ticks.push(mm)
            return (
              <g pointerEvents="none">
                <line x1={X(0)} y1={ry} x2={X(D)} y2={ry} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
                {ticks.map((mm, i) => (
                  <line key={mm} className={i % 2 === 1 ? 'gv-hide-sm' : undefined} x1={X(mm)} y1={ry - 3} x2={X(mm)} y2={ry + 3} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
                ))}
                <text x={X(0)} y={ry + 15} className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">0</text>
                <text x={X(D)} y={ry + 15} textAnchor="end" className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">{Math.round(D)}mm · profundidade</text>
              </g>
            )
          })()}

          <text x={ox + 8} y={bottomY - 8} className="gv-note" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace" pointerEvents="none">
            estimativa · zone_graph v2 · não é medição
          </text>
        </svg>

        {/* ficha da peça em foco — no telemóvel é o que substitui o hover */}
        {ft && (
          <div className="mono" style={{
            position: 'absolute', left: 12, top: 12, zIndex: 6, maxWidth: 260,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '10px 12px', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 11.5, color: 'var(--text)' }}>{ft.label}</strong>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setFocused(null)} aria-label="Sair do foco"
                style={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'transparent', color: 'var(--dim)',
                }}>voltar</button>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 10.5 }}>
              {ft.specs.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--dim2)' }}>{k}</dt>
                  <dd style={{ margin: 0, color: 'var(--text)' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: 6, fontSize: 9, color: 'var(--dim2)' }}>estimativa · Esc ou fundo p/ sair</div>
          </div>
        )}

        {/* tooltip da marca (substitui o <title> nativo) */}
        {!focused && tip && (
          <div className="mono" role="status" style={{
            position: 'absolute', left: Math.max(6, Math.min(tip.x + 14, 620)), top: Math.max(6, tip.y - 34),
            pointerEvents: 'none', zIndex: 5, background: 'var(--panel2)', color: 'var(--text)',
            border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', fontSize: 11,
            boxShadow: 'var(--shadow-sm)', maxWidth: 280,
          }}>{tip.text}</div>
        )}
      </div>

      {/* vista superior — onde a altura do cooler está no plano */}
      {!compact && (
        <div style={{ borderTop: '1px solid var(--line2)' }}>
          <TopDownInset interior={interior} g={g} hovered={hovered} onHover={setHovered} />
        </div>
      )}

      {/* legenda */}
      {!compact && (
        <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '10px 16px 2px', alignItems: 'center', fontSize: 9.5, color: 'var(--dim2)', borderTop: '1px solid var(--line2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--fresh)' }} /> entra</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--warn)' }} /> sai</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--dim2)' }} /> previsão livre (clique)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 24, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, var(--dim), var(--warn), var(--danger))' }} /> ar esquenta</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: 'radial-gradient(circle, var(--danger), transparent 70%)' }} /> zona quente</span>
          {eddies.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 99, border: '1.4px solid var(--dim2)', borderTopColor: 'transparent' }} /> recirculação</span>
          )}
        </div>
      )}

      {/* chips de estado + simulação */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px 14px', alignItems: 'center' }}>
        {interior.airflow.zones.map((z) => {
          const st = STATUS_PT[z.status] ?? STATUS_PT.ok
          return (
            <span key={z.zone} className="mono" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${st.border}`, color: st.color }}>
              {ZONE_LABEL[z.zone] ?? z.zone}: {st.label}
            </span>
          )
        })}
        <span className="mono" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)' }}>
          pressão {pressao}
        </span>
        {g.mounts.filter((m) => m.cfm > 0).map((m) => (
          <span key={m.id} className="mono" style={{
            fontSize: 10.5, padding: '3px 9px', borderRadius: 99,
            border: `1px solid ${m.occupied_by === 'what_if_fan' ? 'var(--accent-dim)' : 'var(--line)'}`,
            color: m.occupied_by === 'what_if_fan' ? 'var(--accent)' : 'var(--dim)',
          }}>
            {m.id.replace(/_/g, ' ')}: {m.orient === 'intake' ? '+' : '−'}{Math.round(m.cfm)} CFM{m.occupied_by === 'what_if_fan' ? ' · simulado' : ''}
          </span>
        ))}
        {g.mounts.filter((m) => m.occupied_by === null).map((m) => (
          <button key={m.id} type="button" className="mono"
            onClick={onToggleFan ? () => onToggleFan(m.id) : undefined}
            disabled={!onToggleFan}
            style={{
              fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px dashed var(--dim2)',
              color: 'var(--dim2)', background: 'transparent',
              cursor: onToggleFan ? 'pointer' : 'default',
            }}>
            {m.id.replace(/_/g, ' ')}: + simular ventoinha
          </button>
        ))}
        {whatIfFans.length > 0 && onClearWhatIf && (
          <button type="button" className="mono" onClick={onClearWhatIf}
            style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)', background: 'transparent', cursor: 'pointer' }}>
            limpar simulação
          </button>
        )}
      </div>
    </div>
  )
}
