import type jsPDF from 'jspdf'
import type { Company } from '@stockmanager/shared'
import type { DocumentAssets } from './assets'
import { maakDocument, type DocRegel, type DocumentSpec, type Kolom } from './opmaak'
import { bedrag, datum, getal, positie } from './formaat'

/**
 * De documenten van een project in één huisstijl (2026-10-05). Ze verschillen
 * in kop, partij en kolommen; de opmaak zelf staat in `opmaak.ts`. Deze laag
 * kent geen API: wie hem aanroept, zoekt klant, artikel en materiaal op.
 */

export interface DocPartij {
  naam: string
  regels: string[]
}

export interface PrijsRegel {
  naam: string
  notitie: string | null
  materiaal: string
  qty: number
  eenheid: string
  prijs: number
  totaal: number
}

const PRIJS_KOLOMMEN: Kolom[] = [
  { kop: '#', breedte: 38, stijl: 'pos' },
  { kop: 'Omschrijving', stijl: 'omschrijving' },
  { kop: 'Materiaal', breedte: 118, stijl: 'tekst' },
  { kop: 'Aantal', breedte: 56, stijl: 'getal' },
  { kop: 'Stukprijs', breedte: 84, stijl: 'getal' },
  { kop: 'Totaal', breedte: 96, stijl: 'totaal' },
]

/** "25" bij stuks, "2,5 m" bij een andere eenheid. */
const aantal = (qty: number, eenheid: string) => (!eenheid || eenheid === 'st' ? getal(qty) : `${getal(qty)} ${eenheid}`)

function prijsRegels(regels: PrijsRegel[], teken = 1): DocRegel[] {
  return regels.map((r, i) => ({
    cellen: [positie(i), r.naam, r.materiaal, aantal(r.qty, r.eenheid), bedrag(teken * r.prijs), bedrag(teken * r.totaal)],
    notitie: r.notitie,
  }))
}

function totalenVan(subtotaal: number, btwPct: number, btw: number, totaal: number) {
  return {
    rijen: [['Subtotaal', bedrag(subtotaal)], [`BTW ${getal(btwPct)}%`, bedrag(btw)]] as [string, string][],
    groot: ['Totaal incl. BTW', bedrag(totaal)] as [string, string],
  }
}

function btwVan(regels: PrijsRegel[], btwPct: number) {
  const sub = Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
  const btw = Math.round(sub * btwPct) / 100
  return { sub, btw, totaal: Math.round((sub + btw) * 100) / 100 }
}

const kenmerk = (k: string, v: string | null | undefined): [string, string][] => (v ? [[k, v]] : [])
const sectie = (kop: string, tekst: string | null | undefined) => (tekst?.trim() ? [{ kop, tekst: tekst.trim() }] : [])

// ── Offerte ────────────────────────────────────────────────────────────────

export interface OfferteDoc {
  nummer: string
  datum: string | null
  geldigTot: string | null
  klant: DocPartij
  referentie: string | null
  leverdatum: string | null
  regels: PrijsRegel[]
  notities: string
}

export function offerteDocument(d: OfferteDoc, co: Company, assets: DocumentAssets): jsPDF {
  const t = btwVan(d.regels, 21)
  return maakDocument(
    {
      titel: 'OFFERTE',
      meta: [['Offertenr.', d.nummer], ['Datum', datum(d.datum)], ['Geldig tot', d.geldigTot ? datum(d.geldigTot) : '30 dagen']],
      partij: { label: 'Klant', ...d.klant },
      kenmerken: [...kenmerk('Referentie / PO', d.referentie), ...kenmerk('Gewenste leverdatum', d.leverdatum && datum(d.leverdatum))],
      kolommen: PRIJS_KOLOMMEN,
      regels: prijsRegels(d.regels),
      leeg: 'Nog geen regels.',
      totalen: totalenVan(t.sub, 21, t.btw, t.totaal),
      secties: sectie('Opmerkingen', d.notities),
      voetregel: `Offerte ${d.nummer}`,
    },
    co,
    assets,
  )
}

