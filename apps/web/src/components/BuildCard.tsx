import Link from 'next/link'
import type { CuratedBuild } from '@/lib/repositories/types'
import KingBadge from './KingBadge'
import FpsBadge from './FpsBadge'
import PriceTag from './PriceTag'

interface BuildCardProps {
  build: CuratedBuild
  variant?: 'default' | 'rei' | 'equilibrado' | 'arrojado'
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function BuildCard({ build, variant = 'default' }: BuildCardProps) {
  const isHighlight = variant === 'rei' || build.is_rei_absoluto

  return (
    <div
      className={`card relative ${isHighlight ? 'border-2' : ''}`}
      style={
        isHighlight
          ? { borderColor: 'var(--accent-gold)', background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)' }
          : {}
      }
    >
      {variant === 'rei' && !build.is_rei_absoluto && (
        <div className="mb-3">
          <KingBadge tier={build.tier} size="md" />
        </div>
      )}
      {variant !== 'rei' && !build.is_rei_absoluto && (
        <div className="mb-3">
          <span className="text-xs uppercase tracking-wider text-secondary">
            {variant === 'equilibrado' && 'Build Equilibrado'}
            {variant === 'arrojado' && 'Build Arrojado'}
            {variant === 'default' && 'Build'}
          </span>
        </div>
      )}

      <h3 className="text-xl mb-1" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
        {build.title}
      </h3>
      <p className="text-sm text-secondary mb-4">{build.subtitle}</p>

      <div className="flex items-baseline justify-between mb-3">
        <PriceTag price_brl={build.total_price_brl} in_stock size="lg" />
        {!build.is_rei_absoluto && build.rs_per_fps_top_game > 0 && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-secondary">R$/FPS</div>
            <div className="num-mono text-lg font-bold">
              {formatBRL(build.rs_per_fps_top_game)}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <FpsBadge
          estimate={{
            id: 0,
            cpu_id: build.components.cpu_id,
            gpu_id: build.components.gpu_id,
            game_slug: build.top_game_slug,
            resolution: '1080p',
            preset: 'high',
            fps: build.fps_top_game,
            confidence_band_pct: 15,
            method: 'anchor_scale',
            sources: ['techpowerup.com', 'passmark.com'],
            created_at: build.crowned_at,
          }}
        />
      </div>

      <Link
        href={`/build/${build.slug}`}
        className="btn-ghost w-full text-center text-sm"
      >
        Ver build completo →
      </Link>
    </div>
  )
}