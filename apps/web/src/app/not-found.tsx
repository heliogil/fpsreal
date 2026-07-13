import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 20, padding: '40px 16px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--dim)' }}>ERRO 404</div>
      <h1 className="disp" style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 700, color: 'var(--strong)', margin: 0 }}>
        Esta página não existe
      </h1>
      <p style={{ fontSize: 15, color: 'var(--dim)', maxWidth: 420 }}>
        O link pode estar errado ou a página foi movida.
      </p>
      <Link href="/" className="btn" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', font: "600 14px var(--font-plex),'IBM Plex Sans'", padding: '12px 24px', borderRadius: 8 }}>
        Ir para o início →
      </Link>
    </main>
  )
}
