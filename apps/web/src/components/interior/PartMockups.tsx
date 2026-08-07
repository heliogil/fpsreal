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
 *   case_front:   front-mesh · front-solid
 *
 * Todos os desenhos usam SÓ tokens da marca (var(--…)) — GUIA §2.
 */
import type { ReactNode } from 'react'

export type Box = { x: number; y: number; w: number; h: number }
export type MockupOpts = { spin?: boolean; heat?: number; label?: string }
export type MockupRenderer = (box: Box, opts?: MockupOpts) => ReactNode

/* ── primitivas compartilhadas ─────────────────────────────────────────── */

/**
 * fanBlades — pá de ventoinha real, não só o aro+cubo do FanDisc.
 * Uma pá é um path assimétrico (tipo foice) desenhado uma vez e repetido
 * `bladeCount` vezes por rotação ao redor do centro. Referência: fotos reais
 * de ventoinha de GPU/cooler (blade count típico 9-11, mais fino que largo).
 * Fica DENTRO do raio `r` — nunca ultrapassa (mesma regra do bevel: a
 * silhueta nunca infla pra além da dimensão real da peça).
 */
function fanBlades(cx: number, cy: number, r: number, bladeCount: number, opts?: { hubR?: number; ring?: boolean }) {
  const hubR = opts?.hubR ?? r * 0.2
  const bladeOuterR = r * 0.92
  const bladeInnerR = hubR * 1.15
  // uma pá: do cubo até quase a borda, curvada (foice) — ponto de controle
  // deslocado lateralmente pra dar a curva assimétrica de uma pá real
  const bladePath = `M ${bladeInnerR} 0 Q ${bladeOuterR * 0.55} ${-bladeOuterR * 0.38} ${bladeOuterR} ${-bladeOuterR * 0.12} Q ${bladeOuterR * 0.5} ${bladeOuterR * 0.22} ${bladeInnerR} 0 Z`
  const blades = Array.from({ length: bladeCount }, (_, i) => {
    const angle = (360 / bladeCount) * i
    return (
      <path key={i} d={bladePath} fill="var(--line)" opacity=".55"
        transform={`translate(${cx} ${cy}) rotate(${angle})`} />
    )
  })
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
      {opts?.ring && <circle cx={cx} cy={cy} r={r * 0.86} fill="none" stroke="var(--accent-dim)" strokeWidth="1.2" />}
      {blades}
      <circle cx={cx} cy={cy} r={hubR} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
    </g>
  )
}

/**
 * MaterialDefs — texturas partilhadas, declaradas UMA vez no <defs> do SVG.
 *
 * Servem dois fins: (1) diferenciar materiais (aletas, malha, PCB, chapa
 * escovada) para a cena ler como CORTE DE PRODUTO e não como esquema; (2)
 * baratear o DOM — a malha frontal era desenhada com centenas de <circle>
 * num laço e passa a ser um único fill.
 * `patternUnits="userSpaceOnUse"` mantém a densidade constante em unidades
 * de viewBox (não escala com a peça), que é o que se quer numa textura.
 */
export function MaterialDefs() {
  return (
    <>
      <pattern id="mat-fins-v" patternUnits="userSpaceOnUse" width="4" height="4">
        <line x1="0.5" y1="0" x2="0.5" y2="4" stroke="var(--line)" strokeWidth="1" />
      </pattern>
      <pattern id="mat-fins-h" patternUnits="userSpaceOnUse" width="4" height="4">
        <line x1="0" y1="0.5" x2="4" y2="0.5" stroke="var(--line)" strokeWidth="1" />
      </pattern>
      {/* brilho da iluminação: a luz só aparece quando o descritor a declara
          (ver visuals/schema.py). Usa tokens da marca — o schema não tem campo
          de COR de propósito. */}
      <filter id="mat-glow" x="-45%" y="-45%" width="190%" height="190%">
        <feGaussianBlur stdDeviation="2.1" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <pattern id="mat-mesh" patternUnits="userSpaceOnUse" width="7" height="7">
        <circle cx="3.5" cy="3.5" r="1.05" fill="var(--line)" />
      </pattern>
      {/* trilhas de PCB: têm de SUGERIR o material, não virar papel quadriculado
          — daí o espaçamento largo, o traço fino e a opacidade baixa */}
      <pattern id="mat-pcb" patternUnits="userSpaceOnUse" width="26" height="26">
        <path d="M0 13 H26 M13 0 V26" fill="none" stroke="var(--accent-dim)" strokeWidth=".5" opacity=".18" />
      </pattern>
      <pattern id="mat-brushed" patternUnits="userSpaceOnUse" width="6" height="3">
        <line x1="0" y1="1.5" x2="6" y2="1.5" stroke="var(--strong)" strokeWidth=".5" opacity=".055" />
      </pattern>
    </>
  )
}

