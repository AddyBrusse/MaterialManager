import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { Project, ProductieOrder } from '@stockmanager/shared'
import { articlesApi } from '../api/articles'
import { relatiesApi } from '../api/relaties'
import { gradesApi } from '../api/grades'
import { profilesApi } from '../api/profiles'
import { companyApi } from '../api/company'

const C = {
  primary: '#1a5fc8',
  text:    '#111111',
  muted:   '#666666',
  light:   '#f4f6fa',
  border:  '#d8dde8',
  white:   '#ffffff',
}

// A4 constants
const A4_W = 595.28
const A4_H = 841.89
const A4_M = 50
const A4_CW = A4_W - A4_M * 2

// A5 constants
const A5_W = 419.53
const A5_H = 595.28
const A5_M = 30
const A5_CW = A5_W - A5_M * 2

// ── Low-level helpers ──────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function setColor(doc: jsPDF, hex: string, target: 'fill' | 'text' | 'draw') {
  const [r, g, b] = rgb(hex)
  if (target === 'fill') doc.setFillColor(r, g, b)
  else if (target === 'text') doc.setTextColor(r, g, b)
  else doc.setDrawColor(r, g, b)
}

function txt(
  doc: jsPDF, str: string, x: number, y: number,
  opts?: { align?: 'left' | 'right' | 'center'; maxWidth?: number }
) {
  doc.text(str, x, y, opts as Parameters<typeof doc.text>[3])
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: string) {
  setColor(doc, color, 'fill')
  doc.rect(x, y, w, h, 'F')
}

function strokeRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: string, lw = 0.3) {
  setColor(doc, color, 'draw')
  doc.setLineWidth(lw)
  doc.rect(x, y, w, h, 'S')
}

function hline(doc: jsPDF, x1: number, x2: number, y: number, color: string, lw = 0.3) {
  setColor(doc, color, 'draw')
  doc.setLineWidth(lw)
  doc.line(x1, y, x2, y)
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function buildMaterialSpec(artikelId: string | null): string {
  if (!artikelId) return ''
  try {
    const artikel = articlesApi.list().find(a => a.id === artikelId)
    if (!artikel?.recipe) return ''
    const { recipe } = artikel
    const grade   = gradesApi.listSync().find(g => g.id === recipe.gradeId)
    const profile  = profilesApi.listSync().find(p => p.id === recipe.profileId)
    const dimStr = profile?.dimensionSchema
      .map(d => `${d.label} ${recipe.dimensions[d.key] ?? '?'}${d.unit}`)
      .join(' · ') ?? ''
    return [grade?.name, profile?.name, dimStr, `L=${recipe.lengthPerPieceMm}mm`]
      .filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

export function getOrdersWithMissingDrawing(orders: ProductieOrder[]): string[] {
  return orders
    .filter(o => o.artikelId !== null)
    .filter(o => {
      try {
        const artikel = articlesApi.list().find(a => a.id === o.artikelId)
        return !artikel?.drawingPath
      } catch {
        return true
      }
    })
    .map(o => o.artikelNaam)
}

async function generateQr(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 256, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } })
}

function getKlantNaam(project: Project): string {
  try {
    const relaties = relatiesApi.listSync()
    const relatie = relaties.find(r => r.id === project.relatieId)
    return relatie?.naam ?? project.naam
  } catch {
    return project.naam
  }
}

// ── A4 Productieformulier ─────────────────────────────────────────────────────

