import jsPDF from 'jspdf'
import type { Company } from '@stockmanager/shared'
import type { DocumentAssets, Familie, Gewicht } from './assets'

/**
 * Eén opmaak voor alle documenten: het template `design_handoff_offerte`
 * (2026-10-05), nagebouwd in jsPDF. Maten staan in CSS-pixels zoals in het
 * template en worden hier naar pdf-punten omgerekend (× 0,75), zodat je ze
 * één op één naast de README kunt leggen.
 *
 * Per document verschillen alleen de kop, de partij (klant, factuuradres,
 * afleveradres, leverancier), de kolommen en wat er onder de tabel staat.
 */

export type KolomStijl = 'pos' | 'omschrijving' | 'tekst' | 'getal' | 'totaal' | 'vinkvak'

export interface Kolom {
  kop: string
  /** In px; leeg = de rest van de breedte (de omschrijving). */
  breedte?: number
  stijl: KolomStijl
}

export interface DocRegel {
  /** Eén cel per kolom, in dezelfde volgorde. Bij een vinkvak telt de tekst niet. */
  cellen: string[]
  /** Tweede regel onder de naam: bewerking, tekening en revisie. */
  notitie?: string | null
}

export interface DocumentSpec {
  titel: string
  /** Rechtsboven onder de titel: nummer, datum, … */
  meta: [string, string][]
  /** Links onder de rode lijn. */
  partij: { label: string; naam: string; regels: string[] }
  /** Rechts onder de rode lijn: referentie, leverdatum, … */
  kenmerken: [string, string][]
  kolommen: Kolom[]
  regels: DocRegel[]
  /** Tekst als er geen regels zijn. */
  leeg?: string
  totalen?: { rijen: [string, string][]; groot: [string, string] }
  /** Blokken onder de tabel: opmerking, betaling, … */
  secties?: { kop: string; tekst: string }[]
  /** Invulvelden onderaan, voor wie tekent (pakbon) of pakt (picklist). */
  invullen?: { kop: string; velden: string[] }
  /** Rechts in de lopende voetregel: "Offerte OFF-2026-0418". */
  voetregel: string
}

// ── Maten (px, zoals het template) ─────────────────────────────────────────

const PX = 0.75
const PAGINA_B = 793.7
const PAGINA_H = 1122.5
const ZIJ = 72 // 0,75 in
const BOVEN = 57.6 // 0,6 in
const ONDER = 57.6
const RECHTS = PAGINA_B - ZIJ
const BREED = RECHTS - ZIJ

const KLEUR = {
  ink: '#1A1A1A',
  body: '#555555',
  label: '#8A857C',
  note: '#9A948A',
  partno: '#B0AAA0',
  hairline: '#ECEAE5',
  rood: '#E1251B',
}

// ── Pen: lettertype, kleur en tekst in px ──────────────────────────────────

class Pen {
  readonly doc: jsPDF
  private readonly eigenFonts: boolean
  private charSpace = 0

  constructor(assets: DocumentAssets) {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
    for (const f of assets.fonts) {
      const bestand = `${f.familie}-${f.gewicht}.ttf`
      this.doc.addFileToVFS(bestand, f.data)
      this.doc.addFont(bestand, f.familie, f.gewicht)
    }
    this.eigenFonts = assets.fonts.length > 0
  }

  font(familie: Familie, gewicht: Gewicht, px: number, kleur: string, spatiering = 0): this {
    if (this.eigenFonts) this.doc.setFont(familie, gewicht)
    else this.doc.setFont('helvetica', gewicht === 'normal' || gewicht === 'medium' ? 'normal' : 'bold')
    this.doc.setFontSize(px * PX)
    this.doc.setTextColor(kleur)
    this.charSpace = spatiering
    return this
  }

  breedte(s: string): number {
    return this.doc.getTextWidth(s) / PX + this.charSpace * Math.max(0, s.length - 1)
  }

  /** `y` is de basislijn. Uitlijnen rekenen we zelf: jsPDF telt de letterspatiëring niet mee. */
  tekst(s: string, x: number, y: number, uitlijning: 'links' | 'rechts' | 'midden' = 'links') {
    if (!s) return
    const b = this.breedte(s)
    const x0 = uitlijning === 'rechts' ? x - b : uitlijning === 'midden' ? x - b / 2 : x
    this.doc.text(s, x0 * PX, y * PX, this.charSpace ? { charSpace: this.charSpace * PX } : undefined)
  }

  /** Breekt tekst af op `max` px breed. */
  regels(s: string, max: number): string[] {
    if (!s) return []
    return this.doc.splitTextToSize(s, max * PX) as string[]
  }

