import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { getLiveBuilds } from '@/lib/live-server'
import { getMockRepository } from '@/lib/repositories'

interface PageProps {
  params: Promise<{ slug: string[] }>
}

/**
 * Catch-all SEO — rota usada pelos "X vs o Rei".
 * Ex: /i5-13400f-rtx-4060-vs-rei-dos-r-5k
 *
 * Só responde a slugs no formato "<desafiante>-vs-rei-dos-<faixa>" com faixa
 * reconhecida. Qualquer outra URL (/.env, erros de digitação, etc.) devolve
 * 404 de verdade — antes respondia 200 a tudo, o que gerava páginas vazias
 * indexáveis ao infinito (soft-404).
 * Slug igual ao de um build real → redirect permanente para /build/[slug].
 */

const VS_REI = /^[a-z0-9-]+-vs-rei-dos-(r-?3k|r-?5k|r-?8k|r-?12k)$/

const TIERS = {
  r3k: { tier: 'r3k', label: 'R$ 3k' },
  r5k: { tier: 'r5k', label: 'R$ 5k' },
  r8k: { tier: 'r8k', label: 'R$ 8k' },
  r12k: { tier: 'r12k_plus', label: 'R$ 12k+' },
} as const

function parseSlug(slug: string[] | undefined) {
  if (!slug || slug.length !== 1) return null
  const m = VS_REI.exec(slug[0].toLowerCase())
  if (!m) return null
  return TIERS[m[1].replace('-', '') as keyof typeof TIERS]
}

export async function generateMetadata(props: PageProps) {
  const { slug } = await props.params
  // Página editorial ainda sem dado do desafiante: não indexar até ter conteúdo real.
  return parseSlug(slug) ? { robots: { index: false, follow: true } } : {}
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function SeoCatchAllPage(props: PageProps) {
  const params = await props.params
  const slugStr = (params.slug ?? []).join('/')
  // Live-first, mock only as a fallback if the API is unreachable — the same
  // pattern as the home and results pages, so these SEO pages show the same
  // numbers as the rest of the site (never stale fixture prices).
  const builds = (await getLiveBuilds()) ?? (await getMockRepository().builds.getAll())
  const directBuild = builds.find((b) => b.slug === slugStr) ?? null
  if (directBuild) permanentRedirect(`/build/${directBuild.slug}`)

  const parsed = parseSlug(params.slug)
  if (!parsed) notFound()
  const tierGuess = parsed.tier
  const tierLabel = parsed.label

  // Pega o Rei da faixa inferida (se houver), a partir dos builds ao vivo.
  const rei = tierGuess
    ? (builds.find((b) => b.tier === tierGuess && !b.is_rei_absoluto) ?? null)
    : null

  // Extrai um "nome do concorrente" legível a partir do slug.
  const contenderName = (params.slug ?? [])
    .join(' ')
    .replace(/-vs-rei-dos-[a-z0-9+]+/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="pb-6 border-b border-border">
        <p className="text-xs uppercase tracking-wider text-secondary mb-2">
          Comparativo editorial
        </p>
        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}
        >
          {contenderName || slugStr} vs Rei dos {tierLabel || '?'}
        </h1>
        <p className="text-secondary">
          A Harpia mediu os dois. Spoiler: o trono quase nunca cai.
        </p>
      </header>

      {rei ? (
        <section className="space-y-3">
          <div className="card">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
              O trono atual
            </h2>
            <p className="text-secondary text-sm mb-3">{rei.subtitle}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-secondary uppercase">Total</div>
                <div className="num-mono text-2xl font-bold">{formatBRL(rei.total_price_brl)}</div>
              </div>
              <div>
                <div className="text-xs text-secondary uppercase">R$/FPS</div>
                <div className="num-mono text-2xl font-bold" style={{ color: 'var(--text-mono)' }}>
                  {formatBRL(rei.rs_per_fps_top_game)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
              E o desafiante?
            </h2>
            <p className="text-sm text-secondary">
              Para um comparativo justo precisamos rodar o build candidato
              contra nosso modelo. Por enquanto,{' '}
              <Link href="/wizard" style={{ color: 'var(--accent-gold)' }}>
                monta seu build no wizard
              </Link>{' '}
              e a Harpia te diz em que posição ele fica.
            </p>
          </div>

          <div className="text-center pt-4">
            <Link href={`/build/${rei.slug}`} className="btn-ghost">
              Ver detalhes do Rei dos {tierLabel} →
            </Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <p className="text-secondary">
            Não conseguimos identificar a faixa do trono no slug{' '}
            <span className="num-mono">{slugStr}</span>. Tente{' '}
            <Link href="/" style={{ color: 'var(--accent-gold)' }}>
              voltar para a home
            </Link>{' '}
            e escolher um dos Tronos oficiais.
          </p>
        </section>
      )}

      <footer className="text-xs text-secondary pt-4 border-t border-border">
        <p>
          Comparativo editorial. Estimativas via modelo anchor_scale v1 (±15%).{' '}
          <Link href="/como-medimos" style={{ color: 'var(--accent-gold)' }}>
            Ver metodologia
          </Link>
          .
        </p>
      </footer>
    </article>
  )
}