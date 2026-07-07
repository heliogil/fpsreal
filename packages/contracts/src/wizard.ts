/**
 * Wizard flow types for pc-builder-br (Rei do FPS).
 *
 * The wizard is the primary entry point: a four-step form that
 * captures user intent and returns up to three ranked builds.
 */

import type { BuildResult } from './repositories.js'
import type { Resolution, SessionType } from './entities.js'

/** Ordered step identifiers for the wizard. */
export type WizardStep = 'budget' | 'games' | 'priority' | 'results'

/** In-flight wizard state — held in React context or component state. */
export interface WizardState {
  currentStep: WizardStep
  input: Partial<WizardInput>
  results: BuildResult[] | null
  isLoading: boolean
  error: string | null
}

/** Local copy of wizard input (kept here so wizard.ts has no import from repositories). */
export interface WizardInput {
  budget_brl: number
  games: GameSlug[]
  priority: 'fps' | 'budget' | 'quiet' | 'future_proof'
  resolution: Resolution
  session_type: SessionType
  existing_components?: Partial<import('./repositories.js').BuildComponents>
}

// ============================================================
// SUPPORTED GAMES
// ============================================================

/** Game slugs currently supported by the FPS engine. */
export type GameSlug =
  | 'cs2'
  | 'valorant'
  | 'fortnite'
  | 'apex-legends'
  | 'gta-v'
  | 'hogwarts-legacy'
  | 'cyberpunk-2077'
  | 'rdr2'
  | 'elden-ring'
  | 'league-of-legends'
  | 'minecraft'
  | 'the-sims-4'
  | 'call-of-duty-warzone'

/** Game metadata shown in the wizard's games step. */
export interface GameOption {
  slug: GameSlug
  name: string
  genre: string
  thumb_url?: string
}