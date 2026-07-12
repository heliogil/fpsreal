import type { GeoFlow, GeoMount, GeoPlacement, LiveInterior, LiveProduct } from '@/lib/live-server'
import { pickVariant, renderPart } from './PartMockups'

/**
 * GabineteVivo v3 — função pura da GEOMETRIA PARAMÉTRICA do backend.
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
  const box = (p: { x: number; y: number; w: number; h: number }) => ({
    x: X(p.x), y: oy + (H - p.y - p.h) * s, w: p.w * s, h: p.h * s,
  })

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
  const vAir = airCooler ? pickVariant('cooler', { name: products.cooler?.name, sku: products.cooler?.sku, heightMm: airCooler.h }) : ''

  const topFlows = g.flows.filter((f) => f.to.side === 'top')
  const hasTop = topFlows.length > 0
  const mountLine = (m: GeoMount) => {
    const occupied = m.occupied_by !== null
    const isTop = m.y > H * 0.8 && m.w > m.h
    const color = m.orient === 'intake' ? 'var(--fresh)' : 'var(--warn)'
    if (isTop) {
      return (
        <line key={m.id} data-vent={`${m.orient}-${m.id}`} x1={X(m.x)} y1={oy} x2={X(m.x + m.w)} y2={oy}
          stroke={occupied ? color : 'var(--dim2)'} strokeWidth={occupied ? 3.5 : 1.6}
          strokeLinecap="round" strokeDasharray={occupied ? undefined : '5 5'} opacity={occupied ? 0.85 : 0.5} />
      )
    }
    const wallX = m.x < D / 2 ? X(0) : X(D)
    return (
      <line key={m.id} data-vent={`${m.orient}-${m.id}`} x1={wallX} y1={Yc(m.y + m.h)} x2={wallX} y2={Yc(m.y)}
        stroke={occupied ? color : 'var(--dim2)'} strokeWidth={occupied ? 3.5 : 1.6}
        strokeLinecap="round" strokeDasharray={occupied ? undefined : '5 5'} opacity={occupied ? 0.85 : 0.5} />
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

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {header}

      <svg viewBox="0 0 720 430" role="img"
        aria-label={`Interior do ${interior.case.name ?? 'gabinete'}: fluxo estimado ${score} de 100, pressão ${pressao}`}
        style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)', borderTop: '1px solid var(--line2)', borderBottom: '1px solid var(--line2)' }}>

        {/* chassi (dimensões reais em escala) */}
        <rect x={ox} y={oy} width={D * s} height={H * s} rx={12} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.4" />
        {/* shroud da fonte */}
        <line x1={ox + 4} y1={Yc(g.case.shroud_h_mm)} x2={X(D) - 4} y2={Yc(g.case.shroud_h_mm)} stroke="var(--line2)" strokeWidth="1.2" />

        {/* placa-mãe (backdrop) */}
        {mobo && <g data-part="motherboard" data-variant={vMb}>{renderPart('motherboard', vMb, box(mobo))}</g>}

        {/* zonas de calor (pulso ∝ TDP) */}
        {gpu && (() => { const b = box(gpu); return <rect className="heatpulse" x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx={8} fill="var(--danger)" opacity={0.05 + 0.12 * gpuHeat} style={{ animationDuration: `${3.2 - gpuHeat}s` }} /> })()}
        {(airCooler || pump) && (() => { const b = box((airCooler ?? pump)!); return <rect className="heatpulse" x={b.x - 8} y={b.y - 8} width={b.w + 16} height={b.h + 16} rx={8} fill="var(--danger)" opacity={0.05 + 0.1 * cpuHeat} style={{ animationDuration: `${3.4 - cpuHeat}s` }} /> })()}

        {/* peças (mm → px; variante = tier cosmético) */}
        {psu && <g data-part="psu" data-variant={vPsu}>{renderPart('psu', vPsu, box(psu))}</g>}
        {socket && (() => { const b = box(socket); return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--panel2)" stroke="var(--line)" /> })()}
        {airCooler && <g data-part="cooler" data-variant={vAir}>{renderPart('cooler', vAir, box(airCooler))}</g>}
        {pump && <g data-part="cooler" data-variant="cooler-aio-pump">{renderPart('cooler', 'cooler-aio-pump', box(pump))}</g>}
        {/* tubos da bomba até o radiador — posições reais */}
        {pump && rad && (() => {
          const pb = box(pump); const rb = box(rad)
          const px1 = pb.x + pb.w * 0.3; const px2 = pb.x + pb.w * 0.7; const py = pb.y + 4
          const rx1 = rb.x + rb.w * 0.42; const rx2 = rb.x + rb.w * 0.52; const ry = rb.y + rb.h
          return (
            <g>
              <path d={`M${px1},${py} C${px1 - 14},${py - 40} ${rx1 + 10},${ry + 30} ${rx1},${ry}`} fill="none" stroke="var(--dim2)" strokeWidth="3" strokeLinecap="round" />
              <path d={`M${px2},${py} C${px2 - 6},${py - 44} ${rx2 + 16},${ry + 26} ${rx2},${ry}`} fill="none" stroke="var(--dim2)" strokeWidth="3" strokeLinecap="round" />
            </g>
          )
        })()}
        {ram && (() => { const b = box(ram); return <g data-part="ram" data-variant={vRam}>{renderPart('ram', vRam, b)}</g> })()}
        {gpu && <g data-part="gpu" data-variant={vGpu}>{renderPart('gpu', vGpu, box(gpu))}</g>}
        {m2 && <g data-part="storage" data-variant="ssd-m2">{renderPart('storage', 'ssd-m2', box(m2))}</g>}
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
            <g data-part="cooler-radiator" data-variant="aio-radiator">
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
          const b = box(airCooler)
          return (
            <text x={b.x + b.w + 8} y={b.y + 12} fill={coolerClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontSize="10.5" fontFamily="var(--font-plex-mono), monospace">
              cooler {Math.round(airCooler.h)}mm · folga {Math.round(coolerClr.remaining_mm)}mm
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

        {/* rótulos honestos */}
        <text x={ox + 8} y={oy + H * s - 8} fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          estimativa de fluxo e de dimensões · zone_graph v2 · não é medição
        </text>
        <text x={X(D) - 8} y={oy + H * s - 8} textAnchor="end" fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          viewer 3D em breve
        </text>
      </svg>

      {/* chips de estado (motor composicional) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px', alignItems: 'center' }}>
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
