'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Viewer3D — passo 7 do visualizador: o gabinete em 3D DENTRO da página.
 *
 * A malha é a mesma do "baixar modelo 3D": POST /interior/model.gltf, gerada
 * pelo motor a partir das placements em mm que desenham a vista 2D. Não há
 * segundo gerador, logo o 3D não diverge do 2D. Segue a build em cena (placa
 * trocada, ventoinhas simuladas), porque pede o modelo com os mesmos dados.
 *
 * Este ficheiro importa o three.js; GabineteVivoLive carrega-o com
 * next/dynamic só quando o visitante abre o 3D, por isso ninguém paga o peso
 * do three.js sem pedir.
 *
 * CSP: o glTF traz o buffer em `data:` e o GLTFLoader buscaria-o com fetch,
 * que o `connect-src 'self'` bloqueia. Por isso o JSON é convertido em GLB
 * na memória (buffer no chunk binário) e entregue a `parse()`: nada é buscado.
 *
 * Desenho sob pedido (sem loop contínuo): só renderiza quando a câmara mexe.
 */

const PART_LABEL: Array<[RegExp, string]> = [
  [/^chassi/, 'gabinete'], [/^bandeja/, 'bandeja da placa-mãe'], [/^vidro/, 'vidro lateral'],
  [/^shroud/, 'cobertura da fonte'], [/^motherboard/, 'placa-mãe'], [/^cpu/, 'processador'],
  [/^cooler/, 'cooler'], [/^(aio|radiator|rad)/, 'radiador do AIO'], [/^ram/, 'memória'],
  [/^gpu/, 'placa de vídeo'], [/^m2/, 'SSD M.2'], [/^psu/, 'fonte'],
  [/^fan-.*sim/, 'ventoinha simulada'], [/^fan-front/, 'ventoinha da frente'], [/^fan-rear/, 'ventoinha traseira'],
  [/^fan-top/, 'ventoinha do topo'], [/^fan-bottom/, 'ventoinha de baixo'], [/^fan/, 'ventoinha'],
]
const SOURCE_LABEL: Record<string, string> = {
  spec: 'medida da ficha', form_factor_default: 'medida padrão do formato', derivado: 'medida estimada',
}
function partLabel(name: string): string {
  return PART_LABEL.find(([re]) => re.test(name))?.[1] ?? name
}

/** glTF (JSON com 1 buffer em data:) → GLB em memória. */
function gltfJsonToGlb(json: { buffers?: Array<{ uri?: string }> } & Record<string, unknown>): ArrayBuffer {
  const uri = json.buffers?.[0]?.uri ?? ''
  const m = /^data:[^,]*;base64,(.*)$/.exec(uri)
  if (!m || (json.buffers?.length ?? 0) !== 1) throw new Error('glTF inesperado')
  const raw = atob(m[1])
  const bin = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i)
  const j = JSON.stringify({ ...json, buffers: [{ byteLength: bin.byteLength }] })
  const jsonBytes = new TextEncoder().encode(j)
  const pad4 = (n: number) => (n + 3) & ~3
  const jLen = pad4(jsonBytes.byteLength)
  const bLen = pad4(bin.byteLength)
  const total = 12 + 8 + jLen + 8 + bLen
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jLen, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  u8.set(jsonBytes, 20)
  u8.fill(0x20, 20 + jsonBytes.byteLength, 20 + jLen)
  const b0 = 20 + jLen
  dv.setUint32(b0, bLen, true)
  dv.setUint32(b0 + 4, 0x004e4942, true) // 'BIN'
  u8.set(bin, b0 + 8)
  return out
}

type View = 'lado' | 'frente' | 'cima'

