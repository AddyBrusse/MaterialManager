import jsPDF from 'jspdf'
import type { Opdrachtbevestiging } from '@stockmanager/shared'
import { companyApi } from '../api/company'

// ── Constants (shared with offerte-pdf) ───────────────────────────────────────

const C = {
  primary: '#1a5fc8',
  text:    '#111111',
  muted:   '#666666',
  light:   '#f4f6fa',
  border:  '#d8dde8',
  white:   '#ffffff',
}

const MARGIN    = 50
const PAGE_W    = 595.28
const CONTENT_W = PAGE_W - MARGIN * 2

const COL = {
  pos:    32,
  omschr: 205,
  qty:    60,
  prijs:  90,
  totaal: CONTENT_W - 32 - 205 - 60 - 90,
}

function formatBedrag(n: number): string {
  return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
}

function setColor(doc: jsPDF, hex: string, target: 'fill' | 'text' | 'draw') {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  if (target === 'fill') doc.setFillColor(r, g, b)
  else if (target === 'text') doc.setTextColor(r, g, b)
  else doc.setDrawColor(r, g, b)
}

function txt(doc: jsPDF, str: string, x: number, baseline: number, opts?: { align?: 'left' | 'right' | 'center'; maxWidth?: number }) {
  doc.text(str, x, baseline, opts as Parameters<typeof doc.text>[3])
}

function hline(doc: jsPDF, y: number, color: string, width: number) {
  setColor(doc, color, 'draw')
  doc.setLineWidth(width)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: string) {
  setColor(doc, color, 'fill')
  doc.rect(x, y, w, h, 'F')
}

// ── Table ─────────────────────────────────────────────────────────────────────

function drawTableHeader(doc: jsPDF, y: number): number {
  fillRect(doc, MARGIN, y, CONTENT_W, 20, C.primary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, C.white, 'text')
  const ty = y + 13
  let x = MARGIN + 6
  txt(doc, '#',            x, ty)
  x += COL.pos
  txt(doc, 'Omschrijving', x, ty)
  x += COL.omschr
  txt(doc, 'Qty',         x + COL.qty,            ty, { align: 'right' })
  x += COL.qty
  txt(doc, 'Prijs/stuk',  x + COL.prijs,          ty, { align: 'right' })
  x += COL.prijs
  txt(doc, 'Totaal',      x + COL.totaal - 6,     ty, { align: 'right' })
  return y + 20
}

function drawTableRow(
  doc: jsPDF,
  y: number,
  idx: number,
  regel: { naam: string; omschrijving: string; qty: number; eenheid: string; verkoopprijs: number; totaal: number },
  shade: boolean,
): number {
  const hasOmschr = Boolean(regel.omschrijving)
  const rowH = hasOmschr ? 25 : 15

  if (shade) fillRect(doc, MARGIN, y, CONTENT_W, rowH, C.light)
  setColor(doc, C.border, 'draw')
  doc.setLineWidth(0.3)
  doc.rect(MARGIN, y, CONTENT_W, rowH, 'S')

  const ty = y + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted, 'text')
  let x = MARGIN + 6
  txt(doc, String(idx + 1), x, ty)
  x += COL.pos

  doc.setFont('helvetica', 'bold')
  setColor(doc, C.text, 'text')
  txt(doc, regel.naam, x, ty, { maxWidth: COL.omschr - 4 })

  if (hasOmschr) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, regel.omschrijving, x, ty + 11, { maxWidth: COL.omschr - 4 })
  }
  doc.setFontSize(8)
  x += COL.omschr

  doc.setFont('helvetica', 'normal')
  setColor(doc, C.text, 'text')
  txt(doc, `${regel.qty} ${regel.eenheid}`, x + COL.qty, ty, { align: 'right' })
  x += COL.qty
  txt(doc, formatBedrag(regel.verkoopprijs), x + COL.prijs, ty, { align: 'right' })
  x += COL.prijs
  doc.setFont('helvetica', 'bold')
  txt(doc, formatBedrag(regel.totaal), x + COL.totaal - 6, ty, { align: 'right' })

  return y + rowH
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface OBPdfProject {
  id: string
  naam: string
  klantNaam?: string
  contactNaam?: string
  klantRef: string | null
}

