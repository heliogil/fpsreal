import { sponsoredFor, type SponsoredPlacement } from '@/lib/sponsored'

/** Cartões "Patrocinado" de uma posição. Sem patrocínio ativo, não renderiza nada. */
export default function Patrocinado({ placement }: { placement: SponsoredPlacement }) {
  const items = sponsoredFor(placement)
  if (!items.length) return null
  return (
    <aside aria-label="Patrocinado" style={{ display: 'grid', gap: 10, margin: 'clamp(24px,4vw,36px) 0' }}>
      {items.map((s, i) => (
        <a key={i} href={s.href} target="_blank" rel="sponsored noopener" data-umami-event={`patrocinado-${placement}`}
          style={{
            display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', textDecoration: 'none',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px',
          }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--dim)', border: '1px solid var(--line)',
            borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap',
          }}>Patrocinado</span>
          <span style={{ flex: '1 1 240px', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 14.5, color: 'var(--strong)' }}>{s.title}</strong>
            {s.text && <span style={{ fontSize: 13, color: 'var(--dim)' }}>{s.text}</span>}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-2)', whiteSpace: 'nowrap' }}>{s.cta ?? 'saiba mais'} →</span>
        </a>
      ))}
    </aside>
  )
}
