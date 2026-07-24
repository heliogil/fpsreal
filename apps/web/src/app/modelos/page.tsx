import type { CSSProperties, ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  getVisualsReview, postVisualsAction, type VisualsReviewRow,
} from '@/lib/live-server'
import {
  MaterialDefs, pickVariant, renderPart, renderFromDescriptor,
  type Box, type VariantHints,
} from '@/components/interior/PartMockups'

/**
 * Folha de contacto do ingestor de modelos — REVISÃO.
 *
 * Mostra, lado a lado, a peça DESENHADA PELO DESCRITOR ("gerado") e a peça do
 * TIER ("tier de hoje"), para o founder aprovar em lote com o olho. Nada aqui
 * gera nem valida descritor — isso é do `seed.ingest_visuals`, o caminho
 * auditado. Aqui só se comuta o portão de aprovação (reviewed_at).
 *
 * ACESSO: gated por ?token=… comparado com VISUALS_REVIEW_TOKEN (env do servidor).
 * Sem env, ou token errado, a página é 404 — o segredo nunca chega ao cliente.
 */
export const dynamic = 'force-dynamic'

// caixa de desenho + viewBox por categoria (deixa folga p/ backplate/conector da GPU)
const VIEW: Record<string, { w: number; h: number; box: Box }> = {
  gpu: { w: 184, h: 98, box: { x: 12, y: 36, w: 160, h: 40 } },
  cooler: { w: 140, h: 120, box: { x: 42, y: 14, w: 56, h: 96 } },
  psu: { w: 184, h: 110, box: { x: 20, y: 36, w: 144, h: 54 } },
  case_front: { w: 132, h: 120, box: { x: 46, y: 10, w: 40, h: 100 } },
  ram: { w: 160, h: 110, box: { x: 34, y: 16, w: 92, h: 84 } },
  motherboard: { w: 184, h: 120, box: { x: 14, y: 12, w: 156, h: 96 } },
}
const DEFAULT_VIEW = { w: 160, h: 110, box: { x: 20, y: 16, w: 120, h: 80 } }

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return undefined
}

function hintsFor(cat: string, r: VisualsReviewRow): VariantHints {
  const s = r.specs
  switch (cat) {
    case 'gpu': return { name: r.name, sku: r.sku, lengthMm: num(s.length_mm), tdpW: num(s.tdp_w) }
    case 'cooler': return { name: r.name, sku: r.sku, heightMm: num(s.height_mm) }
    case 'psu': return { name: r.name, sku: r.sku, watts: num(s.watts) }
    case 'case_front': return { name: r.name, airflowClass: (s.airflow_class as string) ?? undefined }
    case 'ram': return { name: r.name, sku: r.sku, ddr: (s.ram_type ?? s.ddr) as string }
    case 'motherboard': return { name: r.name, sku: r.sku, formFactor: (s.form_factor as string) ?? undefined }
    default: return { name: r.name, sku: r.sku }
  }
}

function Thumb({ children, w, h }: { children: ReactNode; w: number; h: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, display: 'block' }} role="img">
      <defs><MaterialDefs /></defs>
      {children}
    </svg>
  )
}

