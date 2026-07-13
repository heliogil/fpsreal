import { NextResponse, type NextRequest } from 'next/server'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${API}/upgrade/advise`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return NextResponse.json({ matched_gpu: false, current: null, gpu_upgrades: [], cpu_upgrades: [] })
    return NextResponse.json(await r.json())
  } catch {
    return NextResponse.json({ matched_gpu: false, current: null, gpu_upgrades: [], cpu_upgrades: [] })
  }
}
