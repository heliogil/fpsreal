import { NextResponse } from 'next/server'

const API = process.env.PCB_API_INTERNAL || 'http://pcb_api:8100'

export async function GET() {
  try {
    const r = await fetch(`${API}/products/?category=cpu&limit=200`, { cache: 'no-store' })
    if (!r.ok) return NextResponse.json({ cpus: [] })
    const products = (await r.json()) as Array<{ name: string }>
    return NextResponse.json({ cpus: products.map((p) => p.name).sort() })
  } catch {
    return NextResponse.json({ cpus: [] })
  }
}
