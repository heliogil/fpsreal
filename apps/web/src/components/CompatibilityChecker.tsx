interface Check {
  a: string
  b: string
  label: string
  status: string
  message: string | null
}
interface CompatibilityCheckerProps {
  errors: string[]
  warnings: string[]
  clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
  checks?: Check[]
}

const NODE: Record<string, string> = {
  cpu: 'CPU', motherboard: 'Placa', ram: 'RAM', gpu: 'GPU',
  case: 'Gabinete', cooler: 'Cooler', psu: 'PSU', storage: 'SSD', system: 'Sistema',
}
const STATUS: Record<string, { c: string; icon: string }> = {
  ok: { c: 'var(--accent-blue, #3597e6)', icon: '✓' },
  warning: { c: 'var(--accent-orange, #e67a35)', icon: '⚠' },
  error: { c: 'var(--accent-red, #e63535)', icon: '✗' },
}
const mono = 'var(--font-plex-mono), monospace'

export default function CompatibilityChecker({
  errors,
  warnings,
  clearances,
  checks = [],
}: CompatibilityCheckerProps) {
  const nothing =
    errors.length === 0 && warnings.length === 0 &&
    Object.keys(clearances).length === 0 && checks.length === 0

  return (
    <div className="card">
      <h3 className="text-lg mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
        Compatibilidade
      </h3>

      {nothing && (
        <p className="text-sm" style={{ color: 'var(--accent-blue)' }}>✓ Sem conflitos detectados.</p>
      )}

      {/* Diagrama de relações */}
      {checks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {checks.map((ch, i) => {
            const s = STATUS[ch.status] ?? STATUS.ok
            return (
              <div
                key={i}
                title={ch.message ?? 'ok'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px',
                  borderRadius: 8, background: 'var(--bg-elevated, #1a1a26)',
                  border: '1px solid var(--border)', borderLeft: `3px solid ${s.c}`,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 12 }}>{NODE[ch.a] ?? ch.a}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>┄ {ch.label} ┄</span>
                <span style={{ fontFamily: mono, fontSize: 12 }}>{NODE[ch.b] ?? ch.b}</span>
                <span style={{ color: s.c, fontSize: 13 }}>{s.icon}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Mensagens de erro/aviso (detalhe) */}
      {errors.map((e, i) => (
        <p key={`e${i}`} className="text-sm" style={{ color: 'var(--accent-red)' }}>✗ {e}</p>
      ))}
      {warnings.map((w, i) => (
        <p key={`w${i}`} className="text-sm" style={{ color: 'var(--accent-orange)' }}>⚠ {w}</p>
      ))}

      {Object.keys(clearances).length > 0 && (
        <div className="mt-3 pt-2 border-t border-border text-xs text-secondary" style={{ fontFamily: mono }}>
          {Object.entries(clearances).map(([slot, c]) => (
            <span key={slot} style={{ marginRight: 14 }}>
              {slot} folga {c.remaining_mm}mm{c.is_tight ? ' (apertado)' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
