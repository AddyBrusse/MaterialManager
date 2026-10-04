import jsPDF from 'jspdf'
import type { Factuur } from '@stockmanager/shared'
import { companyApi } from '../api/company'

/**
 * De factuur (of creditfactuur) als pdf, in dezelfde stijl als de
 * opdrachtbevestiging (2026-10-03). Het factuuradres van de klant staat links,
 * het nummer, de datum en de vervaldatum rechts; onderaan hoe en wanneer er
 * betaald moet worden.
 */

const C = { primary: '#1a5fc8', text: '#111111', muted: '#666666', light: '#f4f6fa', border: '#d8dde8', white: '#ffffff' }
const MARGIN = 50
const PAGE_W = 595.28
const CONTENT_W = PAGE_W - MARGIN * 2
const COL = { pos: 32, omschr: 225, qty: 60, prijs: 80 }

export interface FactuurPdfKlant {
  naam: string | null
  /** Het factuuradres, regel voor regel. */
  adres: string[]
  btw: string | null
  /** Wat de klant er zelf bij zoekt: zijn inkoop- of ordernummer. */
  referentie: string | null
  projectLabel: string
  /** Bij een credit: het nummer van de factuur die hij crediteert. */
  crediteert: string | null
}

const bedrag = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

function kleur(doc: jsPDF, hex: string, doel: 'fill' | 'text' | 'draw') {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  if (doel === 'fill') doc.setFillColor(r, g, b)
  else if (doel === 'text') doc.setTextColor(r, g, b)
  else doc.setDrawColor(r, g, b)
}

function lijn(doc: jsPDF, y: number) {
  kleur(doc, C.border, 'draw')
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
}