// ── Opdrachtbevestiging ────────────────────────────────────────────────────

export interface OpdrachtDoc {
  nummer: string
  datum: string | null
  offerte: string | null
  klant: DocPartij
  opdrachtRef: string | null
  levertijd: string | null
  project: string
  regels: PrijsRegel[]
  notities: string
}

export function opdrachtDocument(d: OpdrachtDoc, co: Company, assets: DocumentAssets): jsPDF {
  const t = btwVan(d.regels, 21)
  return maakDocument(
    {
      titel: 'OPDRACHTBEVESTIGING',
      meta: [['Ordernr.', d.nummer], ['Datum', datum(d.datum)], ...kenmerk('Uit offerte', d.offerte)],
      partij: { label: 'Klant', ...d.klant },
      kenmerken: [
        ...kenmerk('Uw referentie', d.opdrachtRef),
        ['Levertijd', d.levertijd ? datum(d.levertijd) : 'in overleg'],
        ['Project', d.project],
      ],
      kolommen: PRIJS_KOLOMMEN,
      regels: prijsRegels(d.regels),
      leeg: 'Nog geen regels.',
      totalen: totalenVan(t.sub, 21, t.btw, t.totaal),
      secties: sectie('Opmerking', d.notities),
      voetregel: `Opdrachtbevestiging ${d.nummer}`,
    },
    co,
    assets,
  )
}

// ── Factuur en creditfactuur ───────────────────────────────────────────────

export interface FactuurDoc {
  soort: 'factuur' | 'credit'
  nummer: string
  datum: string | null
  vervaldatum: string | null
  crediteert: string | null
  /** Het factuuradres, niet de contactpersoon (besloten 2026-10-05). */
  klant: DocPartij
  referentie: string | null
  project: string
  regels: PrijsRegel[]
  btwPct: number
  subtotaal: number
  btw: number
  totaal: number
  notities: string
}

export function factuurDocument(d: FactuurDoc, co: Company, assets: DocumentAssets): jsPDF {
  const credit = d.soort === 'credit'
  const teken = credit ? -1 : 1
  const betaling = credit
    ? `Dit bedrag wordt verrekend met factuur ${d.crediteert ?? ''}.`.replace(' .', '.')
    : `Graag ${bedrag(d.totaal)} ${d.vervaldatum ? `vóór ${datum(d.vervaldatum)} ` : ''}overmaken${
        co.iban ? ` op ${co.iban}` : ''
      }${co.naam ? ` t.n.v. ${co.naam}` : ''}, onder vermelding van ${d.nummer}.`
  return maakDocument(
    {
      titel: credit ? 'CREDITFACTUUR' : 'FACTUUR',
      meta: credit
        ? [['Creditnr.', d.nummer], ['Datum', datum(d.datum)], ...kenmerk('Crediteert', d.crediteert)]
        : [['Factuurnr.', d.nummer], ['Factuurdatum', datum(d.datum)], ['Vervaldatum', datum(d.vervaldatum)]],
      partij: { label: 'Factuuradres', ...d.klant },
      kenmerken: [...kenmerk('Uw referentie', d.referentie), ['Project', d.project]],
      kolommen: PRIJS_KOLOMMEN,
      regels: prijsRegels(d.regels, teken),
      leeg: 'Nog geen regels.',
      totalen: totalenVan(teken * d.subtotaal, d.btwPct, teken * d.btw, teken * d.totaal),
      secties: [{ kop: credit ? 'Verrekening' : 'Betaling', tekst: betaling }, ...sectie('Opmerking', d.notities)],
      voetregel: `${credit ? 'Creditfactuur' : 'Factuur'} ${d.nummer}`,
    },
    co,
    assets,
  )
}

// ── Pakbon en picklist ─────────────────────────────────────────────────────

export interface PakbonRegel {
  naam: string
  notitie: string | null
  materiaal: string
  /** Magazijnlocatie van het artikel — voor de picklist. */
  locatie: string | null
  besteld: number
  /** Wat er met déze pakbon meegaat. */
  qty: number
  /** Wat er na deze pakbon nog geleverd moet worden. */
  restant: number
  eenheid: string
}

