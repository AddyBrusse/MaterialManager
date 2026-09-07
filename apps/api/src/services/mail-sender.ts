import crypto from 'crypto'
import type { MailAddress, NormalizedMail, SenderResolution } from '@stockmanager/shared'

/**
 * Wie is de klant? — features/60-mail-import.md §3.2.
 *
 * Klanten mailen rechtstreeks én collega's sturen mail intern door, door
 * iedereen in het eigen domein. De afzender van het bestand is dus soms de
 * klant en soms een collega, en de volgorde waarin dat uitgezocht wordt ligt
 * vast:
 *
 *   1. is de afzender een eigen adres?  nee → de afzender ís de klant, klaar
 *   2. zit er een bericht als bijlage?  ja  → dat is het origineel, met echte kop
 *   3. anders: het doorstuur-blok in de body uitlezen
 *   4. niets bruikbaar → geen suggestie, de gebruiker kiest zelf
 *
 * De uitkomst is altijd een suggestie die iemand in het reviewscherm bevestigt
 * (§3.7). Daarom faalt dit naar "onbekend" en nooit naar een gokje.
 */

export interface OwnIdentity {
  /** Eigen maildomeinen, bijv. ['boers-metaalbewerking.nl']. */
  domains: string[]
  /** M365-adressen van de gebruikers (User.email). */
  emails: string[]
}

const EMAIL_RE = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/

/** `Van:` / `From:` — de kop van een doorstuur-blok, in beide talen. */
const FORWARD_HEADER_RE = /^\s*>*\s*(?:Van|From)\s*:\s*(.+?)\s*$/i

function domainOf(email: string | null): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase()
}

export function isOwnAddress(address: MailAddress | null, own: OwnIdentity): boolean {
  if (!address?.email) return false
  const email = address.email.toLowerCase()
  if (own.emails.some((e) => e.toLowerCase() === email)) return true
  const domain = domainOf(email)
  return domain !== null && own.domains.some((d) => d.toLowerCase() === domain)
}

/**
 * Eén `Van:`-regel ontleden. Het adres kan ontbreken — dan stond de afzender in
 * het adresboek en houden we alleen een weergavenaam over.
 */
function parseHeaderLine(rest: string): MailAddress | null {
  const email = rest.match(EMAIL_RE)?.[0] ?? null
  const naam = rest
    .replace(/<[^>]*>/g, '')
    .replace(/\[mailto:[^\]]*\]/gi, '')
    .replace(EMAIL_RE, '')
    .replace(/["'()]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[;,]$/, '')
    .trim()
  if (!email && !naam) return null
  return { naam: naam || null, email }
}

/**
 * Alle afzenders uit doorstuur-blokken, in leesvolgorde (nieuwste bovenaan,
 * zoals Outlook ze stapelt).
 */
export function forwardedSenders(bodyText: string): MailAddress[] {
  const out: MailAddress[] = []
  for (const line of bodyText.split(/\r?\n/)) {
    const m = line.match(FORWARD_HEADER_RE)
    if (!m) continue
    const address = parseHeaderLine(m[1])
    if (address) out.push(address)
  }
  return out
}

function resolution(
  origin: SenderResolution['origin'],
  klant: MailAddress | null,
  doorgestuurdDoor: MailAddress | null,
  confidence: SenderResolution['confidence'],
  reden: string
): SenderResolution {
  return { origin, klant, doorgestuurdDoor, confidence, reden }
}

export function resolveSender(
  mail: NormalizedMail,
  embedded: NormalizedMail[],
  own: OwnIdentity
): SenderResolution {
  const from = mail.from

  // 1 — afzender van buiten: dat is gewoon de klant.
  if (from?.email && !isOwnAddress(from, own)) {
    return resolution('direct', from, null, 'hoog', 'Afzender is een extern adres.')
  }

  const internSender = isOwnAddress(from, own) ? from : null

  // 2 — doorgestuurd als bijlage: het originele bericht draagt zijn eigen kop.
  //     Het diepste externe bericht wint, zodat een keten van doorsturen bij de
  //     klant uitkomt en niet bij de collega die hem doorstuurde.
  const externalEmbedded = embedded.filter((e) => e.from && !isOwnAddress(e.from, own))
  const deepestEmbedded = externalEmbedded[externalEmbedded.length - 1]
  if (deepestEmbedded?.from) {
    return resolution(
      'doorgestuurd',
      deepestEmbedded.from,
      internSender,
      'hoog',
      'Doorgestuurd als bijlage; afzender uit het originele bericht.'
    )
  }

  // 3 — inline doorgestuurd: het `Van:`-blok in de body. Meerdere hops stapelen
  //     nieuwste-eerst, dus de klant is het diepste blok van buiten.
  const external = forwardedSenders(mail.bodyText).filter((a) => !isOwnAddress(a, own))
  const deepest = external[external.length - 1]
  if (deepest?.email) {
    return resolution(
      'doorgestuurd',
      deepest,
      internSender,
      'midden',
      'Doorgestuurd; afzender uit het doorstuur-blok in de tekst.'
    )
  }
  if (deepest?.naam) {
    return resolution(
      'doorgestuurd',
      deepest,
      internSender,
      'laag',
      'Doorgestuurd; alleen een naam gevonden, geen e-mailadres. Controleer de relatie.'
    )
  }

  // 4 — niets bruikbaars. Liever geen suggestie dan een verkeerde.
  if (internSender) {
    return resolution(
      'onbekend',
      null,
      internSender,
      'laag',
      'Interne afzender en geen origineel bericht gevonden. Kies de relatie handmatig.'
    )
  }
  return resolution('onbekend', null, null, 'laag', 'Geen afzender in het bericht gevonden.')
}

/**
 * Idempotentie-sleutel (§4). Het internet message-id als de mail er een draagt;
 * anders een hash over afzender, onderwerp en datum. Altijd gevuld, zodat
 * dezelfde mail twee keer inslepen — of de poller uit fase 2 die opnieuw start —
 * niet tot een tweede project leidt.
 */
export function dedupeKey(mail: NormalizedMail): string {
  if (mail.messageId) return `mid:${mail.messageId}`
  const basis = [mail.from?.email ?? mail.from?.naam ?? '', mail.subject, mail.receivedAt ?? ''].join('|')
  return `hash:${crypto.createHash('sha256').update(basis).digest('hex')}`
}
