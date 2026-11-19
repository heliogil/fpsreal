/** Nomes curtos das vagas de ventoinha (ids de geometry_data.py) — um só sítio
 *  para o cartão, o 2D, o 3D e o diagnóstico falarem igual. */
export const MOUNT_LABEL: Record<string, string> = {
  front_bottom: 'frente (baixo)', front_mid: 'frente (meio)', front_top: 'frente (cima)',
  rear: 'traseira', top_bay: 'topo', shroud: 'base',
}
export const mountLabel = (id: string) => MOUNT_LABEL[id] ?? id.replace(/_/g, ' ')
