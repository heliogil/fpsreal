/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança aplicados a todas as rotas. 'unsafe-inline' em
// script-src é necessário porque o App Router injeta scripts inline de
// hidratação; sem nonces, é o máximo seguro sem quebrar a página.
// Ao ligar analytics (ex.: Umami self-hosted noutro domínio), acrescentar
// esse domínio em script-src e connect-src.
//
// Anúncios (Google AdSense, ver src/lib/ads.ts): os domínios do Google entram
// SEMPRE, porque estes cabeçalhos ficam fixos no build e os anúncios ligam-se
// em tempo de execução (ADSENSE_CLIENT no .env). Sem ADSENSE_CLIENT nenhum
// script do Google é pedido. O risco extra é pequeno: script-src já aceita
// 'unsafe-inline' (hidratação do App Router).
const ADS_SCRIPT = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://www.googletagservices.com https://*.doubleclick.net'
const ADS_FRAME = 'https://*.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://www.google.com'
const ADS_CONNECT = 'https://*.googlesyndication.com https://*.adtrafficquality.google https://*.doubleclick.net'
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${ADS_SCRIPT}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${ADS_CONNECT}`,
  `frame-src 'self' ${ADS_FRAME}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const config = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // O site não usa next/image. Desligar o otimizador remove por completo a
  // superfície de /_next/image (antes aceitava QUALQUER host remoto via
  // remotePatterns '**', exposta às CVEs críticas de RCE do otimizador).
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