  lijn(x1: number, y: number, x2: number, kleur: string, dikte: number) {
    this.doc.setDrawColor(kleur)
    this.doc.setLineWidth(dikte * PX)
    this.doc.line(x1 * PX, y * PX, x2 * PX, y * PX)
  }

  vlak(x: number, y: number, b: number, h: number, kleur: string) {
    this.doc.setFillColor(kleur)
    this.doc.rect(x * PX, y * PX, b * PX, h * PX, 'F')
  }

  kader(x: number, y: number, b: number, h: number, kleur: string) {
    this.doc.setDrawColor(kleur)
    this.doc.setLineWidth(1 * PX)
    this.doc.rect(x * PX, y * PX, b * PX, h * PX, 'S')
  }

  beeld(data: string, x: number, y: number, b: number, h: number) {
    this.doc.addImage(data, 'PNG', x * PX, y * PX, b * PX, h * PX)
  }

  nieuwePagina() {
    this.doc.addPage('a4', 'portrait')
  }
}

/** Basislijn binnen een regel van `px` hoog met regelhoogte `lh`. */
const basis = (top: number, px: number, lh: number) => top + (lh - px) / 2 + px * 0.8

// ── Onderdelen ─────────────────────────────────────────────────────────────

function kop(pen: Pen, spec: DocumentSpec, assets: DocumentAssets, co: Company): number {
  const y = BOVEN
  if (assets.logo) {
    pen.beeld(assets.logo.data, ZIJ, y, 74 * assets.logo.verhouding, 74)
  } else {
    pen.font('display', 'bold', 18, KLEUR.ink).tekst(co.naam, ZIJ, y + 20)
  }

  pen.font('display', 'bold', 32, KLEUR.ink, 0.64).tekst(spec.titel, RECHTS, y + 26, 'rechts')

  pen.font('mono', 'normal', 12.5, KLEUR.ink)
  const waardeB = Math.max(0, ...spec.meta.map(([, v]) => pen.breedte(v)))
  const sleutelB = Math.max(0, ...spec.meta.map(([k]) => pen.breedte(k)))
  const sleutelX = RECHTS - waardeB - 16 - sleutelB
  let my = y + 32 + 14
  for (const [k, v] of spec.meta) {
    const bl = basis(my, 12.5, 16.25)
    pen.font('mono', 'normal', 12.5, KLEUR.label).tekst(k, sleutelX, bl)
    pen.font('mono', 'normal', 12.5, KLEUR.ink).tekst(v, RECHTS, bl, 'rechts')
    my += 16.25 + 3
  }
  const onder = Math.max(y + 74, my - 3)

  const lijnY = onder + 26
  pen.vlak(ZIJ, lijnY, BREED, 2, KLEUR.rood)
  return lijnY + 2 + 24
}

function partij(pen: Pen, spec: DocumentSpec, y: number): number {
  const kolB = (BREED - 40) / 2
  let ly = y
  pen.font('sans', 'semibold', 10.5, KLEUR.label, 1.05).tekst(spec.partij.label.toUpperCase(), ZIJ, basis(ly, 10.5, 14.7))
  ly += 14.7 + 5
  for (const r of pen.font('sans', 'semibold', 15, KLEUR.ink).regels(spec.partij.naam, kolB)) {
    pen.tekst(r, ZIJ, basis(ly, 15, 21))
    ly += 21
  }
  ly += 2
  pen.font('sans', 'normal', 13.5, KLEUR.body)
  for (const regel of spec.partij.regels) {
    for (const r of pen.regels(regel, kolB)) {
      pen.tekst(r, ZIJ, basis(ly, 13.5, 19.5))
      ly += 19.5
    }
  }

  const rx = ZIJ + kolB + 40
  let ry = y
  for (const [k, v] of spec.kenmerken) {
    const bl = basis(ry, 12.5, 17.5)
    pen.font('sans', 'normal', 12.5, KLEUR.label).tekst(k, rx, bl)
    pen.font('mono', 'normal', 12.5, KLEUR.ink).tekst(v, RECHTS, bl, 'rechts')
    ry += 17.5 + 6
  }
  return Math.max(ly, ry - 6) + 30
}

interface Kolommen {
  x: number[]
  b: number[]
}

function verdeel(kolommen: Kolom[]): Kolommen {
  const vast = kolommen.reduce((s, k) => s + (k.breedte ?? 0), 0)
  const b = kolommen.map((k) => k.breedte ?? BREED - vast)
  const x: number[] = []
  let cx = ZIJ
  for (const w of b) {
    x.push(cx)
    cx += w
  }
  return { x, b }
}

const rechtsUit = (s: KolomStijl) => s === 'getal' || s === 'totaal'

