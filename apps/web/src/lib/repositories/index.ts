import type { RootRepository } from './types'

let _repo: RootRepository | null = null

/**
 * Factory: escolhe mock ou live com base em `NEXT_PUBLIC_DATA_SOURCE`.
 *
 * - 'mock' (default): usa fixtures locais. UI funciona 100% sem backend.
 * - 'live': fala com o pcb_api (porta 8100). Falha silenciosa → fallback mock.
 *
 * Lazy init: a primeira chamada instancia o repo. Single-instance por processo.
 */
export function getRepository(): RootRepository {
  if (_repo) return _repo

  const source =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DATA_SOURCE) || 'mock'

  if (source === 'live') {
    // Import dinâmico em runtime para evitar bundling do api.ts no mock build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LiveRepository } = require('./api') as typeof import('./api')
    _repo = new LiveRepository()
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MockRepository } = require('./mock') as typeof import('./mock')
    _repo = new MockRepository()
  }
  return _repo
}

/** Helper para server components: força mock (nunca tenta rede no SSR). */
export function getMockRepository(): RootRepository {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MockRepository } = require('./mock') as typeof import('./mock')
  return new MockRepository()
}

export type { RootRepository } from './types'