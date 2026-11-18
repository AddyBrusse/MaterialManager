import type { Prijsafspraak, PrijsafspraakInvoer } from '../schemas/prijsafspraak'

/**
 * Welke prijsafspraak geldt, en wanneer een nieuwe niet kan (2026-11-18).
 * Scherm en server gebruiken dezelfde functies: het scherm vraagt het vóór het
 * opslaan, de server nog eens (`409 VOORWAARDE`).
 *
 * De afspraak vult de prijs voor; hij is altijd te overschrijven. Wat er op een
 * offerte- of factuurregel staat, is wat telt — de afspraak verandert achteraf
 * niets aan een regel die er al staat.
 */

type Afspraak = Pick<Prijsafspraak, 'prijs' | 'vanafAantal' | 'geldigVan' | 'geldigTot'> & { updatedAt?: string }

const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const nl = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`

/** Geldt de afspraak op deze dag (yyyy-mm-dd)? Van en tot tellen allebei mee. */
export function afspraakGeldtOp(a: Pick<Afspraak, 'geldigVan' | 'geldigTot'>, dag: string): boolean {
  return (!a.geldigVan || a.geldigVan <= dag) && (!a.geldigTot || a.geldigTot >= dag)
}

/**
 * De afspraak voor dit aantal op deze dag: van de afspraken die dan gelden, de
 * hoogste staffel die het aantal haalt. Bij gelijke staffel de laatst
 * gewijzigde (komt niet voor als `waaromNietPrijsafspraak` gevolgd is).
 */
export function geldendeAfspraak<A extends Afspraak>(afspraken: A[], qty: number, dag: string): A | null {
  let beste: A | null = null
  for (const a of afspraken) {
    if (!afspraakGeldtOp(a, dag) || a.vanafAantal > Math.max(qty, 1)) continue
    if (!beste || a.vanafAantal > beste.vanafAantal
      || (a.vanafAantal === beste.vanafAantal && (a.updatedAt ?? '') > (beste.updatedAt ?? ''))) beste = a
  }
  return beste
}

/**
 * De afspraak die geldt voor deze klant. Een afspraak hoort bij de klant van
 * het artikel: in een project van een andere klant geldt hij niet. Een artikel
 * zonder klant heeft een afspraak voor iedereen.
 */
export function afspraakVoorKlant<A extends Afspraak>(
  artikel: { relatieId: string | null },
  klantId: string | null,
  afspraken: A[],
  qty: number,
  dag: string,
): A | null {
  if (artikel.relatieId && artikel.relatieId !== klantId) return null
  return geldendeAfspraak(afspraken, qty, dag)
}

/** Overlappen twee periodes (leeg = open)? */
function overlapt(a: Pick<Afspraak, 'geldigVan' | 'geldigTot'>, b: Pick<Afspraak, 'geldigVan' | 'geldigTot'>): boolean {
  const aVan = a.geldigVan ?? '0000-01-01'
  const aTot = a.geldigTot ?? '9999-12-31'
  const bVan = b.geldigVan ?? '0000-01-01'
  const bTot = b.geldigTot ?? '9999-12-31'
  return aVan <= bTot && bVan <= aTot
}

/** Korte omschrijving: "€ 12,50 vanaf 10 st, t/m 31-12-2026". */
export function afspraakTekst(a: Afspraak): string {
  const delen = [euro(a.prijs)]
  if (a.vanafAantal > 1) delen.push(`vanaf ${a.vanafAantal} st`)
  if (a.geldigVan && a.geldigTot) delen.push(`${nl(a.geldigVan)} t/m ${nl(a.geldigTot)}`)
  else if (a.geldigTot) delen.push(`t/m ${nl(a.geldigTot)}`)
  else if (a.geldigVan) delen.push(`vanaf ${nl(a.geldigVan)}`)
  return delen.join(', ')
}

/**
 * Waarom deze afspraak niet kan, of null. `bestaande` = de andere afspraken van
 * hetzelfde artikel (zonder de afspraak die je aanpast).
 */
export function waaromNietPrijsafspraak(
  invoer: Pick<PrijsafspraakInvoer, 'prijs' | 'vanafAantal' | 'geldigVan' | 'geldigTot'>,
  bestaande: Afspraak[],
): string | null {
  if (!(invoer.prijs > 0)) return 'Vul een prijs groter dan € 0 in.'
  if (!Number.isInteger(invoer.vanafAantal) || invoer.vanafAantal < 1) return 'Het aantal "vanaf" is een heel getal van 1 of meer.'
  if (invoer.geldigVan && invoer.geldigTot && invoer.geldigTot < invoer.geldigVan) {
    return `"Geldig tot" (${nl(invoer.geldigTot)}) ligt vóór "geldig vanaf" (${nl(invoer.geldigVan)}).`
  }
  const botst = bestaande.find((b) => b.vanafAantal === invoer.vanafAantal && overlapt(b, invoer))
  if (botst) {
    return `Er is al een afspraak ${invoer.vanafAantal > 1 ? `vanaf ${invoer.vanafAantal} stuks ` : ''}die in dezelfde periode geldt `
      + `(${afspraakTekst(botst)}). Zet een einddatum op de oude afspraak, of pas die aan.`
  }
  return null
}
