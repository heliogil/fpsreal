'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveInterior } from '@/lib/live-server'

/**
 * "Interior do gabinete" — one Canvas viewport that shows, to real scale:
 *  - the GPU / cooler fitting inside the case (clearance made visual), and
 *  - an airflow estimate (particles heat up passing the CPU/GPU zones).
 *
 * Fed by /interior/estimate. Airflow is a zone-graph ESTIMATE, never a
 * measurement — labelled as such (same integrity rule as FPS).
 */

const ZONE_LABEL: Record<string, string> = {
  intake_front: 'Entrada',
  cpu_zone: 'CPU',
  gpu_zone: 'GPU',
  exhaust_rear: 'Saída',
}
const STATUS: Record<string, { c: string; t: string }> = {
  ok: { c: '#7fd6a3', t: 'ok' },
  tight: { c: '#e0a24a', t: 'apertado' },
  critical: { c: '#e05555', t: 'crítico' },
  dead_zone: { c: '#8b948a', t: 'sem fluxo' },
}

function tempColor(t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const a = k < 0.5 ? [79, 214, 224] : [224, 162, 74]
  const b = k < 0.5 ? [224, 162, 74] : [224, 85, 85]
  const f = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`
}

export default function GabineteInterior({ data }: { data: LiveInterior }) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const [flow, setFlow] = useState(true)

  const score = data.airflow.score
  const scoreColor = score >= 70 ? '#7fd6a3' : score >= 45 ? '#e0a24a' : '#e05555'
  const scoreLabel = score >= 70 ? 'saudável' : score >= 45 ? 'apertado' : 'crítico'
  const gpuClr = data.clearances.gpu
  const coolerClr = data.clearances.cooler

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, raf = 0

    const resize = () => {
      const r = cv.getBoundingClientRect()
      W = r.width; H = r.height
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const maxGpu = data.case.max_gpu_length_mm || 400
    const maxCooler = data.case.max_cooler_height_mm || 180
    const gpuLen = data.parts.gpu.length_mm || 0
    const coolerH = data.parts.cooler.height_mm || 0
    const gpuHeat = Math.min(1, (data.parts.gpu.tdp_w || 0) / 400)
    const cpuHeat = Math.min(1, (data.parts.cpu.tdp_w || 0) / 150)
    const hasFlow = data.airflow.cfm > 0
    const zoneStatus = (z: string) =>
      data.airflow.zones.find((x) => x.zone === z)?.status ?? 'ok'

    const pad = () => ({ x0: 34, y0: 22, x1: W - 34, y1: H - 22 })
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }

    type P = { x: number; y: number; px: number; py: number; t: number; life: number }
    const parts: P[] = []
    const MAX = reduce || !flow ? 0 : 120

    const geom = () => {
      const p = pad()
      const iw = p.x1 - p.x0
      const ih = p.y1 - p.y0
      // GPU: horizontal card near the bottom, length to scale, anchored left
      const gpuW = Math.max(24, (gpuLen / maxGpu) * iw)
      const gpu = { x: p.x0, y: p.y0 + ih * 0.6, w: gpuW, h: ih * 0.16 }
      // CPU cooler: tower top-center, height to scale
      const coolH = Math.max(20, (coolerH / maxCooler) * ih * 0.85)
      const cpu = { x: p.x0 + iw * 0.42, y: p.y0, w: iw * 0.16, h: coolH }
      return { p, iw, ih, gpu, cpu }
    }

    const drawFan = (x: number, y: number, on: boolean, ang: number) => {
      ctx.save(); ctx.translate(x, y)
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7)
      ctx.strokeStyle = on ? '#d4a017' : '#333c35'; ctx.lineWidth = 1.4; ctx.stroke()
      ctx.rotate(ang)
      for (let b = 0; b < 3; b++) {
        ctx.rotate((Math.PI * 2) / 3)
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 7.5, -0.5, 0.5); ctx.closePath()
        ctx.fillStyle = on ? 'rgba(212,160,23,.5)' : 'rgba(120,132,122,.28)'; ctx.fill()
      }
      ctx.restore()
    }

    const heatBox = (r: { x: number; y: number; w: number; h: number }, label: string, heat: number, sub: string) => {
      ctx.save()
      const g = Math.min(1, heat)
      ctx.shadowBlur = 16 * g; ctx.shadowColor = `rgba(224,85,85,${0.5 * g})`
      ctx.fillStyle = `rgba(224,85,85,${0.05 + 0.15 * g})`
      ctx.strokeStyle = `rgba(224,120,90,${0.35 + 0.4 * g})`; ctx.lineWidth = 1
      roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke()
      ctx.fillStyle = 'rgba(240,224,200,.92)'; ctx.font = '600 11px ui-monospace,monospace'; ctx.textBaseline = 'top'
      ctx.fillText(label, r.x + 7, r.y + 6)
      if (sub) { ctx.fillStyle = 'rgba(200,205,196,.6)'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(sub, r.x + 7, r.y + 20) }
      ctx.restore()
    }

    let ang = 0, lastT = performance.now()
    const render = (now: number) => {
      const dt = Math.min(40, now - lastT); lastT = now; ang += dt * 0.004
      const { p, gpu, cpu } = geom()
      ctx.clearRect(0, 0, W, H)

      // chassis
      ctx.strokeStyle = '#2b342d'; ctx.lineWidth = 1.2
      roundRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, 10); ctx.stroke()

      // parts (to scale)
      heatBox(cpu, 'CPU', cpuHeat, `${Math.round(coolerH)}mm`)
      heatBox(gpu, 'GPU', gpuHeat, `${Math.round(gpuLen)}mm`)

      // GPU clearance marker (the gap to the right)
      if (gpuClr) {
        const gx = gpu.x + gpu.w
        ctx.strokeStyle = gpuClr.is_tight ? '#e0a24a' : '#7fd6a3'
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(gx, gpu.y + gpu.h / 2); ctx.lineTo(p.x1, gpu.y + gpu.h / 2); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = gpuClr.is_tight ? '#e0a24a' : '#7fd6a3'; ctx.font = '10px ui-monospace,monospace'; ctx.textBaseline = 'bottom'
        ctx.fillText(`folga ${Math.round(gpuClr.remaining_mm)}mm`, gx + 4, gpu.y - 2)
      }

      // airflow particles
      if (!reduce && flow) {
        while (parts.length < MAX) {
          parts.push({ x: p.x0 + 2, y: p.y0 + (p.y1 - p.y0) * (0.3 + Math.random() * 0.55), px: p.x0, py: 0, t: 0.06, life: 1 })
          parts[parts.length - 1].py = parts[parts.length - 1].y
        }
        const exX = p.x1, exY = p.y0 + (p.y1 - p.y0) * 0.3
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i]
          let vx = 0.95, vy = 0
          const dx = exX - q.x, dy = exY - q.y, d = Math.hypot(dx, dy) + 18
          vx += (dx / d) * 1.5; vy += (dy / d) * 1.5
          vy += Math.sin((q.x + q.y) * 0.02 + now * 0.0006) * 0.16
          const m = Math.hypot(vx, vy) || 1; vx /= m; vy /= m
          q.px = q.x; q.py = q.y; q.x += vx * 1.9; q.y += vy * 1.9; q.life -= 0.004
          if (q.x >= cpu.x && q.x <= cpu.x + cpu.w && q.y >= cpu.y && q.y <= cpu.y + cpu.h) q.t = Math.min(1, q.t + 0.02 * (0.5 + cpuHeat))
          if (q.x >= gpu.x && q.x <= gpu.x + gpu.w && q.y >= gpu.y && q.y <= gpu.y + gpu.h) q.t = Math.min(1, q.t + 0.02 * (0.5 + gpuHeat))
          if (q.x > p.x1 - 4 || q.x < p.x0 - 6 || q.life <= 0 || q.y < p.y0 || q.y > p.y1) { parts.splice(i, 1); continue }
          ctx.strokeStyle = tempColor(q.t); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(q.px, q.py); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.globalAlpha = 1
        }
      }

      // fans (intake front x2, rear exhaust)
      drawFan(p.x0, p.y0 + (p.y1 - p.y0) * 0.36, hasFlow, ang)
      drawFan(p.x0, p.y0 + (p.y1 - p.y0) * 0.72, hasFlow, ang)
      drawFan(p.x1, p.y0 + (p.y1 - p.y0) * 0.30, hasFlow, -ang)

      if (!reduce && flow) raf = requestAnimationFrame(render)
    }

    if (reduce || !flow) { render(performance.now()) } else { raf = requestAnimationFrame(render) }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [data, flow, gpuClr])

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--accent-gold)' }}>Interior do gabinete</span>
        <span className="text-xs text-secondary">encaixe + fluxo · estimativa, não medição</span>
        <span style={{ flex: 1 }} />
        <span className="text-xs text-secondary">fluxo</span>
        <span className="num-mono" style={{ fontSize: '1.15rem', fontWeight: 600, color: scoreColor }}>{score}</span>
        <span className="text-xs" style={{ padding: '2px 8px', borderRadius: 999, border: `1px solid ${scoreColor}`, color: scoreColor }}>{scoreLabel}</span>
      </div>
      <div style={{ background: '#0a0d0b', borderTop: '1px solid var(--border, #1d241f)', borderBottom: '1px solid var(--border, #1d241f)' }}>
        <canvas ref={cvRef} style={{ display: 'block', width: '100%', height: 280 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px', fontSize: 11, alignItems: 'center' }}>
        {data.airflow.zones.map((z) => {
          const s = STATUS[z.status] ?? STATUS.ok
          return (
            <span key={z.zone} style={{ padding: '3px 9px', borderRadius: 999, border: `1px solid ${s.c}55`, color: s.c, fontFamily: 'var(--font-plex-mono), monospace' }}>
              {ZONE_LABEL[z.zone] ?? z.zone}: {s.t}
            </span>
          )
        })}
        <span style={{ padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border,#2a332c)', color: 'var(--text-secondary)', fontFamily: 'var(--font-plex-mono), monospace' }}>
          Pressão: {data.airflow.pressure_balance === 'positive' ? 'positiva' : data.airflow.pressure_balance === 'negative' ? 'negativa' : 'neutra'}
        </span>
        {gpuClr && (
          <span style={{ padding: '3px 9px', borderRadius: 999, border: `1px solid ${gpuClr.is_tight ? '#e0a24a' : '#7fd6a3'}55`, color: gpuClr.is_tight ? '#e0a24a' : '#7fd6a3', fontFamily: 'var(--font-plex-mono), monospace' }}>
            GPU folga {Math.round(gpuClr.remaining_mm)}mm
          </span>
        )}
        {coolerClr && (
          <span style={{ padding: '3px 9px', borderRadius: 999, border: `1px solid ${coolerClr.is_tight ? '#e0a24a' : '#7fd6a3'}55`, color: coolerClr.is_tight ? '#e0a24a' : '#7fd6a3', fontFamily: 'var(--font-plex-mono), monospace' }}>
            cooler folga {Math.round(coolerClr.remaining_mm)}mm
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setFlow((f) => !f)}
          className="btn-ghost"
          style={{ fontSize: 11, padding: '4px 10px' }}
        >
          {flow ? '❚❚ pausar fluxo' : '▶ ver fluxo'}
        </button>
      </div>
    </div>
  )
}