function tabelKop(pen: Pen, spec: DocumentSpec, k: Kolommen, y: number): number {
  pen.font('sans', 'semibold', 10.5, KLEUR.label, 0.84)
  spec.kolommen.forEach((kol, i) => {
    const bl = basis(y, 10.5, 14.7)
    const tekst = kol.kop.toUpperCase()
    if (rechtsUit(kol.stijl)) pen.tekst(tekst, k.x[i] + k.b[i], bl, 'rechts')
    else if (kol.stijl === 'vinkvak') pen.tekst(tekst, k.x[i] + k.b[i] / 2, bl, 'midden')
    else pen.tekst(tekst, k.x[i], bl)
  })
  return y + 14.7 + 9
}

/** De hoogte van een regel en zijn afgebroken tekst, zonder te tekenen. */
function maatVan(pen: Pen, spec: DocumentSpec, k: Kolommen, regel: DocRegel) {
  const regels: string[][] = []
  let notitie: string[] = []
  let hoogte = 18.9
  spec.kolommen.forEach((kol, i) => {
    const tekst = regel.cellen[i] ?? ''
    if (kol.stijl === 'omschrijving') {
      const r = pen.font('sans', 'medium', 13.5, KLEUR.ink).regels(tekst, k.b[i] - 12)
      notitie = regel.notitie ? pen.font('sans', 'normal', 11.5, KLEUR.note).regels(regel.notitie, k.b[i] - 12) : []
      regels.push(r)
      hoogte = Math.max(hoogte, r.length * 18.9 + (notitie.length ? 2 + notitie.length * 16.1 : 0))
    } else if (kol.stijl === 'tekst') {
      const r = pen.font('sans', 'normal', 13.5, KLEUR.body).regels(tekst, k.b[i] - 8)
      regels.push(r)
      hoogte = Math.max(hoogte, r.length * 18.9)
    } else {
      regels.push([tekst])
    }
  })
  return { regels, notitie, hoogte: 11 + hoogte + 11 }
}

function tabelRegel(pen: Pen, spec: DocumentSpec, k: Kolommen, y: number, maat: ReturnType<typeof maatVan>) {
  pen.lijn(ZIJ, y, RECHTS, KLEUR.hairline, 1)
  const top = y + 11
  spec.kolommen.forEach((kol, i) => {
    const r = maat.regels[i]
    const x = k.x[i]
    if (kol.stijl === 'pos') {
      pen.font('mono', 'normal', 12, KLEUR.partno).tekst(r[0], x, basis(top, 12, 18.9))
    } else if (kol.stijl === 'omschrijving') {
      pen.font('sans', 'medium', 13.5, KLEUR.ink)
      r.forEach((t, j) => pen.tekst(t, x, basis(top + j * 18.9, 13.5, 18.9)))
      pen.font('sans', 'normal', 11.5, KLEUR.note)
      const nt = top + r.length * 18.9 + 2
      maat.notitie.forEach((t, j) => pen.tekst(t, x, basis(nt + j * 16.1, 11.5, 16.1)))
    } else if (kol.stijl === 'tekst') {
      pen.font('sans', 'normal', 13.5, KLEUR.body)
      r.forEach((t, j) => pen.tekst(t, x, basis(top + j * 18.9, 13.5, 18.9)))
    } else if (kol.stijl === 'getal') {
      pen.font('mono', 'normal', 13.5, KLEUR.ink).tekst(r[0], x + k.b[i], basis(top, 13.5, 18.9), 'rechts')
    } else if (kol.stijl === 'totaal') {
      pen.font('mono', 'medium', 13.5, KLEUR.ink).tekst(r[0], x + k.b[i], basis(top, 13.5, 18.9), 'rechts')
    } else {
      pen.kader(x + k.b[i] / 2 - 7, top + 2, 14, 14, KLEUR.label)
    }
  })
}

function totalen(pen: Pen, t: NonNullable<DocumentSpec['totalen']>, y: number): number {
  const bx = RECHTS - 280
  let ty = y
  t.rijen.forEach(([k, v], i) => {
    const bl = basis(ty + 5, 13, 16.9)
    pen.font('mono', 'normal', 13, KLEUR.body).tekst(k, bx, bl)
    pen.tekst(v, RECHTS, bl, 'rechts')
    ty += 5 + 16.9 + 5
    if (i === t.rijen.length - 1) pen.lijn(bx, ty, RECHTS, KLEUR.hairline, 1)
  })
  const bl = ty + 12 + 18 * 0.85
  pen.font('display', 'semibold', 15, KLEUR.ink).tekst(t.groot[0], bx, bl)
  pen.font('mono', 'semibold', 18, KLEUR.ink).tekst(t.groot[1], RECHTS, bl, 'rechts')
  return ty + 12 + 23.4
}

function totaalHoogte(t: NonNullable<DocumentSpec['totalen']>) {
  return t.rijen.length * 26.9 + 12 + 23.4
}

