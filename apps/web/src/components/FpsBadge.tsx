import type { FpsEstimate } from '@/lib/repositories/types'
import { gameLabel } from '@/lib/labels'

interface FpsBadgeProps {
  estimate: FpsEstimate
  showBand?: boolean
  showSource?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Badge numérico de FPS estimado.
 * REGRA DE INTEGRIDADE: nunca exibe FPS sem banda de confiança + fonte.
 */
export default function FpsBadge({
  estimate,
  showBand = true,
  showSource = false,
  size = 'md',
}: FpsBadgeProps) {
  const { fps, confidence_band_pct, game_slug, resolution, sources } = estimate
  const low = Math.round(fps * (1 - confidence_band_pct / 100))
  const high = Math.round(fps * (1 + confidence_band_pct / 100))

  const sizeClass =
    size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-2xl'

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className={`num-mono font-bold ${sizeClass}`}>{fps}</span>
        <span className="text-secondary text-xs uppercase tracking-wider">
          FPS
        </span>
        <span className="text-secondary text-xs">
          · {gameLabel(game_slug)} · {resolution}
        </span>
      </div>
      {showBand && (
        <div style={{ maxWidth: 168 }}>
          <div
            style={{ position: 'relative', height: 5, background: 'var(--bg-elevated, #1a1a26)', borderRadius: 999, marginTop: 3 }}
            role="img"
            aria-label={`Banda estimada ${low} a ${high} FPS, mais ou menos ${confidence_band_pct} por cento`}
          >
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(100 - Math.min(90, confidence_band_pct * 2)) / 2}%`, width: `${Math.min(90, confidence_band_pct * 2)}%`, background: 'var(--text-mono, #c0ffb0)', opacity: 0.25, borderRadius: 999 }} />
            <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 2, background: 'var(--text-mono, #c0ffb0)', transform: 'translateX(-1px)', borderRadius: 2 }} />
          </div>
          <div className="text-xs text-secondary" style={{ marginTop: 3 }}>
            <span className="num-mono">{low}–{high} fps</span> · ±{confidence_band_pct}% estimativa
          </div>
        </div>
      )}
      {showSource && sources && sources.length > 0 && (
        <div className="text-xs text-secondary">
          fontes: {sources.join(', ')}
        </div>
      )}
    </div>
  )
}