import type { CuratedBuild } from '../repositories/types'

/**
 * 5 builds curados — os Tronos do Rei do FPS.
 * Dados de 2026, plausíveis para o mercado brasileiro.
 *
 * Cada build referencia os 8 componentes (cpu_id, gpu_id, etc.) por ID de produto.
 * Os IDs batem com `products.ts` e `offers.ts`.
 */

export const builds: CuratedBuild[] = [
  // ============ Rei dos R$3k ============
  {
    id: 1,
    slug: 'rei-dos-r-3k',
    tier: 'r3k',
    title: 'Rei dos R$ 3k — custo x performance em 1080p',
    subtitle: 'RX 6600 + Ryzen 5 5600',
    description:
      'O trono do orçamento apertado. Roda CS2 acima de 140fps e Valorant cravando 200fps em 1080p. Honestamente, é o melhor R$/FPS abaixo dos R$ 3 mil hoje.',
    components: {
      cpu_id: 1,
      gpu_id: 10,
      ram_id: 40,
      motherboard_id: 50,
      storage_id: 60,
      psu_id: 70,
      case_id: 30,
      cooler_id: 80,
    },
    total_price_brl: 2950,
    rs_per_fps_top_game: 20.34, // 2950 / 145
    fps_top_game: 145,
    top_game_slug: 'cs2',
    is_rei_absoluto: false,
    is_active: true,
    crowned_at: '2026-01-15T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },

  // ============ Rei dos R$5k ============
  {
    id: 2,
    slug: 'rei-dos-r-5k',
    tier: 'r5k',
    title: 'Rei dos R$ 5k — o sweet spot do brasileiro',
    subtitle: 'RTX 4060 Ti + Ryzen 5 7600',
    description:
      'A faixa mais disputada do mercado BR. Aqui a Harpia decreta: DLSS + AM5 + 16GB DDR5 = o melhor R$/FPS real da atualidade. Roda tudo em 1080p high, 1440p com folga.',
    components: {
      cpu_id: 2,
      gpu_id: 12,
      ram_id: 41,
      motherboard_id: 51,
      storage_id: 60,
      psu_id: 71,
      case_id: 31,
      cooler_id: 80,
    },
    total_price_brl: 4890,
    rs_per_fps_top_game: 23.29, // 4890 / 210
    fps_top_game: 210,
    top_game_slug: 'cs2',
    is_rei_absoluto: false,
    is_active: true,
    crowned_at: '2026-01-15T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },

  // ============ Rei dos R$8k ============
  {
    id: 3,
    slug: 'rei-dos-r-8k',
    tier: 'r8k',
    title: 'Rei dos R$ 8k — 1440p sem concessões',
    subtitle: 'RTX 4070 Super + Ryzen 7 7700X',
    description:
      'O trono do gamer que já tem monitor 1440p. 285fps em CS2, 95fps em Cyberpunk 2077 no ultra. Aqui o R$/FPS ainda faz sentido; acima disso começa a pagar pelo marketing.',
    components: {
      cpu_id: 3,
      gpu_id: 14,
      ram_id: 42,
      motherboard_id: 52,
      storage_id: 61,
      psu_id: 72,
      case_id: 32,
      cooler_id: 81,
    },
    total_price_brl: 7750,
    rs_per_fps_top_game: 27.19, // 7750 / 285
    fps_top_game: 285,
    top_game_slug: 'cs2',
    is_rei_absoluto: false,
    is_active: true,
    crowned_at: '2026-01-15T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },

  // ============ Rei dos R$12k+ ============
  {
    id: 4,
    slug: 'rei-dos-r-12k',
    tier: 'r12k_plus',
    title: 'Rei dos R$ 12k+ — alta performance sem exagero',
    subtitle: 'RTX 4080 Super + Ryzen 9 7900X',
    description:
      'Para quem quer 4K ou 1440p a 240Hz sem DLSS. A partir daqui o R$/FPS já não é mais o critério — é sobre a experiência de ter mais cabeça de GPU do que precisa.',
    components: {
      cpu_id: 4,
      gpu_id: 17,
      ram_id: 43,
      motherboard_id: 53,
      storage_id: 61,
      psu_id: 73,
      case_id: 33,
      cooler_id: 82,
    },
    total_price_brl: 11900,
    rs_per_fps_top_game: 31.32, // 11900 / 380
    fps_top_game: 380,
    top_game_slug: 'cs2',
    is_rei_absoluto: false,
    is_active: true,
    crowned_at: '2026-01-15T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },

  // ============ Rei Absoluto (simbólico) ============
  {
    id: 5,
    slug: 'rei-absoluto-9800x3d',
    tier: 'r12k_plus',
    title: 'Rei Absoluto — o trono que muda só com nova geração',
    subtitle: 'AMD 9800X3D + RTX 4090',
    description:
      'Simbólico. O trono só muda quando sai uma nova geração que vira o jogo (3D VCache contra o resto do mundo, hoje). O R$/FPS aqui não é critério — é troféu.',
    components: {
      cpu_id: 5,
      gpu_id: 19,
      ram_id: 43,
      motherboard_id: 53,
      storage_id: 61,
      psu_id: 73,
      case_id: 33,
      cooler_id: 83,
    },
    total_price_brl: 24500,
    rs_per_fps_top_game: 0, // não é critério
    fps_top_game: 420,
    top_game_slug: 'cs2',
    is_rei_absoluto: true,
    is_active: true,
    crowned_at: '2026-01-15T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
]

export function getBuildBySlug(slug: string): CuratedBuild | undefined {
  return builds.find((b) => b.slug === slug)
}

export function getBuildByTier(tier: string): CuratedBuild | undefined {
  return builds.find((b) => b.tier === tier && !b.is_rei_absoluto)
}

export function getReiAbsoluto(): CuratedBuild | undefined {
  return builds.find((b) => b.is_rei_absoluto)
}