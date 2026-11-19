import { adsConfig, publisherId } from '@/lib/ads'

// O ads.txt diz aos compradores de anúncio quem pode vender o nosso espaço.
// Só existe quando os anúncios estão ligados (ADSENSE_CLIENT) — antes disso, 404.
export const dynamic = 'force-dynamic'

export function GET() {
  const cfg = adsConfig()
  if (!cfg) return new Response('Not found', { status: 404 })
  // f08c47fec0942fa0 = ID fixo da Google na especificação ads.txt (IAB)
  return new Response(`google.com, ${publisherId(cfg.client)}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