/**
 * bevel — chanfro de volume: luz no topo, sombra na base (mesma direção de
 * luz do resto da cena). Transforma silhueta chapada em sólido.
 *
 * INTEGRIDADE: o chanfro é SEMPRE para DENTRO da caixa. A caixa desenhada é a
 * dimensão real em mm — inflar a silhueta para simular volume seria mentir
 * sobre o tamanho da peça.
 */
export function bevel(b: Box, d = 3, r = 2) {
  const dd = Math.max(1, Math.min(d, b.h / 3, b.w / 3))
  return (
    <g pointerEvents="none">
      <path d={`M${b.x + r},${b.y} H${b.x + b.w - r} L${b.x + b.w - r - dd},${b.y + dd} H${b.x + r + dd} Z`}
        fill="var(--strong)" opacity=".08" />
      <path d={`M${b.x + r},${b.y + b.h} H${b.x + b.w - r} L${b.x + b.w - r - dd},${b.y + b.h - dd} H${b.x + r + dd} Z`}
        fill="var(--bg)" opacity=".4" />
    </g>
  )
}

/**
 * shroudPath — contorno do corpo da peça (GPU/cooler/PSU) com corte
 * diagonal nos cantos e crista elevada no topo, em vez do <rect> chapado
 * atual. Intensidade do corte varia por `cut` (mapeia o enum `shroud` do
 * descritor). Referência: foto real de GPU (ASUS RTX 3070 KO, Newegg
 * 14-126-466), que mostra corte diagonal nos 4 cantos + crista central.
 * Corte SEMPRE pra dentro da caixa — nunca ultrapassa b.w/b.h (mesma regra
 * do bevel: a caixa em mm nunca é inflada).
 */
function shroudPath(b: Box, cut: 'flat' | 'dual_tone' | 'angular' | 'industrial'): string {
  const notch = cut === 'industrial' ? b.h * 0.28 : cut === 'angular' ? b.h * 0.2 : b.h * 0.1
  const ridgeH = cut === 'flat' ? 0 : Math.min(3, b.h * 0.06)
  const { x, y, w, h } = b
  // 8 pontos: canto sup-esq cortado, crista, canto sup-dir cortado, desce,
  // canto inf-dir cortado, crista inferior reta, canto inf-esq cortado, fecha
  return [
    `M ${x} ${y + notch}`,
    `L ${x + notch} ${y}`,
    `L ${x + w - notch} ${y}`,
    `L ${x + w} ${y + notch}`,
    ridgeH > 0 ? `L ${x + w} ${y + notch + ridgeH}` : '',
    `L ${x + w} ${y + h - notch}`,
    `L ${x + w - notch} ${y + h}`,
    `L ${x + notch} ${y + h}`,
    `L ${x} ${y + h - notch}`,
    'Z',
  ].filter(Boolean).join(' ')
}

/* `finLines` foi removido: as aletas passaram a ser o padrão `mat-fins-*`,
   que é mais nítido e troca dezenas de <line> por um único fill. */

