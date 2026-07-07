/**
 * FastAPI request / response types for pc-builder-br (Rei do FPS).
 *
 * The backend exposes a thin JSON API consumed by the frontend.
 * These types are the wire contract between the two halves.
 */

import type { BuildComponents } from './repositories.js'
import type { BuildResult } from './repositories.js'
import type { Resolution, SessionType } from './entities.js'

// ============================================================
// HEALTH
// ============================================================

/** `GET /api/health` response. */
export interface ApiHealthResponse {
  status: 'ok'
  db: 'connected' | 'disconnected'
  version: string
}

// ============================================================
// WIZARD
// ============================================================

/** `POST /api/wizard` request body. */
export interface ApiWizardRequest {
  budget_brl: number
  games: import('./wizard.js').GameSlug[]
  priority: 'fps' | 'budget' | 'quiet' | 'future_proof'
  resolution: Resolution
  session_type: SessionType
  existing_components?: Partial<BuildComponents>
}

/** `POST /api/wizard` response body. */
export interface ApiWizardResponse {
  builds: BuildResult[]
  /** UUID of the persisted BuildSession for later retrieval. */
  session_id: string
}

// ============================================================
// AFFILIATE CLICK TRACKING
// ============================================================

/** `POST /api/clicks` request body — fired when a user clicks an offer link. */
export interface ApiAffiliateClickRequest {
  offer_id: number
  build_id?: number
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

/** `POST /api/clicks` response — minimal ack. */
export interface ApiAffiliateClickResponse {
  status: 'ok'
  click_id: number
}