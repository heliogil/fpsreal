import type { MetadataRoute } from 'next'

const BASE = 'https://reidofps.com.br'
const API  = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    { url: BASE,                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/pecas`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/wizard`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/meu-pc`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/vs`,           lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/como-medimos`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  let buildEntries: MetadataRoute.Sitemap = []
  try {
    const r = await fetch(`${API}/builds/`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      const builds = (await r.json()) as Array<{ slug: string; is_active: boolean }>
      buildEntries = builds
        .filter((b) => b.is_active)
        .map((b) => ({
          url: `${BASE}/build/${b.slug}`,
          lastModified: new Date(),
          changeFrequency: 'daily' as const,
          priority: 0.9,
        }))
    }
  } catch { /* API indisponível no build — sitemap sem build entries */ }

  return [...statics, ...buildEntries]
}
