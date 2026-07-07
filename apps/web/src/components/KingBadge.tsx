import type { CuratedBuild, BudgetTier } from '@/lib/repositories/types'

interface KingBadgeProps {
  build?: CuratedBuild
  tier?: BudgetTier
  size?: 'sm' | 'md' | 'lg'
}

const tierLabel: Record<BudgetTier, string> = {
  r3k: 'Rei dos R$ 3k',
  r5k: 'Rei dos R$ 5k',
  r8k: 'Rei dos R$ 8k',
  r12k_plus: 'Rei dos R$ 12k+',
}

export default function KingBadge({ build, tier, size = 'md' }: KingBadgeProps) {
  const isAbsoluto = build?.is_rei_absoluto ?? false
  const label = isAbsoluto
    ? 'Rei Absoluto'
    : tier
      ? tierLabel[tier]
      : build
        ? tierLabel[build.tier]
        : 'Rei'

  const cls =
    'king-badge' + (isAbsoluto ? ' king-badge-absoluto' : '') +
    (size === 'lg' ? ' text-base px-4 py-1.5' : '') +
    (size === 'sm' ? ' text-xs px-2 py-0.5' : '')

  return (
    <span className={cls} aria-label={`Lacre: ${label}`}>
      <span aria-hidden="true">{isAbsoluto ? '👑✨' : '👑'}</span>
      <span>{label}</span>
    </span>
  )
}