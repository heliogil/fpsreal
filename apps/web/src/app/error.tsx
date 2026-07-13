'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 20, padding: '40px 16px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--warn)' }}>ERRO INESPERADO</div>
      <h1 className="disp" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, color: 'var(--strong)', margin: 0 }}>
        Algo deu errado
      </h1>
      <p style={{ fontSize: 15, color: 'var(--dim)', maxWidth: 420 }}>
        A Harpia encontrou um problema ao carregar esta página. Tente recarregar ou volte para o início.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          className="btn"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', font: "600 14px var(--font-plex),'IBM Plex Sans'", padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          Tentar novamente
        </button>
        <Link href="/" className="btn" style={{ border: '1px solid var(--line)', color: 'var(--text)', font: "500 14px var(--font-plex),'IBM Plex Sans'", padding: '11px 22px', borderRadius: 8 }}>
          Ir para o início
        </Link>
      </div>
    </main>
  )
}
