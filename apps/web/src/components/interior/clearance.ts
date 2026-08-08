/**
 * clearance — margem de segurança da folga do cooler.
 *
 * PORQUÊ EXISTE: `max_cooler_height_mm` vem da FICHA DO FABRICANTE, e essa
 * ficha erra. A Noctua mediu à mão mais de 100 gabinetes e encontrou desvio
 * relevante em **56** deles (blog de 07/08/2026, "CPU cooler clearance: Why
 * our data sometimes deviates from the case manufacturer's specs"):
 *
 *   subestimado (real > ficha — só custa performance que se deixou na mesa):
 *     Thermaltake TR100        68  → 70,7   (+2,7mm)
 *     NZXT H2 Flow             75  → 79     (+4mm)
 *     Corsair 5000D/4000D/…   170  → 180    (+10mm)
 *
 *   SOBRESTIMADO (real < ficha — o lado perigoso: o cooler encosta na tampa
 *   ou simplesmente não entra):
 *     ASUS Prime AP201        170  → 168,3  (−1,7mm)
 *     Lian Li B4-mATX         168  → 164,5  (−3,5mm)
 *
 * CONSEQUÊNCIA: uma folga calculada em poucos milímetros a partir da ficha
 * pode, na peça real, ser NEGATIVA. Por isso não basta "apertado": abaixo da
 * cauda de sobrestimação observada não se pode afirmar que cabe.
 *
 * Isto é a aplicação directa do princípio do projecto — estimativa, nunca
 * medição. O número continua a ser mostrado; o que muda é que ele deixa de
 * ser apresentado como exacto.
 */

export type ClearanceBand = 'risco' | 'apertado' | 'ok'

/** cauda de sobrestimação observada (Lian Li B4-mATX, −3,5mm), arredondada. */
export const SPEC_OVERSTATE_MM = 4

/** mesmo limiar de "apertado" que o motor usa (`TIGHT_MM`, interior.py). */
export const TIGHT_MM = 15

export function coolerBand(remainingMm: number): ClearanceBand {
  if (remainingMm < SPEC_OVERSTATE_MM) return 'risco'
  if (remainingMm < TIGHT_MM) return 'apertado'
  return 'ok'
}

export function bandTone(b: ClearanceBand): string {
  if (b === 'risco') return 'var(--accent-red)'
  if (b === 'apertado') return 'var(--warn)'
  return 'var(--fresh)'
}

/** sufixo curto para chips e cotas. Vazio quando não há ressalva a fazer. */
export function bandSuffix(b: ClearanceBand): string {
  if (b === 'risco') return ' · pode não caber'
  if (b === 'apertado') return ' · apertado'
  return ''
}

/** frase completa, para tooltip/aria — explica de onde vem a incerteza. */
export function bandNote(b: ClearanceBand): string {
  if (b === 'risco') {
    return 'folga dentro da margem de erro da ficha do fabricante — pode não caber; confirme a medida real do gabinete'
  }
  if (b === 'apertado') {
    return 'cabe, mas sem margem para subir a ventoinha frontal ou usar memória alta'
  }
  return ''
}
