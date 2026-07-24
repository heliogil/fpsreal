import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLiveBuilds, getLiveInterior } from '@/lib/live-server'
import { C, scoreTone, gabineteSvg } from '@/lib/case-render'

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
