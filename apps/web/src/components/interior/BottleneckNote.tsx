import type { InteriorDiagnosis } from '@/lib/live-server'
import { mountLabel } from '@/lib/viewer-labels'

/**
 * BottleneckNote — transforma o score num diagnóstico acionável.
 *
 * O score é um número; sozinho não diz o que fazer. Aqui a frase nomeia O QUE
 * segura o fluxo e mostra os números que sustentam a afirmação — e, quando há
 * vaga do lado que falta, oferece simular a ventoinha que resolve (o mesmo
 * motor do what-if, no sítio onde o problema aparece).
 *
 * A estrutura vem do backend (`diagnosis`); a frase vive aqui, na camada de
 * apresentação. Nada é calculado no cliente.
 *
 * INTEGRIDADE: é estimativa. A frase diz "estimado", nunca "medido".
 */

const ZONE_PT: Record<string, string> = {
  intake_front: 'a frente', cpu_zone: 'o processador', gpu_zone: 'a placa de vídeo',
  exhaust_rear: 'a traseira', exhaust_top: 'o topo',
}

/** Frase curta, em linguagem de jogador: o que segura o ar. Os números (CFM,
 *  W) ficam nos "detalhes" do cartão — aqui só o que ajuda a decidir. */
export function bottleneckText(d: InteriorDiagnosis): { tone: string; text: string } | null {
  const zona = d.worst_zone ? ZONE_PT[d.worst_zone] ?? null : null
  const sofre = zona ? ` — ${zona} sente mais` : ''
  switch (d.code) {
    case 'gpu_obstructed':
      return { tone: 'var(--warn)', text: `a placa${d.gpu_slots ? ` de ${d.gpu_slots} slots` : ''} é grossa e tapa a passagem do ar. Um gabinete mais largo alivia` }
    case 'no_intake':
      return { tone: 'var(--danger)', text: 'não entra ar fresco: falta ventoinha de entrada' }
    case 'no_exhaust':
      return { tone: 'var(--danger)', text: 'o ar quente não tem por onde sair: falta ventoinha de saída' }
    case 'exhaust_limited':
      return { tone: 'var(--warn)', text: `sai menos ar do que entra${sofre}` }
    case 'intake_limited':
      return { tone: 'var(--warn)', text: `entra pouco ar fresco${sofre}` }
    case 'airflow_low':
      return { tone: 'var(--warn)', text: `pouco ar para o calor desta build${sofre}` }
    case 'ok':
    default:
      return null // sem gargalo: não ocupar espaço a dizer que está tudo bem
  }
}

export default function BottleneckNote({
  diagnosis, onSimulate, compact = false,
}: {
  diagnosis?: InteriorDiagnosis
  /** chamar o what-if no mount sugerido (só quando há vaga do lado que falta) */
  onSimulate?: (mountId: string) => void
  compact?: boolean
}) {
  if (!diagnosis) return null
  const msg = bottleneckText(diagnosis)
  if (!msg) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      padding: compact ? '8px 12px' : '10px 16px',
      borderTop: '1px solid var(--line2)',
      fontSize: compact ? 12 : 13.5, color: 'var(--text)', lineHeight: 1.45,
    }}>
      <span aria-hidden style={{ color: msg.tone, fontWeight: 700 }}>▸</span>
      <span style={{ flex: 1, minWidth: 180 }}>
        <span style={{ color: msg.tone, fontWeight: 600 }}>Gargalo:</span> {msg.text}
      </span>
      {!diagnosis.suggest_mount && (
        <span style={{ color: 'var(--dim2)', whiteSpace: 'nowrap' }}>
          sem vaga para mais ventoinhas
        </span>
      )}
      {diagnosis.suggest_mount && onSimulate && (
        <button type="button" data-umami-event="viewer-simular-ventoinha" onClick={() => onSimulate(diagnosis.suggest_mount!)}
          style={{
            fontSize: compact ? 11 : 12, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
            border: '1px solid var(--accent-dim)', background: 'var(--accent-soft)', color: 'var(--accent)',
            maxWidth: '100%', textAlign: 'left',
          }}>
          {/* QUANTIFICADO: o motor já rodou o what-if e devolveu o ganho */}
          + ventoinha no {mountLabel(diagnosis.suggest_mount)}
          {typeof diagnosis.suggest_delta === 'number' && diagnosis.suggest_delta > 0
            ? ` (+${diagnosis.suggest_delta})` : ''}
        </button>
      )}
    </div>
  )
}
