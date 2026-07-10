import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

/** Same-origin proxy so the browser never talks to the internal API (no CORS). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  try {
    const r = await fetch(`${API}/upgrade/gpu`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return NextResponse.json({ matched: false, current: null, upgrades: [] })
    return NextResponse.json(await r.json())
  } catch {
    return NextResponse.json({ matched: false, current: null, upgrades: [] })
  }
}
