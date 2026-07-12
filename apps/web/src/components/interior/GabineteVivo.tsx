import type { LiveInterior, LiveProduct } from '@/lib/live-server'
import { pickVariant, renderPart } from './PartMockups'

/**
 * GabineteVivo — cutaway 2D data-driven do gabinete (o moat visual).
 *
 * Desenha o interior do gabinete a partir da geometria REAL servida por
 * /interior/estimate (max_gpu_length, max_cooler_height, folgas, zonas de
 * airflow) e posiciona mockups de peças escolhidos por tier visual
 * (PartMockups: GPU flagship ≠ GPU de entrada — regra do design doc).
 *
 * Animações:
 *  - fluxo de ar: partículas SMIL percorrendo o gabinete (frente → trás),
 *    quantidade/velocidade proporcionais ao CFM estimado; a cor esquenta
 *    (cinza → âmbar → vermelho) ao passar pelas zonas de calor.
 *  - fans girando (CSS), calor pulsando na GPU/CPU proporcional ao TDP.
 *  - `prefers-reduced-motion` esconde as partículas e congela os fans.
 *
 * INTEGRIDADE: tudo aqui é estimativa de fluxo (zone_graph), nunca medição —
 * rotulado no painel. Peça sem dados → silhueta "em análise" (nunca inventar).
 */

