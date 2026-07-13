'use client'

import { useEffect, useState } from 'react'
import { detectGpu, saveMeuPc, loadMeuPc } from '@/lib/gpu-detect'

const RES = ['1080p', '1440p', '4k'] as const
type Res = (typeof RES)[number]

type Upg = {
  gpu_id?: number
  cpu_id?: number
  name: string
  brand: string | null
  price_brl: number
  offer_id: number | null
  avg_fps: number
  gain_fps: number | null
  gain_pct: number | null
  fps_per_1k: number
}
type Result = {
  matched_gpu: boolean
  current: { gpu: { name: string; avg_fps: number | null }; cpu: { name: string; id: number } } | null
  gpu_upgrades: Upg[]
  cpu_upgrades: Upg[]
}

const syne = { fontFamily: 'var(--font-syne), Syne, sans-serif' }
const mono = { fontFamily: 'var(--font-plex-mono), monospace' }
function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function UpgradeCard({ u, res }: { u: Upg; res: Res }) {
  return (
    <div className="card card-hover">
      <div className="flex justify-between items-baseline mb-1">
        <span style={syne}>{u.name}</span>
        <span className="num-mono" style={{ ...mono, color: 'var(--text-mono)' }}>{brl(u.price_brl)}</span>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="num-mono text-xl font-bold">{Math.round(u.avg_fps)}<span className="text-xs text-secondary"> FPS</span></span>
        {u.gain_fps != null && u.gain_fps > 0 && (
          <span className="num-mono text-sm" style={{ color: 'var(--accent-green,#7fd6a3)' }}>
            +{Math.round(u.gain_fps)} FPS{u.gain_pct != null ? ` (+${u.gain_pct}%)` : ''}
          </span>
        )}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-secondary num-mono">{u.fps_per_1k} FPS / R$1k</span>
        {u.offer_id != null && (
          <a href={`/go/${u.offer_id}?utm_source=meu-pc&utm_medium=upgrade&utm_campaign=${res}`}
            className="text-xs" style={{ color: 'var(--accent-gold)' }}>
            Comprar (amostra) →
          </a>
        )}
      </div>
    </div>
  )
}

