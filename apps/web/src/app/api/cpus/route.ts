import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

/** CPU names for the "meu PC" autocomplete datalist (same-origin, no CORS). */
export async function GET() {
  try {
    const r = await fetch(`${API}/products/?category=cpu&limit=50`, { cache: 'no-store' })
    if (!r.ok) return NextResponse.json({ cpus: [] })
    const rows = (await r.json()) as Array<{ name: string }>
    return NextResponse.json({ cpus: rows.map((p) => p.name) })
  } catch {
    return NextResponse.json({ cpus: [] })
  }
}
