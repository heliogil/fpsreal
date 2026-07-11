import type { RootRepository } from './types'

/**
 * Mock repository — fixtures locais.
 *
 * Este é o único caminho de dados baseado em fixtures. O caminho AO VIVO é o
 * `live-server.ts` (fala com o pcb_api pela rede interna do docker via
 * `PCB_API_INTERNAL`). As páginas usam `live-server.ts` primeiro e caem neste
 * mock apenas quando a API está inacessível — não há switch de data-source em
 * runtime. (O antigo `getRepository()`/`LiveRepository` foi removido: o
 * `LiveRepository` estava desatualizado, chamava endpoints inexistentes, e
 * nunca era invocado.)
 */
export function getMockRepository(): RootRepository {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MockRepository } = require('./mock') as typeof import('./mock')
  return new MockRepository()
}

export type { RootRepository } from './types'