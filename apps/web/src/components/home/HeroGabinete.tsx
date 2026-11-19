'use client'

import { useEffect, useState } from 'react'
import type { LiveInterior } from '@/lib/live-server'
import Gabinete2D from '@/components/interior/Gabinete2D'

type Viewer3DType = typeof import('@/components/interior/Viewer3D').default

/**
 * O gabinete do Rei como protagonista da home (padrão "produto como herói").
 * O HTML do servidor traz o corte 2D leve; o 3D (que gira devagar até a pessoa
 * tocar) entra assim que o three.js chega — sem "carregando" e sem saltar,
 * porque os dois ocupam o mesmo quadro.
 */
export default function HeroGabinete({ components, interior }: {
  components: Record<string, number>
  interior: LiveInterior
}) {
  const [V3D, setV3D] = useState<Viewer3DType | null>(null)
  const [gl, setGl] = useState(true)

  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) { setGl(false); return }
    } catch { setGl(false); return }
    let off = false
    void import('@/components/interior/Viewer3D').then((m) => { if (!off) setV3D(() => m.default) })
    return () => { off = true }
  }, [])

  const flat = (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>
      <Gabinete2D interior={interior} compact />
    </div>
  )
  if (!gl || !V3D) return <div style={{ aspectRatio: '1 / 0.82', display: 'grid', placeItems: 'center' }}>{flat}</div>
  return (
    <V3D embedded minimal autoRotate aspect="1 / 0.82" components={components} interior={interior} placeholder={flat} />
  )
}
