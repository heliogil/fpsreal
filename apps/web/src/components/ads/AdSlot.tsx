'use client'

import { useEffect, useRef, useState } from 'react'
import { ADS_READY_EVENT } from './AdsRuntime'

/**
 * Um bloco de anúncio do AdSense. Sem `client`/`slot` (anúncios desligados ou
 * posição sem bloco criado) não renderiza NADA — nem espaço reservado. Com
 * anúncios ligados, só aparece depois da escolha de cookies (é aí que o script
 * carrega) e já com a altura reservada, para a página não saltar.
 */
export default function AdSlot({ client, slot, minHeight = 250 }: {
  client?: string | null
  slot?: string | null
  minHeight?: number
}) {
  const [ready, setReady] = useState(false)
  const pushed = useRef(false)

  useEffect(() => {
    if (!client || !slot) return
    const w = window as Window & { __reiAdsReady?: boolean }
    if (w.__reiAdsReady) setReady(true)
    const on = () => setReady(true)
    window.addEventListener(ADS_READY_EVENT, on)
    return () => window.removeEventListener(ADS_READY_EVENT, on)
  }, [client, slot])

  useEffect(() => {
    if (!ready || pushed.current) return
    pushed.current = true
    try {
      const w = window as Window & { adsbygoogle?: unknown[] }
      ;(w.adsbygoogle = w.adsbygoogle || []).push({})
    } catch { /* bloqueador de anúncios: o espaço fica vazio, a página segue */ }
  }, [ready])

  if (!client || !slot || !ready) return null
  return (
    <aside aria-label="Publicidade" style={{ margin: 'clamp(24px,4vw,36px) 0' }}>
      <div style={{ fontSize: 11, color: 'var(--dim2)', marginBottom: 4, letterSpacing: '.05em' }}>publicidade</div>
      <ins className="adsbygoogle" style={{ display: 'block', minHeight }}
        data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  )
}