export default async function ModelosPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const envToken = process.env.VISUALS_REVIEW_TOKEN
  const token = searchParams.token ?? ''
  if (!envToken || token !== envToken) notFound()

  const data = await getVisualsReview(token)
  if (!data) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
        <p className="mono" style={{ color: 'var(--dim)' }}>
          API indisponível ou nenhum descritor. Corra <code>python -m seed.ingest_visuals</code> primeiro.
        </p>
      </main>
    )
  }

  // server actions — leem o token do próprio form (mesmo segredo que abriu a folha)
  async function approve(formData: FormData) {
    'use server'
    const t = String(formData.get('token') ?? '')
    const skus = formData.getAll('sku').map(String)
    if (t && skus.length) await postVisualsAction(t, 'approve', skus)
    revalidatePath('/modelos')
  }
  async function revoke(formData: FormData) {
    'use server'
    const t = String(formData.get('token') ?? '')
    const skus = formData.getAll('sku').map(String)
    if (t && skus.length) await postVisualsAction(t, 'revoke', skus)
    revalidatePath('/modelos')
  }

  const byCat = new Map<string, VisualsReviewRow[]>()
  for (const r of data.rows) {
    const arr = byCat.get(r.category) ?? []
    arr.push(r)
    byCat.set(r.category, arr)
  }

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 96px' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Ingestor de modelos — revisão</h1>
        <p className="mono" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>
          {data.total} descritores · <b style={{ color: 'var(--fresh)' }}>{data.approved} aprovados</b> ·{' '}
          <b style={{ color: 'var(--warn)' }}>{data.pending} pendentes</b>. À esquerda o desenho DO
          descritor; à direita o tier de hoje. Marque e aprove — só aprovados vão ao viewer.
        </p>
      </header>

      <form>
        <input type="hidden" name="token" value={token} />
        {/* barra de ação fixa no topo */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 12px', marginBottom: 16, background: 'var(--card)',
          border: '1px solid var(--line)', borderRadius: 10,
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--dim2)' }}>
            pendentes já vêm marcados
          </span>
          <span style={{ flex: 1 }} />
          <button formAction={revoke} className="mono" style={btn('revoke')}>Revogar selecionados</button>
          <button formAction={approve} className="mono" style={btn('approve')}>Aprovar selecionados</button>
        </div>

        {[...byCat.entries()].map(([cat, rows]) => {
          const v = VIEW[cat] ?? DEFAULT_VIEW
          const hasRenderer = ['gpu', 'cooler', 'psu', 'case_front'].includes(cat)
          return (
            <section key={cat} style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dim)', margin: '0 0 10px', letterSpacing: 0.4 }}>
                {cat.toUpperCase()}
                {!hasRenderer && (
                  <span className="mono" style={{ fontSize: 10, fontWeight: 500, color: 'var(--dim2)', marginLeft: 8 }}>
                    (sem renderer paramétrico — viewer usa o tier)
                  </span>
                )}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {rows.map((r) => {
                  const gen = renderFromDescriptor(r.category, r.descriptor, v.box)
                  const tierVariant = pickVariant(r.category, hintsFor(r.category, r))
                  const tier = renderPart(r.category, tierVariant, v.box)
                  return (
                    <label key={r.sku} style={{
                      display: 'block', border: `1px solid ${r.reviewed ? 'var(--fresh-b)' : 'var(--line)'}`,
                      borderRadius: 10, padding: 10, background: 'var(--card)', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <input type="checkbox" name="sku" value={r.sku} defaultChecked={!r.reviewed} />
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </span>
                        <span className="mono" style={{
                          fontSize: 9.5, padding: '2px 7px', borderRadius: 99,
                          border: `1px solid ${r.reviewed ? 'var(--fresh-b)' : 'var(--warn-b)'}`,
                          color: r.reviewed ? 'var(--fresh)' : 'var(--warn)',
                        }}>
                          {r.reviewed ? 'aprovado' : 'pendente'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <figure style={{ margin: 0 }}>
                          <Thumb w={v.w} h={v.h}>{gen ?? tier}</Thumb>
                          <figcaption className="mono" style={{ fontSize: 9.5, color: gen ? 'var(--accent)' : 'var(--dim2)', marginTop: 3 }}>
                            {gen ? `descritor · ${r.source}` : '= tier'}
                          </figcaption>
                        </figure>
                        <figure style={{ margin: 0 }}>
                          <Thumb w={v.w} h={v.h}>{tier}</Thumb>
                          <figcaption className="mono" style={{ fontSize: 9.5, color: 'var(--dim2)', marginTop: 3 }}>
                            tier · {tierVariant}
                          </figcaption>
                        </figure>
                      </div>
                      <p className="mono" style={{ fontSize: 9.5, color: 'var(--dim2)', margin: '8px 0 0', wordBreak: 'break-word' }}>
                        {Object.entries(r.descriptor)
                          .filter(([k]) => k !== 'confidence')
                          .map(([k, val]) => `${k}=${val}`)
                          .join(' · ')}
                        {typeof r.descriptor.confidence === 'number' && ` · conf ${r.descriptor.confidence}`}
                      </p>
                    </label>
                  )
                })}
              </div>
            </section>
          )
        })}
      </form>
    </main>
  )
}

function btn(kind: 'approve' | 'revoke'): CSSProperties {
  const approve = kind === 'approve'
  return {
    fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${approve ? 'var(--fresh-b)' : 'var(--line)'}`,
    background: approve ? 'var(--fresh-bg)' : 'transparent',
    color: approve ? 'var(--fresh)' : 'var(--dim)',
  }
}