/* ── GPU ───────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const gpuBody = (b: Box, fans: number, thick: boolean, flagship: boolean, spin?: boolean) => {
  // Conector de força no topo, perto da traseira (mm→px já resolvido pelo caller).
  const pcx = b.x + b.w * (flagship ? 0.66 : 0.72)
  const pw = flagship ? 16 : 12
  return (
    <g>
      {/* backplate (chapa traseira da PCB) */}
      <rect x={b.x - 1.5} y={b.y - 5} width={b.w + 3} height={5.5} rx={1.5} fill="var(--panel)" stroke="var(--line)" strokeWidth=".7" />
      {/* PCB */}
      <rect x={b.x} y={b.y - 4} width={b.w} height={4} rx={1} fill="var(--accent-dim)" />
      {/* conector de força (8-pin / 12VHPWR) */}
      <rect x={pcx} y={b.y - 9} width={pw} height={6} rx={1.4} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
      {Array.from({ length: flagship ? 4 : 3 }, (_, i) => (
        <line key={i} x1={pcx + (pw / (flagship ? 4 : 3)) * (i + 0.5)} y1={b.y - 8.2} x2={pcx + (pw / (flagship ? 4 : 3)) * (i + 0.5)} y2={b.y - 3.8} stroke="var(--line)" strokeWidth="1" />
      ))}
      {/* shroud */}
      <path d={shroudPath(b, flagship ? 'angular' : 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
      <path d={shroudPath(b, flagship ? 'angular' : 'flat')} fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
      {bevel(b, 3, 5)}
      {/* sem descritor real pra essa peça, não fingimos saber a forma do
          recorte de ventilação — o shroud fica liso, só o corte de canto
          (shroudPath) e a marca de acabamento existem sem precisar de dado */}
      {flagship && <rect x={b.x} y={b.y + b.h - 5} width={b.w} height={5} rx={2} fill="var(--accent)" opacity=".8" />}
      {!flagship && <rect x={b.x + 4} y={b.y + b.h - 4} width={b.w * 0.35} height={2.5} rx={1} fill="var(--accent-dim)" />}
      {/* bracket traseiro (I/O) com fendas de ventilação — única quebra real
          de perfil numa GPU, sempre na ponta que encosta no painel do gabinete */}
      <rect x={b.x + b.w - 10} y={b.y + 2} width={9} height={b.h - 4} rx={1} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
      {Array.from({ length: 4 }, (_, i) => (
        <rect key={i} x={b.x + b.w - 8} y={b.y + 6 + i * ((b.h - 12) / 4)} width={5} height={(b.h - 12) / 4 - 2.5} rx={0.8} fill="var(--line)" opacity=".5" />
      ))}
      {thick && <rect x={b.x} y={b.y - 8} width={b.w} height={4} rx={1} fill="var(--panel)" stroke="var(--line)" strokeWidth=".8" />}
    </g>
  )
}

/* ── Placa-mãe (backdrop) ──────────────────────────────────────────────────
   Detalhes que o olho reconhece num relance: I/O shield na traseira,
   dissipadores de VRM flanqueando o socket, socket, slot PCIe (onde a GPU
   encaixa) e heatsink do chipset. wScale/hScale = fração ocupada (mATX < ATX). */
