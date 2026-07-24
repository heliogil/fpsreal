'use client'

import { useEffect, useState } from 'react'
import type { GeoMount, GeoPlacement, LiveInterior, LiveProduct } from '@/lib/live-server'
import { MaterialDefs, bevel, pickVariant, renderPart, renderFromDescriptor } from './PartMockups'
import TopDownInset from './TopDownInset'
import BottleneckNote from './BottleneckNote'

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
  interior, products, whatIfFans = [], onToggleFan, onFanDelta, onClearWhatIf, pending = false, compact = false,
}: {
  interior: LiveInterior
  products: Products
  /** ids de mounts simulados (estado visual dos botões) */
  whatIfFans?: string[]
  /** clicar num mount livre pede a simulação ao motor */
  onToggleFan?: (mountId: string) => void
  /** +1/−1 ventoinha num mount (empilhamento em baias largas) */
  onFanDelta?: (mountId: string, delta: number) => void
  onClearWhatIf?: () => void
  pending?: boolean
  /** modo comparação lado a lado: esconde inset/legenda p/ caber */
  compact?: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  // sequência de montagem (#9): incrementar re-monta a cena e reinicia a
  // animação; 0 = nunca corrida (a página não anima sozinha no load)
  const [asmRun, setAsmRun] = useState(0)
  // Em toque não há hover — o tooltip pisca no tap. Detetamos ponteiro grosso
  // p/ suprimi-lo (o modo foco assume no telemóvel). SSR-safe: só no cliente.
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    setCoarse(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
  }, [])

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
      {g && (
        <button type="button" onClick={() => setAsmRun((n) => n + 1)} className="mono"
          title="ver as peças assentarem na ordem de instalação"
          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--dim)', background: 'transparent',
            border: '1px solid var(--line)', borderRadius: 99, padding: '3px 10px', cursor: 'pointer' }}>
          montar
        </button>
      )}
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
  // A cena reserva um anel para a CASCA do gabinete (moldura) e uma faixa para
  // os pés. O interior — que é o que a régua mede — encolhe na mesma medida,
  // por isso a escala mm→px continua honesta.
  const FRAME = 9
  const FEET = 8
  const s = Math.min((596 - FRAME * 2) / D, (372 - FRAME * 2 - FEET) / H)
  const ox = 62 + FRAME + (596 - FRAME * 2 - D * s) / 2
  const oy = 22 + FRAME + (372 - FRAME * 2 - FEET - H * s) / 2
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

  // O TDP é a FONTE de calor; o status da zona é quão bem esse calor é levado
  // embora. Uma GPU quente com bom fluxo brilha menos que a mesma GPU sufocada
  // — o brilho passa a refletir a ESTIMATIVA, não só a ficha técnica.
  const zoneStatus: Record<string, string> = Object.fromEntries(
    interior.airflow.zones.map((z) => [z.zone, z.status]),
  )
  const heatMult = (s?: string) =>
    s === 'critical' ? 1.45 : s === 'dead_zone' ? 1.5 : s === 'tight' ? 1.12 : 0.8
  const gpuHeat = Math.min(1, (interior.parts.gpu.tdp_w || 0) / 400)
  const cpuHeat = Math.min(1, (interior.parts.cpu.tdp_w || 0) / 150)
  const gpuHeatM = heatMult(zoneStatus.gpu_zone)
  const cpuHeatM = heatMult(zoneStatus.cpu_zone)
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

  // Passo 0 do ingestor: se há descritor APROVADO para a categoria, a peça é
  // desenhada a partir DELE (aquela peça, não o tier). Sem descritor — ou se o
  // renderer paramétrico devolver null — cai na variante de tier: regressão zero.
  const visuals = interior.visuals ?? {}
  const drawPart = (
    category: string, tierVariant: string,
    b: { x: number; y: number; w: number; h: number },
    opts?: { spin?: boolean; heat?: number; label?: string },
  ) => renderFromDescriptor(category, visuals[category]?.descriptor, b)
    ?? renderPart(category, tierVariant, b, opts)
  /** origem do desenho p/ o tooltip e verificação ('modelo'|'tier') */
  const drawSrc = (category: string) => (visuals[category] ? 'modelo' : 'tier')

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
      ...(interior.parts.gpu.thickness_mm ? [['espessura', `${interior.parts.gpu.slots ?? '?'}-slot · ~${mm(interior.parts.gpu.thickness_mm)} típico`] as [string, string]] : []),
      ['TDP', `${Math.round(interior.parts.gpu.tdp_w)} W`],
      ...(gpuClr ? [['folga até a frente', mm(gpuClr.remaining_mm) + (gpuClr.is_tight ? ' (apertado)' : '')] as [string, string]] : []),
      ...(interior.clearances.gpu_side ? [['folga até a tampa', mm(interior.clearances.gpu_side.remaining_mm) + (interior.clearances.gpu_side.is_tight ? ' (apertado)' : '')] as [string, string]] : []),
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
    const k = Math.min(720 / (ft.box.w + pad * 2), 430 / (ft.box.h + pad * 2), 2.8)
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
  // choke = quanto o motor diz que este caminho está obstruído (0..1). É o que
  // liga o motor de obstrução ao MOVIMENTO: um fluxo sufocado gagueja (rastros
  // mais curtos, menos, apagando cedo), um intake livre corre límpido.
  const flowChoke = (f: { obstructions?: Array<{ factor: number }> }) =>
    Math.min(1, (f.obstructions?.reduce((a, o) => a + o.factor, 0) ?? 0) / 0.9)
  type Stream = { d: string; intensity: number; heatT: number; choke: number; key: string }
  const streams: Stream[] = []

  /* CAMPO RESOLVIDO (Onda 2): o motor devolve linhas de corrente calculadas
     sobre o mapa real de obstáculos — elas contornam a GPU porque a parede da
     peça impõe fluxo-nulo, não porque alguém desenhou a curva. Substituem as
     béziers heurísticas; sem campo, cai-se nelas exactamente como antes. */
  const field = g.flow_field ?? null
  /** T normalizado do campo, amostrado em mm (0 fora / em célula sólida) */
  const sampleT = (mx: number, my: number): number => {
    const th = field?.thermal
    if (!th) return 0
    const i = Math.max(0, Math.min(th.cols - 1, Math.floor((mx / D) * th.cols)))
    const j = Math.max(0, Math.min(th.rows - 1, Math.floor((my / H) * th.rows)))
    const v = th.t[j]?.[i] ?? 0
    return v < 0 ? 0 : v
  }

  if (field && field.streamlines.length > 0) {
    field.streamlines.forEach((sl, si) => {
      const pts = sl.pts
      if (pts.length < 2) return
      const stride = pts.length > 60 ? 2 : 1
      let d = ''
      for (let i = 0; i < pts.length; i += stride) {
        d += `${i === 0 ? 'M' : 'L'}${X(pts[i][0]).toFixed(1)},${Yc(pts[i][1]).toFixed(1)}`
      }
      const last = pts[pts.length - 1]
      d += `L${X(last[0]).toFixed(1)},${Yc(last[1]).toFixed(1)}`
      const sp = sl.speed.length ? sl.speed : [0.5]
      const mean = sp.reduce((a, b) => a + b, 0) / sp.length
      // onde a linha AQUECE: 1ª fração do trajeto onde T passa 40% do máximo
      // dela — deixa de ser palpite, passa a ser leitura do campo térmico.
      let heatT = 0.6
      let tmaxLine = 0.001
      const temps: number[] = []
      for (let i = 0; i < pts.length; i++) {
        const t = sampleT(pts[i][0], pts[i][1])
        temps.push(t)
        if (t > tmaxLine) tmaxLine = t
      }
      const hit = temps.findIndex((v) => v >= tmaxLine * 0.4)
      if (hit > 0) heatT = Math.min(0.86, Math.max(0.12, hit / temps.length))
      streams.push({
        key: `sf${si}`, d,
        intensity: Math.min(1, mean * 1.7),
        heatT,
        // caminho lento = sufocado: o "gaguejo" agora vem da velocidade REAL
        choke: Math.min(1, Math.max(0, 1 - mean * 1.9)),
      })
    })
  } else g.flows.forEach((f, fi) => {
    const sx = ox - 26
    const sy = Yc(f.from.y)
    const heatT = Math.min(0.86, 0.18 + (f.heat_at[0] ?? 0.55) * 0.6)
    const choke = flowChoke(f)
    if (f.to.side === 'rear') {
      const ey = Yc(f.to.y)
      streams.push({
        key: `f${fi}`,
        d: `M${sx},${sy} C${X(D * 0.3)},${sy} ${X(D * 0.72)},${(sy + ey) / 2} ${X(D) + 26},${ey}`,
        intensity: f.intensity, heatT, choke,
      })
    } else {
      const w = f.to.w ?? 100
      const k = Math.max(2, Math.min(4, 2 + Math.round(f.intensity * 2)))
      for (let i = 0; i < k; i++) {
        const xi = X(f.to.x + (w * (i + 0.5)) / k)
        streams.push({
          key: `f${fi}-${i}`,
          d: `M${sx},${sy} C${X(D * 0.32)},${sy} ${xi},${Yc(H * 0.45)} ${xi},${oy - 14}`,
          intensity: f.intensity * (0.75 + 0.25 * (i % 2)), heatT, choke,
        })
      }
    }
  })

  /* CAMPO TÉRMICO CONTÍNUO (Onda 2 #3) — substitui os dois glows radiais.
     A temperatura vem do MESMO campo que move o ar: fontes nas peças (por TDP),
     ambiente entrando pelos intakes, advecção-difusão sobre a grade. Deixa de
     ser "duas manchas por peça" e passa a ser a pluma que o escoamento desenha.
     Reamostrado 2×2 (≈4× menos nós) — depois do borrão fica indistinguível. */
  const thermalCells = (() => {
    const th = field?.thermal
    if (!th || !th.t?.length) return null
    const B = 2
    const cw = (D / th.cols) * s * B
    const chh = (H / th.rows) * s * B
    const out: Array<{ x: number; y: number; t: number }> = []
    for (let j = 0; j < th.rows; j += B) {
      for (let i = 0; i < th.cols; i += B) {
        let acc = 0, n = 0
        for (let dj = 0; dj < B; dj++) {
          for (let di = 0; di < B; di++) {
            const v = th.t[j + dj]?.[i + di]
            if (v !== undefined && v >= 0) { acc += v; n++ }
          }
        }
        if (!n) continue
        const t = acc / n
        if (t < 0.16) continue          // frio: não pinta (mantém a cena limpa)
        out.push({
          x: ox + (i / th.cols) * D * s,
          y: oy + (H - ((j + B) / th.rows) * H) * s,
          t,
        })
      }
    }
    return out.length ? { cells: out, w: cw + 0.8, h: chh + 0.8 } : null
  })()
  const thermalBlur = thermalCells ? Math.max(4, thermalCells.w * 0.85) : 6
  /** Rampa quente em TOKENS da marca (GUIA §2) — nada de rgb() fixo: assim o
      campo acompanha o tema claro/escuro. Duas bandas bastam: depois do borrão
      gaussiano elas fundem-se e leem como gradiente contínuo. */
  const heatFill = (t: number) => (t < 0.42 ? 'var(--warn)' : 'var(--danger)')

  /* obstrução por peça (somada em todos os fluxos) — vinda do motor */
  const obstrByPart: Record<string, number> = {}
  g.flows.forEach((f) => f.obstructions?.forEach((o) => {
    obstrByPart[o.part] = (obstrByPart[o.part] ?? 0) + o.factor
  }))
  const flowsToTop = g.flows.some((f) => f.to.side === 'top')

  /* zonas sem fluxo → eddies de recirculação, posicionados na SOMBRA (bolsão a
     sotavento) da peça que obstrui a zona — não num ponto genérico. O ar que
     não passa pela peça gorda recircula logo atrás dela. */
  const leewardOf = (b: { x: number; y: number; w: number; h: number }) =>
    flowsToTop
      ? { x: b.x + b.w * 0.5, y: b.y - 16 }          // saída no topo → bolsão acima
      : { x: b.x + b.w + 14, y: b.y + b.h * 0.35 }   // saída traseira → atrás (maior x)
  const gpuLee = gpu ? leewardOf(box(gpu)) : null
  const cpuLee = (airCooler || pump || socket) ? leewardOf(box((airCooler ?? pump ?? socket)!)) : null
  const zonePoint: Record<string, { x: number; y: number } | null> = {
    intake_front: { x: X(0) + 26, y: Yc(H * 0.5) },
    gpu_zone: gpuLee,   // sombra da GPU (a obstrução da câmara inferior)
    cpu_zone: cpuLee,   // sombra do cooler
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
        <svg viewBox="0 0 720 430" role="img" className={compact ? 'gv-compact' : undefined}
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
            <linearGradient id="gv-rim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--strong)', stopOpacity: 0.09 }} />
              <stop offset="1" style={{ stopColor: 'var(--strong)', stopOpacity: 0 }} />
            </linearGradient>
            {/* sombra de contato: elipse escura sob as peças pesadas, ancora-as no piso */}
            <radialGradient id="gv-contact">
              <stop offset="0" style={{ stopColor: 'var(--bg)', stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id="gv-heat">
              <stop offset="0" style={{ stopColor: 'var(--danger)', stopOpacity: 0.85 }} />
              <stop offset="0.45" style={{ stopColor: 'var(--danger)', stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: 'var(--danger)', stopOpacity: 0 }} />
            </radialGradient>
            <filter id="gv-lift" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" floodColor="#000" floodOpacity="0.34" />
            </filter>
            {/* plano distante: desfoque leve — recua sem sumir */}
            <filter id="gv-far" x="-8%" y="-8%" width="116%" height="116%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
            {/* campo térmico: as células da grade fundem-se num gradiente
                contínuo — é o borrão que transforma a grade em CAMPO */}
            <filter id="gv-thermal" x="-12%" y="-12%" width="124%" height="124%">
              <feGaussianBlur stdDeviation={Math.max(4, thermalBlur)} />
            </filter>
            <MaterialDefs />
          </defs>

          {/* tudo o que é CENA entra neste grupo: é ele que recebe o zoom do
              modo foco. Régua e rótulo ficam de fora (ver abaixo). */}
          <g key={`asm${asmRun}`} className={asmRun > 0 ? 'gv-assembling' : undefined}
            transform={focusTransform} style={{ transition: 'transform .38s cubic-bezier(.4,0,.2,1)' }}>

          {/* ── EXTERIOR: a casca que ENQUADRA o corte ───────────────────────
              O viewer mostra um corte do gabinete; sem casca, o corte flutua no
              vazio. Moldura com espessura, veneziana no topo (por onde o ar
              quente sai), pés e — no fim da cena — a aresta do vidro lateral.
              É o suficiente para ler "gabinete" sem competir com o interior. */}
          {(() => {
            const sx = ox - FRAME, sy = oy - FRAME
            const sw = D * s + FRAME * 2, sh = H * s + FRAME * 2
            const nv = Math.max(4, Math.round(sw / 26))
            const vw = (sw - 28) / nv
            return (
              <g data-depth="shell" pointerEvents="none">
                <rect x={sx} y={sy} width={sw} height={sh} rx={9}
                  fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
                {/* veneziana do topo */}
                {Array.from({ length: nv }, (_, i) => (
                  <rect key={`vt${i}`} x={sx + 14 + i * vw} y={sy + 2.6}
                    width={Math.max(2, vw - 5)} height={3.2} rx={1.6}
                    fill="var(--bg)" opacity={0.5} />
                ))}
                {/* pés */}
                <rect x={sx + 14} y={sy + sh} width={26} height={FEET} rx={2.5}
                  fill="var(--panel)" stroke="var(--line)" strokeWidth="0.9" />
                <rect x={sx + sw - 40} y={sy + sh} width={26} height={FEET} rx={2.5}
                  fill="var(--panel)" stroke="var(--line)" strokeWidth="0.9" />
              </g>
            )
          })()}

          {/* chassi */}
          <rect x={ox} y={oy} width={D * s} height={H * s} rx={12} fill="url(#gv-back)" stroke="var(--line)" strokeWidth="1.4" vectorEffect={focused ? 'non-scaling-stroke' : undefined} />
          {/* rim-light no topo: no dark a sombra preta (gv-lift) quase não lê,
              então o volume do chassi vem daqui — luz de cima mais presente */}
          <rect x={ox + 8} y={oy + 1.5} width={D * s - 16} height={22} rx={8} fill="url(#gv-rim)" pointerEvents="none" />
          <line x1={ox + 12} y1={oy + 2} x2={X(D) - 12} y2={oy + 2} stroke="var(--strong)" strokeWidth="1" opacity=".08" />
          <rect x={ox + 2} y={bottomY - 40} width={D * s - 4} height={38} fill="url(#gv-floor)" opacity={0.6} />
          <line x1={ox + 4} y1={Yc(g.case.shroud_h_mm)} x2={X(D) - 4} y2={Yc(g.case.shroud_h_mm)} stroke="var(--line2)" strokeWidth="1.2" />

          {/* sombras de CONTATO — ancoram as peças pesadas (a GPU projeta no
              shroud, a fonte assenta no piso do basement). Puro grounding. */}
          <g pointerEvents="none">
            {gpu && (() => { const b = box(gpu); const sy = Yc(g.case.shroud_h_mm); return <ellipse cx={b.x + b.w / 2} cy={sy} rx={b.w * 0.42} ry={7} fill="url(#gv-contact)" opacity={0.7} /> })()}
            {psu && (() => { const b = box(psu); return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h} rx={b.w * 0.5} ry={6} fill="url(#gv-contact)" /> })()}
          </g>

          {/* parede frontal (mesh = fluxo livre · sólido = restrito) */}
          {(() => {
            const fb = box({ x: 0, y: 0, w: Math.min(14, D * 0.04), h: H })
            const t = vFront === 'front-mesh' ? 'painel frontal · mesh (fluxo livre)' : 'painel frontal · sólido (fluxo restrito)'
            return (
              <g data-part="case_front" data-variant={vFront} data-src={drawSrc('case_front')} opacity={0.9 * dimOf('front')} {...partProps('front', t)}>
                {drawPart('case_front', vFront, fb)}
              </g>
            )
          })()}

          {/* ── PLANO DISTANTE: a bandeja da placa e o que corre ATRÁS dela ──
              Camadas explícitas de profundidade. O plano distante leva desfoque
              leve e menos opacidade — é o que faz o corte ler como VOLUME em vez
              de decalque, e é o que dá aos cabos um "atrás" onde existir. */}
          {mobo && (() => {
            const b = box(mobo)
            // EPS (topo) · 24-pin (meio) · front-panel (baixo)
            const gy = [b.y + b.h * 0.18, b.y + b.h * 0.52, b.y + b.h * 0.84]
            const pb = psu ? box(psu) : null
            const chx = b.x - 19          // canaleta vertical atrás da bandeja
            const runs = pb ? gy.map((y, i) => {
              const x0 = pb.x + pb.w * (0.20 + i * 0.17)
              return `M${x0.toFixed(1)},${pb.y.toFixed(1)} C${chx.toFixed(1)},${(pb.y - 26).toFixed(1)} `
                + `${chx.toFixed(1)},${(y + 48).toFixed(1)} ${(b.x - 7).toFixed(1)},${y.toFixed(1)}`
            }) : []
            return (
              <g data-depth="tray" data-asm="0" filter="url(#gv-far)" opacity={0.5} pointerEvents="none">
                <rect x={b.x - 11} y={b.y - 7} width={b.w + 19} height={b.h + 13} rx={4}
                  fill="var(--panel)" stroke="var(--line2)" strokeWidth="1" />
                {/* CHICOTE atrás da bandeja: 24-pin, EPS e front-panel sobem
                    pela canaleta e saem nos passa-cabos. Vivem no plano
                    DISTANTE — é exactamente por isto que o cabo dependia do
                    z-order: sem um "atrás" onde correr, vira rabisco. */}
                {runs.map((d, i) => (
                  <g key={`cb${i}`} data-cable={['eps', 'atx24', 'front_panel'][i]}>
                    <path d={d} fill="none" stroke="var(--line)" strokeWidth="4.2" opacity="0.55" strokeLinecap="round" />
                    <path d={d} fill="none" stroke="var(--dim2)" strokeWidth="2.1" strokeLinecap="round" />
                  </g>
                ))}
                {/* passa-cabos na borda frontal da bandeja (por cima da ponta
                    do cabo, para o chicote parecer atravessar a chapa) */}
                {gy.map((y, i) => (
                  <rect key={`gr${i}`} x={b.x - 9} y={y - 6.5} width={7} height={13} rx={3.5}
                    fill="var(--bg)" stroke="var(--line2)" strokeWidth="0.9" />
                ))}
              </g>
            )
          })()}

          {/* ── PLANO DA PLACA: a placa e o que está montado NELA ────────────
              O M.2 era desenhado depois da GPU (aparecia à frente dela) e a RAM
              depois do cooler (a torre sumia por trás da memória). Ambos são
              peças do plano da placa: ficam ATRÁS do que se projeta ao vidro. */}
          <g data-depth="board">
            {mobo && (
              <g data-part="motherboard" data-asm="0" data-variant={vMb} filter="url(#gv-lift)" opacity={dimOf('mobo')}
                {...partProps('mobo', `placa-mãe ${vMb === 'mb-atx' ? 'ATX' : 'mATX'}`)}>
                {renderPart('motherboard', vMb, box(mobo))}
              </g>
            )}
            {socket && (() => { const b = box(socket); return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--panel2)" stroke="var(--line)" pointerEvents="none" /> })()}
            {m2 && (
              <g data-part="storage" data-asm="1" data-variant="ssd-m2" opacity={dimOf('m2')} {...partProps('m2', 'SSD M.2')}>
                {renderPart('storage', 'ssd-m2', box(m2))}
              </g>
            )}
            {ram && (
              <g data-part="ram" data-asm="2" data-variant={vRam} opacity={dimOf('ram')}
                {...partProps('ram', `memória${vRam === 'ram-heatspreader' ? ' com dissipador' : ''}`)}>
                {renderPart('ram', vRam, box(ram))}
              </g>
            )}
          </g>

          {/* calor: CAMPO contínuo do solver; sem campo, os dois glows de antes */}
          {thermalCells ? (
            <g data-thermal="field" filter="url(#gv-thermal)" pointerEvents="none">
              {thermalCells.cells.map((c, i) => (
                <rect key={`th${i}`} x={c.x} y={c.y} width={thermalCells.w} height={thermalCells.h}
                  fill={heatFill(c.t)} opacity={Math.min(0.4, 0.04 + c.t * 0.4)} />
              ))}
            </g>
          ) : (
            <>
              {gpu && (() => { const b = box(gpu); const c = center(b); const r = Math.max(b.w, b.h) * 0.6 * (0.9 + 0.15 * gpuHeatM); const op = Math.min(0.5, (0.13 + 0.2 * gpuHeat) * gpuHeatM); return <g className="heatpulse" style={{ animationDuration: `${3.2 - gpuHeat}s` }} pointerEvents="none"><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.62} fill="url(#gv-heat)" opacity={op} /></g> })()}
              {(airCooler || pump || socket) && (() => { const b = box((airCooler ?? pump ?? socket)!); const c = center(b); const r = Math.max(b.w, b.h) * 0.66 * (0.9 + 0.15 * cpuHeatM); const op = Math.min(0.46, (0.11 + 0.17 * cpuHeat) * cpuHeatM); return <g className="heatpulse" style={{ animationDuration: `${3.4 - cpuHeat}s` }} pointerEvents="none"><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.66} fill="url(#gv-heat)" opacity={op} /></g> })()}
            </>
          )}

          {/* ── PLANO PRÓXIMO: o que se projeta na direção do vidro ────────── */}
          <g data-depth="near">
          {/* fonte */}
          {psu && (
            <g data-part="psu" data-asm="4" data-variant={vPsu} data-src={drawSrc('psu')} filter="url(#gv-lift)" opacity={dimOf('psu')}
              {...partProps('psu', `fonte ${vPsu === 'psu-modular' ? 'modular' : 'básica'}`)}>
              {drawPart('psu', vPsu, box(psu))}
            </g>
          )}

          {/* cooler a ar — altura de DESENHO (corpo). A folga de spec vive na vista superior. */}
          {airCooler && (
            <g data-part="cooler" data-asm="3" data-variant={vAir} data-src={drawSrc('cooler')} filter="url(#gv-lift)" opacity={dimOf('cooler')}
              {...partProps('cooler', `cooler ${Math.round(coolerRealH)}mm de altura${coolerClr ? ` · folga ${Math.round(coolerClr.remaining_mm)}mm até a tampa` : ''}${compact ? '' : ' — ver corte superior'}`)}>
              {drawPart('cooler', vAir, box(airCooler))}
            </g>
          )}
          {pump && (
            <g data-part="cooler" data-asm="3" data-variant="cooler-aio-pump" filter="url(#gv-lift)" opacity={dimOf('pump')}
              {...partProps('pump', 'bomba do AIO (water block sobre a CPU)')}>
              {renderPart('cooler', 'cooler-aio-pump', box(pump))}
            </g>
          )}
          {/* tubos bomba → radiador. Os tubos de um AIO saem por UMA PORTA numa
              extremidade do radiador (não pelo meio): roteamos para a ponta mais
              próxima da bomba, e as duas mangueiras encostam lado a lado ali. */}
          {pump && rad && (() => {
            const pb = box(pump); const rb = box(rad)
            const bx1 = pb.x + pb.w * 0.33; const bx2 = pb.x + pb.w * 0.67; const by = pb.y - 4
            const ry = rb.y + rb.h
            const pumpCx = pb.x + pb.w / 2
            // ponta do radiador mais perto da bomba = a porta real
            const nearLeft = Math.abs(pumpCx - rb.x) <= Math.abs(pumpCx - (rb.x + rb.w))
            const port = nearLeft ? rb.x + 18 : rb.x + rb.w - 18
            const rx1 = port - 8; const rx2 = port + 8
            const midY = (by + ry) / 2
            // curva mais pronunciada quanto mais lateral for a porta (mangueira sobra)
            const bow = nearLeft ? -18 : 18
            const d1 = `M${bx1},${by} C${bx1 + bow},${midY} ${rx1 - bow * 0.5},${midY} ${rx1},${ry}`
            const d2 = `M${bx2},${by} C${bx2 + bow},${midY} ${rx2 - bow * 0.5},${midY} ${rx2},${ry}`
            return (
              <g fill="none" strokeLinecap="round" pointerEvents="none" opacity={dimOf('pump')}>
                <path d={d1} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
                <path d={d2} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
                <path d={d1} stroke="var(--dim2)" strokeWidth="3.2" />
                <path d={d2} stroke="var(--dim2)" strokeWidth="3.2" />
              </g>
            )
          })()}
          {/* PCIe da fonte ao conector da GPU. Este é o ÚNICO cabo que se vê
              inteiro, de propósito: sobe pela frente do shroud e encaixa no
              conector que o renderer do descritor já desenha em cima da placa
              (o descritor diz se é 8pin, 8x2 ou 12vhpwr). Os outros ficam
              esmaecidos atrás da bandeja — é o que impede o rabisco. */}
          {gpu && psu && (() => {
            const gb = box(gpu), pb = box(psu)
            const x0 = pb.x + pb.w * 0.30, y0 = pb.y
            const x1 = gb.x + gb.w * 0.68, y1 = gb.y - 7
            const shroudY = Yc(g.case.shroud_h_mm)
            const d = `M${x0.toFixed(1)},${y0.toFixed(1)} C${x0.toFixed(1)},${(shroudY - 6).toFixed(1)} `
              + `${(x1 - 26).toFixed(1)},${(y1 + 34).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
            return (
              <g data-cable="pcie" data-asm="7" fill="none" strokeLinecap="round" pointerEvents="none" opacity={dimOf('gpu')}>
                <path d={d} stroke="var(--line)" strokeWidth="5.4" opacity=".55" />
                <path d={d} stroke="var(--dim2)" strokeWidth="2.9" />
              </g>
            )
          })()}
          {gpu && (
            <g data-part="gpu" data-asm="5" data-variant={vGpu} data-src={drawSrc('gpu')} filter="url(#gv-lift)" opacity={dimOf('gpu')}
              {...partProps('gpu', `GPU ${Math.round(gpu.w)}mm${gpuClr ? ` · folga ${Math.round(gpuClr.remaining_mm)}mm até a frente` : ''}`)}>
              {drawPart('gpu', vGpu, box(gpu))}
            </g>
          )}
          </g>{/* ── fim do plano próximo ── */}

          {/* ventoinhas do gabinete (fábrica e simuladas) */}
          {caseFans.map((f, i) => {
            const b = box(f)
            const sim = f.simulated === true
            const nf = Math.max(1, f.fan_count ?? 1)   // empilhamento (what-if)
            const wide = f.wide === true
            const fid = `fan:${f.mount ?? i}`
            // N discos ao longo do eixo longo (baia horizontal = topo)
            const discs = Array.from({ length: nf }, (_, k) => {
              const t = (k + 0.5) / nf
              return wide ? { cx: b.x + b.w * t, cy: b.y + b.h / 2 } : { cx: b.x + b.w / 2, cy: b.y + b.h * t }
            })
            const r = Math.min((wide ? b.w / nf : b.h / nf) * 0.34, 5)
            return (
              <g key={`cf${i}`} data-part="case_fan" data-asm="6" opacity={dimOf(fid)}
                {...hoverProps(fid, sim ? `${nf > 1 ? `${nf} ventoinhas` : 'ventoinha'} SIMULADA${nf > 1 ? 's' : ''} (what-if)` : 'ventoinha de fábrica')}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3}
                  fill={sim ? 'var(--accent-soft)' : 'var(--panel2)'}
                  stroke={sim ? 'var(--accent)' : 'var(--line)'} strokeWidth="1"
                  strokeDasharray={sim ? '4 3' : undefined} />
                {discs.map((d, k) => (
                  <circle key={k} cx={d.cx} cy={d.cy} r={r}
                    fill="var(--panel)" stroke={sim ? 'var(--accent)' : 'var(--line)'} strokeWidth="1" />
                ))}
                {bevel(b, 2, 3)}
              </g>
            )
          })}

          {/* AIO: radiador + fila de fans */}
          {rad && (() => {
            const b = box(rad)
            return (
              <g data-part="cooler-radiator" data-asm="6" filter="url(#gv-lift)" opacity={dimOf('rad')} {...partProps('rad', 'radiador do AIO')}>
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
              // choke (do motor de obstrução): caminho sufocado GAGUEJA — menos
              // rastros, mais curtos, apagando antes de completar o trajeto.
              const ch = st.choke
              const dur = Math.max(3, 6.6 - st.intensity * 2.4) + (si % 3) * 0.35
              const baseTrails = compact ? 1 + Math.round(st.intensity) : 2 + Math.round(st.intensity * 3)
              const trails = Math.max(1, Math.round(baseTrails * (1 - 0.45 * ch)))
              const pre = Math.max(0.05, st.heatT - 0.12).toFixed(2)
              const L = (5 + st.intensity * 9) * (1 - 0.4 * ch)   // rastro encurta
              const w = 1.3 + st.intensity * 1.1
              const peak = ((0.45 + 0.4 * st.intensity) * (1 - 0.35 * ch)).toFixed(2)
              const fadeOut = (0.97 - 0.32 * ch).toFixed(2)        // apaga mais cedo
              const d = `M${-L},0 C${(-L * 0.6).toFixed(1)},${-w} ${-w},${-w} 0,0 C${-w},${w} ${(-L * 0.6).toFixed(1)},${w} ${-L},0 Z`
              return Array.from({ length: trails }, (_, di) => {
                const begin = `${-((di / trails) * dur + si * 0.5).toFixed(2)}s`
                return (
                  <path key={`${st.key}-${di}`} className={di >= 2 ? 'gv-dot-extra' : undefined} d={d} fill="#A0A0A0" opacity={peak}>
                    <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={st.d} rotate="auto" />
                    <animate attributeName="fill" values="#A0A0A0;#A0A0A0;#E0A93B;#C85348" keyTimes={`0;${pre};${st.heatT.toFixed(2)};1`} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                    <animate attributeName="opacity" values={`0;${peak};${peak};0`} keyTimes={`0;.04;${fadeOut};1`} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                  </path>
                )
              })
            })}
          </g>
          {/* ARESTA DO VIDRO: o painel lateral que estamos a atravessar. Vai por
              último porque é a camada mais PRÓXIMA — um brilho diagonal fraco e
              a aresta interna bastam; qualquer coisa mais forte tapa a cena. */}
          <g data-depth="glass" pointerEvents="none">
            <path d={`M${(ox + D * s * 0.60).toFixed(1)},${oy} L${(ox + D * s).toFixed(1)},${(oy + H * s * 0.40).toFixed(1)} L${(ox + D * s).toFixed(1)},${oy} Z`}
              fill="var(--strong)" opacity={0.035} />
            <rect x={ox} y={oy} width={D * s} height={H * s} rx={12} fill="none"
              stroke="var(--strong)" strokeWidth="1" opacity={0.1} />
          </g>
          </g>{/* ── fim da cena com zoom ── */}

          {/* Régua ESCONDIDA no modo foco: com a cena ampliada a escala deixa
              de bater, e uma régua errada é pior do que régua nenhuma. */}
          {!focused && (() => {
            const ry = bottomY + FRAME + FEET + 6   // abaixo da casca E dos pés
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

          {/* régua de ALTURA na calha esquerda — o outro eixo no plano da vista
              lateral, onde vivem as folgas de GPU e cooler. Some no telemóvel e
              no foco (escala deixa de bater). */}
          {!focused && (() => {
            const rx = ox - FRAME - 8               // à esquerda da casca
            const ticks: number[] = []
            for (let mm = 0; mm <= H + 1; mm += 50) ticks.push(mm)
            return (
              <g pointerEvents="none" className="gv-hide-sm">
                <line x1={rx} y1={Yc(0)} x2={rx} y2={Yc(H)} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
                {ticks.map((mm, i) => (
                  <line key={mm} className={i % 2 === 1 ? 'gv-hide-sm' : undefined} x1={rx - 3} y1={Yc(mm)} x2={rx + 3} y2={Yc(mm)} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
                ))}
                <text x={rx - 5} y={Yc(H) + 3} textAnchor="end" className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace" transform={`rotate(-90 ${rx - 5} ${Yc(H) + 3})`}>{Math.round(H)}mm · altura</text>
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
        {!focused && !coarse && tip && (
          <div className="mono" role="status" style={{
            position: 'absolute', left: Math.max(6, Math.min(tip.x + 14, 620)), top: Math.max(6, tip.y - 34),
            pointerEvents: 'none', zIndex: 5, background: 'var(--panel2)', color: 'var(--text)',
            border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', fontSize: 11,
            boxShadow: 'var(--shadow-sm)', maxWidth: 280,
          }}>{tip.text}</div>
        )}
      </div>

      {/* diagnóstico: o que segura o fluxo, e como simular a solução */}
      <BottleneckNote diagnosis={interior.diagnosis} onSimulate={onToggleFan} compact={compact} />

      {/* vista superior — onde a altura do cooler está no plano */}
      {!compact && (
        <div style={{ borderTop: '1px solid var(--line2)' }}>
          <TopDownInset interior={interior} g={g} hovered={focused ?? hovered} onHover={setHovered} />
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
        {g.mounts.filter((m) => m.cfm > 0).map((m) => {
          const isSim = m.occupied_by === 'what_if_fan'
          const cnt = interior.what_if?.counts?.[m.id] ?? m.fan_count ?? 1
          const cap = m.capacity ?? 1
          const stepper = isSim && onFanDelta && cap > 1
          return (
            <span key={m.id} className="mono" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10.5, padding: '3px 9px', borderRadius: 99,
              border: `1px solid ${isSim ? 'var(--accent-dim)' : 'var(--line)'}`,
              color: isSim ? 'var(--accent)' : 'var(--dim)',
              background: isSim ? 'var(--accent-soft)' : 'transparent',
            }}>
              {m.id.replace(/_/g, ' ')}: {m.orient === 'intake' ? '+' : '−'}{Math.round(m.cfm)} CFM
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
