import { notFound } from 'next/navigation'
import {
  getLiveBuildBySlug,
  getLiveFpsByBuild,
  checkLiveCompatibility,
  getLiveProduct,
  getLiveBestOffer,
  getLiveInterior,
} from '@/lib/live-server'
import KingBadge from '@/components/KingBadge'
import FpsBadge from '@/components/FpsBadge'
import CompatibilityChecker from '@/components/CompatibilityChecker'
import GabineteInterior from '@/components/GabineteInterior'
import HarpiaVerdict from '@/components/HarpiaVerdict'
import type { BuildComponents } from '@/lib/repositories/types'
import { gameLabel } from '@/lib/labels'

export const dynamic = 'force-dynamic'

const VALID_RES = ['1080p', '1440p', '4k'] as const
type Res = (typeof VALID_RES)[number]

interface PageProps {
  params: { slug: string }
  searchParams: { res?: string }
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const componentLabels: Array<{ key: keyof BuildComponents; label: string }> = [
  { key: 'cpu_id', label: 'Processador (CPU)' },
  { key: 'motherboard_id', label: 'Placa-mãe' },
  { key: 'ram_id', label: 'Memória RAM' },
  { key: 'gpu_id', label: 'Placa de vídeo (GPU)' },
  { key: 'storage_id', label: 'Armazenamento (SSD)' },
  { key: 'psu_id', label: 'Fonte (PSU)' },
  { key: 'case_id', label: 'Gabinete' },
  { key: 'cooler_id', label: 'Cooler' },
]

export default async function BuildDetailPage({ params, searchParams }: PageProps) {
  const build = await getLiveBuildBySlug(params.slug)
  if (!build) notFound()

  const res: Res = VALID_RES.includes(searchParams.res as Res)
    ? (searchParams.res as Res)
    : '1080p'

  const fpsEstimates = await getLiveFpsByBuild(
    build.components.cpu_id,
    build.components.gpu_id,
    res,
  )

  const components = build.components as unknown as Record<string, number>
  const compat = (await checkLiveCompatibility(components)) ?? {
    errors: [], warnings: [], clearances: {}, checks: [], airflow: [],
  }
  const interior = await getLiveInterior(components)

  const offerEntries = await Promise.all(
    componentLabels.map(async ({ key }) => {
      const productId = build.components[key]
      const product = await getLiveProduct(productId)
      const offer = product ? await getLiveBestOffer(productId) : null
      return { key, product, offer }
    }),
  )

  const allDemo = offerEntries.every(
    (e) => !e.offer || e.offer.merchant.name.toLowerCase().includes('amostra'),
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <div className="mb-3">
          <KingBadge build={build} size="md" />
        </div>
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          {build.title}
        </h1>
        <p className="text-secondary">{build.subtitle}</p>
        <div className="mt-4 flex items-baseline gap-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-secondary">Total</div>
            <div className="num-mono text-3xl font-bold">{formatBRL(build.total_price_brl)}</div>
            {allDemo && (
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                preço de amostra · afiliados em breve
              </div>
            )}
          </div>
          {!build.is_rei_absoluto && build.rs_per_fps_top_game > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-secondary">R$/FPS · CS2 · 1080p</div>
              <div className="num-mono text-3xl font-bold" style={{ color: 'var(--text-mono)' }}>
                {formatBRL(build.rs_per_fps_top_game)}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Veredicto da Harpia */}
      <HarpiaVerdict build={build} />

      {/* Componentes */}
      <section>
        <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          Componentes
        </h2>
        <div className="space-y-2">
          {offerEntries.map(({ key, product, offer }) => {
            if (!product) return null
            const label = componentLabels.find((c) => c.key === key)?.label ?? key
            return (
              <div
                key={key}
                className="card flex items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wider text-secondary mb-1">
                    {label}
                  </div>
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-xs text-secondary">
                    {product.brand} · SKU {product.sku}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num-mono text-lg font-semibold">
                    {offer ? formatBRL(offer.price_brl) : '—'}
                  </div>
                  {offer && (
                    <div className="text-xs text-secondary">
                      {offer.merchant.name.toLowerCase().includes('amostra') ? (
                        <span style={{ opacity: 0.6 }}>amostra · sem afiliado</span>
                      ) : (
                        <a
                          href={`/go/${offer.id}?utm_source=build&utm_medium=detalhe&utm_campaign=${build.slug}`}
                          className="hover:underline"
                          style={{ color: 'var(--accent-gold)' }}
                        >
                          Comprar no {offer.merchant.name} →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* FPS estimado */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-2xl" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            FPS estimado
          </h2>
          {/* Fix 3 — resolução toggle */}
          <div className="flex gap-2" role="group" aria-label="Resolução">
            {VALID_RES.map((r) => (
              <a
                key={r}
                href={`?res=${r}`}
                className="text-sm px-3 py-1 rounded border transition-colors"
                style={{
                  borderColor: r === res ? 'var(--accent-gold)' : 'var(--border)',
                  color: r === res ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: r === res ? 'rgba(212,160,23,0.08)' : 'var(--bg-elevated)',
                  textDecoration: 'none',
                }}
                aria-current={r === res ? 'true' : undefined}
              >
                {r}
              </a>
            ))}
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-secondary border-b border-border">
                <th className="py-2 pr-4">Jogo</th>
                <th className="py-2 pr-4">Preset</th>
                <th className="py-2 pr-8">FPS estimado</th>
              </tr>
            </thead>
            <tbody>
              {fpsEstimates.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-secondary">
                    Sem estimativas para este par CPU+GPU em {res}.
                  </td>
                </tr>
              )}
              {fpsEstimates.map((e) => (
                <tr key={e.id} className="border-b border-border">
                  <td className="py-2 pr-4">{gameLabel(e.game_slug)}</td>
                  <td className="py-2 pr-4">{e.preset}</td>
                  {/* Fix 1 — showBand=true, banda visual activa */}
                  <td className="py-3 pr-4">
                    <FpsBadge estimate={e} showBand size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-secondary mt-3 italic">
            FPS são estimativas calculadas via modelo anchor_scale v1, cruzando benchmarks públicos. Não temos bancada — não testamos "em casa".{' '}
            <a href="/como-medimos" style={{ color: 'var(--accent-gold)' }}>
              Ver metodologia →
            </a>
          </p>
        </div>
      </section>

      {/* Interior do gabinete */}
      {interior && (
        <section>
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            Dentro do gabinete
          </h2>
          <GabineteInterior data={interior} />
        </section>
      )}

      {/* Compatibilidade */}
      <CompatibilityChecker
        errors={compat.errors}
        warnings={compat.warnings}
        clearances={compat.clearances}
        checks={compat.checks}
      />

      {/* CTA */}
      <section className="text-center py-8">
        <p className="text-secondary mb-3">
          Quer adaptar este build? Roda o wizard.
        </p>
        <a href="/wizard" className="btn-ghost">
          Refazer com meu orçamento →
        </a>
      </section>
    </div>
  )
}