export function buildFactuurPdf(f: Factuur, klant: FactuurPdfKlant): jsPDF {
  const co = companyApi.getSync()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const credit = f.soort === 'credit'
  // Een credit toont zijn bedragen negatief: het is een tegenboeking.
  const teken = credit ? -1 : 1
  let y = MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  kleur(doc, C.primary, 'text')
  doc.text(credit ? 'Creditfactuur' : 'Factuur', MARGIN, y + 18)

  doc.setFontSize(10)
  kleur(doc, C.text, 'text')
  doc.text(co.naam || 'Bedrijfsnaam', PAGE_W - MARGIN, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  kleur(doc, C.muted, 'text')
  let ry = y + 14
  for (const regel of [
    co.adres, [co.postcode, co.stad].filter(Boolean).join('  '), co.telefoon, co.email,
    co.kvk ? `KvK ${co.kvk}` : null, co.btw ? `BTW ${co.btw}` : null, co.iban ? `IBAN ${co.iban}` : null,
  ]) {
    if (!regel) continue
    doc.text(regel, PAGE_W - MARGIN, ry, { align: 'right' })
    ry += 11
  }

  y = Math.max(y + 48, ry + 4)
  lijn(doc, y)
  y += 20

  // Links: aan wie
  const startY = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  kleur(doc, C.muted, 'text')
  doc.text('FACTUURADRES', MARGIN, y)
  y += 12
  doc.setFontSize(9)
  kleur(doc, C.text, 'text')
  if (klant.naam) { doc.text(klant.naam, MARGIN, y); y += 13 }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  for (const r of klant.adres) { doc.text(r, MARGIN, y); y += 12 }
  if (klant.btw) { kleur(doc, C.muted, 'text'); doc.text(`BTW ${klant.btw}`, MARGIN, y); y += 12 }

  // Rechts: het document
  const meta: [string, string][] = [
    [credit ? 'Creditnummer' : 'Factuurnummer', f.id],
    ['Datum', datum(f.verzondenOp ?? new Date().toISOString())],
  ]
  if (!credit) meta.push(['Vervaldatum', datum(f.vervaldatum)])
  if (klant.crediteert) meta.push(['Crediteert', klant.crediteert])
  meta.push(['Project', klant.projectLabel])
  if (klant.referentie) meta.push(['Uw referentie', klant.referentie])
  let my = startY
  doc.setFontSize(8)
  for (const [label, waarde] of meta) {
    doc.setFont('helvetica', 'bold')
    kleur(doc, C.muted, 'text')
    doc.text(label, MARGIN + CONTENT_W / 2 + 10, my)
    doc.setFont('helvetica', 'normal')
    kleur(doc, C.text, 'text')
    doc.text(waarde, MARGIN + CONTENT_W / 2 + 100, my)
    my += 13
  }

  y = Math.max(y, my) + 16
  lijn(doc, y)
  y += 14

  // Tabel
  kleur(doc, C.primary, 'fill')
  doc.rect(MARGIN, y, CONTENT_W, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  kleur(doc, C.white, 'text')
  const kolX = {
    pos: MARGIN + 6, omschr: MARGIN + 6 + COL.pos,
    qty: MARGIN + 6 + COL.pos + COL.omschr + COL.qty,
    prijs: MARGIN + 6 + COL.pos + COL.omschr + COL.qty + COL.prijs,
    totaal: PAGE_W - MARGIN - 6,
  }
  doc.text('#', kolX.pos, y + 13)
  doc.text('Omschrijving', kolX.omschr, y + 13)
  doc.text('Aantal', kolX.qty, y + 13, { align: 'right' })
  doc.text('Prijs/stuk', kolX.prijs, y + 13, { align: 'right' })
  doc.text('Totaal', kolX.totaal, y + 13, { align: 'right' })
  y += 20

  f.regels.forEach((r, i) => {
    if (i % 2 === 1) { kleur(doc, C.light, 'fill'); doc.rect(MARGIN, y, CONTENT_W, 16, 'F') }
    doc.setFont('helvetica', 'normal')
    kleur(doc, C.muted, 'text')
    doc.text(String(i + 1), kolX.pos, y + 11)
    doc.setFont('helvetica', 'bold')
    kleur(doc, C.text, 'text')
    doc.text(r.naam, kolX.omschr, y + 11, { maxWidth: COL.omschr - 6 })
    doc.setFont('helvetica', 'normal')
    doc.text(`${r.qty} ${r.eenheid}`, kolX.qty, y + 11, { align: 'right' })
    doc.text(bedrag(r.verkoopprijs), kolX.prijs, y + 11, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(bedrag(teken * r.totaal), kolX.totaal, y + 11, { align: 'right' })
    y += 16
  })
  lijn(doc, y)
  y += 16

  for (const [label, waarde, vet] of [
    ['Subtotaal excl. BTW', teken * f.subtotaal, false],
    [`BTW ${f.btwPct}%`, teken * f.btwBedrag, false],
    ['Totaal incl. BTW', teken * f.totaalInclBtw, true],
  ] as [string, number, boolean][]) {
    doc.setFont('helvetica', vet ? 'bold' : 'normal')
    doc.setFontSize(vet ? 9 : 8)
    kleur(doc, vet ? C.text : C.muted, 'text')
    doc.text(label, PAGE_W - MARGIN - 200, y)
    kleur(doc, C.text, 'text')
    doc.text(bedrag(waarde), PAGE_W - MARGIN, y, { align: 'right' })
    y += vet ? 18 : 14
  }

  if (f.notities) {
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    kleur(doc, C.text, 'text')
    doc.text(f.notities, MARGIN, y, { maxWidth: CONTENT_W })
  }

  // Onderaan: wat de klant moet doen.
  const voetY = 806
  kleur(doc, C.light, 'fill')
  doc.rect(MARGIN, voetY - 14, CONTENT_W, 26, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  kleur(doc, C.muted, 'text')
  const voet = credit
    ? `Dit bedrag wordt verrekend met factuur ${klant.crediteert ?? ''}.`
    : `Graag ${bedrag(f.totaalInclBtw)} vóór ${datum(f.vervaldatum)} overmaken`
      + (co.iban ? ` op ${co.iban}` : '') + ` o.v.v. ${f.id}.`
  doc.text(voet, PAGE_W / 2, voetY, { align: 'center' })
  return doc
}
