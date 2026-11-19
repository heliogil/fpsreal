/**
 * Anúncios (Google AdSense) — configuração lida em TEMPO DE EXECUÇÃO.
 *
 * Desligado por padrão: sem ADSENSE_CLIENT no ambiente do pcb_web não aparece
 * nada (nem espaço reservado, nem aviso de cookies, nem script do Google), e o
 * /ads.txt responde 404. Ligar = pôr as variáveis no .env e recriar o
 * container, sem rebuild:
 *
 *   ADSENSE_CLIENT=ca-pub-1234567890123456
 *   ADSENSE_SLOT_HOME_MEIO=1234567890      (um bloco por posição, criado no AdSense)
 *   ADSENSE_SLOT_BUILD_FPS=…
 *   ADSENSE_SLOT_BUILD_PECAS=…
 *
 * Regra da casa: anúncio nunca no visualizador, nunca colado ao veredicto e
 * nunca dentro de um ranking — e não mexe em nada do que é calculado.
 */

export const AD_PLACEMENTS = ['home_meio', 'build_fps', 'build_pecas'] as const
export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export type AdsConfig = { client: string; slots: Partial<Record<AdPlacement, string>> }

export function adsConfig(): AdsConfig | null {
  const client = process.env.ADSENSE_CLIENT?.trim()
  if (!client || !/^ca-pub-\d{10,20}$/.test(client)) return null
  const slots: Partial<Record<AdPlacement, string>> = {}
  for (const p of AD_PLACEMENTS) {
    const v = process.env[`ADSENSE_SLOT_${p.toUpperCase()}`]?.trim()
    if (v && /^\d{6,20}$/.test(v)) slots[p] = v
  }
  return { client, slots }
}

/** "ca-pub-123…" → "pub-123…" (o formato do ads.txt). */
export const publisherId = (client: string) => client.replace(/^ca-/, '')