async function drawProductieFormulier(doc: jsPDF, order: ProductieOrder, project: Project, klantNaam: string): Promise<void> {
  let y = A4_M

  // Header band
  fillRect(doc, A4_M, y, A4_CW, 68, C.primary)

  // QR code (right in header)
  const qrImg = await generateQr(order.id)
  doc.addImage(qrImg, 'PNG', A4_W - A4_M - 56, y + 8, 50, 50)

  // Title + order id
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  setColor(doc, C.white, 'text')
  txt(doc, 'PRODUCTIEFORMULIER', A4_M + 14, y + 30)
  doc.setFontSize(13)
  txt(doc, order.id, A4_M + 14, y + 52)

  y += 82

  // Info block (2 columns)
  const colW = (A4_CW - 20) / 2
  const rX = A4_M + colW + 20

  function infoItem(label: string, val: string, x: number, cy: number): number {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, label, x, cy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(doc, C.text, 'text')
    txt(doc, val, x, cy + 12, { maxWidth: colW })
    return cy + 28
  }

  let lyL = y
  lyL = infoItem('ARTIKEL',  order.artikelNaam,                    A4_M, lyL)
  lyL = infoItem('AANTAL',   `${order.qty} ${order.eenheid}`,      A4_M, lyL)
  const spec = buildMaterialSpec(order.artikelId)
  if (spec) lyL = infoItem('MATERIAAL', spec, A4_M, lyL)

  let lyR = y
  lyR = infoItem('PROJECT',   `${project.id} — ${project.naam}`, rX, lyR)
  lyR = infoItem('KLANT',     klantNaam,                          rX, lyR)
  if (project.levertijdDatum) lyR = infoItem('LEVERTIJD', formatDatum(project.levertijdDatum), rX, lyR)

  y = Math.max(lyL, lyR) + 14

  hline(doc, A4_M, A4_W - A4_M, y, C.border)
  y += 16

  // Steps section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  setColor(doc, C.text, 'text')
  txt(doc, 'BEWERKINGSSTAPPEN', A4_M, y)
  y += 14

  // Table column widths
  const CK = 18   // checkbox
  const CNR = 26  // nr
  const CNM = 200 // naam bewerking
  const CMC = 100 // machine
  const CDR = 100 // gereed door
  const CDT = A4_CW - CK - CNR - CNM - CMC - CDR

  // Table header
  fillRect(doc, A4_M, y, A4_CW, 18, C.primary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setColor(doc, C.white, 'text')
  const ht = y + 12
  let cx = A4_M + CK + 4
  txt(doc, '#',           cx, ht);          cx += CNR
  txt(doc, 'Bewerking',   cx, ht);          cx += CNM
  txt(doc, 'Machine',     cx, ht);          cx += CMC
  txt(doc, 'Gereed door', cx, ht);          cx += CDR
  txt(doc, 'Datum / tijd', cx, ht)
  y += 18

  const stappen = [...order.stappen].sort((a, b) => a.volgorde - b.volgorde)

  stappen.forEach((stap, idx) => {
    const ROW_H = 30
    if (idx % 2 === 1) fillRect(doc, A4_M, y, A4_CW, ROW_H, C.light)
    strokeRect(doc, A4_M, y, A4_CW, ROW_H, C.border)

    const ty = y + 18

    // Checkbox
    const cbX = A4_M + 4
    const cbY = y + 8
    strokeRect(doc, cbX, cbY, 13, 13, C.border, 0.5)
    if (stap.gereedOp) {
      setColor(doc, C.primary, 'draw')
      doc.setLineWidth(1.5)
      doc.line(cbX + 2, cbY + 7, cbX + 5, cbY + 10)
      doc.line(cbX + 5, cbY + 10, cbX + 11, cbY + 3)
    }

    cx = A4_M + CK + 4

    // Nr
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(doc, C.muted, 'text')
    txt(doc, String(stap.volgorde), cx, ty);  cx += CNR

    // Naam
    doc.setFont('helvetica', stap.gereedOp ? 'normal' : 'bold')
    setColor(doc, C.text, 'text')
    txt(doc, stap.naam, cx, ty);              cx += CNM

    // Machine
    doc.setFont('helvetica', 'normal')
    setColor(doc, C.muted, 'text')
    txt(doc, stap.machine ?? '—', cx, ty);   cx += CMC

    // Gereed door
    if (stap.gereedDoor) {
      setColor(doc, C.text, 'text')
      txt(doc, stap.gereedDoor, cx, ty)
    } else {
      hline(doc, cx, cx + CDR - 10, y + ROW_H - 7, C.border, 0.4)
    }
    cx += CDR

    // Datum/tijd
    if (stap.gereedOp) {
      doc.setFontSize(7.5)
      setColor(doc, C.text, 'text')
      txt(doc, new Date(stap.gereedOp).toLocaleString('nl-NL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }), cx, ty)
    } else {
      hline(doc, cx, cx + CDT - 6, y + ROW_H - 7, C.border, 0.4)
    }

    y += ROW_H
  })

  if (stappen.length === 0) {
    fillRect(doc, A4_M, y, A4_CW, 30, C.light)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    setColor(doc, C.muted, 'text')
    txt(doc, 'Geen bewerkingsstappen gedefinieerd.', A4_M + 12, y + 19)
    y += 30
  }

  y += 22

  // Signature area (only if enough space)
  if (y < A4_H - A4_M - 80) {
    hline(doc, A4_M, A4_W - A4_M, y, C.border)
    y += 16
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.muted, 'text')
    txt(doc, 'VRIJGAVE / KWALITEITSCONTROLE', A4_M, y)
    y += 20
    const sigW = (A4_CW - 20) / 3
    for (let i = 0; i < 3; i++) {
      const labels = ['Gecontroleerd door', 'Handtekening', 'Datum']
      const sx = A4_M + i * (sigW + 10)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      setColor(doc, C.muted, 'text')
      txt(doc, labels[i], sx, y)
      hline(doc, sx, sx + sigW - 10, y + 26, C.border, 0.4)
    }
  }

  // Footer
  const fY = A4_H - A4_M - 10
  hline(doc, A4_M, A4_W - A4_M, fY - 8, C.border)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor(doc, C.muted, 'text')
  const co = companyApi.getSync()
  txt(doc, `${co.naam}${co.email ? '  ·  ' + co.email : ''}  ·  ${order.id}`, A4_W / 2, fY, { align: 'center' })
}

// ── A5 Loopkaart ──────────────────────────────────────────────────────────────

async function drawLoopkaart(doc: jsPDF, order: ProductieOrder, project: Project, klantNaam: string): Promise<void> {
  let y = A5_M

  // Header band
  fillRect(doc, A5_M, y, A5_CW, 30, C.primary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.white, 'text')
  txt(doc, 'LOOPKAART', A5_M + 10, y + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  txt(doc, project.id, A5_W - A5_M - 2, y + 20, { align: 'right' })

  y += 40

  // QR code (left) + production number (right)
  const QR = 120
  const qrImg = await generateQr(order.id)
  doc.addImage(qrImg, 'PNG', A5_M, y, QR, QR)

  const numX = A5_M + QR + 14
  const numW = A5_CW - QR - 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor(doc, C.muted, 'text')
  txt(doc, 'PRODUCTIENUMMER', numX, y + 14)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  setColor(doc, C.primary, 'text')
  // Split order id to fit if needed
  txt(doc, order.id, numX, y + 42, { maxWidth: numW })

  // Info right column
  let iy = y + 60

  function infoLine(label: string, val: string) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, label, numX, iy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setColor(doc, C.text, 'text')
    txt(doc, val, numX, iy + 11, { maxWidth: numW })
    iy += 26
  }

  infoLine('ARTIKEL',  order.artikelNaam)
  infoLine('AANTAL',   `${order.qty} ${order.eenheid}`)
  infoLine('KLANT',    klantNaam)

  y += QR + 14

  // Levertijd (prominent)
  if (project.levertijdDatum) {
    hline(doc, A5_M, A5_W - A5_M, y, C.border)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, 'LEVERTIJD', A5_M, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    setColor(doc, C.text, 'text')
    txt(doc, formatDatum(project.levertijdDatum), A5_M, y + 16)
    y += 36
  }

  // Machining steps flow
  const bewerkingen = order.stappen
    .sort((a, b) => a.volgorde - b.volgorde)
    .map(s => s.naam)
    .join('  →  ')

  if (bewerkingen) {
    hline(doc, A5_M, A5_W - A5_M, y, C.border)
    y += 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, 'BEWERKINGEN', A5_M, y)
    y += 11
    doc.setFontSize(8)
    setColor(doc, C.text, 'text')
    txt(doc, bewerkingen, A5_M, y, { maxWidth: A5_CW })
    y += 16
  }

  // Material band at bottom
  const spec = buildMaterialSpec(order.artikelId)
  if (spec) {
    const bandH = 40
    const bandY = A5_H - A5_M - bandH
    fillRect(doc, A5_M, bandY, A5_CW, bandH, C.light)
    strokeRect(doc, A5_M, bandY, A5_CW, bandH, C.border)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, 'MATERIAALSPECIFICATIE', A5_M + 8, bandY + 12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.text, 'text')
    txt(doc, spec, A5_M + 8, bandY + 28, { maxWidth: A5_CW - 16 })
  }
}

// ── Public exports ─────────────────────────────────────────────────────────────

export async function downloadProductieFormulier(order: ProductieOrder, project: Project): Promise<void> {
  const klantNaam = getKlantNaam(project)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  await drawProductieFormulier(doc, order, project, klantNaam)
  doc.addPage('a5')
  await drawLoopkaart(doc, order, project, klantNaam)
  doc.save(`Werkopdracht-${order.id}.pdf`)
}

export async function downloadAlleProductieFormulieren(project: Project): Promise<void> {
  const orders = project.productieOrders.filter(o => o.artikelId !== null)
  if (orders.length === 0) return

  const klantNaam = getKlantNaam(project)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  let first = true

  for (const order of orders) {
    if (!first) doc.addPage('a4')
    first = false
    await drawProductieFormulier(doc, order, project, klantNaam)
    doc.addPage('a5')
    await drawLoopkaart(doc, order, project, klantNaam)
  }

  doc.save(`Productieformulieren-${project.id}.pdf`)
}