type Products = Partial<Record<'gpu' | 'cooler' | 'ram' | 'psu' | 'storage' | 'motherboard' | 'case', LiveProduct | null>>

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const s = (v: unknown): string => (typeof v === 'string' ? v : '')

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
  const maxGpu = interior.case.max_gpu_length_mm || 400
  const maxCooler = interior.case.max_cooler_height_mm || 180
  const gpuLen = interior.parts.gpu.length_mm || 0
  const coolerH = interior.parts.cooler.height_mm || 0
  const gpuHeat = Math.min(1, (interior.parts.gpu.tdp_w || 0) / 400)
  const cpuHeat = Math.min(1, (interior.parts.cpu.tdp_w || 0) / 150)
  const cfm = interior.airflow.cfm || 0
  const fanIn = Math.max(1, interior.airflow.fans?.intake ?? 2)
  const fanOut = Math.max(1, interior.airflow.fans?.exhaust ?? 1)
  const gpuClr = interior.clearances.gpu
  const coolerClr = interior.clearances.cooler
  const score = interior.airflow.score
  const scoreTone = score >= 70 ? 'var(--fresh)' : score >= 45 ? 'var(--warn)' : 'var(--danger)'
  const pressao = interior.airflow.pressure_balance === 'positive' ? 'positiva' : interior.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'

  /* variantes por tier (o dado decide o desenho) */
  const gpuSpecs = products.gpu?.specs ?? {}
  const vGpu = pickVariant('gpu', { name: products.gpu?.name, sku: products.gpu?.sku, lengthMm: gpuLen || n(gpuSpecs['length_mm']), tdpW: interior.parts.gpu.tdp_w || n(gpuSpecs['tdp_w']) })
  const vCooler = pickVariant('cooler', { name: interior.parts.cooler.name ?? products.cooler?.name, sku: products.cooler?.sku, heightMm: coolerH })
  const vRam = pickVariant('ram', { name: products.ram?.name, sku: products.ram?.sku, ddr: s(products.ram?.specs?.['ram_type']) })
  const vPsu = pickVariant('psu', { name: products.psu?.name, sku: products.psu?.sku, watts: n(products.psu?.specs?.['watts']) })
  const vSto = pickVariant('storage', { name: products.storage?.name, sku: products.storage?.sku })
  const vMb = pickVariant('motherboard', { name: products.motherboard?.name, sku: products.motherboard?.sku })
  const vFront = pickVariant('case_front', { name: interior.case.name ?? products.case?.name, sku: products.case?.sku, airflowClass: interior.case.airflow_class ?? '' })
  const isAio = vCooler === 'cooler-aio'

  /* ── geometria (viewBox 720×430) ─────────────────────────────────────── */
  const CASE = { x: 40, y: 22, w: 648, h: 386 }
  // GPU: ancorada na traseira (direita), cresce para a frente (esquerda)
  const gpuRun = 544 // px que representam max_gpu_length_mm
  const gpuPx = Math.max(46, (gpuLen / maxGpu) * gpuRun)
  const gpuH = vGpu === 'gpu-flagship' ? 54 : vGpu === 'gpu-dual' ? 46 : 40
  const gpuBox = { x: 628 - gpuPx, y: 236, w: gpuPx, h: gpuH }
  // Cooler: cresce para cima a partir do socket
  const coolerPx = Math.max(30, (coolerH / maxCooler) * 128)
  const coolerBox = { x: 388, y: 196 - coolerPx, w: 86, h: coolerPx }
  const socket = { x: 410, y: 198, w: 44, h: 30 }
  const flowDots = cfm >= 130 ? 5 : cfm >= 70 ? 4 : 3
  const flowDur = Math.max(3.4, 7 - cfm / 45)

  const flowPaths = [
    'M84,140 C240,128 470,118 652,96',
    `M84,${gpuBox.y + 18} C300,${gpuBox.y + 14} 500,210 652,140`,
    'M84,330 C300,322 500,270 652,170',
  ]
  const heatColors = 'var(--dim2)' // cold start; SMIL precisa de literais ↓
  void heatColors

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {/* header do painel — padrão do handoff */}
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

      <svg viewBox="0 0 720 430" role="img" aria-label={`Interior do gabinete ${interior.case.name ?? ''}: GPU ${Math.round(gpuLen)}mm, cooler ${Math.round(coolerH)}mm, fluxo estimado ${score} de 100, pressão ${pressao}`} style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)', borderTop: '1px solid var(--line2)', borderBottom: '1px solid var(--line2)' }}>
        {/* chassi */}
        <rect x={CASE.x} y={CASE.y} width={CASE.w} height={CASE.h} rx={14} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.4" />
        {/* frente do gabinete (variante mesh/sólida) */}
        <g data-part="case_front" data-variant={vFront}>{renderPart('case_front', vFront, { x: 46, y: 78, w: 34, h: 274 })}</g>
        {/* shroud da fonte */}
        <rect x={90} y={334} width={590} height={66} rx={8} fill="var(--panel2)" opacity=".5" stroke="var(--line2)" />

        {/* placa-mãe */}
        <g data-part="motherboard" data-variant={vMb}>{renderPart('motherboard', vMb, { x: 258, y: 66, w: 372, h: 258 })}</g>

        {/* zonas de calor (pulso ∝ TDP) */}
        <rect className="heatpulse" x={coolerBox.x - 14} y={Math.min(coolerBox.y, socket.y) - 10} width={coolerBox.w + 28} height={socket.y + socket.h - Math.min(coolerBox.y, socket.y) + 18} rx={10} fill="var(--danger)" opacity={0.05 + 0.1 * cpuHeat} style={{ animationDuration: `${3.4 - cpuHeat}s` }} />
        <rect className="heatpulse" x={gpuBox.x - 8} y={gpuBox.y - 8} width={gpuBox.w + 16} height={gpuBox.h + 16} rx={10} fill="var(--danger)" opacity={0.05 + 0.12 * gpuHeat} style={{ animationDuration: `${3.2 - gpuHeat}s` }} />

        {/* socket + cooler */}
        <rect x={socket.x} y={socket.y} width={socket.w} height={socket.h} rx={3} fill="var(--panel2)" stroke="var(--line)" />
        <g data-part="cooler" data-variant={vCooler}>{renderPart('cooler', vCooler, coolerBox, { spin: true })}</g>
        {isAio && (
          /* radiador AIO no top bay */
          <g data-part="cooler-radiator" data-variant="aio-radiator-360">
            <rect x={150} y={32} width={400} height={24} rx={5} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
            {Array.from({ length: 26 }, (_, i) => (
              <line key={i} x1={158 + i * 15} y1={35} x2={158 + i * 15} y2={53} stroke="var(--line)" strokeWidth="1" />
            ))}
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={216 + i * 134} cy={44} r={9} fill="none" stroke="var(--accent-dim)" strokeWidth="1.4" />
            ))}
          </g>
        )}

        {/* RAM */}
        <g data-part="ram" data-variant={vRam}>{renderPart('ram', vRam, { x: 508, y: 96, w: 44, h: 92 })}</g>

        {/* storage */}
        {vSto === 'ssd-m2'
          ? <g data-part="storage" data-variant={vSto}>{renderPart('storage', vSto, { x: 300, y: 214, w: 66, h: 12 })}</g>
          : <g data-part="storage" data-variant={vSto}>{renderPart('storage', vSto, { x: 206, y: 348, w: 64, h: 40 })}</g>}

        {/* GPU (comprimento em escala real) */}
        <g data-part="gpu" data-variant={vGpu}>{renderPart('gpu', vGpu, gpuBox, { spin: true })}</g>

        {/* folga da GPU até a frente — cota de engenharia */}
        {gpuClr && (
          <g className="mono">
            <line x1={86} y1={gpuBox.y + gpuBox.h / 2} x2={gpuBox.x - 4} y2={gpuBox.y + gpuBox.h / 2} stroke={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} strokeWidth="1" strokeDasharray="4 4" />
            <line x1={86} y1={gpuBox.y + gpuBox.h / 2 - 6} x2={86} y2={gpuBox.y + gpuBox.h / 2 + 6} stroke={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} strokeWidth="1" />
            <text x={90} y={gpuBox.y + gpuBox.h / 2 - 7} fill={gpuClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontSize="10.5" fontFamily="var(--font-plex-mono), monospace">
              folga {Math.round(gpuClr.remaining_mm)}mm
            </text>
            <text x={gpuBox.x + 6} y={gpuBox.y - 8} fill="var(--dim2)" fontSize="10" fontFamily="var(--font-plex-mono), monospace">GPU {Math.round(gpuLen)}mm</text>
          </g>
        )}
        {/* cota do cooler */}
        {coolerClr && (
          <text x={coolerBox.x + coolerBox.w + 8} y={coolerBox.y + 12} fill={coolerClr.is_tight ? 'var(--warn)' : 'var(--fresh)'} fontSize="10.5" fontFamily="var(--font-plex-mono), monospace">
            cooler {Math.round(coolerH)}mm · folga {Math.round(coolerClr.remaining_mm)}mm
          </text>
        )}

        {/* PSU */}
        <g data-part="psu" data-variant={vPsu}>{renderPart('psu', vPsu, { x: 100, y: 344, w: 96, h: 48 })}</g>

        {/* fans de entrada (frente) e saída (traseira) */}
        {Array.from({ length: Math.min(3, fanIn) }, (_, i) => {
          const ys = [128, 218, 306]
          return <g key={`in${i}`} data-part="fan" data-variant="fan-120">{renderPart('fan', 'fan-120', { x: 48, y: ys[i] - 26, w: 52, h: 52 }, { spin: cfm > 0 })}</g>
        })}
        {Array.from({ length: Math.min(2, fanOut) }, (_, i) => (
          <g key={`out${i}`} data-part="fan" data-variant="fan-120">{renderPart('fan', 'fan-120', { x: 632, y: 74 + i * 66, w: 48, h: 48 }, { spin: cfm > 0 })}</g>
        ))}

        {/* ── FLUXO DE AR — partículas SMIL (cinza→âmbar→vermelho) ──────── */}
        <g className="flowdots">
          {flowPaths.map((d, pi) =>
            Array.from({ length: flowDots }, (_, di) => {
              const dur = flowDur + pi * 0.5
              const begin = `${-((di / flowDots) * dur + pi * 0.7).toFixed(2)}s`
              return (
                <circle key={`${pi}-${di}`} r={pi === 1 ? 3 : 2.4} fill="#A0A0A0" opacity=".8">
                  <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={d} rotate="0" />
                  <animate attributeName="fill" values="#A0A0A0;#E0A93B;#C85348;#C85348" keyTimes={`0;${pi === 0 ? '0.75' : '0.45'};0.9;1`} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;.85;.85;0" keyTimes="0;.06;.92;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                </circle>
              )
            }),
          )}
        </g>

        {/* rótulo honesto dentro do quadro */}
        <text x={CASE.x + 10} y={CASE.y + CASE.h - 10} fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          estimativa de fluxo · zone_graph v1 · não é medição
        </text>
        <text x={CASE.x + CASE.w - 10} y={CASE.y + CASE.h - 10} textAnchor="end" fill="var(--dim2)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
          viewer 3D em breve
        </text>
      </svg>

      {/* chips de estado */}
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
        {interior.airflow.fans && (
          <span className="mono" style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--dim)' }}>
            {interior.airflow.fans.intake}× entrada · {interior.airflow.fans.exhaust}× saída
          </span>
        )}
      </div>
    </div>
  )
}