export default function Viewer3D({
  components, whatIfFans = [], downloadHref,
}: {
  components: Record<string, number>
  whatIfFans?: string[]
  downloadHref?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const api = useRef<{
    setModel: (root: THREE.Object3D) => void
    view: (v: View) => void
    dispose: () => void
  } | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'fail' | 'nogl'>('loading')
  const [picked, setPicked] = useState<string | null>(null)

  // ── cena (uma vez) ───────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setState('nogl')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.setAttribute('aria-label', 'Gabinete em 3D: arraste para girar, pinça ou roda para aproximar')
    wrap.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 2.4))
    const key = new THREE.DirectionalLight(0xffffff, 2.6)
    key.position.set(-0.4, 1.2, 1.4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xc9a24b, 0.9)
    rim.position.set(1.2, 0.6, -0.8)
    scene.add(rim)

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20)
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.rotateSpeed = 0.8

    let model: THREE.Object3D | null = null
    let center = new THREE.Vector3()
    let radius = 0.3
    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const resize = () => {
      const w = wrap.clientWidth || 1
      const h = wrap.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const view = (v: View) => {
      const d = radius / Math.sin((camera.fov * Math.PI) / 360) * 0.82
      const dir = v === 'frente' ? new THREE.Vector3(-1, 0.18, 0.25)
        : v === 'cima' ? new THREE.Vector3(-0.15, 1, 0.35)
          : new THREE.Vector3(-0.45, 0.35, 1) // lado do vidro, de frente-cima
      camera.position.copy(center).addScaledVector(dir.normalize(), d)
      controls.target.copy(center)
      controls.update()
      render()
    }

    const disposeTree = (o: THREE.Object3D) => o.traverse((c) => {
      const m = c as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.()
    })

    const setModel = (root: THREE.Object3D) => {
      const first = !model
      if (model) { scene.remove(model); disposeTree(model) }
      model = root
      root.traverse((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh) return
        // material próprio por peça (o destaque não pinta as outras)
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mesh.material = mat
        if (mat.transparent) { mat.depthWrite = false; return }
        // arestas: as cores da marca são muito escuras; o contorno dá a forma
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 30),
          new THREE.LineBasicMaterial({ color: 0x8a8f99, transparent: true, opacity: 0.45 }),
        )
        edges.raycast = () => {}
        mesh.add(edges)
      })
      scene.add(root)
      const box = new THREE.Box3().setFromObject(root)
      center = box.getCenter(new THREE.Vector3())
      radius = box.getBoundingSphere(new THREE.Sphere()).radius
      controls.minDistance = radius * 0.9
      controls.maxDistance = radius * 5
      if (first) view('lado'); else render()
    }

    // tocar numa peça → nome (+ de onde vem a medida); arrastar não conta
    const ray = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    let lit: THREE.Mesh | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!down || !model) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 6) return
      const r = canvas.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObject(model, true).find((h) => {
        const mat = (h.object as THREE.Mesh).material as THREE.Material
        return (h.object as THREE.Mesh).isMesh && !mat.transparent
      })
      if (lit) { (lit.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000); lit = null }
      if (hit) {
        let o: THREE.Object3D | null = hit.object
        while (o && !o.name && o.parent) o = o.parent
        lit = hit.object as THREE.Mesh
        ;(lit.material as THREE.MeshStandardMaterial).emissive.setHex(0x5a4310)
        const src = (o?.userData?.fonte as string | undefined) ?? (hit.object.userData?.fonte as string | undefined)
        setPicked(`${partLabel(o?.name ?? '')}${src && SOURCE_LABEL[src] ? ` · ${SOURCE_LABEL[src]}` : ''}`)
      } else {
        setPicked(null)
      }
      render()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)

    api.current = {
      setModel, view,
      dispose: () => {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointerup', onUp)
        controls.dispose()
        if (model) disposeTree(model)
        renderer.dispose()
        renderer.forceContextLoss()
        canvas.remove()
      },
    }
    resize()
    return () => { api.current?.dispose(); api.current = null }
  }, [])

  // ── modelo (a cada build em cena) ────────────────────────────────────────
  const fansKey = whatIfFans.join(',')
  useEffect(() => {
    if (!api.current) return // sem WebGL: a cena nem chegou a existir
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const r = await fetch('/api/interior/model.gltf', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ components, ...(fansKey ? { what_if_fans: fansKey.split(',') } : {}) }),
        })
        if (!r.ok) throw new Error(String(r.status))
        const glb = gltfJsonToGlb(await r.json())
        const gltf = await new GLTFLoader().parseAsync(glb, '')
        if (cancelled) return
        api.current?.setModel(gltf.scene)
        setPicked(null)
        setState('ok')
      } catch {
        if (!cancelled) setState('fail')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, fansKey])

  const btn: React.CSSProperties = {
    fontSize: 12, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--dim)',
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 'clamp(280px, 62vw, 440px)' }}>
        <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }} />
        {state !== 'ok' && (
          <div className="mono" style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center',
            padding: 16, fontSize: 12.5, color: state === 'loading' ? 'var(--dim)' : 'var(--warn)', pointerEvents: 'none',
          }}>
            {state === 'loading' && 'montando o gabinete em 3D…'}
            {state === 'fail' && 'não deu para gerar o 3D agora.'}
            {state === 'nogl' && 'este navegador não mostra 3D (WebGL desligado).'}
          </div>
        )}
        {picked && (
          <div className="mono" role="status" style={{
            position: 'absolute', left: 10, top: 10, padding: '4px 10px', borderRadius: 8, fontSize: 12,
            background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)', pointerEvents: 'none',
          }}>{picked}</div>
        )}
      </div>
      <div className="mono" style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px',
        borderTop: '1px solid var(--line2)', fontSize: 11.5, color: 'var(--dim2)',
      }}>
        <button type="button" style={btn} onClick={() => api.current?.view('lado')}>lado</button>
        <button type="button" style={btn} onClick={() => api.current?.view('frente')}>frente</button>
        <button type="button" style={btn} onClick={() => api.current?.view('cima')}>cima</button>
        <span style={{ flex: '1 1 160px' }}>arraste para girar · pinça/roda para aproximar · toque numa peça</span>
        {downloadHref && (
          <a href={downloadHref} download data-umami-event="baixar-3d" style={{ color: 'var(--dim)' }}>⬇ .gltf</a>
        )}
      </div>
      <div className="mono" style={{ padding: '0 12px 8px', fontSize: 10.5, color: 'var(--dim2)' }}>
        3D gerado da mesma geometria em mm da vista 2D · estimativa, não medição
      </div>
    </div>
  )
}