function voetBlokRegels(co: Company): string[] {
  const plaats = [co.postcode, co.stad].filter(Boolean).join(' ')
  const een = [co.naam, [co.adres, plaats].filter(Boolean).join(', '), co.telefoon, co.email]
  const twee = [
    co.kvk ? `KvK ${co.kvk}` : null,
    co.btw ? `BTW ${co.btw}` : null,
    co.iban ? `IBAN ${co.iban}` : null,
    'Levering volgens onze algemene voorwaarden',
  ]
  return [een, twee].map((r) => r.filter(Boolean).join('  ·  ')).filter(Boolean)
}

// ── Het document ───────────────────────────────────────────────────────────

export function maakDocument(spec: DocumentSpec, co: Company, assets: DocumentAssets): jsPDF {
  const pen = new Pen(assets)
  const grens = PAGINA_H - ONDER
  const k = verdeel(spec.kolommen)

  let y = kop(pen, spec, assets, co)
  y = partij(pen, spec, y)

  // Tabel: de kolomkoppen herhalen op elke pagina, een regel breekt nooit.
  y = tabelKop(pen, spec, k, y)
  if (spec.regels.length === 0 && spec.leeg) {
    pen.lijn(ZIJ, y, RECHTS, KLEUR.hairline, 1)
    pen.font('sans', 'normal', 13.5, KLEUR.note).tekst(spec.leeg, ZIJ, basis(y + 11, 13.5, 18.9))
    y += 11 + 18.9 + 11
  }
  for (const regel of spec.regels) {
    const maat = maatVan(pen, spec, k, regel)
    if (y + maat.hoogte > grens) {
      pen.nieuwePagina()
      y = tabelKop(pen, spec, k, BOVEN)
    }
    tabelRegel(pen, spec, k, y, maat)
    y += maat.hoogte
  }
  pen.lijn(ZIJ, y, RECHTS, KLEUR.hairline, 1)

  const ruimte = (h: number) => {
    if (y + h > grens) {
      pen.nieuwePagina()
      y = BOVEN
    }
  }

  if (spec.totalen) {
    y += 22
    ruimte(totaalHoogte(spec.totalen))
    y = totalen(pen, spec.totalen, y)
  }

  for (const s of spec.secties ?? []) {
    const regels = pen.font('sans', 'normal', 12.5, KLEUR.body).regels(s.tekst, BREED * 0.8)
    y += 26
    ruimte(19.7 + regels.length * 18)
    pen.font('sans', 'semibold', 10.5, KLEUR.label, 1.05).tekst(s.kop.toUpperCase(), ZIJ, basis(y, 10.5, 14.7))
    y += 14.7 + 5
    pen.font('sans', 'normal', 12.5, KLEUR.body)
    for (const r of regels) {
      pen.tekst(r, ZIJ, basis(y, 12.5, 18))
      y += 18
    }
  }

  if (spec.invullen) {
    const n = spec.invullen.velden.length
    const gat = 24
    const vb = (BREED - gat * (n - 1)) / n
    y += 34
    ruimte(14.7 + 44 + 20)
    pen.font('sans', 'semibold', 10.5, KLEUR.label, 1.05).tekst(spec.invullen.kop.toUpperCase(), ZIJ, basis(y, 10.5, 14.7))
    y += 14.7 + 44
    spec.invullen.velden.forEach((veld, i) => {
      const x = ZIJ + i * (vb + gat)
      pen.lijn(x, y, x + vb, KLEUR.label, 1)
      pen.font('sans', 'normal', 11, KLEUR.note).tekst(veld, x, y + 15)
    })
    y += 20
  }

  // Voettekst met de bedrijfsgegevens, gecentreerd onder een haarlijn.
  const voet = voetBlokRegels(co)
  y += 40
  ruimte(16 + voet.length * 18.7)
  pen.lijn(ZIJ, y, RECHTS, KLEUR.hairline, 1)
  y += 16
  pen.font('sans', 'normal', 11, KLEUR.note)
  for (const r of voet) {
    pen.tekst(r, ZIJ + BREED / 2, basis(y, 11, 18.7), 'midden')
    y += 18.7
  }

  // Lopende voetregel op elke pagina; paginanummer alleen als er meer zijn.
  const n = pen.doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pen.doc.setPage(i)
    const bl = PAGINA_H - 21.6
    pen.font('mono', 'normal', 9, KLEUR.note, 0.36)
    if (co.naam) pen.tekst(co.naam, ZIJ, bl)
    pen.tekst(n > 1 ? `${spec.voetregel}  ·  ${i}/${n}` : spec.voetregel, RECHTS, bl, 'rechts')
  }
  return pen.doc
}
