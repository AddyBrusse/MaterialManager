import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadStepGeometry, frameCameraToObject, type BrepFaceRange } from './stepGeometry'
import {
  buildEdgeSegments, walkEdgeChain, findFaceForTriangle, computeFaceCentroid, buildFaceHighlightGeometry,
  formatMm, type EdgeSegment,
} from './stepMeasure'

interface StepViewerProps {
  url: string
}

interface Bbox { x: number; y: number; z: number }
type SelectionInfo =
  | { kind: 'edge'; length: number }
  | { kind: 'face-pending' }
  | { kind: 'face-pair'; distance: number }

// Per-mesh data attached to each THREE.Mesh's userData so the click handler
// can go from a raycaster hit straight back to the CAD face / edge-segment
// data it needs, without re-deriving anything per click.
interface MeshUserData { brepFaces: BrepFaceRange[]; positions: Float32Array; index: Uint32Array }
interface LineUserData { segments: EdgeSegment[] }

function disposeObject3D(obj: THREE.Object3D) {
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
    obj.geometry.dispose()
    const mat = obj.material
    if (Array.isArray(mat)) mat.forEach(m => m.dispose()); else mat.dispose()
  }
}

export function StepViewer({ url }: StepViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frameId = 0
    let resizeObserver: ResizeObserver | null = null
    let highlightObjects: THREE.Object3D[] = []

    setStatus('loading')
    setBbox(null)
    setSelectionInfo(null)

    loadStepGeometry(url).then(meshes => {
      if (cancelled || !containerRef.current) return
      const container = containerRef.current

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf4f6f7)

      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight)
      container.appendChild(renderer.domElement)

      scene.add(new THREE.AmbientLight(0xffffff, 1.1))
      const key1 = new THREE.DirectionalLight(0xffffff, 0.55)
      key1.position.set(1, 2, 3)
      scene.add(key1)
      const key2 = new THREE.DirectionalLight(0xffffff, 0.4)
      key2.position.set(-2, 1.5, -1)
      scene.add(key2)
      const fill = new THREE.DirectionalLight(0xffffff, 0.35)
      fill.position.set(-1, -2, -1)
      scene.add(fill)

      const group = new THREE.Group()
      const material = new THREE.MeshStandardMaterial({ color: 0xc7ced4, metalness: 0.08, roughness: 0.55 })
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x2b2f33 })
      const edgeGeometries: THREE.BufferGeometry[] = []
      const meshObjects: THREE.Mesh[] = []
      const lineObjects: THREE.LineSegments[] = []
      for (const mesh of meshes) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
        geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1))
        if (!mesh.normals) geometry.computeVertexNormals()
        const stepMesh = new THREE.Mesh(geometry, material)
        const meshData: MeshUserData = { brepFaces: mesh.brepFaces, positions: mesh.positions, index: mesh.index }
        stepMesh.userData = meshData
        group.add(stepMesh)
        meshObjects.push(stepMesh)
        // Contour/feature edges (not every triangle seam) in a dark line on
        // top of the shaded mesh — makes part geometry read clearly instead
        // of relying on shading alone. Also the pickable target for "select
        // a line": each pair of vertices here is one segment (see stepMeasure).
        const edges = new THREE.EdgesGeometry(geometry, 20)
        edgeGeometries.push(edges)
        const lineSegs = new THREE.LineSegments(edges, edgeMaterial)
        const lineData: LineUserData = { segments: buildEdgeSegments(edges) }
        lineSegs.userData = lineData
        group.add(lineSegs)
        lineObjects.push(lineSegs)
      }
      scene.add(group)

      // Center the model at the origin and place the camera at a distance
      // proportional to its size, so parts of any scale fill the viewport.
      const box = new THREE.Box3().setFromObject(group)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      group.position.sub(center)
      setBbox({ x: size.x, y: size.y, z: size.z })
      const radius = Math.max(size.x, size.y, size.z, 1) * 0.5
      camera.position.set(radius * 1.8, radius * 1.4, radius * 1.8)
      camera.near = radius / 100
      camera.far = radius * 100
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      // Sphere-based placement above leaves large empty margins for
      // elongated/flat parts — tighten to the actual projected silhouette
      // before handing off to OrbitControls, which reads this as its
      // starting distance/orientation.
      frameCameraToObject(camera, group)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.update()

      // ── Click-to-measure ──────────────────────────────────────────────
      // A native `click` only fires on mousedown→mouseup with negligible
      // movement between them — the browser already suppresses it after a
      // real drag, so this never fights with OrbitControls' drag-to-orbit;
      // no manual drag-threshold tracking needed.
      const raycaster = new THREE.Raycaster()
      const highlightFaceMaterial = new THREE.MeshBasicMaterial({
        color: 0xffa726, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      })
      const highlightLineMaterial = new THREE.LineBasicMaterial({ color: 0xe53935 })
      let pendingFaceCentroid: THREE.Vector3 | null = null

      function clearHighlights() {
        highlightObjects.forEach(o => { group.remove(o); disposeObject3D(o) })
        highlightObjects = []
      }

      function handleEdgeHit(hit: THREE.Intersection) {
        const data = hit.object.userData as LineUserData
        if (hit.index == null) return
        const segIdx = Math.floor(hit.index / 2)
        const chain = walkEdgeChain(data.segments, segIdx)

        clearHighlights()
        pendingFaceCentroid = null
        const geom = new THREE.BufferGeometry().setFromPoints(chain.points)
        const line = new THREE.Line(geom, highlightLineMaterial)
        group.add(line)
        highlightObjects = [line]

        setSelectionInfo({ kind: 'edge', length: chain.length })
      }

      function handleFaceHit(hit: THREE.Intersection) {
        const data = hit.object.userData as MeshUserData
        if (hit.faceIndex == null) return
        const face = findFaceForTriangle(data.brepFaces, hit.faceIndex)
        if (!face) return
        const centroid = computeFaceCentroid(data.positions, data.index, face.first, face.last)
        const highlightGeom = buildFaceHighlightGeometry(data.positions, data.index, face.first, face.last)
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightFaceMaterial)

        if (pendingFaceCentroid) {
          group.add(highlightMesh)
          highlightObjects.push(highlightMesh)
          const distance = centroid.distanceTo(pendingFaceCentroid)
          pendingFaceCentroid = null
          setSelectionInfo({ kind: 'face-pair', distance })
        } else {
          clearHighlights()
          group.add(highlightMesh)
          highlightObjects = [highlightMesh]
          pendingFaceCentroid = centroid
          setSelectionInfo({ kind: 'face-pending' })
        }
      }

      function onClick(event: MouseEvent) {
        if (!renderer || !controls) return
        const rect = renderer.domElement.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        // Keep the edge-pick tolerance a constant number of screen pixels
        // regardless of zoom level (world-space size covered by one pixel
        // scales with camera distance).
        const dist = camera.position.distanceTo(controls.target)
        const fovRad = (camera.fov * Math.PI) / 180
        const worldPerPixel = (2 * dist * Math.tan(fovRad / 2)) / renderer.domElement.clientHeight
        raycaster.params.Line = { threshold: worldPerPixel * 2.5 }

        const edgeHits = raycaster.intersectObjects(lineObjects, false)
        const faceHits = raycaster.intersectObjects(meshObjects, false)

        if (edgeHits.length > 0) handleEdgeHit(edgeHits[0])
        else if (faceHits.length > 0) handleFaceHit(faceHits[0])
        else {
          clearHighlights()
          pendingFaceCentroid = null
          setSelectionInfo(null)
        }
      }
      renderer.domElement.addEventListener('click', onClick)

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
        renderer?.domElement.removeEventListener('click', onClick)
        controls?.dispose()
        clearHighlights()
        highlightFaceMaterial.dispose()
        highlightLineMaterial.dispose()
        group.children.forEach(child => {
          if (child instanceof THREE.Mesh) child.geometry.dispose()
        })
        edgeGeometries.forEach(g => g.dispose())
        material.dispose()
        edgeMaterial.dispose()
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
      {bbox && (
        <div className="wq-step-bbox">
          {formatMm(bbox.x)} × {formatMm(bbox.y)} × {formatMm(bbox.z)}
        </div>
      )}
      {selectionInfo && (
        <div className="wq-step-measure">
          {selectionInfo.kind === 'edge' && <>Lengte: {formatMm(selectionInfo.length)}</>}
          {selectionInfo.kind === 'face-pending' && <>Selecteer tweede vlak…</>}
          {selectionInfo.kind === 'face-pair' && <>Afstand: {formatMm(selectionInfo.distance)}</>}
        </div>
      )}
    </div>
  )
}
