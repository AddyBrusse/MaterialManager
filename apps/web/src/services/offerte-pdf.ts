import jsPDF from 'jspdf'
import type { Offerte } from '@stockmanager/shared'
import { companyApi } from '../api/company'

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

function hex(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function formatBedrag(n: number): string {
  return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
}

function setColor(doc: jsPDF, hex: string, target: 'fill' | 'text' | 'draw') {
  const [r, g, b] = parseInt(hex.slice(1), 16) > 0
    ? [(parseInt(hex.slice(1), 16) >> 16) & 255, (parseInt(hex.slice(1), 16) >> 8) & 255, parseInt(hex.slice(1), 16) & 255]
    : [0, 0, 0]
  if (target === 'fill') doc.setFillColor(r, g, b)
  else if (target === 'text') doc.setTextColor(r, g, b)
  else doc.setDrawColor(r, g, b)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Table ────────────────────────────────────────────────────────────────────

function drawTableHeader(doc: jsPDF, y: number): number {
  fillRect(doc, MARGIN, y, CONTENT_W, 20, C.primary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, C.white, 'text')
  const ty = y + 13
  let x = MARGIN + 6
  txt(doc, '#',           x, ty);                              x += COL.pos
  txt(doc, 'Omschrijving', x, ty);                             x += COL.omschr
  txt(doc, 'Qty',          x + COL.qty,    ty, { align: 'right' }); x += COL.qty
  txt(doc, 'Prijs/stuk',   x + COL.prijs,  ty, { align: 'right' }); x += COL.prijs
  txt(doc, 'Totaal',       x + COL.totaal - 6, ty, { align: 'right' })
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

  // pos
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted, 'text')
  let x = MARGIN + 6
  txt(doc, String(idx + 1), x, ty); x += COL.pos

  // naam
  doc.setFont('helvetica', 'bold')
  setColor(doc, C.text, 'text')
  txt(doc, regel.naam, x, ty, { maxWidth: COL.omschr - 4 })

  // omschrijving
  if (hasOmschr) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, C.muted, 'text')
    txt(doc, regel.omschrijving, x, ty + 11, { maxWidth: COL.omschr - 4 })
  }
  doc.setFontSize(8)
  x += COL.omschr

  // qty
  doc.setFont('helvetica', 'normal')
  setColor(doc, C.text, 'text')
  txt(doc, `${regel.qty} ${regel.eenheid}`, x + COL.qty, ty, { align: 'right' }); x += COL.qty

  // prijs
  txt(doc, formatBedrag(regel.verkoopprijs), x + COL.prijs, ty, { align: 'right' }); x += COL.prijs

  // totaal
  doc.setFont('helvetica', 'bold')
  txt(doc, formatBedrag(regel.totaal), x + COL.totaal - 6, ty, { align: 'right' })

  return y + rowH
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface OffertePdfProject {
  id: string
  naam: string
  klantNaam?: string
  contactNaam?: string
  klantRef: string | null
  levertijdDatum: string | null
}