export function buildOpdrachtbevestigingPdf(project: OBPdfProject, ob: Opdrachtbevestiging): jsPDF {
  const co = companyApi.getSync()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  let y = MARGIN

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  setColor(doc, C.primary, 'text')
  txt(doc, 'Opdrachtbevestiging', MARGIN, y + 18)

  // Company block (top right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text, 'text')
  txt(doc, co.naam || 'Bedrijfsnaam', PAGE_W - MARGIN, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted, 'text')
  let ry = y + 14
  if (co.adres)    { txt(doc, co.adres,    PAGE_W - MARGIN, ry, { align: 'right' }); ry += 11 }
  if (co.postcode || co.stad) {
    txt(doc, [co.postcode, co.stad].filter(Boolean).join('  '), PAGE_W - MARGIN, ry, { align: 'right' }); ry += 11
  }
  if (co.telefoon) { txt(doc, co.telefoon, PAGE_W - MARGIN, ry, { align: 'right' }); ry += 11 }
  if (co.email)    { txt(doc, co.email,    PAGE_W - MARGIN, ry, { align: 'right' }); ry += 11 }
  if (co.kvk)     { txt(doc, `KvK ${co.kvk}`, PAGE_W - MARGIN, ry, { align: 'right' }); ry += 11 }
  if (co.btw)     { txt(doc, `BTW ${co.btw}`, PAGE_W - MARGIN, ry, { align: 'right' }) }

  y += 48
  hline(doc, y, C.border, 0.5)
  y += 20

  // ── Two-column info block ─────────────────────────────────────────────────
  const colW = CONTENT_W / 2

  // Left: klant
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setColor(doc, C.muted, 'text')
  txt(doc, 'KLANT', MARGIN, y)
  y += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(doc, C.text, 'text')
  if (project.klantNaam) { txt(doc, project.klantNaam, MARGIN, y); y += 13 }
  if (project.contactNaam) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.muted, 'text')
    txt(doc, project.contactNaam, MARGIN, y)
    y += 13
  }

  // Right: document meta (aligned at right half)
  const metaX = MARGIN + colW + 10
  const labelW = 90
  const startY = y - (project.klantNaam ? 25 : 0) - 12

  const meta: [string, string][] = [
    ['Bevestiging nr.', ob.id],
    ['Datum',           formatDatum(ob.createdAt)],
    ['Project',         `${project.id} — ${project.naam}`],
    ['Levertijd',       formatDatum(ob.levertijdDatum)],
  ]
  if (project.klantRef) meta.push(['Ref. klant', project.klantRef])

  let my = startY
  doc.setFontSize(8)
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'bold')
    setColor(doc, C.muted, 'text')
    txt(doc, label, metaX, my)
    doc.setFont('helvetica', 'normal')
    setColor(doc, C.text, 'text')
    txt(doc, value, metaX + labelW, my)
    my += 13
  }

  y = Math.max(y, my) + 16
  hline(doc, y, C.border, 0.5)
  y += 14

  // ── Intro sentence ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor(doc, C.text, 'text')
  const intro = `Hierbij bevestigen wij de ontvangst van uw opdracht en bevestigen de onderstaande specificaties.`
  doc.text(intro, MARGIN, y, { maxWidth: CONTENT_W })
  y += 20

  // ── Table ─────────────────────────────────────────────────────────────────
  y = drawTableHeader(doc, y)

  ob.regels.forEach((regel, i) => {
    y = drawTableRow(doc, y, i, regel, i % 2 === 1)
  })

  hline(doc, y, C.border, 0.5)
  y += 16

  // ── Totalen ───────────────────────────────────────────────────────────────
  const subtotaal = ob.regels.reduce((s, r) => s + r.totaal, 0)
  const btw       = Math.round(subtotaal * 0.21 * 100) / 100
  const totaal    = Math.round((subtotaal + btw) * 100) / 100

  const totalsX    = PAGE_W - MARGIN - 200
  const totalsValX = PAGE_W - MARGIN

  const totalsRows: [string, string, boolean][] = [
    ['Subtotaal excl. BTW', formatBedrag(subtotaal), false],
    ['BTW 21%',             formatBedrag(btw),       false],
    ['Totaal incl. BTW',    formatBedrag(totaal),    true],
  ]

  for (const [label, value, bold] of totalsRows) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9 : 8)
    setColor(doc, bold ? C.text : C.muted, 'text')
    txt(doc, label, totalsX, y)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    setColor(doc, C.text, 'text')
    txt(doc, value, totalsValX, y, { align: 'right' })
    y += bold ? 18 : 14
  }

  // ── Notities ──────────────────────────────────────────────────────────────
  if (ob.notities) {
    y += 10
    hline(doc, y, C.border, 0.5)
    y += 14
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, C.muted, 'text')
    txt(doc, 'OPMERKINGEN', MARGIN, y)
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.text, 'text')
    doc.text(ob.notities, MARGIN, y, { maxWidth: CONTENT_W })
  }

  // ── Betalingsinfo strip ───────────────────────────────────────────────────
  const footerY = 820
  fillRect(doc, MARGIN, footerY - 14, CONTENT_W, 26, C.light)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(doc, C.muted, 'text')
  txt(
    doc,
    `Betalingstermijn: 30 dagen netto  ·  Alle prijzen zijn excl. BTW  ·  ${co.naam}${co.email ? '  ·  ' + co.email : ''}`,
    PAGE_W / 2, footerY,
    { align: 'center' }
  )

  return doc
}

export function downloadOpdrachtbevestigingPdf(project: OBPdfProject, ob: Opdrachtbevestiging) {
  const doc = buildOpdrachtbevestigingPdf(project, ob)
  doc.save(`Opdrachtbevestiging-${ob.id}.pdf`)
}
