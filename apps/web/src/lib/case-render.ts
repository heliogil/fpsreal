import type { LiveInterior } from '@/lib/live-server'

/**
 * Desenho partilhado do gabinete para saídas RASTERIZADAS (next/og).
 *
 * Usado pelo card social (`opengraph-image`) e pela ficha de alta resolução
 * (`/build/<slug>/ficha`). Vive aqui para os dois falarem a MESMA geometria —
 * a caixa da imagem tem de bater com a da página, senão o material que circula
 * por aí contradiz o produto.
 *
 * Satori/resvg não resolvem `var(--…)`: a paleta é hex literal, espelhando os
 * tokens do tema escuro.
 */
// paleta (tema escuro) — hex literais: Satori/resvg não resolvem var(--…)
export const C = {
  bg: '#0E0E10', panel: '#17181b', panel2: '#2A2D34', line: '#2b2c30',
  text: '#F4F4F2', dim: '#A0A0A0', dim2: '#6f7175',
  gold: '#C9A24B', goldSoft: '#2a2417',
  fresh: '#7BA86A', warn: '#E0A93B', danger: '#C85348',
}

export function scoreTone(s: number) {
  return s >= 70 ? C.fresh : s >= 45 ? C.warn : C.danger
}

/** SVG do gabinete a partir da GEOMETRIA REAL (o mesmo mm→px do viewer, num
 *  subconjunto estático): a caixa do card passa a bater com a da página. Sem
 *  geometria (raro), cai numa silhueta genérica dirigida pelos dados. */
export function gabineteSvg(interior: LiveInterior | null): string {
  const VW = 470, VH = 430
  const score = interior?.airflow.score ?? 0
  const tone = scoreTone(score)
  const g = interior?.geometry
  const rects: string[] = []

  if (g) {
    // mm→px idêntico ao GabineteVivo, mas mapeado para este viewBox do card
    const D = g.case.depth_mm, H = g.case.height_mm
    const s = Math.min((VW - 70) / D, (VH - 60) / H)
    const ox = 35 + ((VW - 70) - D * s) / 2
    const oy = 26 + ((VH - 60) - H * s) / 2
    const bx = (p: { x: number; y: number; w: number; h: number }) => ({
      x: ox + p.x * s, y: oy + (H - p.y - p.h) * s, w: p.w * s, h: p.h * s,
    })
    const P = (part: string) => g.placements.find((p) => p.part === part)
    rects.push(`<rect x="${ox}" y="${oy}" width="${(D * s).toFixed(1)}" height="${(H * s).toFixed(1)}" rx="14" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>`)
    const draw = (part: string, fill: string, stroke = C.line) => {
      const p = P(part); if (!p) return
      const b = bx(p)
      rects.push(`<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`)
    }
    draw('motherboard', C.panel)
    draw('psu', C.panel2)
    draw('aio_radiator', C.panel2, C.gold)
    draw('air_cooler', C.panel2)
    draw('aio_pump', C.panel2, C.gold)
    // GPU realçada + zona de calor tonalizada pelo score
    const gp = P('gpu')
    if (gp) {
      const b = bx(gp)
      rects.push(`<circle cx="${(b.x + b.w / 2).toFixed(1)}" cy="${(b.y + b.h / 2).toFixed(1)}" r="${Math.min(b.w, 90).toFixed(0)}" fill="${tone}" opacity="0.12"/>`)
      rects.push(`<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="4" fill="${C.panel2}" stroke="${C.line}" stroke-width="1.4"/>`)
    }
    // marcas de entrada/saída
    rects.push(`<line x1="${ox}" y1="${oy + H * s * 0.35}" x2="${ox}" y2="${oy + H * s * 0.7}" stroke="${C.fresh}" stroke-width="5" stroke-linecap="round"/>`)
    rects.push(`<line x1="${(ox + D * s).toFixed(1)}" y1="${oy + H * s * 0.35}" x2="${(ox + D * s).toFixed(1)}" y2="${oy + H * s * 0.62}" stroke="${C.warn}" stroke-width="5" stroke-linecap="round"/>`)
  } else {
    rects.push(`<rect x="40" y="24" width="390" height="382" rx="16" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>`)
    rects.push(`<rect x="90" y="250" width="260" height="52" rx="6" fill="${C.panel2}" stroke="${C.line}"/>`)
    rects.push(`<circle cx="215" cy="150" r="60" fill="${tone}" opacity="0.10"/>`)
  }
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">${rects.join('')}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
}
