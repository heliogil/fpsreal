import type { LiveInterior } from '@/lib/live-server'

/**
 * Veredicto — a resposta em linguagem de jogador, ANTES do desenho técnico.
 *
 * O viewer mostra geometria em mm, CFM e zonas; isso convence quem entende e
 * perde quem não entende. Esta linha responde às duas perguntas que importam
 * para comprar: "cabe?" e "vai esquentar?" — com semáforo e, quando há, a
 * solução. Nada é calculado aqui: lê as folgas e o diagnóstico do motor.
 *
 * INTEGRIDADE: é estimativa; o texto nunca diz "medido".
 */

type Tone = 'ok' | 'warn' | 'bad'
const TONE: Record<Tone, { color: string; dot: string; label: string }> = {
  ok: { color: 'var(--fresh)', dot: 'var(--fresh)', label: 'tudo certo' },
  warn: { color: 'var(--warn)', dot: 'var(--warn)', label: 'atenção' },
  bad: { color: 'var(--danger)', dot: 'var(--danger)', label: 'problema' },
}
const worse = (a: Tone, b: Tone): Tone => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : 'ok')

const ZONA: Record<string, string> = {
  gpu_zone: 'a placa de vídeo',
  cpu_zone: 'o processador',
  intake_front: 'a frente do gabinete',
  exhaust_rear: 'a traseira do gabinete',
  exhaust_top: 'o topo do gabinete',
}

// só as folgas que hoje são confiáveis (gpu_side está desligada no motor)
const FOLGAS: Record<string, string> = { gpu: 'a placa de vídeo', cooler: 'o cooler' }

export function veredicto(interior: LiveInterior): { tone: Tone; cabe: string; ar: string } {
  // ── cabe? ────────────────────────────────────────────────────────────────
  let fitTone: Tone = 'ok'
  let cabe = 'Cabe tudo com folga.'
  const folgas = Object.entries(interior.clearances ?? {}).filter(([k]) => k in FOLGAS)
  const neg = folgas.find(([, c]) => c.remaining_mm < 0)
  const tight = folgas.find(([, c]) => c.is_tight)
  if (neg) {
    fitTone = 'bad'
    cabe = `Não cabe: ${FOLGAS[neg[0]]} passa ${Math.round(-neg[1].remaining_mm)} mm do limite do gabinete.`
  } else if (tight) {
    fitTone = 'warn'
    cabe = `Cabe, mas no limite: sobram ${Math.round(tight[1].remaining_mm)} mm para ${FOLGAS[tight[0]]}.`
  }

  // ── vai esquentar? ───────────────────────────────────────────────────────
  const score = interior.airflow.score
  const d = interior.diagnosis
  const zona = d?.worst_zone ? ZONA[d.worst_zone] ?? 'o gabinete' : 'a placa de vídeo'
  const fix = d?.suggest_mount ? ' Uma ventoinha a mais resolve.' : ''
  let airTone: Tone = 'ok'
  let ar = 'O ar circula bem.'
  if (score < 45) {
    airTone = 'bad'
    ar = `Fluxo de ar fraco: ${zona} vai esquentar.${fix || ' Este gabinete já não tem vaga — vale outro gabinete.'}`
  } else if (score < 70) {
    airTone = 'warn'
    ar = `O ar circula, mas ${zona} vai trabalhar mais quente.${fix}`
  }
  return { tone: worse(fitTone, airTone), cabe, ar }
}

export default function Veredicto({ interior, compact = false }: { interior: LiveInterior; compact?: boolean }) {
  const v = veredicto(interior)
  const t = TONE[v.tone]
  return (
    <div role="status" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: compact ? '8px 12px' : '12px 16px', borderTop: '1px solid var(--line2)',
      background: `color-mix(in srgb, ${t.color} 7%, transparent)`,
    }}>
      <span aria-hidden style={{
        width: 10, height: 10, borderRadius: 99, background: t.dot, flex: 'none', marginTop: compact ? 5 : 6,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${t.dot} 25%, transparent)`,
      }} />
      <div style={{ fontSize: compact ? 12.5 : 14.5, lineHeight: 1.45, color: 'var(--text)' }}>
        <strong style={{ color: t.color }}>{t.label}.</strong> {v.cabe} {v.ar}
      </div>
    </div>
  )
}
