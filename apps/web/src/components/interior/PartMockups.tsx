/**
 * PartMockups — biblioteca de mockups SVG das peças, por tier visual.
 *
 * ARQUITETURA (extensível — "pronta para receber novos modelos"):
 *   - Cada peça é um renderer puro `(box, opts) => JSX` registrado em
 *     `PART_REGISTRY[categoria][variantId]`.
 *   - Adicionar um modelo novo = escrever um renderer e registrá-lo
 *     (uma linha). Nada mais muda: o GabineteVivo pede a variante via
 *     `pickVariant(categoria, hints)` e desenha o que o registry devolver.
 *   - Variantes são mapeadas por TIER visual (entry ≠ flagship), não por SKU
 *     — regra do design doc (emenda 2026-07-06).
 *
 * Variantes atuais (≥2 por categoria):
 *   gpu:          gpu-compact · gpu-dual · gpu-flagship
 *   cooler:       cooler-lowprofile · cooler-tower · cooler-aio
 *   ram:          ram-bare · ram-heatspreader
 *   psu:          psu-basic · psu-modular
 *   storage:      ssd-m2 · ssd-sata
 *   motherboard:  mb-matx · mb-atx
 *   fan:          fan-120 · fan-slim
 *   case_front:   front-mesh · front-solid
 *
 * Todos os desenhos usam SÓ tokens da marca (var(--…)) — GUIA §2.
 */
import type { ReactNode } from 'react'

export type Box = { x: number; y: number; w: number; h: number }
export type MockupOpts = { spin?: boolean; heat?: number; label?: string }
export type MockupRenderer = (box: Box, opts?: MockupOpts) => ReactNode

/* ── primitivas compartilhadas ─────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FanDisc({ cx, cy, r, spin: _spin, dur: _dur }: { cx: number; cy: number; r: number; spin?: boolean; dur?: number }) {
  // Anel + cubo, estático — sem elemento giratório (decisão do founder:
  // pás animadas viravam ruído). A vida da cena é o fluxo de ar, não o rotor.
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="none" stroke="var(--line)" strokeWidth="1" opacity=".6" />
      <circle cx={cx} cy={cy} r={r * 0.2} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
    </g>
  )
}

function finLines(x: number, y: number, w: number, h: number, n: number, vertical = true) {
  const lines = []
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    lines.push(
      vertical
        ? <line key={i} x1={x + w * t} y1={y} x2={x + w * t} y2={y + h} stroke="var(--line)" strokeWidth="1" />
        : <line key={i} x1={x} y1={y + h * t} x2={x + w} y2={y + h * t} stroke="var(--line)" strokeWidth="1" />,
    )
  }
  return lines
}

/* ── GPU ───────────────────────────────────────────────────────────────── */

const gpuBody = (b: Box, fans: number, thick: boolean, flagship: boolean, spin?: boolean) => {
  const r = Math.min(b.h * 0.34, 15)
  const cxs = Array.from({ length: fans }, (_, i) => b.x + b.w * ((i + 1) / (fans + 1)))
  return (
    <g>
      {/* PCB */}
      <rect x={b.x} y={b.y - 4} width={b.w} height={4} rx={1} fill="var(--accent-dim)" />
      {/* shroud */}
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
      {flagship && <rect x={b.x} y={b.y + b.h - 5} width={b.w} height={5} rx={2} fill="var(--accent)" opacity=".8" />}
      {!flagship && <rect x={b.x + 4} y={b.y + b.h - 4} width={b.w * 0.35} height={2.5} rx={1} fill="var(--accent-dim)" />}
      {cxs.map((cx, i) => <FanDisc key={i} cx={cx} cy={b.y + b.h / 2} r={r} spin={spin} dur={2 + i * 0.3} />)}
      {thick && <rect x={b.x} y={b.y - 8} width={b.w} height={4} rx={1} fill="var(--panel)" stroke="var(--line)" strokeWidth=".8" />}
    </g>
  )
}

/* ── registry ──────────────────────────────────────────────────────────── */