export interface PakbonDoc {
  nummer: string
  datum: string | null
  klantNaam: string
  /** Afleveradres van de klant, anders het vestigingsadres. */
  aflever: DocPartij
  referentie: string | null
  order: string | null
  project: string
  regels: PakbonRegel[]
  notities: string
}

/** De pakbon gaat mee met de zending: geen prijzen, wel wat er nog komt. */
export function pakbonDocument(d: PakbonDoc, co: Company, assets: DocumentAssets): jsPDF {
  return maakDocument(
    {
      titel: 'PAKBON',
      meta: [['Pakbonnr.', d.nummer], ['Datum', datum(d.datum)], ...kenmerk('Ordernr.', d.order)],
      partij: { label: 'Afleveradres', ...d.aflever },
      kenmerken: [...kenmerk('Uw referentie', d.referentie), ['Project', d.project]],
      kolommen: [
        { kop: '#', breedte: 38, stijl: 'pos' },
        { kop: 'Omschrijving', stijl: 'omschrijving' },
        { kop: 'Materiaal', breedte: 104, stijl: 'tekst' },
        { kop: 'Besteld', breedte: 68, stijl: 'getal' },
        { kop: 'Geleverd', breedte: 80, stijl: 'totaal' },
        { kop: 'Nog te leveren', breedte: 116, stijl: 'getal' },
      ],
      regels: d.regels.map((r, i) => ({
        cellen: [positie(i), r.naam, r.materiaal, aantal(r.besteld, r.eenheid), aantal(r.qty, r.eenheid), r.restant > 0 ? aantal(r.restant, r.eenheid) : '—'],
        notitie: r.notitie,
      })),
      leeg: 'Geen regels op deze pakbon.',
      secties: sectie('Opmerking', d.notities),
      invullen: { kop: 'Ontvangen in goede orde', velden: ['Naam', 'Datum', 'Handtekening'] },
      voetregel: `Pakbon ${d.nummer}`,
    },
    co,
    assets,
  )
}

/**
 * Dezelfde pakbon als lijst om te pakken (gevraagd 2026-10-05): per regel waar
 * het ligt en een vak om af te vinken, zonder adres of prijzen. Blijft in huis.
 */
export function picklistDocument(d: PakbonDoc, co: Company, assets: DocumentAssets): jsPDF {
  return maakDocument(
    {
      titel: 'PICKLIST',
      meta: [['Pakbonnr.', d.nummer], ['Datum', datum(d.datum)], ...kenmerk('Ordernr.', d.order)],
      partij: { label: 'Voor', naam: d.klantNaam, regels: [d.project] },
      kenmerken: [['Regels', String(d.regels.length)], ['Stuks', getal(d.regels.reduce((s, r) => s + r.qty, 0))]],
      kolommen: [
        { kop: '#', breedte: 38, stijl: 'pos' },
        { kop: 'Omschrijving', stijl: 'omschrijving' },
        { kop: 'Locatie', breedte: 118, stijl: 'tekst' },
        { kop: 'Aantal', breedte: 72, stijl: 'totaal' },
        { kop: 'Gepakt', breedte: 64, stijl: 'vinkvak' },
      ],
      regels: d.regels.map((r, i) => ({
        cellen: [positie(i), r.naam, r.locatie ?? '—', aantal(r.qty, r.eenheid), ''],
        notitie: r.notitie,
      })),
      leeg: 'Geen regels op deze pakbon.',
      secties: sectie('Opmerking', d.notities),
      invullen: { kop: 'Gepakt en gecontroleerd', velden: ['Gepakt door', 'Gecontroleerd door', 'Datum'] },
      voetregel: `Picklist ${d.nummer}`,
    },
    co,
    assets,
  )
}

// ── Zaagbon ────────────────────────────────────────────────────────────────

export interface ZaagbonRegel {
  /** Code van de staaf (260042-1, #00412). */
  staaf: string
  materiaal: string
  locatie: string | null
  /** "4 × 120 mm" */
  stuks: string
  /** Wat er van de staaf af gaat, in mm. */
  zaaglengte: number
  /** Calculatienummer · machine */
  notitie: string | null
}

