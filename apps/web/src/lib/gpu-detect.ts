/**
 * Client-only WebGL GPU detection. Reads the (public) unmasked renderer string
 * the browser already exposes — no plugin, no permission, nothing sent to a
 * server. Returns a normalized model name or null.
 */

export function parseGpu(s: string): string | null {
  if (!s) return null
  // NVIDIA: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11...)"
  let m = s.match(/\b(RTX|GTX)\s*(\d{3,4})\s*(Ti\s*SUPER|SUPER|Ti)?/i)
  if (m) {
    const suffix = m[3] ? ' ' + m[3].toUpperCase().replace(/\s+/g, ' ') : ''
    return ('GeForce ' + m[1].toUpperCase() + ' ' + m[2] + suffix).trim()
  }
  // AMD: "AMD Radeon RX 7800 XT"
  m = s.match(/\bRX\s*(\d{3,4})\s*(XTX|XT|GRE)?/i)
  if (m) return ('Radeon RX ' + m[1] + (m[2] ? ' ' + m[2].toUpperCase() : '')).trim()
  // Intel Arc: "Intel(R) Arc(TM) A770 Graphics"
  m = s.match(/\bArc\D*([AB]\s*\d{3,4})/i)
  if (m) return ('Arc ' + m[1].replace(/\s+/g, '')).trim()
  return null
}

export function detectGpu(): { model: string | null; raw: string | null } {
  if (typeof document === 'undefined') return { model: null, raw: null }
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return { model: null, raw: null }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return { model: null, raw: null }
    const raw = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
    return { model: parseGpu(raw), raw }
  } catch {
    return { model: null, raw: null }
  }
}

// ---- localStorage "meu PC" ----
const KEY = 'reidofps_meupc'
export type MeuPc = { gpu: string; cpu?: string; savedAt: number }

export function saveMeuPc(gpu: string, cpu?: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ gpu, cpu: cpu || undefined, savedAt: Date.now() }))
    window.dispatchEvent(new Event('meupc-changed'))
  } catch {
    /* ignore */
  }
}
export function loadMeuPc(): MeuPc | null {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as MeuPc) : null
  } catch {
    return null
  }
}
