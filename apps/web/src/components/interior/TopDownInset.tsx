import type { GeoPlacement, InteriorGeometry, LiveInterior } from '@/lib/live-server'

/**
 * TopDownInset — corte SUPERIOR do gabinete (profundidade × largura).
 *
 * PORQUÊ EXISTE: a "altura do cooler" é, fisicamente, a dimensão perpendicular
 * à placa-mãe — ela vai da bandeja até à tampa lateral. Na vista lateral essa
 * medida NÃO está no plano, então desenhá-la na vertical era uma estilização
 * que podia enganar. Aqui ela está no plano: é a única vista onde a folga do
 * cooler pode ser mostrada honestamente.
 *
 * HONESTIDADE: a largura útil (`width_mm`) é DERIVADA da altura máx. de cooler
 * do gabinete (que é, por definição, esse vão) — vem rotulada como derivada.
 * A espessura da GPU não é estimada (não há dado no catálogo): a GPU aparece
 * como faixa fina, sem número.
 */

export default function TopDownInset({
  interior, g, hovered, onHover,
}: {
  interior: LiveInterior
  g: InteriorGeometry
  hovered?: string | null
  onHover?: (id: string | null) => void
}) {
  const D = g.case.depth_mm
  const W = g.case.width_mm ?? interior.case.max_cooler_height_mm ?? 170
  const derived = g.case.width_is_derived !== false

  const P = (part: string): GeoPlacement | undefined => g.placements.find((p) => p.part === part)
  const airCooler = P('air_cooler')
  const pump = P('aio_pump')
  const rad = P('aio_radiator')
  const gpu = P('gpu')

  const coolerH = interior.parts.cooler.height_mm || 0
  const clr = interior.clearances.cooler

  /* ── mm → px (profundidade na horizontal, largura na vertical) ─────────── */
  const VW = 720, VH = 190
  const padL = 58, padR = 58, padT = 26, padB = 34
  const s = Math.min((VW - padL - padR) / D, (VH - padT - padB) / W)
  const ox = padL + ((VW - padL - padR) - D * s) / 2
  const oy = padT
  const X = (x: number) => ox + x * s
  // y=0 é a BANDEJA da placa; y=W é a tampa lateral
  const Y = (y: number) => oy + y * s
  const trayY = Y(0)
  const panelY = Y(W)

  const coolerOk = clr ? !clr.is_tight : true
  const coolerTone = clr ? (clr.is_tight ? 'var(--warn)' : 'var(--fresh)') : 'var(--dim2)'
  const dim = (id: string) => (hovered && hovered !== id ? 0.25 : 1)

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img"
      aria-label={`Corte superior: largura útil ${Math.round(W)}mm (derivada), cooler ${Math.round(coolerH)}mm${clr ? `, folga ${Math.round(clr.remaining_mm)}mm` : ''}`}
      style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--bg)' }}>

      <text x={ox} y={14} className="gv-note" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">
        corte superior · profundidade × largura
      </text>

      {/* chassi visto de cima */}
      <rect x={X(0)} y={trayY} width={D * s} height={W * s} rx={7}
        fill="var(--panel)" stroke="var(--line)" strokeWidth="1.3" />

      {/* bandeja da placa-mãe (parede de referência) e tampa lateral */}
      <line x1={X(0)} y1={trayY} x2={X(D)} y2={trayY} stroke="var(--line)" strokeWidth="2.5" />
      <text x={X(0) - 6} y={trayY + 4} textAnchor="end" className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">bandeja</text>
      <line x1={X(0)} y1={panelY} x2={X(D)} y2={panelY} stroke="var(--line)" strokeWidth="2" strokeDasharray="6 4" opacity=".8" />
      <text x={X(0) - 6} y={panelY + 4} textAnchor="end" className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">tampa</text>

      {/* GPU: comprimento é real; espessura NÃO é estimada (faixa fina, sem número) */}
      {gpu && (() => {
        const gy = Y(W * 0.52)
        return (
          <g opacity={dim('gpu')} onMouseEnter={() => onHover?.('gpu')} onMouseLeave={() => onHover?.(null)}>
            <rect x={X(gpu.x)} y={gy} width={gpu.w * s} height={Math.max(7, 12 * s)} rx={2}
              fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
            <text x={X(gpu.x) + 4} y={gy - 4} className="gv-micro gv-hide-sm" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">
              GPU {Math.round(gpu.w)}mm · espessura não estimada
            </text>
          </g>
        )
      })()}

      {/* COOLER — a peça que só aqui pode ser honesta */}
      {(airCooler || pump) && coolerH > 0 && (() => {
        const base = (airCooler ?? pump)!
        const cx = X(base.x)
        const cw = Math.max(28, base.w * s)
        const ch = coolerH * s
        return (
          <g opacity={dim('cooler')} onMouseEnter={() => onHover?.('cooler')} onMouseLeave={() => onHover?.(null)}>
            {/* corpo do cooler medido a partir da bandeja */}
            <rect x={cx} y={trayY} width={cw} height={ch} rx={3}
              fill="var(--panel2)" stroke={coolerTone} strokeWidth="1.4" />
            <text x={cx + cw / 2} y={trayY + ch / 2 + 3} textAnchor="middle"
              className="gv-cota" fill="var(--text)" fontWeight="600" fontFamily="var(--font-plex-mono), monospace">
              {Math.round(coolerH)}mm
            </text>
            {/* folga até à tampa */}
            {clr && (
              <g>
                <line x1={cx + cw / 2} y1={trayY + ch} x2={cx + cw / 2} y2={panelY}
                  stroke={coolerTone} strokeWidth="1" strokeDasharray="3 3" />
                <text x={cx + cw + 8} y={(trayY + ch + panelY) / 2 + 3}
                  className="gv-cota" fill={coolerTone} fontWeight="600" fontFamily="var(--font-plex-mono), monospace">
                  folga {Math.round(clr.remaining_mm)}mm
                </text>
              </g>
            )}
          </g>
        )
      })()}

      {/* radiador no topo: visto de cima ocupa a profundidade da baia */}
      {rad && (
        <g opacity={dim('rad') * 0.55}>
          <rect x={X(rad.x)} y={trayY + 3} width={rad.w * s} height={Math.max(6, 10 * s)} rx={2}
            fill="none" stroke="var(--warn)" strokeWidth="1" strokeDasharray="5 4" />
          {/* fica visível também no estreito: numa build AIO é a única coisa
              que explica por que este corte aparece quase vazio */}
          <text x={X(rad.x) + 4} y={trayY - 4} className="gv-micro" fill="var(--warn)" fontFamily="var(--font-plex-mono), monospace">
            radiador no topo (acima deste corte)
          </text>
        </g>
      )}

      {/* cota da largura útil */}
      <g>
        <line x1={X(D) + 14} y1={trayY} x2={X(D) + 14} y2={panelY} stroke="var(--dim2)" strokeWidth="1" />
        <line x1={X(D) + 10} y1={trayY} x2={X(D) + 18} y2={trayY} stroke="var(--dim2)" strokeWidth="1" />
        <line x1={X(D) + 10} y1={panelY} x2={X(D) + 18} y2={panelY} stroke="var(--dim2)" strokeWidth="1" />
        <text x={X(D) + 21} y={(trayY + panelY) / 2 - 2} className="gv-micro" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">{Math.round(W)}mm</text>
        <text x={X(D) + 21} y={(trayY + panelY) / 2 + 9} className="gv-micro gv-hide-sm" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">{derived ? 'derivado' : 'spec'}</text>
      </g>

      <text x={ox} y={VH - 6} className="gv-micro gv-hide-sm" fill="var(--dim2)" fontFamily="var(--font-plex-mono), monospace">
        largura útil derivada da altura máx. de cooler · espessura da GPU não estimada
      </text>
    </svg>
  )
}
