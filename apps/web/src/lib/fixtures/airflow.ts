import type { BuildAirflowZoneState } from '../repositories/types'

/**
 * Estado de airflow por build (exemplo do R$5k como default — todos "ok").
 * Outros builds têm perfis ligeiramente diferentes para mostrar variação na UI.
 *
 * Modelo: zonas simplificadas (intake front, gpu zone, cpu zone, exhaust rear).
 * Score: 0–100. Status: ok / tight / critical.
 */

export interface AirflowProfile {
  build_slug: string
  pressure_balance: 'positive' | 'neutral' | 'negative'
  zones: Array<{ zone: string; score: number; status: 'ok' | 'tight' | 'critical' | 'dead_zone' }>
  warnings: string[]
  confidence: string
}

export const airflowProfiles: AirflowProfile[] = [
  // R$3k — Aerocool Air 3 com 3 fans inclusos. Positivo. Tudo ok.
  {
    build_slug: 'rei-dos-r-3k',
    pressure_balance: 'positive',
    zones: [
      { zone: 'intake_front', score: 88, status: 'ok' },
      { zone: 'gpu_zone', score: 75, status: 'ok' },
      { zone: 'cpu_zone', score: 70, status: 'ok' },
      { zone: 'exhaust_rear', score: 82, status: 'ok' },
    ],
    warnings: [],
    confidence: 'estimativa de fluxo de ar, modelo de zonas v1',
  },

  // R$5k — NZXT H5 Flow com 2 fans. Positivo, gpu_zone mais apertado.
  {
    build_slug: 'rei-dos-r-5k',
    pressure_balance: 'positive',
    zones: [
      { zone: 'intake_front', score: 85, status: 'ok' },
      { zone: 'gpu_zone', score: 72, status: 'ok' },
      { zone: 'cpu_zone', score: 68, status: 'ok' },
      { zone: 'exhaust_rear', score: 80, status: 'ok' },
    ],
    warnings: [],
    confidence: 'estimativa de fluxo de ar, modelo de zonas v1',
  },

  // R$8k — Fractal North (mesh front). GPU mais quente, CPU ok.
  {
    build_slug: 'rei-dos-r-8k',
    pressure_balance: 'positive',
    zones: [
      { zone: 'intake_front', score: 90, status: 'ok' },
      { zone: 'gpu_zone', score: 62, status: 'tight' },
      { zone: 'cpu_zone', score: 70, status: 'ok' },
      { zone: 'exhaust_rear', score: 78, status: 'ok' },
    ],
    warnings: ['GPU zone tight — considere adicionar fan lateral no Fractal North'],
    confidence: 'estimativa de fluxo de ar, modelo de zonas v1',
  },

  // R$12k+ — Lian Li O11 EVO sem fans inclusos. GPU 4080 Super = mais calor.
  {
    build_slug: 'rei-dos-r-12k',
    pressure_balance: 'neutral',
    zones: [
      { zone: 'intake_front', score: 60, status: 'tight' },
      { zone: 'gpu_zone', score: 55, status: 'tight' },
      { zone: 'cpu_zone', score: 78, status: 'ok' },
      { zone: 'exhaust_rear', score: 65, status: 'ok' },
    ],
    warnings: [
      'Lian Li O11 EVO não inclui fans — adicione 6–9 fans para fluxo balanceado',
      'GPU zone tight — recomendado fan inferior extra',
    ],
    confidence: 'estimativa de fluxo de ar, modelo de zonas v1',
  },

  // Rei Absoluto — RTX 4090 + Lian Li. Critical no GPU zone.
  {
    build_slug: 'rei-absoluto-9800x3d',
    pressure_balance: 'neutral',
    zones: [
      { zone: 'intake_front', score: 50, status: 'tight' },
      { zone: 'gpu_zone', score: 42, status: 'critical' },
      { zone: 'cpu_zone', score: 80, status: 'ok' },
      { zone: 'exhaust_rear', score: 60, status: 'ok' },
    ],
    warnings: [
      'RTX 4090 em Lian Li sem fans = GPU zone critical',
      'Obrigatório: configuração mínima de 9 fans + vertical mount ou radiador 360mm no topo',
    ],
    confidence: 'estimativa de fluxo de ar, modelo de zonas v1',
  },
]

export function getAirflowBySlug(slug: string): AirflowProfile | undefined {
  return airflowProfiles.find((a) => a.build_slug === slug)
}