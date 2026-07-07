import type { AirflowProfile } from '@/lib/fixtures/airflow'

interface AirflowPanelProps {
  airflow: AirflowProfile
}

const statusColor: Record<string, string> = {
  ok: 'var(--accent-blue)',
  tight: 'var(--accent-orange)',
  critical: 'var(--accent-red)',
  dead_zone: 'var(--accent-red)',
}

const statusLabel: Record<string, string> = {
  ok: 'OK',
  tight: 'apertado',
  critical: 'crítico',
  dead_zone: 'zona morta',
}

export default function AirflowPanel({ airflow }: AirflowPanelProps) {
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg" style={{ fontFamily: 'var(--font-syne), Syne, sans-serif' }}>
          Fluxo de ar
        </h3>
        <span className="text-xs uppercase tracking-wider text-secondary">
          pressão: {airflow.pressure_balance}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {airflow.zones.map((z) => (
          <div key={z.zone} className="bg-elevated rounded-md p-3 border border-border">
            <div className="text-xs text-secondary uppercase tracking-wider mb-1">
              {z.zone.replace(/_/g, ' ')}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="num-mono text-xl font-bold">{z.score}</span>
              <span
                className="text-xs font-semibold"
                style={{ color: statusColor[z.status] }}
              >
                {statusLabel[z.status]}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-base rounded overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, z.score)}%`,
                  backgroundColor: statusColor[z.status],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {airflow.warnings.length > 0 && (
        <div className="border-l-2 pl-3 py-1" style={{ borderColor: 'var(--accent-orange)' }}>
          <ul className="text-sm space-y-1">
            {airflow.warnings.map((w, i) => (
              <li key={i} className="text-secondary">
                ⚠ {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-secondary mt-3 italic">{airflow.confidence}</p>
    </div>
  )
}