import type { ZodError, ZodIssue } from 'zod'

/**
 * Validatiefouten in gewone taal, per veld.
 *
 * Zod meldt in het Engels en met de veldnaam uit de code ("externeRef: String
 * must contain at most 200 character(s)"). Dat las de gebruiker op 2026-09-25
 * in een rode melding en kon er niets mee. Hier wordt het "Externe referentie
 * is te lang: maximaal 200 tekens".
 */

/** Hoe een veld heet op het scherm. Onbekende velden vallen terug op hun naam. */
const LABELS: Record<string, string> = {
  externeRef: 'Externe referentie',
  qty: 'Aantal',
  verkoopprijs: 'Prijs per stuk',
  naam: 'Naam',
  omschrijving: 'Omschrijving',
  eenheid: 'Eenheid',
  notities: 'Notities',
  levertijdDatum: 'Levertijd',
  userName: 'Gebruiker',
  status: 'Status',
  artikelId: 'Artikel',
  relatieId: 'Klant',
  bewerkingen: 'Bewerkingen',
  reden: 'Reden',
  email: 'E-mailadres',
  telefoon: 'Telefoonnummer',
}

function label(pad: (string | number)[]): string {
  // Een regel in een lijst: "regels.2.qty" → "Aantal (regel 3)".
  const laatste = [...pad].reverse().find((p): p is string => typeof p === 'string')
  const index = pad.find((p): p is number => typeof p === 'number')
  const naam = laatste ? LABELS[laatste] ?? laatste : 'Invoer'
  return index !== undefined ? `${naam} (regel ${index + 1})` : naam
}

const TYPE: Record<string, string> = {
  string: 'tekst', number: 'getal', boolean: 'ja/nee', array: 'lijst', object: 'gegevens', date: 'datum',
}

function zin(i: ZodIssue): string {
  switch (i.code) {
    case 'invalid_type':
      if (i.received === 'undefined' || i.received === 'null') return 'is niet ingevuld'
      return `moet een ${TYPE[i.expected] ?? i.expected} zijn`
    case 'too_small':
      if (i.type === 'string') return Number(i.minimum) <= 1 ? 'mag niet leeg zijn' : `moet minstens ${i.minimum} tekens zijn`
      if (i.type === 'array') return Number(i.minimum) <= 1 ? 'moet minstens één keuze bevatten' : `moet minstens ${i.minimum} keuzes bevatten`
      return i.inclusive ? `moet minstens ${i.minimum} zijn` : `moet groter zijn dan ${i.minimum}`
    case 'too_big':
      if (i.type === 'string') return `is te lang: maximaal ${i.maximum} tekens`
      if (i.type === 'array') return `bevat te veel keuzes: maximaal ${i.maximum}`
      return i.inclusive ? `mag hoogstens ${i.maximum} zijn` : `moet kleiner zijn dan ${i.maximum}`
    case 'invalid_enum_value':
      return `moet een van deze zijn: ${i.options.join(', ')}`
    case 'invalid_string':
      return i.validation === 'email' ? 'is geen geldig e-mailadres' : 'heeft een ongeldige vorm'
    case 'invalid_date':
      return 'is geen geldige datum'
    case 'not_finite':
      return 'moet een gewoon getal zijn'
    case 'not_multiple_of':
      return `moet een veelvoud van ${i.multipleOf} zijn`
    default:
      // `custom` en de rest: daar staat onze eigen tekst in de melding.
      return i.message
  }
}

/** Eén zin per veld: "Externe referentie is te lang: maximaal 200 tekens". */
export function zodVeldenNl(err: ZodError): string[] {
  return err.issues.map(i => `${label(i.path)} ${zin(i)}`)
}

/** De hele melding, zoals hij in het scherm komt. */
export function zodMeldingNl(err: ZodError): string {
  const velden = zodVeldenNl(err)
  if (velden.length === 1) return `Niet goed ingevuld: ${velden[0]}.`
  return `Niet goed ingevuld: ${velden.join('; ')}.`
}
