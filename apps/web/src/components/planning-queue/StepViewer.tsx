import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import occtimportjs from 'occt-import-js'

interface StepViewerProps {
  url: string
}

// The WASM module (~7MB) and any already-parsed STEP geometry are cached at
// module scope — switching the selected job/order shouldn't re-download or
// re-parse the same file, and shouldn't pay the WASM init cost twice.
let occtModulePromise: ReturnType<typeof occtimportjs> | null = null
function getOcctModule() {
  if (!occtModulePromise) {
    occtModulePromise = occtimportjs({ locateFile: () => '/occt/occt-import-js.wasm' })
  }
  return occtModulePromise
}

interface ParsedGeometry { positions: Float32Array; normals: Float32Array | null; index: Uint32Array }
const geometryCache = new Map<string, ParsedGeometry[]>()

async function loadStepGeometry(url: string): Promise<ParsedGeometry[]> {
  const cached = geometryCache.get(url)
  if (cached) return cached

  const [occt, response] = await Promise.all([getOcctModule(), fetch(url)])
  if (!response.ok) throw new Error(`Kon bestand niet laden (${response.status})`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  const result = occt.ReadStepFile(buffer, null)
  if (!result.success || result.meshes.length === 0) throw new Error('Geen geometrie gevonden in step-bestand')

  const meshes = result.meshes.map(m => ({
    positions: new Float32Array(m.attributes.position.array),
    normals: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
    index: new Uint32Array(m.index.array),
  }))
  geometryCache.set(url, meshes)
  return meshes
}

export function StepViewer({ url }: StepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0
    let resizeObserver: ResizeObserver | null = null

    setStatus('loading')

    loadStepGeometry(url).then(meshes => {
      if (cancelled || !containerRef.current) return
      const container = containerRef.current

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf1f3f5)

      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight)
      container.appendChild(renderer.domElement)

      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      const key = new THREE.DirectionalLight(0xffffff, 0.9)
      key.position.set(1, 2, 3)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.4)
      fill.position.set(-2, -1, -2)
      scene.add(fill)

      const group = new THREE.Group()
      const material = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.15, roughness: 0.6 })
      for (const mesh of meshes) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
        geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1))
        if (!mesh.normals) geometry.computeVertexNormals()
        group.add(new THREE.Mesh(geometry, material))
      }
      scene.add(group)

      // Center the model at the origin and place the camera at a distance
      // proportional to its size, so parts of any scale fill the viewport.
      const box = new THREE.Box3().setFromObject(group)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      group.position.sub(center)
      const radius = Math.max(size.x, size.y, size.z, 1) * 0.5
      camera.position.set(radius * 1.8, radius * 1.4, radius * 1.8)
      camera.near = radius / 100
      camera.far = radius * 100
      camera.updateProjectionMatrix()

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.update()

      const animate = () => {
        controls?.update()
        renderer?.render(scene, camera)
        frameId = requestAnimationFrame(animate)
      }
      animate()

      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !container.clientWidth || !container.clientHeight) return
        camera.aspect = container.clientWidth / container.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight)
      })
      resizeObserver.observe(container)

      setStatus('ready')

      // Cleanup captured in the outer effect's return via closures below.
      ;(container as HTMLDivElement & { __cleanup?: () => void }).__cleanup = () => {
        resizeObserver?.disconnect()
        cancelAnimationFrame(frameId)
        controls?.dispose()
        group.children.forEach(child => {
          if (child instanceof THREE.Mesh) child.geometry.dispose()
        })
        material.dispose()
        renderer?.dispose()
        if (renderer?.domElement.parentElement === container) container.removeChild(renderer.domElement)
      }
    }).catch(err => {
      if (cancelled) return
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Onbekende fout bij laden van step-bestand')
    })

    return () => {
      cancelled = true
      const container = containerRef.current as (HTMLDivElement & { __cleanup?: () => void }) | null
      container?.__cleanup?.()
    }
  }, [url])

  return (
    <div className="wq-step-fill">
      <div ref={containerRef} className="wq-step-canvas" />
      {status === 'loading' && <div className="wq-step-overlay">3D-model laden…</div>}
      {status === 'error' && <div className="wq-step-overlay error">{error}</div>}
    </div>
  )
}
