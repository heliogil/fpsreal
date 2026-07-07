interface CompatibilityCheckerProps {
  errors: string[]
  warnings: string[]
  clearances: Record<string, { remaining_mm: number; is_tight: boolean }>
}

export default function CompatibilityChecker({
  errors,
  warnings,
  clearances,
}: CompatibilityCheckerProps) {
  if (errors.length === 0 && warnings.length === 0 && Object.keys(clearances).length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg mb-2" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          Compatibilidade
        </h3>
        <p className="text-sm" style={{ color: 'var(--accent-blue)' }}>
          ✓ Sem conflitos detectados.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="text-lg mb-3" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
        Compatibilidade
      </h3>

      {errors.length > 0 && (
        <ul className="mb-3 space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="text-sm" style={{ color: 'var(--accent-red)' }}>
              ✗ {e}
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="mb-3 space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="text-sm" style={{ color: 'var(--accent-orange)' }}>
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}

      {Object.keys(clearances).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-xs uppercase tracking-wider text-secondary mb-1">
            Folgas (clearance)
          </div>
          <ul className="space-y-1">
            {Object.entries(clearances).map(([slot, c]) => (
              <li key={slot} className="text-sm">
                <span className="text-secondary">{slot}:</span>{' '}
                <span className="num-mono">
                  {c.remaining_mm}mm {c.is_tight && '(apertado)'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}