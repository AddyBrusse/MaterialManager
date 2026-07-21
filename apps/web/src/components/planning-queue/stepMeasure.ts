import * as THREE from 'three'
import type { BrepFaceRange } from './stepGeometry'

// Geometry/selection math for StepViewer's click-to-measure feature — kept
// out of the component so the imperative three.js setup there stays
// readable. Nothing here touches React or the DOM.

export interface EdgeSegment {
  a: THREE.Vector3
  b: THREE.Vector3
  dir: THREE.Vector3 // normalized a -> b
  length: number
}

/** One entry per line-segment pair in an EdgesGeometry (non-indexed: vertices 0,1 / 2,3 / ... each form one segment). */
export function buildEdgeSegments(edgesGeometry: THREE.BufferGeometry): EdgeSegment[] {
  const pos = edgesGeometry.getAttribute('position')
  const segments: EdgeSegment[] = []
  for (let i = 0; i + 1 < pos.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i)
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1)
    const length = a.distanceTo(b)
    const dir = length > 1e-9 ? b.clone().sub(a).normalize() : new THREE.Vector3()
    segments.push({ a, b, dir, length })
  }
  return segments
}

const POINT_EPS = 1e-4 // world units (mm) — vertices this close count as "the same point"
const COLLINEAR_COS = Math.cos((8 * Math.PI) / 180) // ~8° tolerance before treating a join as a real corner

/**
 * From the clicked segment, walks connected segments in both directions —
 * "connected" meaning they share an endpoint AND continue in nearly the same
 * direction — to approximate one continuous straight CAD edge out of
 * however many tessellation segments it got split into. Stops at a real
 * corner, a dead end, or a junction (3+ segments meeting at one point, where
 * "keep going straight" is ambiguous).
 */
export function walkEdgeChain(segments: EdgeSegment[], startIndex: number): { points: THREE.Vector3[]; length: number } {
  const used = new Set<number>([startIndex])
  const start = segments[startIndex]
  let length = start.length
  const points = [start.a.clone(), start.b.clone()]

  function extend(fromPoint: THREE.Vector3, initialDir: THREE.Vector3, prepend: boolean) {
    let currentPoint = fromPoint
    let currentDir = initialDir
    for (;;) {
      const candidates: number[] = []
      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue
        const s = segments[i]
        if (s.a.distanceTo(currentPoint) < POINT_EPS || s.b.distanceTo(currentPoint) < POINT_EPS) candidates.push(i)
      }
      if (candidates.length !== 1) return // dead end or junction
      const i = candidates[0]
      const s = segments[i]
      const startsAtA = s.a.distanceTo(currentPoint) < POINT_EPS
      const segDir = startsAtA ? s.dir.clone() : s.dir.clone().negate()
      if (segDir.dot(currentDir) < COLLINEAR_COS) return // real corner
      used.add(i)
      length += s.length
      const nextPoint = (startsAtA ? s.b : s.a).clone()
      if (prepend) points.unshift(nextPoint); else points.push(nextPoint)
      currentPoint = nextPoint
      currentDir = segDir
    }
  }

  extend(start.b, start.dir, false)
  extend(start.a, start.dir.clone().negate(), true)

  return { points, length }
}

export function findFaceForTriangle(brepFaces: BrepFaceRange[], faceIndex: number): BrepFaceRange | null {
  return brepFaces.find(f => faceIndex >= f.first && faceIndex <= f.last) ?? null
}

/** Plain vertex average over the face's triangle range — fine for a centroid at typical CNC-part tessellation density. */
export function computeFaceCentroid(positions: Float32Array, index: Uint32Array, first: number, last: number): THREE.Vector3 {
  const sum = new THREE.Vector3()
  let count = 0
  for (let t = first; t <= last; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = index[t * 3 + k]
      sum.x += positions[vi * 3]
      sum.y += positions[vi * 3 + 1]
      sum.z += positions[vi * 3 + 2]
      count++
    }
  }
  if (count > 0) sum.divideScalar(count)
  return sum
}

/** A small non-indexed geometry containing just this face's triangles, for a highlight overlay. */
export function buildFaceHighlightGeometry(positions: Float32Array, index: Uint32Array, first: number, last: number): THREE.BufferGeometry {
  const triCount = last - first + 1
  const verts = new Float32Array(triCount * 3 * 3)
  let o = 0
  for (let t = first; t <= last; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = index[t * 3 + k]
      verts[o++] = positions[vi * 3]
      verts[o++] = positions[vi * 3 + 1]
      verts[o++] = positions[vi * 3 + 2]
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`
}
