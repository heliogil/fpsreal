import type { Metadata } from 'next'
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import ThemeToggle from '@/components/ThemeToggle'

const syne = Syne({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-syne', display: 'swap' })
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Rei do FPS — o melhor R$ por FPS hoje, medido contra o Rei',
  description:
    'Comparador brasileiro de PCs gamer. Com seu orçamento e seus jogos, o melhor R$ por FPS hoje — e cada build medida contra o Rei. A gente não inventa FPS: toda métrica com fonte, data e banda de confiança.',
}

/** Crown mark — the brand symbol (the Harpia stays out of the product UI per the handoff). */
function CrownWordmark() {
  return (
    <span
      className="disp"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '.4em', fontWeight: 800, letterSpacing: '.01em', lineHeight: 1, color: 'var(--strong)' }}
    >
      <svg width="1em" height="1em" viewBox="0 0 24 22" style={{ height: '.84em', width: 'auto', flex: 'none' }} aria-hidden="true">
        <path d="M1.6 7.4l4.3 3.9L12 2.3l6.1 9 4.3-3.9-1.7 11.3H3.3z" fill="var(--accent)" />
        <rect x="3.4" y="19.6" width="17.2" height="2.1" rx="1" fill="var(--accent)" />
      </svg>
      <span>REI DO <span style={{ color: 'var(--accent)' }}>FPS</span></span>
    </span>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" className={`${syne.variable} ${plex.variable} ${plexMono.variable}`}>
      <body>
        <div style={{ minHeight: '100vh', background: 'var(--grad)', backgroundAttachment: 'fixed' }}>
          <header
            style={{
              position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '16px clamp(16px,4vw,40px)',
              borderBottom: '1px solid var(--line2)',
              background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(12px)',
            }}
          >
            <a href="/" style={{ fontSize: 19 }}>
              <CrownWordmark />
            </a>
            <nav style={{ display: 'flex', gap: 24, alignItems: 'center', fontSize: 13.5, fontWeight: 500, color: 'var(--dim)' }}>
              <a className="navlink" href="/#challengers" style={{ color: 'inherit' }}>Builds curadas</a>
              <a className="navlink" href="/pecas" style={{ color: 'inherit' }}>Peças & FPS</a>
              <a className="navlink" href="/como-medimos" style={{ color: 'inherit' }}>Como medimos o FPS</a>
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ThemeToggle />
              <a
                className="btn"
                href="/wizard"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)', font: "600 13.5px var(--font-plex), 'IBM Plex Sans'", padding: '10px 18px', borderRadius: 8 }}
              >
                Montar minha build
              </a>
            </div>
          </header>

          {children}

          <footer style={{ borderTop: '1px solid var(--line2)', marginTop: 64, padding: 'clamp(28px,4vw,40px) clamp(16px,4vw,40px)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <a href="/"><CrownWordmark /></a>
              <div className="mono" style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--dim2)', maxWidth: 460 }}>
                Estimativas anchor+scale · fonte: TechPowerUp + GamersNexus · preço com selo de frescura.
                <br />
                🤝 Alguns links são de afiliado — se você comprar por eles, a gente ganha comissão da loja.
                O preço para você <strong style={{ color: 'var(--dim)' }}>não muda</strong>, e isso nunca reordena o ranking.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
