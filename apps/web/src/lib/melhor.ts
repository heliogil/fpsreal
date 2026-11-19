/**
 * "Melhor PC gamer até R$ X" — a build com mais FPS por orçamento
 * (API /melhor, calculada todo dia por seed.best_by_budget com a mesma regra do
 * Rei de cada faixa).
 */
const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

export type BudgetPick = {
  budget_brl: number
  total_brl: number
  avg_fps: number
  components: Record<string, number>
  cpu_name: string | null
  gpu_name: string | null
  computed_at: string | null
}

export async function getBudgetPicks(): Promise<BudgetPick[]> {
  try {
    const r = await fetch(`${API}/melhor/`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    return r.ok ? ((await r.json()) as BudgetPick[]) : []
  } catch {
    return []
  }
}

export const budgetSlug = (b: number) => `ate-${b}`
export const parseBudgetSlug = (s: string): number | null => {
  const m = /^ate-(\d{4,5})$/.exec(s)
  return m ? Number(m[1]) : null
}
export const fmtBudget = (b: number) => `R$ ${b.toLocaleString('pt-BR')}`

const sameBuild = (a: BudgetPick, b: BudgetPick) =>
  Object.keys(a.components).every((k) => a.components[k] === b.components[k])

/** Orçamentos vizinhos com a MESMA build formam um grupo; a página canónica é a
 *  do menor orçamento do grupo (as outras apontam para ela — sem conteúdo
 *  duplicado para o Google). */
export function groupPicks(picks: BudgetPick[]): Array<{ from: number; to: number; pick: BudgetPick }> {
  const sorted = [...picks].sort((x, y) => x.budget_brl - y.budget_brl)
  const out: Array<{ from: number; to: number; pick: BudgetPick }> = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && sameBuild(last.pick, p)) last.to = p.budget_brl
    else out.push({ from: p.budget_brl, to: p.budget_brl, pick: p })
  }
  return out
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro']
export function mesAno(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}