export interface ZaagbonDoc {
  project: string
  projectNaam: string
  klantNaam: string
  datum: string
  regels: ZaagbonRegel[]
}

/**
 * De zaagbon van een project (2026-10-07): alle staven die voor het project
 * vastliggen, waar ze liggen en wat eraf moet. Blijft in huis, net als de
 * picklist; afvinken per staaf.
 */
export function zaagbonDocument(d: ZaagbonDoc, co: Company, assets: DocumentAssets): jsPDF {
  return maakDocument(
    {
      titel: 'ZAAGBON',
      meta: [['Project', d.project], ['Datum', datum(d.datum)]],
      partij: { label: 'Voor', naam: d.klantNaam, regels: [d.projectNaam] },
      kenmerken: [['Staven', String(d.regels.length)], ['Zaaglengte', `${getal(d.regels.reduce((s, r) => s + r.zaaglengte, 0))} mm`]],
      kolommen: [
        { kop: '#', breedte: 38, stijl: 'pos' },
        { kop: 'Staaf', breedte: 92, stijl: 'tekst' },
        { kop: 'Materiaal', stijl: 'omschrijving' },
        { kop: 'Locatie', breedte: 96, stijl: 'tekst' },
        { kop: 'Stuks', breedte: 88, stijl: 'getal' },
        { kop: 'Zaag af', breedte: 80, stijl: 'totaal' },
        { kop: 'Gezaagd', breedte: 72, stijl: 'vinkvak' },
      ],
      regels: d.regels.map((r, i) => ({
        cellen: [positie(i), r.staaf, r.materiaal, r.locatie ?? '—', r.stuks, `${getal(r.zaaglengte)} mm`, ''],
        notitie: r.notitie,
      })),
      leeg: 'Er ligt geen materiaal vast voor dit project.',
      invullen: { kop: 'Gezaagd en gecontroleerd', velden: ['Gezaagd door', 'Gecontroleerd door', 'Datum'] },
      voetregel: `Zaagbon ${d.project}`,
    },
    co,
    assets,
  )
}

// ── Prijsaanvraag ──────────────────────────────────────────────────────────

export interface PrijsaanvraagDoc {
  nummer: string
  datum: string
  leverancier: DocPartij
  regels: { materiaal: string; maat: string; lengte: string; qty: number; notitie: string | null }[]
  /** Uiterlijk nodig, als een regel bij een project met leverdatum hoort. */
  nodigVoor: string | null
  notities: string | null
}

/**
 * Prijsaanvraag aan een leverancier (2026-10-06): wat we willen hebben, zonder
 * prijzen. Per regel de maat, lengte en het aantal stuks — ook een aangepaste
 * lengte staat er zo, zodat ze zien dat het op maat gezaagd moet worden.
 */
export function prijsaanvraagDocument(d: PrijsaanvraagDoc, co: Company, assets: DocumentAssets): jsPDF {
  const spec: DocumentSpec = {
    titel: 'PRIJSAANVRAAG',
    meta: [['Aanvraagnr.', d.nummer], ['Datum', datum(d.datum)]],
    partij: { label: 'Leverancier', ...d.leverancier },
    kenmerken: kenmerk('Uiterlijk nodig', d.nodigVoor ? datum(d.nodigVoor) : null),
    kolommen: [
      { kop: '#', breedte: 38, stijl: 'pos' },
      { kop: 'Materiaal', stijl: 'omschrijving' },
      { kop: 'Maat', breedte: 110, stijl: 'tekst' },
      { kop: 'Lengte', breedte: 90, stijl: 'getal' },
      { kop: 'Aantal', breedte: 70, stijl: 'totaal' },
    ],
    regels: d.regels.map((r, i) => ({ cellen: [positie(i), r.materiaal, r.maat, r.lengte, `${getal(r.qty)} st`], notitie: r.notitie })),
    leeg: 'Geen regels.',
    secties: [
      { kop: 'Graag van u', tekst: 'Per regel uw prijs (per kg, per stuk of in totaal), eventuele zaagkosten per snede en de levertijd. Lengtes zijn op maat gezaagd, tenzij er een hele staaf staat.' },
      ...sectie('Opmerking', d.notities),
    ],
    voetregel: `Prijsaanvraag ${d.nummer}`,
  }
  return maakDocument(spec, co, assets)
}

