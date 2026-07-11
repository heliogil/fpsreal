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

interface PageProps {
  params: { slug: string }
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

export default async function BuildDetailPage({ params }: PageProps) {
  const build = await getLiveBuildBySlug(params.slug)
  if (!build) notFound()

  const fpsEstimates = await getLiveFpsByBuild(
    build.components.cpu_id,
    build.components.gpu_id,
  )

  const components = build.components as unknown as Record<string, number>
  const compat = (await checkLiveCompatibility(components)) ?? {
    errors: [], warnings: [], clearances: {}, checks: [], airflow: [],
  }
  const interior = await getLiveInterior(components)

  // Best offer per component (parallel), from the live catalog.
  const offerEntries = await Promise.all(
    componentLabels.map(async ({ key }) => {
      const productId = build.components[key]
      const product = await getLiveProduct(productId)
      const offer = product ? await getLiveBestOffer(productId) : null
      return { key, product, offer }
    }),
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
        <div className="mt-4 flex items-baseline gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-secondary">Total</div>
            <div className="num-mono text-3xl font-bold">{formatBRL(build.total_price_brl)}</div>
          </div>
          {!build.is_rei_absoluto && build.rs_per_fps_top_game > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-secondary">R$/FPS (top game)</div>
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
                    <a
                      href={`/go/${offer.id}?utm_source=build&utm_medium=detalhe&utm_campaign=${build.slug}`}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--accent-gold)' }}
                    >
                      Comprar no {offer.merchant.name} →
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* FPS estimado */}
      <section>
        <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          FPS estimado
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-secondary border-b border-border">
                <th className="py-2 pr-4">Jogo</th>
                <th className="py-2 pr-4">Resolução</th>
                <th className="py-2 pr-4">Preset</th>
                <th className="py-2 pr-4">FPS estimado</th>
                <th className="py-2 pr-4">Banda</th>
              </tr>
            </thead>
            <tbody>
              {fpsEstimates.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-secondary">
                    Sem estimativas para este par CPU+GPU.
                  </td>
                </tr>
              )}
              {fpsEstimates.map((e) => (
                <tr key={e.id} className="border-b border-border">
                  <td className="py-2 pr-4">{gameLabel(e.game_slug)}</td>
                  <td className="py-2 pr-4 num-mono">{e.resolution}</td>
                  <td className="py-2 pr-4">{e.preset}</td>
                  <td className="py-2 pr-4">
                    <FpsBadge estimate={e} showBand={false} size="sm" />
                  </td>
                  <td className="py-2 pr-4 text-secondary text-xs">
                    <span className="num-mono">±{e.confidence_band_pct}%</span> · {e.sources.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-secondary mt-3 italic">
            FPS são estimativas calculadas via modelo anchor_scale v1, cruzando benchmarks públicos. Não temos bancada — não testamos “em casa”.{' '}
            <a href="/como-medimos" style={{ color: 'var(--accent-gold)' }}>
              Ver metodologia →
            </a>
          </p>
        </div>
      </section>

      {/* Interior do gabinete — encaixe (clearance) + fluxo de ar, ao vivo */}
      {interior && (
        <section>
          <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
            Dentro do gabinete
          </h2>
          <GabineteInterior data={interior} />
        </section>
      )}

      {/* Compatibilidade — soquete, RAM, PSU (o encaixe físico está acima) */}
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