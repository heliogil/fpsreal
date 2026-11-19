'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeoMount, LiveInterior } from '@/lib/live-server'

/**
 * Viewer3D — o gabinete em 3D DENTRO da página (vista principal no desktop).
 *
 * A malha é a mesma do "baixar modelo 3D": POST /interior/model.gltf, gerada
 * pelo motor a partir das placements em mm que desenham a vista 2D. Não há
 * segundo gerador, logo o 3D não diverge do 2D. Segue a build em cena (placa
 * trocada, ventoinhas simuladas), porque pede o modelo com os mesmos dados.
 *
 * Por cima da malha, a partir da MESMA resposta do /interior/estimate que o 2D
 * usa (fase 2 do 3D, 2026-11-19):
 *  - mounts livres como anéis clicáveis — clicar simula uma ventoinha ali
 *    (o mesmo what-if do 2D); clicar numa ventoinha simulada tira-a;
 *  - linhas de fluxo do campo resolvido pelo motor (corte no meio da largura);
 *  - etiquetas com as medidas que decidem compra (GPU e cooler, com a folga).
 *
 * Este ficheiro importa o three.js; GabineteVivoLive carrega-o com
 * next/dynamic só quando o 3D vai aparecer, por isso ninguém paga o peso do
 * three.js sem precisar.
 *
 * CSP: o glTF traz o buffer em `data:` e o GLTFLoader buscaria-o com fetch,
 * que o `connect-src 'self'` bloqueia. Por isso o JSON é convertido em GLB
 * na memória (buffer no chunk binário) e entregue a `parse()`: nada é buscado.
 *
 * Desenho sob pedido (sem loop contínuo): só renderiza quando algo muda.
 */

const PART_LABEL: Array<[RegExp, string]> = [
  [/^chassi/, 'gabinete'], [/^bandeja/, 'bandeja da placa-mãe'], [/^vidro/, 'vidro lateral'],
  [/^shroud/, 'cobertura da fonte'], [/^motherboard/, 'placa-mãe'], [/^cpu/, 'processador'],
  [/^cooler/, 'cooler'], [/^(aio|radiator|rad)/, 'radiador do AIO'], [/^ram/, 'memória'],
  [/^gpu/, 'placa de vídeo'], [/^m2/, 'SSD M.2'], [/^psu/, 'fonte'],
  [/^fan-front/, 'ventoinha da frente'], [/^fan-rear/, 'ventoinha traseira'],
  [/^fan-top/, 'ventoinha do topo'], [/^fan-shroud/, 'ventoinha da cobertura da fonte'], [/^fan/, 'ventoinha'],
]
const SOURCE_LABEL: Record<string, string> = {
  spec: 'medida da ficha', form_factor_default: 'medida padrão do formato', derivado: 'medida estimada',
  simulado: 'simulada — clique para tirar',
}
const MOUNT_LABEL: Record<string, string> = {
  front_bottom: 'frontal inferior', front_top: 'frontal superior', front_mid: 'frontal meio',
  rear: 'traseira', top_bay: 'baía superior', shroud: 'cobertura da fonte',
}
const mountLabel = (id: string) => MOUNT_LABEL[id] ?? id.replace(/_/g, ' ')
/** nó do glTF → chave da ficha no GabineteVivo (as peças que têm ficha) */
const FICHA_OF: Array<[RegExp, string]> = [
  [/^gpu/, 'gpu'], [/^cooler/, 'cooler'], [/^aio_pump/, 'pump'], [/^aio_(radiator|fans)/, 'rad'],
  [/^psu/, 'psu'], [/^motherboard/, 'mobo'], [/^ram/, 'ram'],
]
const fichaOf = (name: string) => FICHA_OF.find(([re]) => re.test(name))?.[1] ?? null
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
type Label = { el: HTMLDivElement; pos: THREE.Vector3 }

const S = 0.001 // mm → m (mesmos eixos do glTF: X profundidade, Y altura, Z largura)
const C_FRESH = new THREE.Color(0x7ba86a)
const C_WARN = new THREE.Color(0xe0a93b)
const C_HOT = new THREE.Color(0xc85348)
const C_ACCENT = 0xc9a24b

