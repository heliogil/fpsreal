import type { Metadata } from 'next'
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
})

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Rei do FPS — R$ por FPS, a conta aberta',
  description:
    'Comparador brasileiro de builds gamer por custo/FPS. Tronos por faixa de orçamento, transparência de método, sem bancada de benchmark própria.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${syne.variable} ${plex.variable} ${plexMono.variable}`}>
      <body>
        <header className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🦅</span>
              <span
                className="text-xl"
                style={{ fontFamily: 'var(--font-syne), Syne, sans-serif', fontWeight: 700 }}
              >
                Rei do FPS
              </span>
            </a>
            <nav className="flex items-center gap-4 sm:gap-6 text-sm">
              <a href="/#tronos" className="hover:text-gold transition-colors">
                Tronos
              </a>
              <a href="/pecas" className="hover:text-gold transition-colors">
                Peças
              </a>
              <a href="/wizard" className="hover:text-gold transition-colors">
                Wizard
              </a>
              <a href="/como-medimos" className="hover:text-gold transition-colors">
                Como medimos
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-border mt-16">
          <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-secondary flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between">
            <span>
              A Harpia observa. <span style={{ color: 'var(--text-mono)' }}>R$ por FPS</span> — a conta aberta.
            </span>
            <span>
              Fonte: TechPowerUp, PassMark, Cinebench · modelo anchor_scale v1
            </span>
          </div>
          <div className="max-w-6xl mx-auto px-6 pb-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
            🔗 Alguns links são de afiliado — se você comprar por eles, ganhamos comissão da loja. <strong>O preço para você não muda.</strong>
          </div>
        </footer>
      </body>
    </html>
  )
}