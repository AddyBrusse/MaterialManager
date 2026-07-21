// Shared preview logic for the artikel thumbnails shown on
// Offerte/Opdrachtbevestiging/Paklijst/Factuur rows and Productie order
// cards — resolves which attachment to preview (STEP 3D render preferred,
// PDF drawing as fallback) and renders it to a cached data URL, at either
// the small 100px row size or a larger size for the hover preview.

import * as THREE from 'three'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
// eslint-disable-next-line import/no-unresolved -- Vite ?url import, resolved at build time
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Article } from '../api/articles'
import { loadStepGeometry, frameCameraToObject } from '../components/planning-queue/stepGeometry'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const STEP_FILE_RE = /\.(step|stp)$/i

export interface ArtikelPreviewSource {
  kind: 'step' | 'pdf'
  url: string
  name: string
}

/**
 * A 3D render identifies a part better than a 2D drawing at thumbnail size,
 * so a STEP file (if attached) always wins over a PDF drawing.
 */
export function resolveArtikelPreviewSource(article: Article | null): ArtikelPreviewSource | null {
  if (!article) return null
  const step = article.attachments.find(a => a.path && STEP_FILE_RE.test(a.name))
  if (step) return { kind: 'step', url: step.path as string, name: step.name }
  const pdf = article.attachments.find(a => a.path && a.kind === 'drawing' && a.name.toLowerCase().endsWith('.pdf'))
  if (pdf) return { kind: 'pdf', url: pdf.path as string, name: pdf.name }
  return null
}

// ── Row thumbnail vs. hover-preview render sizes ────────────────────────────

export const PREVIEW_SIZE_SM = 200 // 2x the 100px row thumbnail, for crispness
export const PREVIEW_SIZE_LG = 1000 // 2x the 500px hover preview, same logic

// ── PDF: render page 1 to a canvas ──────────────────────────────────────────

const pdfThumbCache = new Map<string, Promise<string>>()

export function renderPdfThumbnail(url: string, sizePx: number = PREVIEW_SIZE_SM): Promise<string> {
  const key = `${url}::${sizePx}`
  const cached = pdfThumbCache.get(key)
  if (cached) return cached
  const promise = (async () => {
    const loadingTask = getDocument({ url })
    try {
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(1)
      const raw = page.getViewport({ scale: 1 })
      const scale = sizePx / Math.max(raw.width, raw.height)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D niet beschikbaar')
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      return canvas.toDataURL('image/png')
    } finally {
      await loadingTask.destroy()
    }
  })()
  pdfThumbCache.set(key, promise)
  return promise
}

// ── STEP: one-shot render, no RAF loop / orbit controls ─────────────────────
// A table can list many rows each needing their own STEP preview — unlike
// the interactive StepViewer (one live canvas in a detail panel), this
// renders a single static frame and disposes the GL context immediately, so
// N rows never means N concurrent 60fps WebGL contexts.

const stepThumbCache = new Map<string, Promise<string>>()

export function renderStepThumbnail(url: string, sizePx: number = PREVIEW_SIZE_SM): Promise<string> {
  const key = `${url}::${sizePx}`
  const cached = stepThumbCache.get(key)
  if (cached) return cached
  const promise = (async () => {
    const meshes = await loadStepGeometry(url)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4f6f7)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(sizePx, sizePx)

    try {
      // Bright, mostly-shadowless lighting — a small/medium thumbnail has no
      // room for moody shading to read as anything but "dark", so ambient
      // does most of the work and the directional lights just add a little
      // form definition on top.
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
      for (const mesh of meshes) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        if (mesh.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
        geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1))
        if (!mesh.normals) geometry.computeVertexNormals()
        group.add(new THREE.Mesh(geometry, material))
        // Contour/feature edges (not every triangle seam) in a dark line on
        // top of the shaded mesh — makes part geometry read clearly instead
        // of relying on shading alone.
        const edges = new THREE.EdgesGeometry(geometry, 20)
        edgeGeometries.push(edges)
        group.add(new THREE.LineSegments(edges, edgeMaterial))
      }
      scene.add(group)

      const box = new THREE.Box3().setFromObject(group)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      group.position.sub(center)
      const radius = Math.max(size.x, size.y, size.z, 1) * 0.5
      camera.position.set(radius * 1.8, radius * 1.4, radius * 1.8)
      camera.near = radius / 100
      camera.far = radius * 100
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      // The radius-based placement above sizes off the bounding *sphere*,
      // which leaves large empty margins for elongated/flat parts — tighten
      // to the actual projected silhouette so the render fills the frame.
      frameCameraToObject(camera, group)

      renderer.render(scene, camera)
      const dataUrl = renderer.domElement.toDataURL('image/png')

      group.children.forEach(child => { if (child instanceof THREE.Mesh) child.geometry.dispose() })
      edgeGeometries.forEach(g => g.dispose())
      material.dispose()
      edgeMaterial.dispose()
      return dataUrl
    } finally {
      renderer.dispose()
    }
  })()
  stepThumbCache.set(key, promise)
  return promise
}

export function renderArtikelPreview(source: ArtikelPreviewSource, sizePx: number = PREVIEW_SIZE_SM): Promise<string> {
  return source.kind === 'step' ? renderStepThumbnail(source.url, sizePx) : renderPdfThumbnail(source.url, sizePx)
}

/** Opens a PDF in a new tab and triggers the browser print dialog once it's loaded. */
export function printPdfFile(url: string): void {
  const win = window.open(url, '_blank')
  if (!win) return
  win.addEventListener('load', () => win.print())
}