/** Centros (mm) das ventoinhas que cabem num mount, e o raio de cada uma. */
function mountSlots(m: GeoMount, W: number): { pts: THREE.Vector3[]; r: number; face: string } {
  const face = m.face ?? 'front'
  const z = m.z ?? W / 2
  const n = Math.max(1, m.capacity ?? 1)
  const pts: THREE.Vector3[] = []
  if (face === 'top' || face === 'bottom') {
    const r = Math.min(m.w / n, m.d ?? 120) / 2 * 0.88
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(m.x + (m.w * (i + 0.5)) / n, m.y + m.h / 2, z))
    return { pts, r, face }
  }
  if (face === 'side') {
    pts.push(new THREE.Vector3(m.x + m.w / 2, m.y + m.h / 2, z))
    return { pts, r: Math.min(m.w, m.h) / 2 * 0.9, face }
  }
  const r = Math.min(m.h / n, m.d ?? 120) / 2 * 0.88
  for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(m.x + m.w / 2, m.y + (m.h * (i + 0.5)) / n, z))
  return { pts, r, face }
}

export default function Viewer3D({
  components, whatIfFans = [], downloadHref, interior, onToggleFan, embedded = false, onPick, picked: pickedKey,
}: {
  components: Record<string, number>
  whatIfFans?: string[]
  downloadHref?: string
  /** a mesma estimativa que desenha o 2D: mounts, campo de fluxo e folgas */
  interior?: LiveInterior | null
  /** clicar num mount livre (ou numa ventoinha simulada) pede o what-if */
  onToggleFan?: (mountId: string) => void
  /** dentro do cartão do visualizador (sem moldura própria, proporção do 2D) */
  embedded?: boolean
  /** tocar numa peça com ficha (GPU, cooler, fonte…) abre a ficha no cartão */
  onPick?: (key: string | null) => void
  /** ficha aberta agora (null = nenhuma): fechar a ficha apaga o realce */
  picked?: string | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef(onToggleFan)
  toggleRef.current = onToggleFan
  const whatIfRef = useRef(whatIfFans)
  whatIfRef.current = whatIfFans
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const api = useRef<{
    setModel: (root: THREE.Object3D) => void
    setOverlay: (g: THREE.Group, labels: Label[]) => void
    setFlowVisible: (v: boolean) => void
    setActive: (v: boolean) => void
    clearLit: () => void
    view: (v: View) => void
    dispose: () => void
  } | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'fail' | 'nogl'>('loading')
  const [picked, setPicked] = useState<string | null>(null)
  const [showFlow, setShowFlow] = useState(true)
  // Toque (celular/tablet): o 3D começa PARADO — o dedo rola a página, um toque
  // escolhe peça ou vaga. Girar pede um toque em "girar". Sem isto, o arrastar
  // do 3D prende a rolagem da página (o problema da fase 3).
  const [touch, setTouch] = useState(false)
  const [active, setActive] = useState(false)

  // ── cena (uma vez) ───────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    const labelsBox = labelsRef.current
    if (!wrap || !labelsBox) return
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
    // a roda só aproxima depois de um clique na cena: passar o rato por cima
    // a rolar a página não pode virar zoom (prendia a rolagem no desktop)
    controls.enableZoom = false
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    setTouch(isTouch)
    const setActiveScene = (v: boolean) => {
      if (!isTouch) return
      controls.enabled = v
      controls.enableZoom = v
      canvas.style.touchAction = v ? 'none' : 'pan-y'
    }
    setActiveScene(false)
    // saiu da tela → volta a parar (o próximo arrastar é rolagem outra vez)
    const io = new IntersectionObserver(([en]) => {
      if (en && en.intersectionRatio < 0.35) setActive(false)
    }, { threshold: [0, 0.35] })
    io.observe(wrap)

    let model: THREE.Object3D | null = null
    let overlay: THREE.Group | null = null
    let flowGroup: THREE.Object3D | null = null
    let labels: Label[] = []
    let flowVisible = true
    let center = new THREE.Vector3()
    let radius = 0.3
    const v3 = new THREE.Vector3()

    const placeLabels = () => {
      const w = wrap.clientWidth || 1
      const h = wrap.clientHeight || 1
      for (const l of labels) {
        v3.copy(l.pos).project(camera)
        const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05
        l.el.style.display = vis ? 'block' : 'none'
        if (vis) l.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -100%)`
      }
    }
    const render = () => { renderer.render(scene, camera); placeLabels() }
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

    const setOverlay = (g: THREE.Group, ls: Label[]) => {
      if (overlay) { scene.remove(overlay); disposeTree(overlay) }
      labelsBox.replaceChildren(...ls.map((l) => l.el))
      overlay = g
      labels = ls
      flowGroup = g.getObjectByName('fluxo') ?? null
      if (flowGroup) flowGroup.visible = flowVisible
      scene.add(g)
      render()
    }
    const setFlowVisible = (v: boolean) => {
      flowVisible = v
      if (flowGroup) flowGroup.visible = v
      render()
    }

    // ── apontar / tocar ──────────────────────────────────────────────────
    // mount livre → simula ventoinha; ventoinha simulada → tira; peça → nome
    // (+ de onde vem a medida). Arrastar não conta como toque.
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitAt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const targets = overlay ? overlay.children.filter((c) => c.name !== 'fluxo') : []
      const mh = ray.intersectObjects(targets, true).find((h) => h.object.userData?.mountId)
      if (mh) return { mountId: mh.object.userData.mountId as string, sim: false, obj: null as THREE.Mesh | null, name: '', ring: (mh.object.userData.ring as THREE.Mesh | undefined) ?? null }
      if (!model) return null
      const hit = ray.intersectObject(model, true).find((h) => {
        const mat = (h.object as THREE.Mesh).material as THREE.Material
        return (h.object as THREE.Mesh).isMesh && !mat.transparent
      })
      if (!hit) return null
      let o: THREE.Object3D | null = hit.object
      while (o && !o.name && o.parent) o = o.parent
      const name = o?.name ?? ''
      const src = (o?.userData?.fonte as string | undefined) ?? (hit.object.userData?.fonte as string | undefined)
      const fm = /^fan-(.+)-\d+$/.exec(name)
      if (src === 'simulado' && fm && whatIfRef.current.includes(fm[1])) {
        return { mountId: fm[1], sim: true, obj: hit.object as THREE.Mesh, name }
      }
      return { mountId: null, sim: false, obj: hit.object as THREE.Mesh, name, src }
    }
    let down: { x: number; y: number } | null = null
    let lit: THREE.Mesh | null = null
    let hoverRing: THREE.Mesh | null = null
    const setRingHover = (ring: THREE.Mesh | null) => {
      if (hoverRing === ring) return
      if (hoverRing) (hoverRing.material as THREE.MeshBasicMaterial).opacity = hoverRing.userData.baseOpacity
      hoverRing = ring
      if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 1
      render()
    }
    let moveQueued = false
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons || moveQueued) return
      moveQueued = true
      requestAnimationFrame(() => {
        moveQueued = false
        const h = hitAt(e)
        const ring = (h && 'ring' in h ? h.ring : null) ?? null
        setRingHover(ring)
        const actionable = !!h?.mountId && !!toggleRef.current
        canvas.style.cursor = actionable ? 'pointer' : ''
        if (actionable && h?.mountId) {
          setPicked(h.sim
            ? `${mountLabel(h.mountId)} · ventoinha simulada — clique para tirar`
            : `${mountLabel(h.mountId)} · espaço livre — clique para simular uma ventoinha`)
        }
      })
    }
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
      if (!isTouch) controls.enableZoom = true
    }
    const onLeave = () => { if (!isTouch) controls.enableZoom = false }
    const onUp = (e: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 6) return
      const h = hitAt(e)
      if (lit) { (lit.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000); lit = null }
      if (h?.mountId && toggleRef.current) {
        setPicked(h.sim ? 'tirando a ventoinha simulada…' : `simulando ventoinha: ${mountLabel(h.mountId)}…`)
        toggleRef.current(h.mountId)
      } else if (h?.obj) {
        lit = h.obj
        ;(lit.material as THREE.MeshStandardMaterial).emissive.setHex(0x5a4310)
        const key = fichaOf(h.name)
        if (key && pickRef.current) {
          setPicked(null)          // a ficha do cartão diz mais do que o nome
          pickRef.current(key)
        } else {
          pickRef.current?.(null)
          const src = 'src' in h ? h.src : undefined
          setPicked(`${partLabel(h.name)}${src && SOURCE_LABEL[src] ? ` · ${SOURCE_LABEL[src]}` : ''}`)
        }
      } else {
        pickRef.current?.(null)
        setPicked(null)
      }
      render()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)

    const clearLit = () => {
      if (lit) { (lit.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000); lit = null; render() }
    }
    api.current = {
      setModel, setOverlay, setFlowVisible, view, clearLit, setActive: setActiveScene,
      dispose: () => {
        ro.disconnect()
        io.disconnect()
        canvas.removeEventListener('pointerleave', onLeave)
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointermove', onMove)
        controls.dispose()
        if (model) disposeTree(model)
        if (overlay) disposeTree(overlay)
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
    setState((s) => (s === 'ok' ? s : 'loading'))
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

  // ── sobreposição: mounts livres, fluxo, medidas (da mesma estimativa) ────
  useEffect(() => {
    if (!api.current || !interior?.geometry) return
    const g = interior.geometry
    const W = g.case.width_mm ?? 170
    const grp = new THREE.Group()
    grp.name = 'sobreposicao'
    const labels: Label[] = []

    // mounts livres: anel por vaga, com um disco quase invisível para o clique
    for (const m of g.mounts) {
      if (m.occupied_by !== null || !onToggleFan) continue
      const { pts, r, face } = mountSlots(m, W)
      for (const p of pts) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: C_ACCENT, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
        })
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 40), ringMat)
        ring.userData = { mountId: m.id, baseOpacity: 0.7 }
        ring.renderOrder = 2
        const pad = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 32), new THREE.MeshBasicMaterial({
          color: C_ACCENT, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false,
        }))
        pad.userData = { mountId: m.id, ring }
        ring.userData.ring = ring
        const holder = new THREE.Group()
        holder.add(ring, pad)
        holder.position.set(p.x * S, p.y * S, p.z * S)
        holder.scale.setScalar(S)
        if (face === 'front' || face === 'rear') holder.rotation.y = Math.PI / 2
        else if (face === 'top' || face === 'bottom') holder.rotation.x = Math.PI / 2
        grp.add(holder)
      }
    }

    // linhas de fluxo: o campo resolvido pelo motor, num plano entre as peças e o vidro
    const ff = g.flow_field
    if (ff?.streamlines?.length) {
      const flow = new THREE.Group()
      flow.name = 'fluxo'
      const zf = W * 0.62
      for (const sl of ff.streamlines) {
        if (sl.pts.length < 3) continue
        const curve = new THREE.CatmullRomCurve3(sl.pts.map(([x, y]) => new THREE.Vector3(x * S, y * S, zf * S)))
        const segs = Math.min(80, sl.pts.length * 3)
        const geo = new THREE.TubeGeometry(curve, segs, 1.3 * S, 5, false)
        // cor ao longo do trajeto: ar fresco → aquecido (a partícula leva o calor das peças)
        const cols: number[] = []
        const pos = geo.attributes.position
        const ring = 6 // radialSegments + 1
        for (let i = 0; i < pos.count; i++) {
          const t = Math.floor(i / ring) / segs
          const c = t < 0.5 ? C_FRESH.clone().lerp(C_WARN, t * 2) : C_WARN.clone().lerp(C_HOT, (t - 0.5) * 1.2)
          cols.push(c.r, c.g, c.b)
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
        const tube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }))
        tube.raycast = () => {}
        flow.add(tube)
        // ponta de seta no fim: para onde o ar vai
        const end = curve.getPoint(1)
        const dir = curve.getTangent(1)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5 * S, 12 * S, 10), new THREE.MeshBasicMaterial({ color: C_HOT }))
        cone.position.copy(end)
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        cone.raycast = () => {}
        flow.add(cone)
      }
      grp.add(flow)
    }

    // etiquetas com as medidas que decidem compra
    const mk = (text: string, tone: string, pos: THREE.Vector3) => {
      const el = document.createElement('div')
      el.className = 'mono'
      el.textContent = text
      Object.assign(el.style, {
        position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap', pointerEvents: 'none',
        fontSize: '11.5px', padding: '2px 7px', borderRadius: '6px', color: tone,
        background: 'color-mix(in srgb, var(--panel2) 88%, transparent)', border: '1px solid var(--line)',
      } satisfies Partial<CSSStyleDeclaration>)
      labels.push({ el, pos: pos.multiplyScalar(S) })
    }
    const gpu = g.placements.find((p) => p.part === 'gpu')
    const gClr = interior.clearances.gpu
    if (gpu && interior.parts.gpu.length_mm) {
      const thick = interior.parts.gpu.thickness_mm ?? 41
      mk(`GPU ${Math.round(interior.parts.gpu.length_mm)}mm${gClr ? ` · folga ${Math.round(gClr.remaining_mm)}mm` : ''}`,
        gClr?.is_tight ? 'var(--warn)' : 'var(--fresh)',
        new THREE.Vector3(gpu.x + gpu.w / 2, gpu.y + gpu.h + 6, 4 + thick))
    }
    const cooler = g.placements.find((p) => p.part === 'air_cooler')
    const cClr = interior.clearances.cooler
    if (cooler && interior.parts.cooler.height_mm) {
      mk(`cooler ${Math.round(interior.parts.cooler.height_mm)}mm${cClr ? ` · folga ${Math.round(cClr.remaining_mm)}mm até o vidro` : ''}`,
        cClr?.is_tight ? 'var(--warn)' : 'var(--fresh)',
        new THREE.Vector3(cooler.x + cooler.w / 2, cooler.y + cooler.h + 6, 4 + interior.parts.cooler.height_mm))
    }
    const rad = g.placements.find((p) => p.part === 'aio_radiator')
    if (rad) mk(`radiador ${Math.round(rad.w)}mm`, 'var(--dim)', new THREE.Vector3(rad.x + rad.w / 2, rad.y, W / 2))

    api.current.setOverlay(grp, labels)
  }, [interior, onToggleFan])

  useEffect(() => { api.current?.setFlowVisible(showFlow) }, [showFlow])
  useEffect(() => { api.current?.setActive(active) }, [active])
  useEffect(() => { if (!pickedKey) api.current?.clearLit() }, [pickedKey])

  const btn: React.CSSProperties = {
    fontSize: 12, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--dim)',
  }
  const hasFree = !!onToggleFan && !!interior?.geometry?.mounts.some((m) => m.occupied_by === null)

  return (
    <div style={embedded ? undefined : { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', overflow: 'hidden' }}>
      <div style={embedded
        ? { position: 'relative', aspectRatio: '720 / 430', maxHeight: '70vh', width: '100%' }
        : { position: 'relative', height: 'clamp(280px, 62vw, 440px)' }}>
        <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }} />
        <div ref={labelsRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
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
            maxWidth: 'calc(100% - 20px)',
          }}>{picked}</div>
        )}
        {touch && state === 'ok' && !active && (
          <button type="button" onClick={() => setActive(true)} data-umami-event="viewer-3d-girar" className="mono"
            style={{
              position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 3,
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 99, cursor: 'pointer',
              border: '1px solid var(--accent-dim)', background: 'var(--card)', color: 'var(--accent)',
              boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap',
            }}>
            ⟳ toque para girar em 3D
          </button>
        )}
        {touch && active && (
          <button type="button" onClick={() => setActive(false)} className="mono"
            style={{
              position: 'absolute', right: 10, top: 10, zIndex: 3, fontSize: 12, padding: '5px 12px', borderRadius: 99,
              cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)',
            }}>
            ✓ pronto
          </button>
        )}
      </div>
      <div className="mono" style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px',
        borderTop: '1px solid var(--line2)', fontSize: 11.5, color: 'var(--dim2)',
      }}>
        <button type="button" style={btn} onClick={() => api.current?.view('lado')}>lado</button>
        <button type="button" style={btn} onClick={() => api.current?.view('frente')}>frente</button>
        <button type="button" style={btn} onClick={() => api.current?.view('cima')}>cima</button>
        {interior?.geometry?.flow_field && (
          <button type="button" style={{ ...btn, color: showFlow ? 'var(--fresh)' : 'var(--dim)' }}
            aria-pressed={showFlow} onClick={() => setShowFlow((v) => !v)} data-umami-event="viewer-3d-fluxo">
            {showFlow ? '◉' : '○'} fluxo de ar
          </button>
        )}
        <span style={{ flex: '1 1 160px' }}>
          {touch
            ? `toque numa peça para ver a ficha${hasFree ? ' · anel dourado = vaga livre, toque para simular' : ''}`
            : `arraste para girar · clique e use a roda para aproximar · clique numa peça para ver a ficha${hasFree ? ' · anel dourado = vaga livre' : ''}`}
        </span>
        {downloadHref && (
          <a href={downloadHref} download data-umami-event="baixar-3d" style={{ color: 'var(--dim)' }}>⬇ .gltf</a>
        )}
      </div>
      <div className="mono" style={{ padding: '0 12px 8px', fontSize: 10.5, color: 'var(--dim2)' }}>
        3D gerado pelo motor, da geometria em mm · linhas de fluxo: corte no meio da largura · estimativa, não medição
      </div>
    </div>
  )
}
