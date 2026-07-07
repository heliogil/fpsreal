import type { CuratedBuild } from '@/lib/repositories/types'

interface HarpiaVerdictProps {
  build: CuratedBuild
}

/**
 * Veredicto da Harpia — texto editorial sobre o build.
 * Tom: editorial, técnico sem ser snob, brasileiro autêntico.
 * Slogan: "A Harpia observa".
 */
export default function HarpiaVerdict({ build }: HarpiaVerdictProps) {
  return (
    <div
      className="card relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(212,160,23,0.05) 100%)',
        borderColor: 'var(--accent-gold)',
      }}
    >
      <div className="flex items-start gap-4">
        <div className="harpia" aria-hidden="true">🦅</div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--accent-gold)' }}
            >
              A Harpia observa
            </span>
          </div>
          <p className="text-base leading-relaxed">
            {build.description}
          </p>
          {!build.is_rei_absoluto && build.rs_per_fps_top_game > 0 && (
            <p className="text-sm text-secondary mt-3">
              Veredito: este build decreta{' '}
              <span className="num-mono font-semibold">
                R$ {build.rs_per_fps_top_game.toFixed(2)} por FPS
              </span>{' '}
              no jogo-referência. Nada mau.
            </p>
          )}
          {build.is_rei_absoluto && (
            <p className="text-sm text-secondary mt-3">
              Veredito: este trono é simbólico. Não se discute — observa-se.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}