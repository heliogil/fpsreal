import type { GeoFlow, GeoMount, GeoPlacement, LiveInterior, LiveProduct } from '@/lib/live-server'
import { pickVariant, renderPart } from './PartMockups'

/**
 * GabineteVivo v4 — função pura da GEOMETRIA PARAMÉTRICA do backend.
 *
 * Nada aqui é desenhado caso a caso: o /interior/estimate entrega, em mm,
 *  - o volume interior do gabinete e as PREVISÕES de montagem (mounts) com
 *    orientação intake/exhaust e ocupação (fan stock, radiador de AIO, livre),
 *  - as colocações de cada peça (specs reais + padrões de form factor),
 *  - os FLUXOS compostos (cada intake alimenta cada exhaust, com intensidade
 *    já descontada a resistência das peças no caminho e pontos de calor).
 * Este componente só converte mm→px e desenha. Gabinete novo ou peça nova =
 * dados novos, mesmo código.
 *
 * Linguagem visual aprovada: linha verde na parede onde entra ar, laranja
 * onde sai, tracejada onde há previsão livre; radiador = bloco sólido com
 * fila de fans particionada; partículas nascem fora, esquentam nas zonas de
 * calor e saem pelas paredes marcadas. Fans estáticos — a vida da cena é o ar.
 *
 * v4 (2026-07): profundidade em camadas (gradiente + sombra + highlight),
 * calor como GRADIENTE térmico radial, streamlines sob as partículas + eddies
 * de recirculação nas zonas mortas, parede frontal (mesh vs sólido), cabos da
 * fonte data-driven, legenda-chave, régua de escala e tooltips <title>.
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

export default function GabineteVivo({ interior, products }: { interior: LiveInterior; products: Products }) {
  const g = interior.geometry
  const score = interior.airflow.score
  const scoreTone = score >= 70 ? 'var(--fresh)' : score >= 45 ? 'var(--warn)' : 'var(--danger)'
  const pressao = interior.airflow.pressure_balance === 'positive' ? 'positiva' : interior.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
      <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--dim)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 99 }}>
        visualização 2D · estimativa
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>{interior.case.name ?? 'gabinete'}</span>
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

  /* variantes visuais por tier (cosmética; dimensões vêm da geometria) */
  const vGpu = pickVariant('gpu', { name: products.gpu?.name, sku: products.gpu?.sku, lengthMm: gpu?.w ?? 0, tdpW: interior.parts.gpu.tdp_w })
  const vMb = pickVariant('motherboard', { name: products.motherboard?.name, sku: products.motherboard?.sku })
  const vRam = pickVariant('ram', { name: products.ram?.name, sku: products.ram?.sku })
  const vPsu = pickVariant('psu', { name: products.psu?.name, sku: products.psu?.sku })
  const coolerRealH = interior.parts.cooler.height_mm || airCooler?.h || 0
  const vAir = airCooler ? pickVariant('cooler', { name: products.cooler?.name, sku: products.cooler?.sku, heightMm: coolerRealH }) : ''
  const vFront = pickVariant('case_front', { name: interior.case.name ?? undefined, airflowClass: interior.case.airflow_class ?? undefined })

  const topFlows = g.flows.filter((f) => f.to.side === 'top')
  const hasTop = topFlows.length > 0
  const mountLine = (m: GeoMount) => {
    const occupied = m.occupied_by !== null
    const isTop = m.y > H * 0.8 && m.w > m.h
    const color = m.orient === 'intake' ? 'var(--fresh)' : 'var(--warn)'
    const tip = `${m.id.replace(/_/g, ' ')} · ${m.orient === 'intake' ? 'entrada' : 'saída'} · ${occupied ? `${Math.round(m.cfm)} CFM` : 'previsão livre'}`
    if (isTop) {
      return (
        <line key={m.id} data-vent={`${m.orient}-${m.id}`} x1={X(m.x)} y1={oy} x2={X(m.x + m.w)} y2={oy}
          stroke={occupied ? color : 'var(--dim2)'} strokeWidth={occupied ? 3.5 : 1.6}
          strokeLinecap="round" strokeDasharray={occupied ? undefined : '5 5'} opacity={occupied ? 0.85 : 0.5}>
          <title>{tip}</title>
        </line>
      )
    }
    const wallX = m.x < D / 2 ? X(0) : X(D)
    return (
      <line key={m.id} data-vent={`${m.orient}-${m.id}`} x1={wallX} y1={Yc(m.y + m.h)} x2={wallX} y2={Yc(m.y)}
        stroke={occupied ? color : 'var(--dim2)'} strokeWidth={occupied ? 3.5 : 1.6}
        strokeLinecap="round" strokeDasharray={occupied ? undefined : '5 5'} opacity={occupied ? 0.85 : 0.5}>
        <title>{tip}</title>
      </line>
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

  /* zonas quentes → pontos p/ eddies de recirculação (só onde falta fluxo) */
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
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {header}

      <svg viewBox="0 0 720 430" role="img"
        aria-label={`Interior do ${interior.case.name ?? 'gabinete'}: fluxo estimado ${score} de 100, pressão ${pressao}`}
        style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)', borderTop: '1px solid var(--line2)', borderBottom: '1px solid var(--line2)' }}>

        {/* ── camada de profundidade e calor (defs) ───────────────────────── */}
        <defs>
          {/* fundo do chassi: gradiente vertical sutil (profundidade ambiente) */}
          <linearGradient id="gv-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--panel)' }} />
            <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
          </linearGradient>
          {/* sombra de contato no piso interno */}
          <linearGradient id="gv-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--bg)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 0.55 }} />
          </linearGradient>
          {/* glow térmico radial (câmera térmica): núcleo quente → transparente */}
          <radialGradient id="gv-heat">
            <stop offset="0" style={{ stopColor: 'var(--danger)', stopOpacity: 0.85 }} />
            <stop offset="0.45" style={{ stopColor: 'var(--danger)', stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: 'var(--danger)', stopOpacity: 0 }} />
          </radialGradient>
          {/* sombra projetada das peças — dá leitura de frente/trás (corte) */}
          <filter id="gv-lift" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" floodColor="#000" floodOpacity="0.34" />
          </filter>
        </defs>

        {/* chassi (dimensões reais em escala) */}
        <rect x={ox} y={oy} width={D * s} height={H * s} rx={12} fill="url(#gv-back)" stroke="var(--line)" strokeWidth="1.4" />
        {/* highlight interno no topo (luz vem de cima → volume no dark) */}
        <line x1={ox + 12} y1={oy + 2} x2={X(D) - 12} y2={oy + 2} stroke="var(--strong)" strokeWidth="1" opacity=".05" />
        {/* sombra de contato no piso */}
        <rect x={ox + 2} y={bottomY - 40} width={D * s - 4} height={38} fill="url(#gv-floor)" opacity={0.6} />
        {/* shroud da fonte */}
        <line x1={ox + 4} y1={Yc(g.case.shroud_h_mm)} x2={X(D) - 4} y2={Yc(g.case.shroud_h_mm)} stroke="var(--line2)" strokeWidth="1.2" />

        {/* parede frontal do gabinete (mesh = fluxo livre · sólido = restrito) */}
        {(() => {
          const fb = box({ x: 0, y: 0, w: Math.min(14, D * 0.04), h: H })
          return (
            <g data-part="case_front" data-variant={vFront} opacity={0.9}>
              {renderPart('case_front', vFront, fb)}
              <title>{`painel frontal · ${vFront === 'front-mesh' ? 'mesh (fluxo livre)' : 'sólido (fluxo restrito)'}`}</title>
            </g>
          )
        })()}

        {/* placa-mãe (backdrop) */}
        {mobo && <g data-part="motherboard" data-variant={vMb} filter="url(#gv-lift)"><title>{`placa-mãe ${vMb === 'mb-atx' ? 'ATX' : 'mATX'}`}</title>{renderPart('motherboard', vMb, box(mobo))}</g>}

        {/* zonas de calor — GRADIENTE térmico radial (o .heatpulse anima a
            opacidade do GRUPO .35↔1; a opacidade fixa fica no ellipse interno
            p/ o pulso multiplicar sem saturar, e o reduced-motion o congela) */}
        {gpu && (() => { const b = box(gpu); const c = center(b); const r = Math.max(b.w, b.h) * 0.6; return <g className="heatpulse" style={{ animationDuration: `${3.2 - gpuHeat}s` }}><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.62} fill="url(#gv-heat)" opacity={0.14 + 0.22 * gpuHeat} /></g> })()}
        {(airCooler || pump || socket) && (() => { const b = box((airCooler ?? pump ?? socket)!); const c = center(b); const r = Math.max(b.w, b.h) * 0.66; return <g className="heatpulse" style={{ animationDuration: `${3.4 - cpuHeat}s` }}><ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.66} fill="url(#gv-heat)" opacity={0.12 + 0.18 * cpuHeat} /></g> })()}

        {/* peças (mm → px; variante = tier cosmético) */}
        {psu && <g data-part="psu" data-variant={vPsu} filter="url(#gv-lift)"><title>{`fonte ${vPsu === 'psu-modular' ? 'modular' : 'básica'}`}</title>{renderPart('psu', vPsu, box(psu))}</g>}
        {socket && (() => { const b = box(socket); return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--panel2)" stroke="var(--line)" /> })()}
        {airCooler && (() => {
          const ab = box(airCooler); const capTop = oy + 4
          if (ab.y < capTop) { ab.h -= capTop - ab.y; ab.y = capTop } // tower não fura o teto
          return <g data-part="cooler" data-variant={vAir} filter="url(#gv-lift)"><title>{`cooler ${Math.round(coolerRealH)}mm${coolerClr ? ` · folga ${Math.round(coolerClr.remaining_mm)}mm` : ''}`}</title>{renderPart('cooler', vAir, ab)}</g>
        })()}
        {pump && <g data-part="cooler" data-variant="cooler-aio-pump" filter="url(#gv-lift)"><title>bomba do AIO</title>{renderPart('cooler', 'cooler-aio-pump', box(pump))}</g>}
        {/* tubos da bomba até o radiador — dos barbs (topo da bomba) à
            extremidade do radiador mais próxima; posições reais, data-driven */}
        {pump && rad && (() => {
          const pb = box(pump); const rb = box(rad)
          const bx1 = pb.x + pb.w * 0.33; const bx2 = pb.x + pb.w * 0.67; const by = pb.y - 4
          const ry = rb.y + rb.h // face inferior do radiador (voltada p/ o interior)
          const anchor = Math.max(rb.x + 16, Math.min(rb.x + rb.w - 16, pb.x + pb.w / 2))
          const rx1 = anchor - 9; const rx2 = anchor + 9
          const midY = (by + ry) / 2
          // leve curvatura p/ fora → lê como duas mangueiras (topo some atrás do rad)
          const d1 = `M${bx1},${by} C${bx1 - 16},${midY} ${rx1 - 12},${midY} ${rx1},${ry}`
          const d2 = `M${bx2},${by} C${bx2 + 16},${midY} ${rx2 + 12},${midY} ${rx2},${ry}`
          return (
            <g fill="none" strokeLinecap="round">
              <path d={d1} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
              <path d={d2} stroke="var(--line)" strokeWidth="5.5" opacity=".5" />
              <path d={d1} stroke="var(--dim2)" strokeWidth="3.2" />
              <path d={d2} stroke="var(--dim2)" strokeWidth="3.2" />
            </g>
          )
        })()}
        {ram && (() => { const b = box(ram); return <g data-part="ram" data-variant={vRam}><title>{`memória${vRam === 'ram-heatspreader' ? ' com dissipador' : ''}`}</title>{renderPart('ram', vRam, b)}</g> })()}
        {gpu && <g data-part="gpu" data-variant={vGpu} filter="url(#gv-lift)"><title>{`GPU ${Math.round(gpu.w)}mm${gpuClr ? ` · folga ${Math.round(gpuClr.remaining_mm)}mm` : ''}`}</title>{renderPart('gpu', vGpu, box(gpu))}</g>}
        {m2 && <g data-part="storage" data-variant="ssd-m2"><title>SSD M.2</title>{renderPart('storage', 'ssd-m2', box(m2))}</g>}
        {/* fans do gabinete: perfil lateral fino na parede */}
        {caseFans.map((f, i) => {
          const b = box(f)
          return (
            <g key={`cf${i}`} data-part="case_fan">
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
              <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={Math.min(b.w * 0.32, 5)} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
            </g>
          )
        })}

        {/* AIO: radiador = bloco sólido; fans = fila particionada (posição/tamanho reais) */}
        {rad && (() => {
          const b = box(rad)
          return (
            <g data-part="cooler-radiator" data-variant="aio-radiator" filter="url(#gv-lift)">
              <title>radiador do AIO</title>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
              <rect x={b.x + 4} y={b.y + 3} width={b.w - 8} height={Math.max(4, b.h - 6)} rx={2} fill="var(--line2)" />
            </g>
          )
        })()}
        {radFans && (() => {
          const b = box(radFans)
          const nf = radFans.fan_count ?? 3
          return (
            <g data-part="aio-fans" data-variant={`aio-fans-${nf}`}>
              <title>{`${nf} fans do radiador`}</title>
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
        {/* cota do volume do stack AIO (o tradeoff) */}
        {rad && radFans && (() => {
          const rb = box(rad); const fb = box(radFans)
          const xr = Math.max(rb.x + rb.w, fb.x + fb.w) + 6
          const mm = Math.round(rad.h + radFans.h)
          return (
            <g>
              <line x1={xr} y1={rb.y} x2={xr} y2={fb.y + fb.h} stroke="var(--dim2)" strokeWidth="1" />
              <line x1={xr - 4} y1={rb.y} x2={xr + 4} y2={rb.y} stroke="var(--dim2)" strokeWidth="1" />
              <line x1={xr - 4} y1={fb.y + fb.h} x2={xr + 4} y2={fb.y + fb.h} stroke="var(--dim2)" strokeWidth="1" />
              <text x={xr + 7} y={(rb.y + fb.y + fb.h) / 2 + 3} fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">~{mm}mm</text>
            </g>
          )
        })()}

        {/* cota de folga da GPU até a frente */}
        {gpu && gpuClr && (() => {
          const b = box(gpu)
          const frontInner = X(28)
          const yMid = b.y + b.h / 2
          return (
            <g>
              <line x1={frontInner} y1={yMid} x2={b.x - 3} y2={yMid} stroke={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} strokeWidth="1" strokeDasharray="4 4" />
              <text x={frontInner + 4} y={yMid - 7} fill={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontSize="10.5" fontFamily="var(--font-plex-mono), monospace">
                folga {Math.round(gpuClr.remaining_mm)}mm
              </text>
              <text x={b.x + 6} y={b.y - 6} fill="var(--dim2)" fontSize="10" fontFamily="var(--font-plex-mono), monospace">GPU {Math.round(gpu.w)}mm</text>
            </g>
          )
        })()}
        {airCooler && coolerClr && (() => {
          const b = box(airCooler); const ty = Math.max(oy + 16, b.y + 12)
          return (
            <text x={b.x + b.w + 8} y={ty} fill={coolerClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontSize="10.5" fontFamily="var(--font-plex-mono), monospace">
              cooler {Math.round(coolerRealH)}mm · folga {Math.round(coolerClr.remaining_mm)}mm
            </text>
          )
        })()}

        {/* linhas de parede: verde entra · laranja sai · tracejado = previsão livre */}
        {g.mounts.map(mountLine)}
        <text x={ox - 54} y={Yc(H * 0.62)} fill="var(--fresh)" fontSize="10.5" fontWeight="600" fontFamily="var(--font-plex-mono), monospace">entrada</text>
        <text x={ox - 54} y={Yc(H * 0.62) + 12} fill="var(--dim2)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace">intake</text>
        <text x={716} y={Yc(H * 0.68)} textAnchor="end" fill="var(--warn)" fontSize="10.5" fontWeight="600" fontFamily="var(--font-plex-mono), monospace">saída</text>
        <text x={716} y={Yc(H * 0.68) + 12} textAnchor="end" fill="var(--dim2)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace">exhaust</text>
        {hasTop && (
          <text x={X(D) - 4} y={oy - 8} textAnchor="end" fill="var(--warn)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">saída pelo radiador</text>
        )}

        {/* streamlines: trilhos tênues por onde as partículas correm (opacidade ∝ intensity) */}
        <g fill="none" strokeLinecap="round">
          {streams.map((st) => (
            <path key={`rail-${st.key}`} d={st.d} stroke="var(--dim2)" strokeWidth={0.8 + st.intensity * 0.8} opacity={0.06 + st.intensity * 0.16} />
          ))}
        </g>

        {/* eddies: redemoinho de recirculação onde o ar não circula (zona morta/crítica) */}
        {eddies.map((e, i) => {
          const r = 13
          const d = eddyArc(e.pt.x, e.pt.y, r)
          return (
            <g key={`eddy-${i}`}>
              <title>{`${ZONE_LABEL[e.z.zone] ?? e.z.zone}: ${STATUS_PT[e.z.status]?.label ?? e.z.status} — ar recircula sem sair`}</title>
              <path d={d} fill="none" stroke={e.tone} strokeWidth="1.4" strokeLinecap="round" opacity={0.5} />
              <g className="flowdots">
                <circle r={2.1} fill={e.tone}>
                  <animateMotion dur="2.6s" repeatCount="indefinite" path={d} rotate="auto" />
                  <animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.1;.85;1" dur="2.6s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          )
        })}

        {/* FLUXO — partículas compostas pelo motor (fora → zonas de calor → fora) */}
        <g className="flowdots">
          {streams.map((st, si) => {
            const dur = Math.max(3, 6.6 - st.intensity * 2.4) + (si % 3) * 0.35
            const dots = 3 + Math.round(st.intensity * 5)
            const pre = Math.max(0.05, st.heatT - 0.12).toFixed(2)
            return Array.from({ length: dots }, (_, di) => {
              const begin = `${-((di / dots) * dur + si * 0.5).toFixed(2)}s`
              return (
                <circle key={`${st.key}-${di}`} r={2.2 + st.intensity} fill="#A0A0A0" opacity=".8">
                  <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={st.d} rotate="0" />
                  <animate attributeName="fill" values="#A0A0A0;#A0A0A0;#E0A93B;#C85348" keyTimes={`0;${pre};${st.heatT.toFixed(2)};1`} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;.85;.85;0" keyTimes="0;.04;.97;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                </circle>
              )
            })
          })}
        </g>

        {/* régua de escala (reforça "em escala" — estimativa dimensional) */}
        {(() => {
          const ry = bottomY + 12
          const step = 50
          const ticks = []
          for (let mm = 0; mm <= D + 1; mm += step) ticks.push(mm)
          return (
            <g>
              <line x1={X(0)} y1={ry} x2={X(D)} y2={ry} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
              {ticks.map((mm) => (
                <line key={mm} x1={X(mm)} y1={ry - 3} x2={X(mm)} y2={ry + 3} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
              ))}
              <text x={X(0)} y={ry + 15} fill="var(--dim2)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace">0</text>
              <text x={X(D)} y={ry + 15} textAnchor="end" fill="var(--dim2)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace">{Math.round(D)}mm · profundidade</text>
            </g>
          )
        })()}

        {/* rótulos honestos */}
        <text x={ox + 8} y={bottomY - 8} fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          estimativa · zone_graph v2 · não é medição
        </text>
        <text x={X(D) - 8} y={bottomY - 8} textAnchor="end" fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          viewer 3D em breve
        </text>
      </svg>

      {/* legenda-chave */}
      <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '10px 16px 2px', alignItems: 'center', fontSize: 9.5, color: 'var(--dim2)', borderTop: '1px solid var(--line2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--fresh)' }} /> entra</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--warn)' }} /> sai</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--dim2)' }} /> previsão livre</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 24, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, var(--dim), var(--warn), var(--danger))' }} /> ar esquenta</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 99, background: 'radial-gradient(circle, var(--danger), transparent 70%)' }} /> zona quente</span>
        {eddies.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 99, border: '1.4px solid var(--dim2)', borderTopColor: 'transparent' }} /> recirculação</span>
        )}
      </div>

      {/* chips de estado (motor composicional) */}
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
          <span key={m.id} className="mono" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)' }}>
            {m.id.replace(/_/g, ' ')}: {m.orient === 'intake' ? '+' : '−'}{Math.round(m.cfm)} CFM
          </span>
        ))}
        {g.mounts.filter((m) => m.occupied_by === null).map((m) => (
          <span key={m.id} className="mono" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px dashed var(--dim2)', color: 'var(--dim2)' }}>
            {m.id.replace(/_/g, ' ')}: previsão livre
          </span>
        ))}
      </div>
    </div>
  )
}
