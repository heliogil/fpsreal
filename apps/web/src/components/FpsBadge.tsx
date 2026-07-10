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
        <div className="text-xs text-secondary">
          banda estimada{' '}
          <span className="num-mono">
            {low}–{high} fps (±{confidence_band_pct}%)
          </span>
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