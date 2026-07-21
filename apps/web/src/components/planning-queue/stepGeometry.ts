import * as THREE from 'three'
import occtimportjs from 'occt-import-js'

// The WASM module (~7MB) and any already-parsed STEP geometry are cached at
// module scope — switching the selected job/order (or rendering the same
// file's row thumbnail elsewhere) shouldn't re-download or re-parse the same
// file, and shouldn't pay the WASM init cost twice. Shared between the
// interactive StepViewer and the one-shot row-thumbnail renderer.
let occtModulePromise: ReturnType<typeof occtimportjs> | null = null
export function getOcctModule() {
  if (!occtModulePromise) {
    occtModulePromise = occtimportjs({ locateFile: () => '/occt/occt-import-js.wasm' })
  }
  return occtModulePromise
}

export interface BrepFaceRange { first: number; last: number }
export interface ParsedGeometry {
  positions: Float32Array
  normals: Float32Array | null
  index: Uint32Array
  // Contiguous triangle-index range per original CAD face, straight from
  // OCCT — since we pass `index` through unmodified, this range lines up
  // directly with three.js's own per-triangle `faceIndex` numbering for the
  // same indexed geometry, which is what makes exact face-picking possible.
  brepFaces: BrepFaceRange[]
}
const geometryCache = new Map<string, ParsedGeometry[]>()

export async function loadStepGeometry(url: string): Promise<ParsedGeometry[]> {
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
    brepFaces: (m.brep_faces ?? []).map(f => ({ first: f.first, last: f.last })),
  }))
  geometryCache.set(url, meshes)
  return meshes
}

/**
 * Tightens a camera already aimed at the origin so `object`'s projected
 * silhouette (from the camera's current viewing angle) fills the frame,
 * instead of sizing the camera off the object's bounding *sphere* — a sphere
 * over-estimates the room needed for elongated/flat parts (e.g. a long thin
 * rack), leaving large empty margins above/below or left/right depending on
 * orientation. Moves the camera along its existing view direction only; the
 * viewing angle itself is unchanged.
 */
export function frameCameraToObject(camera: THREE.PerspectiveCamera, object: THREE.Object3D, margin = 1.08): void {
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const box = new THREE.Box3().setFromObject(object)
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ]
  let maxAbs = 0
  for (const corner of corners) {
    const p = corner.clone().project(camera) // NDC space, [-1, 1] on each axis when in view
    maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y))
  }
  if (maxAbs <= 0) return
  // NDC extent scales ~1/distance for a target-centered object much smaller
  // than the camera distance, so scaling distance by the measured extent
  // (plus a small margin) brings that extent to just under 1 — i.e. the
  // silhouette's tightest-fitting axis touches the frame edge.
  const distance = camera.position.length()
  const direction = camera.position.clone().normalize()
  camera.position.copy(direction.multiplyScalar(distance * maxAbs * margin))
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
}
