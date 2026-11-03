/**
 * Test of echt (2026-11-03): de testomgeving voor de managers.
 *
 * Wat een testomgeving is, bepaalt de database zelf: zijn naam eindigt op
 * `_test`. Geen instelling in de browser of een vlag die je vergeet — wie de
 * echte app per ongeluk op de testdatabase zet, ziet ook de oranje balk.
 * Andersom start de test-app (`OMGEVING=test` in `.env.test`) alleen tegen zo'n
 * database: één verkeerd geplakte regel mag de managers nooit in de echte
 * gegevens laten werken. Zo doet Rails het ook: de database weet zelf wat hij is.
 *
 * `npm run db:seed` weigert bovendien zodra er echte gegevens in staan
 * (`waaromNietSeeden`): seeden hoort alleen op een lege database.
 */

export type Omgeving = 'test' | 'echt'

export interface OmgevingInfo {
  omgeving: Omgeving
  /**
   * Wanneer de echte gegevens naar de test gekopieerd zijn (ISO). Komt uit het
   * commentaar op de database dat `npm run test-omgeving:db -- kopie` zet; null =
   * onbekend of geen kopie.
   */
  kopieVan: string | null
}

/** Een testdatabase heet `…_test`, hoofdletters maken niet uit. */
export function isTestDatabase(naam: string): boolean {
  return /_test$/i.test(naam.trim())
}

export function omgevingVan(dbNaam: string): Omgeving {
  return isTestDatabase(dbNaam) ? 'test' : 'echt'
}

/** Vraagt de omgeving om de testopstelling (`OMGEVING=test`)? */
export function vraagtTest(omgevingVar: string | undefined): boolean {
  return (omgevingVar ?? '').trim().toLowerCase() === 'test'
}

/**
 * Waarom de server niet mag starten, of null. Alleen de test-app wordt
 * tegengehouden: de echte app start altijd, ook als hij op een testdatabase
 * staat (dan toont hij de balk).
 */
export function waaromNietStarten(omgevingVar: string | undefined, dbNaam: string): string | null {
  if (!vraagtTest(omgevingVar)) return null
  if (isTestDatabase(dbNaam)) return null
  return (
    `Dit is de test-app (OMGEVING=test), maar de database heet "${dbNaam}". ` +
    'Een testdatabase heet …_test. Controleer DATABASE_URL in .env.test, en of er ' +
    'in Windows een variabele DATABASE_URL staat: die gaat voor op het bestand. ' +
    'De server is niet gestart en er is niets gewijzigd.'
  )
}

/** Het commentaar `kopie:2026-11-03T10:00:00Z` op de database → de ISO-tijd, anders null. */
export function kopieTijdUit(commentaar: string | null | undefined): string | null {
  const m = /^kopie:(\S+)$/.exec((commentaar ?? '').trim())
  if (!m) return null
  return Number.isNaN(Date.parse(m[1])) ? null : m[1]
}

/**
 * Waarom `npm run db:seed` niet mag, of null. De seed maakt gebruikers,
 * machines en testprojecten voor de planning, maar nooit relaties, artikelen of
 * voorraad. Staan die er wel, dan zijn het echte gegevens.
 */
export function waaromNietSeeden(telling: { relaties: number; artikelen: number; voorraad: number }): string | null {
  const tel = (n: number, een: string, meer: string) => (n > 0 ? `${n} ${n === 1 ? een : meer}` : null)
  const wat = [
    tel(telling.relaties, 'relatie', 'relaties'),
    tel(telling.artikelen, 'artikel', 'artikelen'),
    tel(telling.voorraad, 'voorraadregel', 'voorraadregels'),
  ].filter(Boolean)
  if (wat.length === 0) return null
  return (
    `Seeden geweigerd: deze database bevat al ${wat.join(', ')}. Dat zijn echte gegevens, ` +
    'en de seed hoort alleen op een lege database. Er is niets gewijzigd.'
  )
}
