import type { InteriorDiagnosis } from '@/lib/live-server'

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
  intake_front: 'a entrada frontal', cpu_zone: 'a zona da CPU', gpu_zone: 'a zona da GPU',
  exhaust_rear: 'a saída traseira', exhaust_top: 'a saída pelo topo',
}

export function bottleneckText(d: InteriorDiagnosis): { tone: string; text: string } | null {
  const cfm = (n: number) => `${Math.round(n)} CFM`
  const zona = d.worst_zone ? ZONE_PT[d.worst_zone] ?? d.worst_zone : null
  switch (d.code) {
    case 'gpu_obstructed':
      return { tone: 'var(--warn)', text: `a placa ${d.gpu_slots ? `${d.gpu_slots}-slot ` : 'grossa '}estrangula ${zona ?? 'a zona da GPU'}: o ar de entrada não a atravessa. Um gabinete mais largo (ou frontal mais aberto) alivia` }
    case 'no_intake':
      return { tone: 'var(--danger)', text: `sem entrada de ar: nada empurra ar fresco sobre as ${d.total_w} W da build` }
    case 'no_exhaust':
      return { tone: 'var(--danger)', text: `armadilha de calor: entram ${cfm(d.intake_cfm)}, mas não há saída — o ar quente fica preso` }
    case 'exhaust_limited':
      return { tone: 'var(--warn)', text: `o gargalo é a saída: ${cfm(d.exhaust_cfm)} para tirar o calor de ${d.total_w} W (entram ${cfm(d.intake_cfm)})${zona ? ` — ${zona} é a mais afetada` : ''}` }
    case 'intake_limited':
      return { tone: 'var(--warn)', text: `o gargalo é a entrada: ${cfm(d.intake_cfm)} de ar fresco para ${d.total_w} W${zona ? ` — ${zona} é a mais afetada` : ''}` }
    case 'airflow_low':
      return { tone: 'var(--warn)', text: `fluxo curto para ${d.total_w} W: ${cfm(d.intake_cfm)} entrando e ${cfm(d.exhaust_cfm)} saindo${zona ? ` — ${zona} sente primeiro` : ''}` }
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
    <div className="mono" style={{
      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      padding: compact ? '8px 12px' : '10px 16px',
      borderTop: '1px solid var(--line2)',
      fontSize: compact ? 10 : 11, color: 'var(--dim)', lineHeight: 1.45,
    }}>
      <span aria-hidden style={{ color: msg.tone, fontWeight: 700 }}>▸</span>
      <span style={{ flex: 1, minWidth: 180 }}>
        <span style={{ color: msg.tone, fontWeight: 600 }}>gargalo estimado</span> · {msg.text}
      </span>
      {!diagnosis.suggest_mount && (
        <span style={{ color: 'var(--dim2)', whiteSpace: 'nowrap' }}>
          sem vaga para mais ventoinhas — o gabinete está no limite
        </span>
      )}
      {diagnosis.suggest_mount && onSimulate && (
        <button type="button" onClick={() => onSimulate(diagnosis.suggest_mount!)}
          style={{
            fontSize: compact ? 9.5 : 10.5, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
            border: '1px solid var(--accent-dim)', background: 'var(--accent-soft)', color: 'var(--accent)',
            whiteSpace: 'nowrap',
          }}>
          {/* QUANTIFICADO: o motor já rodou o what-if e devolveu o ganho */}
          simular ventoinha em {diagnosis.suggest_mount.replace(/_/g, ' ')}
          {typeof diagnosis.suggest_delta === 'number' && diagnosis.suggest_delta > 0
            ? ` · ≈ +${diagnosis.suggest_delta} no fluxo` : ''}
        </button>
      )}
    </div>
  )
}
