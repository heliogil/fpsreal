'use client'

import { useEffect, useState } from 'react'

/**
 * Consentimento (LGPD) + carga do script do AdSense.
 *
 * Só é montado quando os anúncios estão ligados (ver lib/ads.ts). Nada do
 * Google carrega antes de o visitante escolher:
 *  - "Aceitar" → anúncios personalizados;
 *  - "Só o essencial" → anúncios NÃO personalizados (sem perfil de interesse).
 * A escolha fica no navegador do visitante e pode ser mudada no rodapé
 * ("preferências de cookies"). O Umami (estatísticas) não usa cookies e não
 * depende disto.
 */

export const CONSENT_KEY = 'reidofps:consent'
export type Consent = 'all' | 'essential'
export const ADS_READY_EVENT = 'reidofps:ads-ready'
const OPEN_EVENT = 'reidofps:consent-open'

type AdsWindow = Window & {
  adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number }
  __reiAdsReady?: boolean
}

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY)
    return v === 'all' || v === 'essential' ? v : null
  } catch {
    return null
  }
}

function loadAds(client: string, consent: Consent) {
  const w = window as AdsWindow
  if (w.__reiAdsReady) return
  w.adsbygoogle = w.adsbygoogle || ([] as unknown as AdsWindow['adsbygoogle'])
  if (consent === 'essential' && w.adsbygoogle) w.adsbygoogle.requestNonPersonalizedAds = 1
  const s = document.createElement('script')
  s.async = true
  s.crossOrigin = 'anonymous'
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
  document.head.appendChild(s)
  w.__reiAdsReady = true
  window.dispatchEvent(new Event(ADS_READY_EVENT))
}

export default function AdsRuntime({ client }: { client: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const c = readConsent()
    if (c) loadAds(client, c)
    else setOpen(true)
    const reopen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, reopen)
    return () => window.removeEventListener(OPEN_EVENT, reopen)
  }, [client])

  const choose = (c: Consent) => {
    const before = readConsent()
    try { window.localStorage.setItem(CONSENT_KEY, c) } catch { /* sem storage: vale só nesta visita */ }
    setOpen(false)
    // mudar de ideia depois de carregado só vale na próxima página
    if (before && before !== c) window.location.reload()
    else loadAds(client, c)
  }

  if (!open) return null
  return (
    <div role="dialog" aria-label="Cookies e anúncios" style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 60, maxWidth: 560, margin: '0 auto',
      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px',
      boxShadow: 'var(--shadow-sm)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text)',
    }}>
      <p style={{ margin: '0 0 10px' }}>
        Mostramos anúncios para manter o site gratuito. Com a sua permissão, o Google pode usar cookies para
        mostrar anúncios do seu interesse. O ranking e as contas nunca mudam por causa disso.{' '}
        <a href="/privacidade" style={{ color: 'var(--accent-2)' }}>saiba mais</a>
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => choose('essential')} style={{
          fontSize: 13, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)',
        }}>Só o essencial</button>
        <button type="button" onClick={() => choose('all')} style={{
          fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)',
        }}>Aceitar</button>
      </div>
    </div>
  )
}

/** Link do rodapé para rever a escolha. */
export function ConsentLink() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} style={{
      font: 'inherit', color: 'inherit', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    }}>preferências de cookies</button>
  )
}
