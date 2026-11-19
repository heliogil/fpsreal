/**
 * Espaço PATROCINADO vendido direto (loja, montadora, fabricante) — o modelo do
 * BuildCores (faixa do iBUYPOWER, build "Sponsored" na home).
 *
 * Lido de SPONSORED_JSON no ambiente do pcb_web, em tempo de execução: vender
 * um espaço = editar o .env e recriar o container. Vazio ⇒ nada aparece.
 *
 *   SPONSORED_JSON='[{"placement":"home","title":"Pichau — PCs montados",
 *     "text":"Monte com garantia de 1 ano.","href":"https://www.pichau.com.br/…",
 *     "cta":"ver na loja","until":"2026-12-31"}]'
 *
 * Regras (as mesmas do "Como medimos"):
 *  - sempre com o selo "Patrocinado" e rel="sponsored";
 *  - fica FORA de qualquer ranking e do cálculo do Rei — não é uma build Rei;
 *  - só links https.
 */

export type SponsoredPlacement = 'home' | 'build'
export type Sponsored = {
  placement: SponsoredPlacement
  title: string
  text: string
  href: string
  cta?: string
  until?: string
}

function valid(x: unknown): x is Sponsored {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (s.placement !== 'home' && s.placement !== 'build') return false
  if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 80) return false
  if (typeof s.text !== 'string' || s.text.length > 200) return false
  if (typeof s.href !== 'string') return false
  try {
    if (new URL(s.href).protocol !== 'https:') return false
  } catch {
    return false
  }
  if (s.cta !== undefined && (typeof s.cta !== 'string' || s.cta.length > 30)) return false
  if (s.until !== undefined && (typeof s.until !== 'string' || Number.isNaN(Date.parse(s.until)))) return false
  return true
}

/** Patrocínios ativos para uma posição (inválidos e vencidos são ignorados). */
export function sponsoredFor(placement: SponsoredPlacement, now: Date = new Date()): Sponsored[] {
  const raw = process.env.SPONSORED_JSON?.trim()
  if (!raw) return []
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  return list.filter(valid).filter((s) => s.placement === placement)
    .filter((s) => !s.until || Date.parse(s.until) + 86_400_000 > now.getTime())
    .slice(0, 2)
}
