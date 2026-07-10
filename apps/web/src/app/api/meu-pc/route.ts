import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

/** Same-origin proxy so the browser never talks to the internal API (no CORS). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const empty = { matched_gpu: false, current: null, gpu_upgrades: [], cpu_upgrades: [] }
  try {
    const r = await fetch(`${API}/upgrade/advise`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return NextResponse.json(empty)
    return NextResponse.json(await r.json())
  } catch {
    return NextResponse.json(empty)
  }
}