const moboBoard = (b: Box, wScale: number, hScale: number): ReactNode => {
  const bw = b.w * wScale
  const bh = b.h * hScale
  const px = (t: number) => b.x + bw * t
  const py = (t: number) => b.y + bh * t
  return (
    <g>
      {/* PCB */}
      <rect x={b.x} y={b.y} width={bw} height={bh} rx={6} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
      <rect x={b.x} y={b.y} width={bw} height={bh} rx={6} fill="url(#mat-pcb)" className="gv-hide-sm gv-mat-fine" />
      {/* traços do PCB */}
      <path d={`M ${px(0.1)} ${py(0.78)} H ${px(0.62)}`} stroke="var(--line2)" strokeWidth="1" />
      <path d={`M ${px(0.12)} ${py(0.12)} V ${py(0.6)}`} stroke="var(--line2)" strokeWidth="1" />
      {/* I/O shield (traseira do gabinete) */}
      <rect x={px(0.9)} y={py(0.05)} width={bw * 0.09} height={bh * 0.34} rx={2} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
      {[0.09, 0.17, 0.25, 0.33].map((t) => (
        <rect key={t} x={px(0.905)} y={py(t)} width={bw * 0.07} height={bh * 0.05} rx={1} fill="var(--line)" opacity=".6" />
      ))}
      {/* dissipadores de VRM (flanqueando o socket, topo) */}
      {[0.5, 0.74].map((t) => (
        <g key={t}>
          <rect x={px(t)} y={py(0.06)} width={bw * 0.13} height={bh * 0.16} rx={2} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
          <rect x={px(t)} y={py(0.06)} width={bw * 0.13} height={bh * 0.16} fill="url(#mat-fins-v)" />
          {bevel({ x: px(t), y: py(0.06), w: bw * 0.13, h: bh * 0.16 }, 2, 2)}
        </g>
      ))}
      {/* socket da CPU */}
      <rect x={px(0.52)} y={py(0.3)} width={bw * 0.2} height={bh * 0.2} rx={2} fill="none" stroke="var(--line)" strokeWidth="1" opacity=".7" />
      {/* slot PCIe — onde a GPU encaixa (borda frontal do board) */}
      <rect x={px(0.02)} y={py(0.6)} width={bw * 0.34} height={bh * 0.045} rx={1.5} fill="var(--accent-dim)" />
      {/* heatsink do chipset */}
      <rect x={px(0.58)} y={py(0.68)} width={bw * 0.16} height={bh * 0.14} rx={2} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
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
    'cooler-lowprofile': (b) => {
      const lp = { x: b.x + b.w * 0.2, y: b.y + b.h * 0.55, w: b.w * 0.6, h: b.h * 0.45 }
      return (
        <g>
          <path d={shroudPath(lp, 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
          <rect x={lp.x} y={lp.y} width={lp.w} height={lp.h} fill="url(#mat-fins-v)" opacity=".9" />
          {bevel(lp, 2, 3)}
          {fanBlades(b.x + b.w / 2, b.y + b.h * 0.34, Math.min(b.w, b.h) * 0.3, 9)}
        </g>
      )
    },
    'cooler-tower': (b) => {
      const tw = { x: b.x + b.w * 0.28, y: b.y, w: b.w * 0.5, h: b.h }
      return (
        <g>
          <path d={shroudPath(tw, 'angular')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
          <rect x={tw.x} y={tw.y + 3} width={tw.w} height={tw.h - 6} fill="url(#mat-fins-h)" opacity=".9" />
          {bevel(tw, 3, 4)}
          <rect x={b.x + b.w * 0.3} y={b.y + 2} width={b.w * 0.46} height={3} rx={1.5} fill="var(--accent-dim)" />
          {fanBlades(b.x + b.w * 0.14, b.y + b.h * 0.42, Math.min(b.w * 0.16, b.h * 0.3), 9)}
        </g>
      )
    },
    'cooler-aio-pump': (b) => {
      /* water block sobre a CPU — corpo + bracket de montagem + cap com anel
         + barbs (entradas dos tubos) no topo. Os tubos até o radiador são
         desenhados pelo GabineteVivo a partir das posições reais. */
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.min(b.w, b.h)
      const bx = R * 0.32
      return (
        <g>
          {/* bracket de montagem em X (parafusos nos cantos) */}
          <line x1={b.x + 5} y1={b.y + 5} x2={b.x + b.w - 5} y2={b.y + b.h - 5} stroke="var(--line)" strokeWidth="1" />
          <line x1={b.x + b.w - 5} y1={b.y + 5} x2={b.x + 5} y2={b.y + b.h - 5} stroke="var(--line)" strokeWidth="1" />
          {[[b.x + 4, b.y + 4], [b.x + b.w - 4, b.y + 4], [b.x + 4, b.y + b.h - 4], [b.x + b.w - 4, b.y + b.h - 4]].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={1.6} fill="var(--panel)" stroke="var(--line)" strokeWidth=".8" />
          ))}
          {/* barbs no topo (onde os tubos encaixam) */}
          <rect x={cx - bx - 3} y={b.y - 6} width={6} height={7} rx={2} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
          <rect x={cx + bx - 3} y={b.y - 6} width={6} height={7} rx={2} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
          {/* corpo do bloco */}
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
          {bevel(b, 3, 7)}
          {/* cap central iluminado */}
          <circle cx={cx} cy={cy} r={R * 0.3} fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx={cx} cy={cy} r={R * 0.3} fill="var(--accent-soft)" />
          <circle cx={cx} cy={cy} r={R * 0.11} fill="var(--accent-dim)" />
        </g>
      )
    },
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
        <path d={shroudPath(b, 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <path d={shroudPath(b, 'flat')} fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
        {bevel(b, 3, 4)}
        {fanBlades(b.x + b.h * 0.55, b.y + b.h / 2, b.h * 0.32, 7)}
      </g>
    ),
    'psu-modular': (b) => (
      <g>
        <path d={shroudPath(b, 'industrial')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        <path d={shroudPath(b, 'industrial')} fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
        {bevel(b, 3, 4)}
        {fanBlades(b.x + b.h * 0.55, b.y + b.h / 2, b.h * 0.32, 7)}
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
    'mb-matx': (b) => moboBoard(b, 0.82, 0.85),
    'mb-atx': (b) => moboBoard(b, 1, 1),
  },

  case_front: {
    'front-mesh': (b) => (
      <g>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="url(#mat-mesh)" />
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

/* ── RENDER POR DESCRITOR (ingestor de modelos) ────────────────────────────
   O ingestor não gera desenho: gera um descritor de APARÊNCIA validado contra a
   ficha técnica. Aqui ele vira peça — sempre DENTRO da caixa em mm que o motor
   mandou, e sempre com tokens da marca. Sem descritor (ou categoria sem suporte)
   devolve `null` e o chamador cai na variante de TIER: regressão zero.

   Ver spec: 2026-07-23-viewer-2d-ingestor-de-modelos-design.md */

export type VisualDescriptor = Record<string, string | number | boolean>

const D_GPU = (b: Box, d: VisualDescriptor): ReactNode => {
  const fans = Math.max(0, Math.min(4, Number(d.fans ?? 2)))
  const style = String(d.fan_style ?? 'blade')
  const shroud = String(d.shroud ?? 'flat')
  const vent = String(d.vent_cut ?? 'none')
  const accent = String(d.accent ?? 'none')
  const backplate = d.backplate === true
  const power = String(d.power ?? 'none')
  const lit = String(d.lighting ?? 'none')
  const r = Math.min(b.h * 0.34, 15)
  const cxs = Array.from({ length: fans }, (_, i) => b.x + b.w * ((i + 1) / (fans + 1)))
  const pins = power === '12vhpwr' ? 4 : power === '8x2' ? 4 : power === '8pin' ? 3 : power === '6pin' ? 2 : 0
  const pw = power === '12vhpwr' ? 16 : 12
  const pcx = b.x + b.w * 0.68
  return (
    <g>
      {backplate && <rect x={b.x - 1.5} y={b.y - 5} width={b.w + 3} height={5.5} rx={1.5} fill="var(--panel)" stroke="var(--line)" strokeWidth=".7" />}
      <rect x={b.x} y={b.y - 4} width={b.w} height={4} rx={1} fill="var(--accent-dim)" />
      {pins > 0 && (
        <g>
          <rect x={pcx} y={b.y - 9} width={pw} height={6} rx={1.4} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
          {Array.from({ length: pins }, (_, i) => (
            <line key={i} x1={pcx + (pw / pins) * (i + 0.5)} y1={b.y - 8.2} x2={pcx + (pw / pins) * (i + 0.5)} y2={b.y - 3.8} stroke="var(--line)" strokeWidth="1" />
          ))}
        </g>
      )}
      <path d={shroudPath(b, shroud as 'flat' | 'dual_tone' | 'angular' | 'industrial')}
        fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
      {shroud === 'dual_tone' && <rect x={b.x} y={b.y} width={b.w} height={b.h * 0.42} rx={5} fill="var(--panel)" opacity=".55" />}
      <path d={shroudPath(b, shroud as 'flat' | 'dual_tone' | 'angular' | 'industrial')}
        fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
      {vent === 'diagonal' && Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={b.x + 8 + i * 9} y1={b.y + b.h - 4} x2={b.x + 16 + i * 9} y2={b.y + 5} stroke="var(--line)" strokeWidth="1" opacity=".5" />
      ))}
      {vent === 'slot' && Array.from({ length: 3 }, (_, i) => (
        <rect key={i} x={b.x + 7 + i * 7} y={b.y + 5} width={2.5} height={b.h - 10} rx={1} fill="var(--line)" opacity=".45" />
      ))}
      {vent === 'hex' && <rect x={b.x + 5} y={b.y + 4} width={Math.max(0, b.w - 10)} height={Math.max(0, b.h - 8)} fill="url(#mat-mesh)" opacity=".5" />}
      {/* recorte de ventilação: só desenha se a ficha técnica REAL da peça
          declarar um (vent_cut acima) — sem descritor, o shroud fica liso.
          Bracket traseiro com fendas é universal (toda GPU tem um), esse
          sim desenha sempre. */}
      <rect x={b.x + b.w - 10} y={b.y + 2} width={9} height={b.h - 4} rx={1} fill="var(--panel)" stroke="var(--line)" strokeWidth="1" />
      {Array.from({ length: 4 }, (_, i) => (
        <rect key={i} x={b.x + b.w - 8} y={b.y + 6 + i * ((b.h - 12) / 4)} width={5} height={(b.h - 12) / 4 - 2.5} rx={0.8} fill="var(--line)" opacity=".5" />
      ))}
      {bevel(b, 3, shroud === 'industrial' ? 2 : 5)}
      {accent === 'strip_bottom' && <rect x={b.x} y={b.y + b.h - 5} width={b.w} height={5} rx={2} fill="var(--accent)" opacity=".8" />}
      {accent === 'edge' && <rect x={b.x + 4} y={b.y + b.h - 4} width={b.w * 0.35} height={2.5} rx={1} fill="var(--accent-dim)" />}
      {accent === 'plate' && <rect x={b.x + b.w * 0.62} y={b.y + 4} width={b.w * 0.3} height={5} rx={2} fill="var(--accent-dim)" />}
      {lit !== 'none' && (
        <g filter="url(#mat-glow)" pointerEvents="none">
          {(lit === 'fans' || lit === 'full') && cxs.map((cx, i) => (
            <circle key={`lf${i}`} cx={cx} cy={b.y + b.h / 2} r={r * 0.88} fill="none"
              stroke="var(--accent-2)" strokeWidth="1.8" opacity=".7" />
          ))}
          {(lit === 'edge' || lit === 'full') && (
            <rect x={b.x + 2} y={b.y + b.h - 3.6} width={Math.max(0, b.w - 4)} height={2.4} rx={1.2}
              fill="var(--accent-2)" opacity=".85" />
          )}
          {(lit === 'logo' || lit === 'full') && (
            <rect x={b.x + b.w * 0.62} y={b.y + 3} width={b.w * 0.3} height={3.6} rx={1.8}
              fill="var(--accent-2)" opacity=".85" />
          )}
        </g>
      )}
      {/* pá/rotor NUNCA aparece aqui — este corte mostra o perfil do cartão,
          a face onde o fan gira não fica voltada pra esta vista. O duto do
          blower é a exceção legítima: sai pela lateral, isso sim é visível. */}
      {style === 'blower' && cxs.map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy={b.y + b.h / 2} r={r * 0.8} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
          <rect x={cx + r} y={b.y + b.h * 0.3} width={b.w * 0.25} height={b.h * 0.4} rx={2} fill="var(--panel)" stroke="var(--line)" strokeWidth=".8" />
        </g>
      ))}
    </g>
  )
}

const D_COOLER = (b: Box, d: VisualDescriptor): ReactNode => {
  const kind = String(d.kind ?? 'tower')
  const towers = Math.max(1, Math.min(2, Number(d.towers ?? 1)))
  const fin = String(d.fin_style ?? 'dense')
  const plate = String(d.top_plate ?? 'none')
  const sideFan = d.side_fan === true
  const lit = String(d.lighting ?? 'none')
  if (kind === 'aio') return PART_REGISTRY.cooler['cooler-aio-pump'](b)
  if (kind === 'low_profile') {
    const lp = { x: b.x + b.w * 0.2, y: b.y + b.h * 0.55, w: b.w * 0.6, h: b.h * 0.45 }
    return (
      <g>
        <path d={shroudPath(lp, 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
        <rect x={lp.x} y={lp.y} width={lp.w} height={lp.h} fill={fin === 'open' ? 'url(#mat-fins-v)' : 'url(#mat-fins-h)'} opacity=".9" />
        {bevel(lp, 2, 3)}
        {fanBlades(b.x + b.w / 2, b.y + b.h * 0.32, Math.min(b.w, b.h) * 0.3, 9)}
      </g>
    )
  }
  const tw = towers === 2 ? b.w * 0.3 : b.w * 0.5
  const gap = towers === 2 ? b.w * 0.08 : 0
  const x0 = b.x + (b.w - (tw * towers + gap * (towers - 1))) / 2
  return (
    <g>
      {Array.from({ length: towers }, (_, i) => {
        const tx = x0 + i * (tw + gap)
        return (
          <g key={i}>
            <path d={shroudPath({ x: tx, y: b.y, w: tw, h: b.h }, 'angular')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
            <rect x={tx} y={b.y + 3} width={tw} height={b.h - 6} fill={fin === 'open' ? 'url(#mat-fins-v)' : 'url(#mat-fins-h)'} opacity=".9" />
            {bevel({ x: tx, y: b.y, w: tw, h: b.h }, 3, 4)}
          </g>
        )
      })}
      {plate !== 'none' && <rect x={x0} y={b.y + 1} width={tw * towers + gap * (towers - 1)} height={4} rx={2} fill={plate === 'logo_plate' ? 'var(--accent-dim)' : 'var(--panel)'} stroke="var(--line)" strokeWidth=".8" />}
      {sideFan && fanBlades(b.x + b.w * 0.13, b.y + b.h * 0.42, Math.min(b.w * 0.15, b.h * 0.28), 9)}
      {lit !== 'none' && (
        <g filter="url(#mat-glow)" pointerEvents="none">
          {(lit === 'ring' || lit === 'full') && (
            <circle cx={b.x + b.w / 2} cy={b.y + 5} r={Math.min(b.w, b.h) * 0.16} fill="none"
              stroke="var(--accent-2)" strokeWidth="1.8" opacity=".75" />
          )}
          {(lit === 'logo' || lit === 'full') && (
            <rect x={x0} y={b.y + 1} width={tw * towers + gap * (towers - 1)} height={3} rx={1.5}
              fill="var(--accent-2)" opacity=".8" />
          )}
        </g>
      )}
    </g>
  )
}

const D_PSU = (b: Box, d: VisualDescriptor): ReactNode => {
  const cabling = String(d.cabling ?? 'fixed')
  const grill = String(d.grill ?? 'round')
  const fanPos = String(d.fan_pos ?? 'bottom')
  const fcx = fanPos === 'rear' ? b.x + b.w - b.h * 0.55 : b.x + b.h * 0.55
  return (
    <g>
      <path d={shroudPath(b, 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
      <path d={shroudPath(b, 'flat')} fill="url(#mat-brushed)" className="gv-hide-sm gv-mat-fine" />
      {bevel(b, 3, 4)}
      {fanBlades(fcx, b.y + b.h / 2, b.h * 0.32, 7)}
      {grill === 'honeycomb' && (
        <circle cx={fcx} cy={b.y + b.h / 2} r={b.h * 0.34} fill="url(#mat-mesh)" opacity=".35" stroke="var(--line)" strokeWidth="1.2" />
      )}
      {grill === 'slot' && Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1={fcx - b.h * 0.3 + i * (b.h * 0.2)} y1={b.y + b.h * 0.2} x2={fcx - b.h * 0.3 + i * (b.h * 0.2)} y2={b.y + b.h * 0.8} stroke="var(--line)" strokeWidth="1" opacity=".6" />
      ))}
      {cabling !== 'fixed' && Array.from({ length: cabling === 'modular' ? 4 : 2 }, (_, i) => (
        <rect key={i} x={b.x + b.w - b.h * 0.9 + i * 7} y={b.y + b.h * 0.3} width={5} height={5} rx={1} fill="var(--accent-dim)" />
      ))}
      {cabling === 'modular' && <rect x={b.x + b.w - b.h * 0.9} y={b.y + b.h * 0.58} width={26} height={4} rx={2} fill="var(--accent)" opacity=".7" />}
    </g>
  )
}

const D_CASE_FRONT = (b: Box, d: VisualDescriptor): ReactNode => {
  const surface = String(d.surface ?? 'solid')
  const cut = String(d.cut ?? 'none')
  const lit = String(d.lighting ?? 'none')
  const fill = surface === 'glass' ? 'var(--panel)' : 'var(--panel2)'
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={fill} stroke="var(--line)" strokeWidth="1" />
      {(surface === 'mesh' || surface === 'hybrid') && (
        <rect x={b.x} y={surface === 'hybrid' ? b.y + b.h * 0.45 : b.y} width={b.w}
          height={surface === 'hybrid' ? b.h * 0.55 : b.h} rx={4} fill="url(#mat-mesh)" />
      )}
      {surface === 'glass' && <rect x={b.x + 1} y={b.y + 1} width={Math.max(0, b.w - 2)} height={Math.max(0, b.h - 2)} rx={3} fill="var(--strong)" opacity=".04" />}
      {surface === 'solid' && <rect x={b.x + b.w * 0.35} y={b.y + 8} width={2} height={Math.max(0, b.h - 16)} rx={1} fill="var(--line)" />}
      {cut === 'side_intake' && <rect x={b.x} y={b.y + b.h * 0.1} width={2.5} height={b.h * 0.8} rx={1} fill="var(--fresh)" opacity=".5" />}
      {cut === 'slit' && Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={b.x + 2} y={b.y + b.h * (0.12 + i * 0.13)} width={Math.max(0, b.w - 4)} height={2} rx={1} fill="var(--line)" opacity=".5" />
      ))}
      {lit !== 'none' && (
        <g filter="url(#mat-glow)" pointerEvents="none">
          {lit === 'strip' && (
            <rect x={b.x + b.w - 3.2} y={b.y + b.h * 0.08} width={2.4} height={b.h * 0.84} rx={1.2}
              fill="var(--accent-2)" opacity=".8" />
          )}
          {lit === 'ring' && (
            <circle cx={b.x + b.w / 2} cy={b.y + b.h * 0.5} r={Math.min(b.w, b.h) * 0.3} fill="none"
              stroke="var(--accent-2)" strokeWidth="1.8" opacity=".75" />
          )}
        </g>
      )}
    </g>
  )
}

const DESCRIPTOR_RENDERERS: Record<string, (b: Box, d: VisualDescriptor) => ReactNode> = {
  gpu: D_GPU, cooler: D_COOLER, psu: D_PSU, case_front: D_CASE_FRONT,
}

/** Desenha a peça a partir do descritor aprovado. `null` ⇒ cai no tier. */
export function renderFromDescriptor(category: string, d: VisualDescriptor | undefined, box: Box): ReactNode | null {
  if (!d) return null
  const fn = DESCRIPTOR_RENDERERS[category]
  if (!fn) return null
  try {
    return fn(box, d)
  } catch {
    return null // descritor estranho nunca derruba o viewer — cai no tier
  }
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