export default function MeuPcPage() {
  const [detected, setDetected] = useState<string | null | undefined>(undefined)
  const [gpu, setGpu] = useState('')
  const [cpu, setCpu] = useState('')
  const [cpuOptions, setCpuOptions] = useState<string[]>([])
  const [budget, setBudget] = useState(3000)
  const [res, setRes] = useState<Res>('1080p')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const saved = loadMeuPc()
    const d = detectGpu()
    setDetected(d.model)
    setGpu(d.model || saved?.gpu || '')
    if (saved?.cpu) setCpu(saved.cpu)
    fetch('/api/products/?category=cpu&limit=200')
      .then((r) => r.json())
      .then((products: Array<{ name: string }>) => setCpuOptions(products.map((p) => p.name).sort()))
      .catch(() => {})
  }, [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!gpu.trim()) return
    setLoading(true)
    saveMeuPc(gpu.trim(), cpu.trim())
    try {
      const r = await fetch('/api/upgrade/advise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gpu_name: gpu.trim(), cpu_name: cpu.trim(), budget_brl: budget, resolution: res }),
      })
      setResult(await r.json())
    } catch {
      setResult({ matched_gpu: false, current: null, gpu_upgrades: [], cpu_upgrades: [] })
    } finally {
      setLoading(false)
    }
  }

  const curFps = result?.current?.gpu.avg_fps ?? null

  return (
    <div className="py-10">
      <section className="text-center mb-8">
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--accent-gold)' }}>
          {detected === undefined ? 'a detetar a tua placa…' : detected ? '● detetámos a tua GPU' : '○ não detetámos — escolhe abaixo'}
        </div>
        <h1 className="text-4xl md:text-5xl mb-3" style={syne}>Meu PC atual</h1>
        <p className="text-secondary max-w-2xl mx-auto">
          Lemos a tua placa direto do navegador (WebGL, sem instalar nada). Diz o CPU e o orçamento
          e dizemos o upgrade — de GPU <em>ou</em> de CPU — que rende <strong>mais FPS por real</strong>.
          FPS é estimativa, não medição.
        </p>
      </section>

      <form onSubmit={run} className="card mb-8" style={{ maxWidth: 640, margin: '0 auto 32px' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-secondary">Placa de vídeo (GPU)</label>
            <input value={gpu} onChange={(e) => setGpu(e.target.value)} placeholder="ex: GeForce RTX 4060"
              className="w-full mt-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg,#f0f0ff)', padding: '8px 10px', ...mono }} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-secondary">Processador (CPU)</label>
            <input value={cpu} onChange={(e) => setCpu(e.target.value)} placeholder="ex: Ryzen 5 5600" list="cpu-list"
              className="w-full mt-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg,#f0f0ff)', padding: '8px 10px', ...mono }} />
            <datalist id="cpu-list">{cpuOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="text-xs uppercase tracking-wider text-secondary">Orçamento p/ o upgrade</label>
            <div className="num-mono text-xl font-bold">{brl(budget)}</div>
            <input type="range" min={500} max={16000} step={200} value={budget}
              onChange={(e) => setBudget(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-gold)' }} aria-label="Orçamento" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-secondary block mb-1">Resolução</label>
            <div className="flex gap-1">
              {RES.map((r) => (
                <button key={r} type="button" onClick={() => setRes(r)} className="text-sm"
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${res === r ? 'var(--accent-gold)' : 'var(--border)'}`, background: res === r ? 'rgba(212,160,23,.08)' : 'var(--bg-elevated)', color: res === r ? 'var(--fg,#f0f0ff)' : 'var(--text-secondary)' }}>
                  {r === '4k' ? '4K' : r}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-gold" disabled={loading || !gpu.trim()}>
            {loading ? '…' : 'Ver upgrades →'}
          </button>
        </div>
      </form>

      {result && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="card mb-6 flex items-center justify-between" style={{ borderColor: 'var(--accent-gold)' }}>
            <div>
              <div className="text-xs uppercase tracking-wider text-secondary">O teu PC hoje</div>
              <div style={syne} className="text-lg">{result.current?.gpu.name ?? gpu}</div>
              <div className="text-xs text-secondary">com {result.current?.cpu.name}</div>
            </div>
            {curFps != null ? (
              <div className="text-right">
                <div className="num-mono text-2xl font-bold">{Math.round(curFps)}<span className="text-xs text-secondary"> FPS méd.</span></div>
                <div className="text-xs text-secondary">{res} · 4 jogos</div>
              </div>
            ) : (
              <div className="text-xs text-secondary" style={{ maxWidth: 220, textAlign: 'right' }}>
                Não temos essa GPU no banco — mostramos as melhores por custo/FPS.
              </div>
            )}
          </div>

          <h2 className="text-xl mb-3" style={syne}>Upgrades de GPU {curFps == null && '(melhores por custo/FPS)'}</h2>
          {result.gpu_upgrades.length === 0 ? (
            <div className="card text-secondary text-sm mb-8">Nenhuma GPU acima da tua cabe nesse orçamento.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {result.gpu_upgrades.map((u) => <UpgradeCard key={u.gpu_id} u={u} res={res} />)}
            </div>
          )}

          {curFps != null && (
            <>
              <h2 className="text-xl mb-3" style={syne}>Upgrades de CPU <span className="text-xs text-secondary">(mesma GPU)</span></h2>
              {result.cpu_upgrades.length === 0 ? (
                <div className="card text-secondary text-sm">O teu CPU já não segura mais FPS com essa GPU nessa resolução — o gargalo é a placa.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.cpu_upgrades.map((u) => <UpgradeCard key={u.cpu_id} u={u} res={res} />)}
                </div>
              )}
            </>
          )}

          <p className="text-xs text-secondary italic mt-4">
            FPS estimados via modelo anchor_scale (média de 4 jogos, {res}). Preços de amostra até os feeds oficiais.
          </p>
        </div>
      )}
    </div>
  )
}
