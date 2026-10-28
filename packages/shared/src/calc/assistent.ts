/**
 * De AI-assistent (2026-10-09): op vaste tijden een bericht voor iedereen, en
 * een chat die altijd open kan. Hij leest en stelt voor — hij wijzigt niets.
 * Een actie is een knop die naar een scherm gaat; de handeling zelf doet een mens.
 */

export interface AssistentActie {
  label: string
  /** Route in de app, altijd beginnend met `/`. */
  link: string
}

export interface AssistentBericht {
  /** Het geplande tijdstip (ISO), bijv. vandaag 08:00. Dient als sleutel voor "al gezien". */
  moment: string
  tekst: string
  acties: AssistentActie[]
  /** Null = zonder taalmodel samengesteld (geen sleutel, of de aanroep faalde). */
  model: string | null
}

export interface ChatBericht {
  rol: 'gebruiker' | 'assistent'
  tekst: string
  acties?: AssistentActie[]
  /** Waar de assistent keek (tabellen en filters), door de server vastgelegd en niet door het model. */
  bronnen?: string[]
}

/** Verbruik van de assistent over de laatste dagen (Instellingen → Assistent). */
export interface AssistentGebruik {
  dagen: number
  chat: number
  bericht: number
  invoer: number
  cacheLezen: number
  cacheSchrijven: number
  uitvoer: number
  /** Geschat in dollars volgens de prijslijst; null bij een model zonder bekende prijs. */
  kostenUsd: number | null
}

const UU_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Alleen geldige tijden, gesorteerd en zonder dubbele. */
export function schoneTijden(tijden: string[]): string[] {
  return [...new Set(tijden.filter((t) => UU_MM.test(t)))].sort()
}

function opTijd(dag: Date, tijd: string): Date {
  const [u, m] = tijd.split(':').map(Number)
  const d = new Date(dag)
  d.setHours(u, m, 0, 0)
  return d
}

/**
 * Het laatste tijdstip dat al geweest is: vandaag de laatste tijd ≤ nu, anders
 * de laatste tijd van gisteren. Null zonder tijden. Werkt in de lokale tijd van
 * de server, net als `vandaagIso`.
 */
export function laatsteMoment(tijden: string[], nu: Date = new Date()): Date | null {
  const schoon = schoneTijden(tijden)
  if (!schoon.length) return null
  const vandaag = schoon.map((t) => opTijd(nu, t)).filter((d) => d.getTime() <= nu.getTime())
  if (vandaag.length) return vandaag[vandaag.length - 1]
  const gisteren = new Date(nu)
  gisteren.setDate(gisteren.getDate() - 1)
  return opTijd(gisteren, schoon[schoon.length - 1])
}

/** Een actie mag alleen naar een route in de app wijzen — nooit naar buiten. */
export function geldigeActie(a: { label?: unknown; link?: unknown }): AssistentActie | null {
  if (typeof a.label !== 'string' || typeof a.link !== 'string') return null
  const label = a.label.trim().slice(0, 60)
  const link = a.link.trim()
  if (!label || !link.startsWith('/') || link.startsWith('//') || /\s/.test(link)) return null
  return { label, link }
}
