import type { GeoPlacement, InteriorGeometry, LiveInterior } from '@/lib/live-server'

/**
 * FrontalInset — corte FRONTAL do gabinete (largura × altura).
 *
 * Fecha as três ortográficas: lateral = profundidade×altura, superior =
 * profundidade×largura, e esta = largura×altura.
 *
 * PORQUÊ EXISTE: é a única vista onde a largura útil e a altura estão no mesmo
 * plano — logo, é onde se vê o que DISPUTA a largura do gabinete: a torre do
 * cooler (que cresce da bandeja para o vidro) e a espessura da GPU (nº de
 * slots). Na lateral essas duas medidas estão fora do plano; na superior a
 * altura está. Aqui vê-se quanto do vão cada peça come e o que sobra.
 *
 * HONESTIDADE: `width_mm` é DERIVADO da altura máx. de cooler (que é, por
 * definição, o vão bandeja→tampa) e vem rotulado como derivado. A espessura da
 * GPU vem de `slots × 20.32mm` e é rotulada "típico" — passo de slot é padrão,
 * a espessura real da peça não está no catálogo.
 */
export default function FrontalInset({
  interior, g, hovered, onHover,
}: {
  interior: LiveInterior
  g: InteriorGeometry
  hovered?: string | null
  onHover?: (id: string | null) => void
}) {
  const H = g.case.height_mm
  const W = g.case.width_mm ?? interior.case.max_cooler_height_mm ?? 170
  const derived = g.case.width_is_derived !== false
  const shroud = g.case.shroud_h_mm

  const P = (part: string): GeoPlacement | undefined => g.placements.find((p) => p.part === part)
  const airCooler = P('air_cooler')
  const pump = P('aio_pump')
  const gpu = P('gpu')
  const ram = P('ram')
  const mobo = P('motherboard')

  const coolerH = interior.parts.cooler.height_mm || 0     // vão bandeja→tampa
  const clr = interior.clearances.cooler
  const gpuThick = interior.parts.gpu.thickness_mm ?? null
  const slots = interior.parts.gpu.slots ?? null

  /* ── mm → px (largura na horizontal, altura na vertical) ───────────────── */
  const VW = 720, VH = 250
  const padT = 30, padB = 26
  const availH = VH - padT - padB
  const s = availH / H
  const ox = 96
  const oy = padT
  const X = (x: number) => ox + x * s
  const Y = (y: number) => oy + (H - y) * s      // y=0 no chão
  const caseW = W * s
  const trayX = X(0)                              // bandeja da placa
  const panelX = X(W)                             // tampa/vidro lateral

  const dim = (id: string) => (hovered && hovered !== id ? 0.25 : 1)
  const hov = (id: string) => ({
    onMouseEnter: () => onHover?.(id),
    onMouseLeave: () => onHover?.(null),
  })

  // anotações à direita
  const ax = panelX + 54
  const rows: Array<{ label: string; value: string; tone: string }> = []
  rows.push({ label: 'largura útil', value: `${Math.round(W)}mm${derived ? ' (derivado)' : ''}`, tone: 'var(--dim)' })
  if (coolerH > 0) {
    rows.push({
      label: 'cooler ocupa',
      value: `${Math.round(coolerH)}mm · ${Math.round((coolerH / W) * 100)}% do vão`,
      tone: clr ? (clr.is_tight ? 'var(--warn)' : 'var(--fresh)') : 'var(--dim)',
    })
  }
  if (clr) {
    rows.push({
      label: 'sobra até a tampa',
      value: `${Math.round(clr.remaining_mm)}mm${clr.is_tight ? ' · apertado' : ''}`,
      tone: clr.is_tight ? 'var(--warn)' : 'var(--fresh)',
    })
  }
  if (gpuThick) {
    rows.push({
      label: 'GPU (espessura)',
      value: `${Math.round(gpuThick)}mm${slots ? ` · ${slots} slots` : ''} · típico`,
      tone: 'var(--dim)',
    })
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img"
      aria-label={`Corte frontal: largura útil ${Math.round(W)}mm${derived ? ' derivada' : ''}, cooler ${Math.round(coolerH)}mm`}
      style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)' }}>

      <text x={16} y={16} className="gv-note" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">
        corte frontal · largura × altura — onde o cooler e a GPU disputam o vão
      </text>

      {/* volume interior */}
      <rect x={trayX} y={Y(H)} width={caseW} height={H * s} rx={5}
        fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
      {/* porão sob o shroud */}
      <rect x={trayX} y={Y(shroud)} width={caseW} height={shroud * s}
        fill="var(--panel2)" opacity={0.55} />
      <line x1={trayX} y1={Y(shroud)} x2={panelX} y2={Y(shroud)} stroke="var(--line2)" strokeWidth="1.1" />

      {/* bandeja (esquerda) e tampa de vidro (direita) */}
      <rect x={trayX - 4} y={Y(H)} width={4} height={H * s} fill="var(--panel2)" stroke="var(--line2)" strokeWidth="0.8" />
      <line x1={panelX} y1={Y(H)} x2={panelX} y2={Y(0)} stroke="var(--strong)" strokeWidth="1.4" opacity={0.16} />

      {/* placa-mãe vista de topo: fina, encostada à bandeja */}
      {mobo && (
        <rect x={trayX} y={Y(mobo.y + mobo.h)} width={Math.max(2, 3 * s * 1.2)} height={mobo.h * s}
          fill="var(--accent-dim)" opacity={0.75} />
      )}

      {/* COOLER: cresce da bandeja para o vidro — a medida que na lateral não
          está no plano. É a peça que come mais largura. */}
      {(airCooler || pump) && coolerH > 0 && (() => {
        const p = (airCooler ?? pump)!
        const tone = clr ? (clr.is_tight ? 'var(--warn)' : 'var(--fresh)') : 'var(--dim2)'
        return (
          <g opacity={dim('cooler')} {...hov('cooler')} style={{ cursor: 'default' }}>
            <rect x={trayX} y={Y(p.y + p.h)} width={coolerH * s} height={p.h * s} rx={3}
              fill="var(--panel2)" stroke={tone} strokeWidth="1.3" />
            {/* aletas desenhadas aqui (sem depender de pattern de outro SVG) */}
            {Array.from({ length: Math.max(2, Math.floor((coolerH * s) / 5)) }, (_, i) => (
              <line key={`fin${i}`} x1={trayX + 3 + i * 5} y1={Y(p.y + p.h) + 2}
                x2={trayX + 3 + i * 5} y2={Y(p.y + p.h) + p.h * s - 2}
                stroke="var(--line)" strokeWidth="0.8" opacity={0.5} />
            ))}
          </g>
        )
      })()}

      {/* GPU de topo: espessura real (slots) a partir da bandeja */}
      {gpu && (
        <g opacity={dim('gpu')} {...hov('gpu')} style={{ cursor: 'default' }}>
          <rect x={trayX} y={Y(gpu.y + gpu.h)} width={Math.max(3, (gpuThick ?? 41) * s)} height={gpu.h * s} rx={2}
            fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
        </g>
      )}

      {/* RAM: encostada à bandeja */}
      {ram && (
        <rect x={trayX + 2} y={Y(ram.y + ram.h)} width={Math.max(2, 8 * s)} height={ram.h * s} rx={1.5}
          fill="var(--panel2)" stroke="var(--line)" strokeWidth="0.9" opacity={dim('ram')} />
      )}

      {/* folga do cooler até a tampa: a barra que interessa */}
      {(airCooler || pump) && coolerH > 0 && clr && (() => {
        const p = (airCooler ?? pump)!
        const yMid = Y(p.y + p.h / 2)
        const x0 = trayX + coolerH * s
        if (panelX - x0 < 3) return null
        return (
          <g pointerEvents="none">
            <line x1={x0} y1={yMid} x2={panelX} y2={yMid}
              stroke={clr.is_tight ? 'var(--warn)' : 'var(--fresh)'} strokeWidth="1.2" strokeDasharray="3 3" />
          </g>
        )
      })()}

      {/* régua da largura */}
      <g pointerEvents="none">
        <line x1={trayX} y1={Y(0) + 12} x2={panelX} y2={Y(0) + 12} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
        <line x1={trayX} y1={Y(0) + 9} x2={trayX} y2={Y(0) + 15} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
        <line x1={panelX} y1={Y(0) + 9} x2={panelX} y2={Y(0) + 15} stroke="var(--dim2)" strokeWidth="1" opacity=".5" />
        <text x={(trayX + panelX) / 2} y={Y(0) + 25} textAnchor="middle" className="gv-micro"
          fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">
          {Math.round(W)}mm{derived ? ' · derivado' : ''}
        </text>
      </g>
      <text x={trayX - 8} y={Y(H) - 6} className="gv-micro" fill="var(--dim2)"
        fontFamily="var(--font-plex-mono), monospace">bandeja</text>
      <text x={panelX + 6} y={Y(H) - 6} className="gv-micro" fill="var(--dim2)"
        fontFamily="var(--font-plex-mono), monospace">vidro</text>

      {/* anotações */}
      <g className="gv-hide-sm">
        {rows.map((r, i) => (
          <g key={r.label}>
            <text x={ax} y={padT + 22 + i * 34} className="gv-micro" fill="var(--dim2)"
              fontFamily="var(--font-plex-mono), monospace">{r.label}</text>
            <text x={ax} y={padT + 38 + i * 34} className="gv-label" fill={r.tone}
              fontFamily="var(--font-plex-mono), monospace">{r.value}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
