import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

interface RouteParams {
  params: { offer_id: string }
}

/**
 * /go/[offer_id] — canonical affiliate redirect with click tracking.
 *
 * This is a thin relay to the ingestion API's `/go/{offer_id}` endpoint,
 * which is the single source of truth: it records the click into
 * `affiliate_clicks` (hashed IP, UTM tags, referer, user-agent, build_id)
 * and 302-redirects to the offer's affiliate URL.
 *
 * We keep the pretty public URL (`/go/5`) and forward the real client IP,
 * referer and user-agent so the recorded click is accurate. The redirect
 * target always comes from our own DB (never from the request), so there is
 * no open-redirect surface.
 *
 * Query string (utm_source, utm_medium, utm_campaign, build_id) is passed
 * through verbatim to the API.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const offerId = parseInt(params.offer_id, 10)
  if (!Number.isFinite(offerId) || offerId <= 0) {
    return NextResponse.json({ error: 'offer_id inválido' }, { status: 400 })
  }

  const search = new URL(req.url).search // '' or '?utm_source=...'
  const apiUrl = `${API}/go/${offerId}${search}`

  // Forward the real client context so the click is attributed correctly.
  // In production nginx sets X-Forwarded-For when the browser hits pcb_web;
  // we relay it to the API (whose _client_ip honours X-Forwarded-For first).
  const headers: Record<string, string> = {}
  const xff = req.headers.get('x-forwarded-for')
  if (xff) headers['x-forwarded-for'] = xff
  const referer = req.headers.get('referer')
  if (referer) headers['referer'] = referer
  const ua = req.headers.get('user-agent')
  if (ua) headers['user-agent'] = ua

  let apiRes: Response
  try {
    // redirect: 'manual' → in the Node runtime undici returns the real 302
    // response with the Location header readable (it does NOT follow it).
    apiRes = await fetch(apiUrl, { redirect: 'manual', headers, cache: 'no-store' })
  } catch {
    // API unreachable — fail closed rather than send the user somewhere wrong.
    return NextResponse.json({ error: 'serviço de redirecionamento indisponível' }, { status: 502 })
  }

  if (apiRes.status === 404) {
    return NextResponse.json({ error: 'oferta não encontrada', offer_id: offerId }, { status: 404 })
  }

  const target = apiRes.headers.get('location')
  if (!target) {
    // 409 (offer without URL) or any unexpected shape.
    return NextResponse.json({ error: 'oferta sem URL de destino', offer_id: offerId }, { status: 502 })
  }

  return NextResponse.redirect(target, { status: 302 })
}
