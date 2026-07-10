'use client'

import { useEffect, useState } from 'react'
import { loadMeuPc } from '@/lib/gpu-detect'

/** Persistent "meu PC" chip in the navbar — shows only when a rig is saved. */
export default function MeuPcChip() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const upd = () => {
      const m = loadMeuPc()
      setLabel(m ? (m.cpu ? `${m.gpu} · ${m.cpu}` : m.gpu) : null)
    }
    upd()
    window.addEventListener('meupc-changed', upd)
    window.addEventListener('storage', upd)
    return () => {
      window.removeEventListener('meupc-changed', upd)
      window.removeEventListener('storage', upd)
    }
  }, [])

  if (!label) return null
  return (
    <a
      href="/meu-pc"
      className="hover:text-gold"
      title="O teu PC guardado"
      style={{
        fontFamily: 'var(--font-plex-mono), monospace',
        fontSize: 11,
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '3px 9px',
        color: 'var(--text-mono)',
        whiteSpace: 'nowrap',
        maxWidth: 260,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      🖥 {label}
    </a>
  )
}
