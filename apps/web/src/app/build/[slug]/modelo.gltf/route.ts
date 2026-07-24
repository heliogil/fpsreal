import { getLiveBuilds } from '@/lib/live-server'

/**
 * `GET /build/<slug>/modelo.gltf` — o gabinete em 3D, pronto a abrir.
 *
 * O motor expõe o modelo em `POST /interior/model.gltf` (precisa do corpo com
 * os componentes); esta rota resolve o build pelo slug e devolve o ficheiro num
 * GET, para poder ser aberto/arrastado direto para qualquer visualizador glTF
 * (Blender, Windows 3D Viewer, gltf-viewer.donmccurdy.com).
 *
 * A malha é gerada pelo MOTOR a partir das mesmas placements em mm que desenham
 * a vista 2D — não há um segundo gerador de dimensão, logo o 3D não pode
 * divergir do que a página afirma. Continua a ser ESTIMATIVA dimensional, e o
 * rótulo viaja dentro do próprio ficheiro (`asset.extras`).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const builds = await getLiveBuilds()
  const build = builds?.find((b) => b.slug === params.slug)
  if (!build) return new Response('build não encontrada', { status: 404 })

  const res = await fetch(`${API}/interior/model.gltf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ components: build.components }),
    cache: 'no-store',
  }).catch(() => null)

  if (!res || !res.ok) {
    return new Response('modelo indisponível para esta build', { status: 502 })
  }

  return new Response(await res.text(), {
    headers: {
      'content-type': 'model/gltf+json; charset=utf-8',
      'content-disposition': `attachment; filename="${params.slug}.gltf"`,
      'cache-control': 'public, max-age=300',
    },
  })
}
