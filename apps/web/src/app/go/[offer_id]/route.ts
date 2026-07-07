import { NextRequest, NextResponse } from 'next/server'
import { getMockRepository } from '@/lib/repositories'

interface RouteParams {
  params: { offer_id: string }
}

/**
 * /go/[offer_id] — redireciona para o link afiliado e registra o clique.
 *
 * Querystring esperado:
 *   ?utm_source=...&utm_medium=...&utm_campaign=...&referer=...
 *
 * Em produção: chama POST /track/click no pcb_api.
 * No mock: apenas loga em window.__reidofps_clicks.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const offerId = parseInt(params.offer_id, 10)
  if (!Number.isFinite(offerId)) {
    return NextResponse.json({ error: 'offer_id inválido' }, { status: 400 })
  }

  const url = new URL(req.url)
  const utm_source = url.searchParams.get('utm_source') ?? undefined
  const utm_medium = url.searchParams.get('utm_medium') ?? undefined
  const utm_campaign = url.searchParams.get('utm_campaign') ?? undefined
  const referer = req.headers.get('referer') ?? undefined

  const repo = getMockRepository()
  // Tracking fire-and-forget.
  void repo.tracking.recordClick(offerId, {
    utm_source,
    utm_medium,
    utm_campaign,
    referer,
  })

  // Resolve offer → URL real.
  const offer = await repo.offers.getByVariant(0).then(() => null)
  // No mock não temos variant_id conhecido, então busca via fallback.
  const offers = await repo.products.search('').then(async () => {
    // Pega direto do mock pelo product_id conhecido.
    return null
  })

  // Como o mock não tem endpoint "offerById", usamos heurística direta.
  const target = await resolveOfferUrl(repo, offerId)

  if (!target) {
    return NextResponse.json(
      { error: 'oferta não encontrada', offer_id: offerId },
      { status: 404 },
    )
  }

  return NextResponse.redirect(target, { status: 302 })
}

async function resolveOfferUrl(
  repo: ReturnType<typeof getMockRepository>,
  offerId: number,
): Promise<string | null> {
  // Mock-only fallback: para o nosso seed, offer_id === id do fixture.
  // Fazemos uma busca via products (não ideal mas funciona sem repo extra).
  const all = await repo.products.getByCategory('cpu')
  for (const p of all) {
    const best = await repo.offers.getBestOffer(p.id)
    if (best && best.id === offerId) return best.url
  }
  return null
}