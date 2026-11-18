import type { BudgetTier } from './repositories/types'

/**
 * Faixas de orçamento — fonte única no site (a API repete em
 * services/ingestion/tiers.py; manter iguais).
 *
 * A chave (`r3k`…) é interna e vive nas URLs (/build/rei-r3k), por isso não
 * muda. Até 2026-11-18 o rótulo dizia "R$ 3k" de uma build de R$ 4.010; agora o
 * rótulo é o TETO real da faixa, e o Rei de cada faixa é recalculado pelo
 * seed/crown_reis.py (máximo de FPS até o teto).
 */
export const TIER_LABEL: Record<BudgetTier, string> = {
  r3k: 'até R$ 4,5k',
  r5k: 'até R$ 7k',
  r8k: 'até R$ 11k',
  r12k_plus: 'R$ 11k+',
}

export const REI_NAME: Record<BudgetTier, string> = {
  r3k: 'Rei até R$ 4,5k',
  r5k: 'Rei até R$ 7k',
  r8k: 'Rei até R$ 11k',
  r12k_plus: 'Rei dos R$ 11k+',
}

export const TIER_ORDER: Record<BudgetTier, number> = { r3k: 0, r5k: 1, r8k: 2, r12k_plus: 3 }

export function tierLabel(tier: string | null | undefined): string {
  return (tier && TIER_LABEL[tier as BudgetTier]) || tier || ''
}
