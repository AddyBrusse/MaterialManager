import PDFDocument from 'pdfkit'
import type { Offerte, Project } from '@stockmanager/shared'

// Company info — update to match actual bedrijfsgegevens
const BEDRIJF = {
  naam: 'Boer Metaalbewerking',
  adres: 'Industrieweg 1',
  postcode: '1234 AB',
  stad: 'Amsterdam',
  tel: '+31 20 123 4567',
  email: 'info@boer-metaal.nl',
  kvk: '12345678',
  btw: 'NL123456789B01',
}

const C = {
  primary:  '#1a5fc8',
  text:     '#111111',
  muted:    '#666666',
  light:    '#f4f6fa',
  border:   '#d8dde8',
  white:    '#ffffff',
}

const MARGIN = 50
const PAGE_W = 595.28
const PAGE_H = 841.89
const CONTENT_W = PAGE_W - MARGIN * 2

// Column widths (sum = CONTENT_W = 495.28)
const COL = {
  pos:    32,
  omschr: 205,
  qty:    60,
  prijs:  90,
  totaal: CONTENT_W - 32 - 205 - 60 - 90,  // ~108
}

function formatBedrag(n: number): string {
  return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Row drawing helpers ───────────────────────────────────────────────────────

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.rect(MARGIN, y, CONTENT_W, 20).fill(C.primary)
  doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
  const ty = y + 6
  let x = MARGIN + 6
  doc.text('#',           x, ty, { width: COL.pos - 6, align: 'left' });   x += COL.pos
  doc.text('Omschrijving', x, ty, { width: COL.omschr, align: 'left' });   x += COL.omschr
  doc.text('Qty',          x, ty, { width: COL.qty, align: 'right' });     x += COL.qty
  doc.text('Prijs/stuk',   x, ty, { width: COL.prijs, align: 'right' });   x += COL.prijs
  doc.text('Totaal',       x, ty, { width: COL.totaal - 6, align: 'right' })
  return y + 20
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  idx: number,
  regel: { naam: string; omschrijving: string; qty: number; eenheid: string; verkoopprijs: number; totaal: number },
  shade: boolean,
): number {
  const lineHeight = 14

  // measure how tall this row needs to be
  const naam = regel.naam
  const omschr = regel.omschrijving ? regel.omschrijving : null
  const rowH = omschr ? lineHeight + 11 : lineHeight

  if (shade) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.light)
  doc.rect(MARGIN, y, CONTENT_W, rowH).stroke(C.border)

  doc.fillColor(C.text).fontSize(8).font('Helvetica')

  const ty = y + 4
  let x = MARGIN + 6

  // pos
  doc.fillColor(C.muted).text(String(idx + 1), x, ty, { width: COL.pos - 6, align: 'left' })
  x += COL.pos

  // omschrijving
  doc.fillColor(C.text).font('Helvetica-Bold').text(naam, x, ty, { width: COL.omschr, lineBreak: false })
  if (omschr) {
    doc.font('Helvetica').fillColor(C.muted).fontSize(7)
      .text(omschr, x, ty + 11, { width: COL.omschr, lineBreak: false })
  }
  doc.fontSize(8).font('Helvetica')
  x += COL.omschr

  // qty
  doc.fillColor(C.text).text(`${regel.qty} ${regel.eenheid}`, x, ty, { width: COL.qty, align: 'right' })
  x += COL.qty

  // prijs
  doc.text(formatBedrag(regel.verkoopprijs), x, ty, { width: COL.prijs, align: 'right' })
  x += COL.prijs

  // totaal
  doc.font('Helvetica-Bold').text(formatBedrag(regel.totaal), x, ty, { width: COL.totaal - 6, align: 'right' })

  return y + rowH
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildOffertePdf(
  project: Pick<Project, 'id' | 'naam' | 'klantRef' | 'levertijdDatum'> & { klantNaam?: string; contactNaam?: string },
  offerte: Offerte,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: {
    Title: `Offerte ${offerte.id}`,
    Author: BEDRIJF.naam,
  }})

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  doc.on('error', reject)

  // ── Header ──────────────────────────────────────────────────────────────────
  let y = MARGIN

  // Left: big title
  doc.font('Helvetica-Bold').fontSize(26).fillColor(C.primary)
    .text('OFFERTE', MARGIN, y)

  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text(BEDRIJF.naam.toUpperCase(), MARGIN, y + 34)

  // Right: company card
  const cardX = PAGE_W - MARGIN - 170
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text)
    .text(BEDRIJF.naam, cardX, y, { width: 170, align: 'right' })
  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text(`${BEDRIJF.adres}\n${BEDRIJF.postcode}  ${BEDRIJF.stad}`, cardX, y + 14, { width: 170, align: 'right' })
    .text(`${BEDRIJF.tel}\n${BEDRIJF.email}`, cardX, y + 42, { width: 170, align: 'right' })
    .text(`KvK ${BEDRIJF.kvk}  ·  BTW ${BEDRIJF.btw}`, cardX, y + 68, { width: 170, align: 'right' })

  y += 88

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.primary).lineWidth(1.5).stroke()
  y += 12

  // ── Klant + offerte info ─────────────────────────────────────────────────────
  const infoColW = (CONTENT_W - 20) / 2

  function labelVal(label: string, val: string, x: number, cy: number) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(label, x, cy, { width: infoColW })
    doc.font('Helvetica').fontSize(8.5).fillColor(C.text).text(val, x, cy + 10, { width: infoColW })
    return cy + 26
  }

  // Left column — klant
  let lyL = y
  const klantNaam = project.klantNaam || project.naam
  lyL = labelVal('KLANT', klantNaam, MARGIN, lyL)
  if (project.contactNaam) lyL = labelVal('CONTACT', project.contactNaam, MARGIN, lyL)
  if (project.klantRef) lyL = labelVal('UW REFERENTIE', project.klantRef, MARGIN, lyL)

  // Right column — offerte details
  let lyR = y
  const rightX = MARGIN + infoColW + 20
  lyR = labelVal('OFFERTE NR.',  offerte.id,           rightX, lyR)
  lyR = labelVal('DATUM',        formatDatum(offerte.createdAt), rightX, lyR)
  lyR = labelVal('GELDIG TOT',   offerte.geldigTot ? formatDatum(offerte.geldigTot) : '30 dagen na offertedatum', rightX, lyR)
  if (project.levertijdDatum) lyR = labelVal('LEVERTIJD', formatDatum(project.levertijdDatum), rightX, lyR)

  y = Math.max(lyL, lyR) + 10

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.border).lineWidth(0.5).stroke()
  y += 14

  // ── Subject line ─────────────────────────────────────────────────────────────
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('BETREFT', MARGIN, y)
  y += 11
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text).text(project.naam, MARGIN, y, { width: CONTENT_W })
  y += 20

  // ── Table ────────────────────────────────────────────────────────────────────
  y = drawTableHeader(doc, y)

  offerte.regels.forEach((regel, idx) => {
    y = drawTableRow(doc, y, idx, regel, idx % 2 === 1)
  })

  y += 16

  // ── Totals block ─────────────────────────────────────────────────────────────
  const subtotaal = offerte.regels.reduce((s, r) => s + r.totaal, 0)
  const btwBedrag = Math.round(subtotaal * 0.21 * 100) / 100
  const totaalInclBtw = Math.round((subtotaal + btwBedrag) * 100) / 100

  const totW = 260
  const totX = PAGE_W - MARGIN - totW

  function totRow(label: string, amount: string, bold: boolean, ty: number) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9 : 8.5)
      .fillColor(C.muted).text(label, totX, ty, { width: totW / 2, align: 'left' })
      .fillColor(C.text).text(amount, totX + totW / 2, ty, { width: totW / 2, align: 'right' })
    return ty + (bold ? 14 : 12)
  }

  y = totRow('Subtotaal excl. BTW', formatBedrag(subtotaal), false, y)
  y = totRow('BTW 21%',             formatBedrag(btwBedrag),  false, y)

  // Total line
  doc.moveTo(totX, y - 2).lineTo(PAGE_W - MARGIN, y - 2).strokeColor(C.border).lineWidth(0.5).stroke()
  y += 2
  totRow('TOTAAL INCL. BTW', formatBedrag(totaalInclBtw), true, y)
  y += 20

  // ── Notities ────────────────────────────────────────────────────────────────
  if (offerte.notities) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('OPMERKINGEN', MARGIN, y)
    y += 11
    doc.font('Helvetica').fontSize(8.5).fillColor(C.text).text(offerte.notities, MARGIN, y, { width: CONTENT_W * 0.6 })
  }

  // ── Footer (bottom of page) ──────────────────────────────────────────────────
  const footerY = PAGE_H - MARGIN - 20
  doc.moveTo(MARGIN, footerY - 8).lineTo(PAGE_W - MARGIN, footerY - 8)
    .strokeColor(C.border).lineWidth(0.5).stroke()

  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text(
      `Betalingstermijn: 30 dagen netto · Alle prijzen zijn excl. BTW · ${BEDRIJF.naam} · ${BEDRIJF.email}`,
      MARGIN, footerY,
      { width: CONTENT_W, align: 'center' }
    )

  doc.end()
  }) // end Promise
}
