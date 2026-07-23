import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLiveBuilds, getLiveInterior } from '@/lib/live-server'
import type { LiveInterior } from '@/lib/live-server'

/**
 * Card social por build (og:image + twitter:image).
 *
 * O modelo do negócio é mídia/SEO + afiliado, e cada página de build era
 * partilhada sem imagem própria. Aqui cada build ganha um card único e
 * reconhecível — nome, R$/FPS, score de fluxo e uma silhueta do gabinete
 * DIRIGIDA pelos dados reais (comprimento da GPU, AIO vs torre, pressão).
 *
 * Rasterizado por `next/og` (Satori + resvg em WASM) — sem browser, roda no
 * mesmo Node standalone. Redes sociais rejeitam SVG, por isso sai PNG.
 *
 * INTEGRIDADE: o rodapé diz "estimativa de fluxo, não medição" — a mesma regra
 * de todo o produto viaja no card que circula por aí.
 */

export const runtime = 'nodejs'
export const alt = 'Build gamer no Rei do FPS — custo por FPS e fluxo de ar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// paleta (tema escuro) — hex literais: Satori/resvg não resolvem var(--…)
const C = {
  bg: '#0E0E10', panel: '#17181b', panel2: '#2A2D34', line: '#2b2c30',
  text: '#F4F4F2', dim: '#A0A0A0', dim2: '#6f7175',
  gold: '#C9A24B', goldSoft: '#2a2417',
  fresh: '#7BA86A', warn: '#E0A93B', danger: '#C85348',
}

function scoreTone(s: number) {
  return s >= 70 ? C.fresh : s >= 45 ? C.warn : C.danger
}

/** SVG do gabinete a partir da GEOMETRIA REAL (o mesmo mm→px do viewer, num
 *  subconjunto estático): a caixa do card passa a bater com a da página. Sem
 *  geometria (raro), cai numa silhueta genérica dirigida pelos dados. */
function gabineteSvg(interior: LiveInterior | null): string {
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

export default async function Image({ params }: { params: { slug: string } }) {
  const [mono, monoSemi] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/IBMPlexMono-400.woff')),
    readFile(join(process.cwd(), 'public/fonts/IBMPlexMono-600.woff')),
  ])
  const fonts = [
    { name: 'Plex', data: mono, weight: 400 as const, style: 'normal' as const },
    { name: 'Plex', data: monoSemi, weight: 600 as const, style: 'normal' as const },
  ]

  const builds = await getLiveBuilds()
  const build = builds?.find((b) => b.slug === params.slug)

  // fallback de marca — o crawler recebe imagem mesmo se a build sumir
  if (!build) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', background: C.bg, color: C.text, fontFamily: 'Plex' }}>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 600 }}>
            REI DO <span style={{ color: C.gold, marginLeft: 14 }}>FPS</span>
          </div>
          <div style={{ display: 'flex', marginTop: 16, color: C.dim, fontSize: 26 }}>o melhor R$ por FPS hoje</div>
        </div>
      ),
      { ...size, fonts },
    )
  }

  const interior = await getLiveInterior(build.components as unknown as Record<string, number>).catch(() => null)
  const score = interior?.airflow.score ?? 0
  const tone = scoreTone(score)
  const rsPerFps = build.rs_per_fps_top_game > 0
    ? build.rs_per_fps_top_game.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'
  const caseName = interior?.case.name ?? ''
  const pressao = interior?.airflow.pressure_balance === 'positive' ? 'positiva'
    : interior?.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, color: C.text, fontFamily: 'Plex', padding: 56 }}>
        {/* cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: 1 }}>
            REI DO <span style={{ color: C.gold, marginLeft: 10 }}>FPS</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', fontSize: 20, color: C.dim, border: `1px solid ${C.line}`,
            borderRadius: 99, padding: '6px 18px' }}>custo-benefício</div>
        </div>

        {/* corpo */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 660 }}>
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 600, lineHeight: 1.05 }}>{build.title}</div>
            {caseName && <div style={{ display: 'flex', fontSize: 24, color: C.dim2, marginTop: 10 }}>{caseName}</div>}

            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 34 }}>
              <div style={{ display: 'flex', fontSize: 92, fontWeight: 600, color: C.gold }}>R$ {rsPerFps}</div>
              <div style={{ display: 'flex', fontSize: 30, color: C.dim, marginLeft: 12 }}>/FPS</div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: tone,
                border: `1px solid ${tone}`, borderRadius: 99, padding: '8px 18px' }}>
                fluxo {score} · {score >= 70 ? 'saudável' : score >= 45 ? 'apertado' : 'crítico'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: C.dim,
                border: `1px solid ${C.line}`, borderRadius: 99, padding: '8px 18px' }}>
                {build.fps_top_game} FPS médios
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: C.dim,
                border: `1px solid ${C.line}`, borderRadius: 99, padding: '8px 18px' }}>
                pressão {pressao}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gabineteSvg(interior)} width={430} height={394} alt="" />
        </div>

        {/* rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 22 }}>
          <div style={{ display: 'flex', color: C.gold }}>reidofps.com.br</div>
          <div style={{ display: 'flex', color: C.dim2, marginLeft: 12 }}>· estimativa de fluxo, não medição</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
