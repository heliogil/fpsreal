/** Human-readable labels for slugs/keys shown in the UI. Single source. */

export const GAME_LABELS: Record<string, string> = {
  'cs2': 'Counter-Strike 2',
  'valorant': 'Valorant',
  'fortnite': 'Fortnite',
  'apex-legends': 'Apex Legends',
  'gta-v': 'GTA V',
  'hogwarts-legacy': 'Hogwarts Legacy',
  'cyberpunk-2077': 'Cyberpunk 2077',
  'rdr2': 'Red Dead Redemption 2',
  'elden-ring': 'Elden Ring',
  'league-of-legends': 'League of Legends',
  'minecraft': 'Minecraft',
  'the-sims-4': 'The Sims 4',
  'call-of-duty-warzone': 'Warzone',
}

export function gameLabel(slug: string): string {
  return GAME_LABELS[slug] ?? slug
}

export const PRIORITY_LABELS: Record<string, string> = {
  budget: 'Melhor custo',
  fps: 'Máximo FPS',
  quiet: 'Silencioso',
  future_proof: 'Durar muito',
}

export function priorityLabel(key: string): string {
  return PRIORITY_LABELS[key] ?? key
}

export const RESOLUTIONS = ['1080p', '1440p', '4k'] as const
export type ResolutionKey = (typeof RESOLUTIONS)[number]
export const RESOLUTION_LABELS: Record<ResolutionKey, string> = {
  '1080p': '1080p',
  '1440p': '1440p',
  '4k': '4K',
}
/** Rough FPS multiplier vs 1080p, for the wizard's live estimate card. */
export const RESOLUTION_FPS_MULT: Record<ResolutionKey, number> = {
  '1080p': 1,
  '1440p': 0.68,
  '4k': 0.42,
}
