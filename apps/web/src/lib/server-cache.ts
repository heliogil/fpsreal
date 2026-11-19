/**
 * Cache em memória das leituras à API (lado do servidor do site).
 *
 * Porquê não o cache do próprio Next: a imagem de produção é construída SEM
 * acesso à API, e o Next pré-renderizaria as páginas com o fallback (lista
 * vazia, dados de amostra) e serviria isso até ao revalidate. Aqui as páginas
 * continuam a renderizar a cada visita, mas os dados vêm da memória:
 *
 *  - TTL curto (5 min por padrão) — preços e Reis mudam no máximo uma vez por
 *    noite; o motor de fluxo é determinístico para as mesmas peças;
 *  - só respostas BEM-SUCEDIDAS entram (erro nunca fica em cache);
 *  - pedidos iguais em simultâneo partilham UMA chamada à API;
 *  - se a API falhar e houver uma cópia vencida, devolve a cópia (o site
 *    aguenta um reinício da API em vez de mostrar página vazia);
 *  - cada leitura recebe uma cópia (structuredClone): quem ordenar ou mexer no
 *    resultado não estraga o que está guardado.
 *
 * NÃO usar para nada que seja por visitante (cliques /go, sessões).
 */

type Entry = { at: number; value: unknown }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 800
export const DEFAULT_TTL_MS = 5 * 60_000

export async function cached<T>(key: string, load: () => Promise<T | null>, ttlMs = DEFAULT_TTL_MS): Promise<T | null> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return structuredClone(hit.value) as T
  let running = inflight.get(key) as Promise<T | null> | undefined
  if (!running) {
    running = (async () => {
      try {
        const v = await load()
        if (v === null || v === undefined) return hit ? (hit.value as T) : null // cópia vencida > nada
        store.delete(key)
        store.set(key, { at: Date.now(), value: v })
        if (store.size > MAX_ENTRIES) {
          const oldest = store.keys().next().value
          if (oldest !== undefined) store.delete(oldest)
        }
        return v
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, running)
  }
  const v = await running
  return v === null || v === undefined ? null : (structuredClone(v) as T)
}

/** Só para testes. */
export function _clearServerCache() {
  store.clear()
  inflight.clear()
}