// ── Inkooporder ────────────────────────────────────────────────────────────

export interface InkoopDoc {
  nummer: string
  /** Per regel ons materiaalnummer (260042), in de volgorde van `regels`; leeg bij een oudere order. */
  materiaalNummers?: (string | null)[]
  datum: string | null
  gewensteLevering: string | null
  leverancier: DocPartij
  /** Hun offertenummer, als ze er een gaven. */
  referentie: string | null
  regels: PrijsRegel[]
  /** Zonder prijzen: een bestelling waarvan de prijs nog niet vastligt. */
  metPrijzen: boolean
  notities: string
}

/**
 * Klaargezet voor de inkoopmodule (2026-10-05) — er is nog geen scherm dat hem
 * maakt. Afleveradres is het eigen bedrijf; zonder prijzen valt de tabel terug
 * op omschrijving, materiaal en aantal.
 */
export function inkooporderDocument(d: InkoopDoc, co: Company, assets: DocumentAssets): jsPDF {
  const t = btwVan(d.regels, 21)
  // Ons nummer per regel (2026-10-07) staat vooraan, op de plek van de #: dat
  // nummer plakt de leverancier op het materiaal, en wij typen het bij binnen
  // boeken weer in.
  const metNummer = !!d.materiaalNummers?.some(Boolean)
  const kolommen = d.metPrijzen && metNummer
    ? [{ kop: 'Ons nr.', breedte: 92, stijl: 'tekst' } as Kolom, ...PRIJS_KOLOMMEN.slice(1).map((k) => (k.kop === 'Materiaal' ? { ...k, breedte: 84 } : k))]
    : d.metPrijzen
    ? PRIJS_KOLOMMEN
    : [
        { kop: '#', breedte: 38, stijl: 'pos' } as Kolom,
        { kop: 'Omschrijving', stijl: 'omschrijving' } as Kolom,
        { kop: 'Materiaal', breedte: 150, stijl: 'tekst' } as Kolom,
        { kop: 'Aantal', breedte: 96, stijl: 'totaal' } as Kolom,
      ]
  const regels = d.metPrijzen
    ? prijsRegels(d.regels).map((r, i) => (metNummer ? { ...r, cellen: [d.materiaalNummers?.[i] ?? '—', ...r.cellen.slice(1)] } : r))
    : d.regels.map((r, i) => ({ cellen: [positie(i), r.naam, r.materiaal, aantal(r.qty, r.eenheid)], notitie: r.notitie }))
  const afleveren = [co.naam, co.adres, [co.postcode, co.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const spec: DocumentSpec = {
    titel: 'INKOOPORDER',
    meta: [['Inkoopnr.', d.nummer], ['Datum', datum(d.datum)], ['Gewenste levering', d.gewensteLevering ? datum(d.gewensteLevering) : 'in overleg']],
    partij: { label: 'Leverancier', ...d.leverancier },
    kenmerken: kenmerk('Uw offerte', d.referentie),
    kolommen,
    regels,
    leeg: 'Nog geen regels.',
    totalen: d.metPrijzen ? totalenVan(t.sub, 21, t.btw, t.totaal) : undefined,
    secties: [
      ...(metNummer ? [{ kop: 'Materiaal labelen', tekst: 'Graag op elk stuk ons nummer (kolom "Ons nr.") zetten. Zo boeken we het bij ontvangst direct op de juiste order in.' }] : []),
      { kop: 'Afleveradres', tekst: afleveren }, ...sectie('Opmerking', d.notities),
    ],
    voetregel: `Inkooporder ${d.nummer}`,
  }
  return maakDocument(spec, co, assets)
}