export function buildOffertePdf(project: OffertePdfProject, offerte: Offerte): jsPDF {
  const co = companyApi.getSync()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  let y = MARGIN

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  setColor(doc, C.primary, 'text')
  txt(doc, 'OFFERTE', MARGIN, y + 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted, 'text')
  txt(doc, co.naam.toUpperCase(), MARGIN, y + 44)

  // Company card (right)
  const cardX = PAGE_W - MARGIN - 170
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(doc, C.text, 'text')
  txt(doc, co.naam, cardX + 170, y + 9, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, C.muted, 'text')
  if (co.adres) txt(doc, co.adres, cardX + 170, y + 21, { align: 'right' })
  if (co.postcode || co.stad) txt(doc, [co.postcode, co.stad].filter(Boolean).join('  '), cardX + 170, y + 31, { align: 'right' })
  if (co.telefoon) txt(doc, co.telefoon, cardX + 170, y + 49, { align: 'right' })
  if (co.email)    txt(doc, co.email,    cardX + 170, y + 59, { align: 'right' })
  const fiscal = [co.kvk && `KvK ${co.kvk}`, co.btw && `BTW ${co.btw}`].filter(Boolean).join('  ·  ')
  if (fiscal)      txt(doc, fiscal,      cardX + 170, y + 77, { align: 'right' })

  y += 90

  // ── Top divider ───────────────────────────────────────────────────────────
  hline(doc, y, C.primary, 1.5)
  y += 14

  // ── Klant + offerte info ──────────────────────────────────────────────────
  const infoColW = (CONTENT_W - 20) / 2

  function labelVal(label: string, val: string, x: number, cy: number): number {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setColor(doc, C.muted, 'text')
    txt(doc, label, x, cy)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.text, 'text')
    txt(doc, val, x, cy + 12)
    return cy + 28
  }

  let lyL = y
  const klantNaam = project.klantNaam || project.naam
  lyL = labelVal('KLANT', klantNaam, MARGIN, lyL)
  if (project.contactNaam) lyL = labelVal('CONTACT', project.contactNaam, MARGIN, lyL)
  if (project.klantRef)    lyL = labelVal('UW REFERENTIE', project.klantRef, MARGIN, lyL)

  let lyR = y
  const rightX = MARGIN + infoColW + 20
  lyR = labelVal('OFFERTE NR.',  offerte.id,                  rightX, lyR)
  lyR = labelVal('DATUM',        formatDatum(offerte.createdAt), rightX, lyR)
  lyR = labelVal('GELDIG TOT',   offerte.geldigTot ? formatDatum(offerte.geldigTot) : '30 dagen na offertedatum', rightX, lyR)
  if (project.levertijdDatum) lyR = labelVal('LEVERTIJD', formatDatum(project.levertijdDatum), rightX, lyR)

  y = Math.max(lyL, lyR) + 10

  // ── Divider ───────────────────────────────────────────────────────────────
  hline(doc, y, C.border, 0.5)
  y += 16

  // ── Betreft ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(doc, C.muted, 'text')
  txt(doc, 'BETREFT', MARGIN, y)
  y += 13
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setColor(doc, C.text, 'text')
  txt(doc, project.naam, MARGIN, y)
  y += 22

  // ── Table ─────────────────────────────────────────────────────────────────
  y = drawTableHeader(doc, y)
  offerte.regels.forEach((regel, idx) => {
    y = drawTableRow(doc, y, idx, regel, idx % 2 === 1)
  })
  y += 16

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotaal     = offerte.regels.reduce((s, r) => s + r.totaal, 0)
  const btwBedrag     = Math.round(subtotaal * 0.21 * 100) / 100
  const totaalInclBtw = Math.round((subtotaal + btwBedrag) * 100) / 100

  const totW = 260
  const totX = PAGE_W - MARGIN - totW

  function totRow(label: string, amount: string, bold: boolean, ty: number): number {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9 : 8.5)
    setColor(doc, C.muted, 'text')
    txt(doc, label, totX, ty)
    setColor(doc, C.text, 'text')
    txt(doc, amount, PAGE_W - MARGIN, ty, { align: 'right' })
    return ty + (bold ? 15 : 13)
  }

  y = totRow('Subtotaal excl. BTW', formatBedrag(subtotaal), false, y)
  y = totRow('BTW 21%',             formatBedrag(btwBedrag),  false, y)
  hline(doc, y - 2, C.border, 0.5)
  y += 2
  totRow('TOTAAL INCL. BTW', formatBedrag(totaalInclBtw), true, y)
  y += 22

  // ── Notities ──────────────────────────────────────────────────────────────
  if (offerte.notities) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setColor(doc, C.muted, 'text')
    txt(doc, 'OPMERKINGEN', MARGIN, y)
    y += 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(doc, C.text, 'text')
    txt(doc, offerte.notities, MARGIN, y, { maxWidth: CONTENT_W * 0.6 })
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = 841.89 - MARGIN - 14
  hline(doc, footerY - 8, C.border, 0.5)
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

export function downloadOffertePdf(project: OffertePdfProject, offerte: Offerte) {
  const doc = buildOffertePdf(project, offerte)
  doc.save(`Offerte-${offerte.id}-v${offerte.versie}.pdf`)
}