export const PART_REGISTRY: Record<string, Record<string, MockupRenderer>> = {
  gpu: {
    'gpu-compact':  (b, o) => gpuBody(b, 1, false, false, o?.spin),
    'gpu-dual':     (b, o) => gpuBody(b, 2, false, false, o?.spin),
    'gpu-flagship': (b, o) => gpuBody(b, 3, true, true, o?.spin),
  },

  cooler: {
    'cooler-lowprofile': (b) => (
      <g>
        <rect x={b.x + b.w * 0.2} y={b.y + b.h * 0.55} width={b.w * 0.6} height={b.h * 0.45} rx={3} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
        {finLines(b.x + b.w * 0.2, b.y + b.h * 0.55, b.w * 0.6, b.h * 0.45, 6)}
        <FanDisc cx={b.x + b.w / 2} cy={b.y + b.h * 0.34} r={Math.min(b.w, b.h) * 0.3} />
      </g>
    ),
    'cooler-tower': (b, o) => (
      <g>
        <rect x={b.x + b.w * 0.28} y={b.y} width={b.w * 0.5} height={b.h} rx={4} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        {finLines(b.x + b.w * 0.28, b.y + 4, b.w * 0.5, b.h - 8, Math.max(5, Math.round(b.h / 9)), false)}
        <rect x={b.x + b.w * 0.3} y={b.y + 2} width={b.w * 0.46} height={3} rx={1.5} fill="var(--accent-dim)" />
        <FanDisc cx={b.x + b.w * 0.14} cy={b.y + b.h * 0.42} r={Math.min(b.w * 0.16, b.h * 0.3)} spin={o?.spin} dur={2.6} />
      </g>
    ),
    'cooler-aio': (b) => (
      <g>
        {/* pump block sobre o socket — o radiador é desenhado no top bay pelo GabineteVivo */}
        <rect x={b.x + b.w * 0.24} y={b.y + b.h * 0.42} width={b.w * 0.52} height={b.h * 0.5} rx={6} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <circle cx={b.x + b.w * 0.5} cy={b.y + b.h * 0.67} r={Math.min(b.w, b.h) * 0.19} fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.6" />
        <circle cx={b.x + b.w * 0.5} cy={b.y + b.h * 0.67} r={Math.min(b.w, b.h) * 0.08} fill="var(--accent-dim)" />
        {/* tubos subindo para o radiador */}
        <path d={`M ${b.x + b.w * 0.36} ${b.y + b.h * 0.45} C ${b.x + b.w * 0.3} ${b.y + b.h * 0.1}, ${b.x + b.w * 0.2} ${b.y - 8}, ${b.x + b.w * 0.1} ${b.y - 14}`} fill="none" stroke="var(--dim2)" strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${b.x + b.w * 0.62} ${b.y + b.h * 0.45} C ${b.x + b.w * 0.58} ${b.y + b.h * 0.06}, ${b.x + b.w * 0.42} ${b.y - 10}, ${b.x + b.w * 0.3} ${b.y - 15}`} fill="none" stroke="var(--dim2)" strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  },

  ram: {
    'ram-bare': (b) => (
      <g>
        {[0, 1].map((i) => (
          <g key={i}>
            <rect x={b.x + i * (b.w * 0.55)} y={b.y} width={b.w * 0.32} height={b.h} rx={1.5} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
            {[0.2, 0.45, 0.7].map((t) => (
              <rect key={t} x={b.x + i * (b.w * 0.55) + b.w * 0.06} y={b.y + b.h * t} width={b.w * 0.2} height={b.h * 0.1} fill="var(--line)" />
            ))}
          </g>
        ))}
      </g>
    ),
    'ram-heatspreader': (b) => (
      <g>
        {[0, 1].map((i) => (
          <g key={i}>
            <path d={`M ${b.x + i * (b.w * 0.55)} ${b.y + b.h} L ${b.x + i * (b.w * 0.55)} ${b.y + 6} L ${b.x + i * (b.w * 0.55) + b.w * 0.19} ${b.y} L ${b.x + i * (b.w * 0.55) + b.w * 0.38} ${b.y + 6} L ${b.x + i * (b.w * 0.55) + b.w * 0.38} ${b.y + b.h} Z`} fill="var(--panel2)" stroke="var(--accent-dim)" strokeWidth="1.2" />
            <rect x={b.x + i * (b.w * 0.55) + b.w * 0.05} y={b.y + 8} width={b.w * 0.28} height={3} rx={1.5} fill="var(--accent)" opacity=".65" />
          </g>
        ))}
      </g>
    ),
  },

  psu: {
    'psu-basic': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <circle cx={b.x + b.h * 0.55} cy={b.y + b.h / 2} r={b.h * 0.32} fill="none" stroke="var(--line)" strokeWidth="1.2" />
        {[0, 60, 120].map((a) => (
          <line key={a} x1={b.x + b.h * 0.55 - b.h * 0.3 * Math.cos((a * Math.PI) / 180)} y1={b.y + b.h / 2 - b.h * 0.3 * Math.sin((a * Math.PI) / 180)} x2={b.x + b.h * 0.55 + b.h * 0.3 * Math.cos((a * Math.PI) / 180)} y2={b.y + b.h / 2 + b.h * 0.3 * Math.sin((a * Math.PI) / 180)} stroke="var(--line)" strokeWidth="1" />
        ))}
      </g>
    ),
    'psu-modular': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <circle cx={b.x + b.h * 0.55} cy={b.y + b.h / 2} r={b.h * 0.32} fill="none" stroke="var(--line)" strokeWidth="1.2" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={b.x + b.w - b.h * 0.9 + i * 7} y={b.y + b.h * 0.3} width={5} height={5} rx={1} fill="var(--accent-dim)" />
        ))}
        <rect x={b.x + b.w - b.h * 0.9} y={b.y + b.h * 0.58} width={26} height={4} rx={2} fill="var(--accent)" opacity=".7" />
      </g>
    ),
  },

  storage: {
    'ssd-m2': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill="var(--panel2)" stroke="var(--accent-dim)" strokeWidth="1" />
        {[0.15, 0.42, 0.68].map((t) => (
          <rect key={t} x={b.x + b.w * t} y={b.y + b.h * 0.22} width={b.w * 0.16} height={b.h * 0.55} rx={1} fill="var(--line)" />
        ))}
        <circle cx={b.x + b.w * 0.95} cy={b.y + b.h / 2} r={1.6} fill="var(--accent)" />
      </g>
    ),
    'ssd-sata': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <rect x={b.x + 4} y={b.y + b.h * 0.3} width={b.w * 0.4} height={b.h * 0.4} rx={1.5} fill="var(--line)" opacity=".5" />
      </g>
    ),
  },

  motherboard: {
    'mb-matx': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w * 0.82} height={b.h * 0.85} rx={6} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
        <path d={`M ${b.x + b.w * 0.1} ${b.y + b.h * 0.75} H ${b.x + b.w * 0.6}`} stroke="var(--line2)" strokeWidth="1" />
        <path d={`M ${b.x + b.w * 0.12} ${b.y + b.h * 0.12} V ${b.y + b.h * 0.6}`} stroke="var(--line2)" strokeWidth="1" />
      </g>
    ),
    'mb-atx': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
        <path d={`M ${b.x + b.w * 0.08} ${b.y + b.h * 0.8} H ${b.x + b.w * 0.8}`} stroke="var(--line2)" strokeWidth="1" />
        <path d={`M ${b.x + b.w * 0.1} ${b.y + b.h * 0.1} V ${b.y + b.h * 0.7}`} stroke="var(--line2)" strokeWidth="1" />
        <path d={`M ${b.x + b.w * 0.3} ${b.y + b.h * 0.15} H ${b.x + b.w * 0.9}`} stroke="var(--line2)" strokeWidth="1" />
      </g>
    ),
  },

  fan: {
    'fan-120': (b, o) => <FanDisc cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={Math.min(b.w, b.h) / 2 - 1} spin={o?.spin} dur={2.4} />,
    'fan-slim': (b, o) => (
      <g opacity=".92">
        <FanDisc cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={Math.min(b.w, b.h) / 2 - 3} spin={o?.spin} dur={2.1} />
      </g>
    ),
  },

  case_front: {
    'front-mesh': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
        {Array.from({ length: Math.floor(b.h / 10) }, (_, r) =>
          Array.from({ length: Math.floor(b.w / 10) }, (_, c) => (
            <circle key={`${r}-${c}`} cx={b.x + 6 + c * 10} cy={b.y + 6 + r * 10} r={1.1} fill="var(--line)" />
          )),
        )}
      </g>
    ),
    'front-solid': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
        <rect x={b.x + b.w * 0.35} y={b.y + 8} width={2} height={b.h - 16} rx={1} fill="var(--line)" />
      </g>
    ),
  },
}

/** Registra um modelo novo em runtime (ou basta editar o objeto acima). */
export function registerPartVariant(category: string, variantId: string, renderer: MockupRenderer) {
  if (!PART_REGISTRY[category]) PART_REGISTRY[category] = {}
  PART_REGISTRY[category][variantId] = renderer
}

/* ── seleção de variante por specs (tier visual) ───────────────────────── */

export type VariantHints = {
  name?: string
  lengthMm?: number
  heightMm?: number
  tdpW?: number
  watts?: number
  ddr?: string
  formFactor?: string
  airflowClass?: string
  sku?: string
}

export function pickVariant(category: string, h: VariantHints = {}): string {
  const name = (h.name ?? '').toLowerCase()
  const sku = (h.sku ?? '').toLowerCase()
  switch (category) {
    case 'gpu': {
      if ((h.lengthMm ?? 0) >= 300 || (h.tdpW ?? 0) >= 300) return 'gpu-flagship'
      if ((h.lengthMm ?? 0) >= 230 || (h.tdpW ?? 0) >= 160) return 'gpu-dual'
      return 'gpu-compact'
    }
    case 'cooler': {
      if (/aio|lf|liquid|360|240|kraken|galahad/.test(name + sku)) return 'cooler-aio'
      if ((h.heightMm ?? 0) > 0 && (h.heightMm ?? 0) < 100) return 'cooler-lowprofile'
      if (/stock|wraith|box/.test(name + sku)) return 'cooler-lowprofile'
      return 'cooler-tower'
    }
    case 'ram':
      return (h.ddr ?? '').toUpperCase() === 'DDR5' || /ddr5/.test(name + sku) ? 'ram-heatspreader' : 'ram-bare'
    case 'psu':
      return (h.watts ?? 0) >= 750 || /rm|gold|modular|a1000/.test(name + sku) ? 'psu-modular' : 'psu-basic'
    case 'storage':
      return /nv|m\.?2|990|sn7|nvme/.test(name + sku) ? 'ssd-m2' : 'ssd-sata'
    case 'motherboard':
      return /matx|m-atx|micro/.test(name + sku + (h.formFactor ?? '').toLowerCase()) ? 'mb-matx' : 'mb-atx'
    case 'fan':
      return 'fan-120'
    case 'case_front':
      return (h.airflowClass ?? '') === 'high' || /mesh|airflow|torrent|216/.test(name + sku) ? 'front-mesh' : 'front-solid'
    default:
      return Object.keys(PART_REGISTRY[category] ?? {})[0] ?? ''
  }
}

/** Desenha `categoria/variante` dentro do box. Fallback: silhueta honesta "em análise". */
export function renderPart(category: string, variantId: string, box: Box, opts?: MockupOpts): ReactNode {
  const r = PART_REGISTRY[category]?.[variantId]
  if (r) return r(box, opts)
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={4} fill="none" stroke="var(--dim2)" strokeWidth="1.2" strokeDasharray="5 4" />
      <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 3} textAnchor="middle" fill="var(--dim2)" fontSize="9" fontFamily="var(--font-plex-mono), monospace">em análise</text>
    </g>
  )
}
