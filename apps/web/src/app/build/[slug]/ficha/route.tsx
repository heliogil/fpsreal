import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLiveBuilds, getLiveInterior } from '@/lib/live-server'
import { C, scoreTone, gabineteSvg } from '@/lib/case-render'

/**
 * FICHA DO GABINETE em alta resolução (PNG 1600×1000).
 *
 * `GET /build/<slug>/ficha` — reaproveita o mesmo pipeline `next/og`
 * (Satori + resvg em WASM) do card social e o MESMO desenho de geometria, para
 * a ficha não contradizer nem a página nem o card.
 *
 * Serve o alcance: é o material que se guarda, imprime ou manda no WhatsApp
 * quando se está a decidir a compra — e leva a régua de integridade junto.
 *
 * INTEGRIDADE: cada número traz a sua origem. Fluxo é ESTIMATIVA (grafo de
 * zonas + campo de potencial), a largura útil é DERIVADA da altura máx. de
 * cooler, e a espessura da GPU é o passo de slot ("típico"). O rodapé diz isso
 * em texto, porque a imagem circula sem a página à volta.
 */
export const runtime = 'nodejs'

const SIZE = { width: 1600, height: 1000 }

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
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
  if (!build) return new Response('build não encontrada', { status: 404 })

  const interior = await getLiveInterior(build.components as unknown as Record<string, number>)
    .catch(() => null)
  const g = interior?.geometry ?? null
  const score = interior?.airflow.score ?? 0
  const tone = scoreTone(score)
  const num = (v: number | null | undefined, suf = 'mm') =>
    v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v)}${suf}`

  const clrGpu = interior?.clearances?.gpu
  const clrCooler = interior?.clearances?.cooler
  const press = interior?.airflow.pressure_balance === 'positive' ? 'positiva'
    : interior?.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'

  type Row = { k: string; v: string; note?: string; tone?: string }
  const dims: Row[] = [
    { k: 'profundidade', v: num(g?.case.depth_mm) },
    { k: 'altura', v: num(g?.case.height_mm) },
    { k: 'largura útil', v: num(g?.case.width_mm), note: g?.case.width_is_derived ? 'derivado' : undefined },
  ]
  const fit: Row[] = [
    {
      k: 'GPU', v: num(interior?.parts.gpu.length_mm),
      note: clrGpu ? `folga ${num(clrGpu.remaining_mm)}` : undefined,
      tone: clrGpu?.is_tight ? C.warn : C.fresh,
    },
    {
      k: 'espessura GPU', v: num(interior?.parts.gpu.thickness_mm),
      note: interior?.parts.gpu.slots ? `${interior.parts.gpu.slots} slots · típico` : 'típico',
    },
    {
      k: 'cooler', v: num(interior?.parts.cooler.height_mm),
      note: clrCooler ? `folga ${num(clrCooler.remaining_mm)}` : undefined,
      tone: clrCooler?.is_tight ? C.warn : C.fresh,
    },
  ]
  const air: Row[] = [
    { k: 'fluxo (estimativa)', v: `${score}/100`, tone },
    { k: 'pressão', v: press },
    { k: 'entrada', v: num(interior?.airflow.intake_cfm, ' CFM') },
    { k: 'saída', v: num(interior?.airflow.exhaust_cfm, ' CFM') },
    { k: 'calor total', v: num(interior?.airflow.heat.total_w, ' W') },
  ]

  const Block = ({ title, rows }: { title: string; rows: Row[] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 26 }}>
      <div style={{ display: 'flex', fontSize: 19, color: C.dim2, letterSpacing: 1, marginBottom: 10 }}>
        {title.toUpperCase()}
      </div>
      {rows.map((r) => (
        <div key={r.k} style={{ display: 'flex', alignItems: 'baseline', marginBottom: 9 }}>
          <div style={{ display: 'flex', width: 250, fontSize: 25, color: C.dim }}>{r.k}</div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: r.tone ?? C.text }}>{r.v}</div>
          {r.note && (
            <div style={{ display: 'flex', fontSize: 19, color: C.dim2, marginLeft: 14 }}>{r.note}</div>
          )}
        </div>
      ))}
    </div>
  )

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, color: C.text, fontFamily: 'Plex', padding: '46px 54px',
      }}>
        {/* cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: `2px solid ${C.line}`, paddingBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 22, color: C.dim2, letterSpacing: 2 }}>FICHA DO GABINETE</div>
            <div style={{ display: 'flex', fontSize: 46, fontWeight: 600, marginTop: 8 }}>
              {(interior?.case.name ?? build.title).slice(0, 42)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 600 }}>
              REI DO <span style={{ color: C.gold, marginLeft: 10 }}>FPS</span>
            </div>
            <div style={{ display: 'flex', fontSize: 19, color: C.dim2, marginTop: 6 }}>reidofps.com.br</div>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, marginTop: 30 }}>
          {/* desenho — mesma geometria do viewer e do card */}
          <div style={{ display: 'flex', width: 660, alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gabineteSvg(interior)} width={640} height={586} alt="" />
          </div>
          {/* números */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: 30 }}>
            <Block title="dimensões" rows={dims} />
            <Block title="encaixe" rows={fit} />
            <Block title="ar" rows={air} />
          </div>
        </div>

        <div style={{ display: 'flex', borderTop: `2px solid ${C.line}`, paddingTop: 18, fontSize: 20, color: C.dim2 }}>
          fluxo e dimensões são ESTIMATIVA — não medição. largura útil derivada da altura máx. de cooler;
          espessura da GPU pelo passo de slot.
        </div>
      </div>
    ),
    { ...SIZE, fonts },
  )
}
