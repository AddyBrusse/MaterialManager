import type { CandidateLine, CandidateSource, MailAttachment, NormalizedMail } from '@stockmanager/shared'
import { baseNameOf, classifyAttachment, hoortBij } from './attachment-kind'

/** Wat een patroon oplevert: de velden die uit de tekst zelf komen. De rest
 *  (id, koppeling, zekerheid) wordt er in extractLines omheen gezet. */
type Kandidaat = Pick<
  CandidateLine,
  'ruweTekst' | 'tekening' | 'rev' | 'positie' | 'qty' | 'bron' | 'attachmentFilename'
>

/**
 * Regels uit een mail halen — features/60-mail-import.md §3.4.
 *
 * Volgorde van signaalwaarde, en dat is geen willekeurige keuze: in een
 * verspanend bedrijf zegt de naam van een bijlage bijna altijd meer dan de
 * lopende tekst. `2026077-001.STEP` bij onderwerp "koppel order: 2026077" is
 * een regel; "kun je hier eens naar kijken" is dat niet.
 *
 * Wat hier uitkomt zijn *kandidaten*, geen regels. Er wordt niets van
 * aangemaakt zonder dat iemand het in het reviewscherm heeft gezien.
 */

/**
 * Exportstempel achteraan een bestandsnaam weghalen.
 *
 * Klantsystemen plakken datum en tijd achter de tekeningnaam bij het
 * exporteren: `2604307-1-2615-0091-0530-1_20260904-0942` (gemeten op mail van
 * een klant). Dat hoort niet bij het tekeningnummer, en het verandert bij elke
 * export - zonder strippen matcht niet alleen niets, maar leert de koppeling
 * ook nooit iets, want het klantnummer is dan elke mail anders.
 *
 * Alleen weghalen als de acht cijfers een geldige datum vormen, zodat een
 * tekeningnummer dat toevallig op cijfers eindigt niet wordt afgekapt.
 */
function looksLikeDate(yyyymmdd: string): boolean {
  const y = Number(yyyymmdd.slice(0, 4))
  const m = Number(yyyymmdd.slice(4, 6))
  const d = Number(yyyymmdd.slice(6, 8))
  return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31
}

const TRAILING_STAMP = /[_\-\s]((?:\d{8})|(?:\d{4}-\d{2}-\d{2}))(?:[_\-]\d{2}-?\d{2})?$/

export function stripExportStamp(base: string): string {
  const m = base.match(TRAILING_STAMP)
  if (!m) return base
  const digits = m[1].replace(/-/g, '')
  if (digits.length !== 8 || !looksLikeDate(digits)) return base
  return base.slice(0, base.length - m[0].length).replace(/[_\-\s]+$/, '') || base
}

/**
 * `rev B`, `revB`, `rev. B`, `_rev-B` → 'B'. Alleen mét het woord "rev".
 *
 * Let op de eigen grens in plaats van `\b`: een underscore telt als
 * woordteken, dus `\brev` matcht niet in `123456_rev B` — precies de vorm die
 * uit Windows-bestandsnamen komt.
 */
function findRev(text: string): string | null {
  const m = text.match(/(?:^|[^A-Za-z])rev[\s._-]*([A-Za-z0-9]{1,3})(?![A-Za-z0-9])/i)
  return m ? m[1].toUpperCase() : null
}

/** `(3x)`, `3x`, `x3`, `3 stuks`, `aantal: 3`. Nooit een jaartal of ordernummer. */
function findQty(text: string): number | null {
  const patterns = [
    /\((\d{1,4})\s*x\)/i,
    /\b(\d{1,4})\s*x\b/i,
    /\bx\s*(\d{1,4})\b/i,
    /\b(\d{1,4})\s*(?:stuks?|st\.?|pcs?)\b/i,
    /\baantal\s*[:=]?\s*(\d{1,4})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > 0 && n <= 9999) return n
    }
  }
  return null
}

/** Ordernummers uit het onderwerp: "koppel order: 2026077" → ['2026077']. */
export function orderNumbersInSubject(subject: string): string[] {
  const out = new Set<string>()
  // Let op: geen `\b`, maar "niet nog meer cijfers". Klanten plakken een
  // letterprefix aan hun ordernummer ("PUR2604307"), en `\b` matcht niet tussen
  // een letter en een cijfer — dan werd het ordernummer niet herkend.
  for (const m of subject.matchAll(/(?<!\d)(\d{6,10})(?!\d)/g)) out.add(m[1])
  return [...out]
}

/**
 * Een bijlagenaam ontleden.
 *
 * Het patroon `<ordernummer>-<positie>` is waargenomen in de eigen mail
 * (§2.1) maar nog niet bevestigd als vaste conventie. Daarom wordt de positie
 * alléén gelezen als het voorvoegsel ook echt een ordernummer uit het
 * onderwerp is — anders is `123456-02` gewoon een tekeningnummer met een
 * streepje erin, en dat mag niet stilletjes als positie 2 gelden.
 */
function fromFilename(filename: string, orderNumbers: string[]): Kandidaat | null {
  if (classifyAttachment(filename) !== 'tekening') return null
  const base = baseNameOf(filename)

  let tekening = base
  let positie: number | null = null

  const viaOrder = stripOrderPrefix(base, orderNumbers)
  if (viaOrder.positie !== null) {
    positie = viaOrder.positie
    tekening = viaOrder.tekening
  } else {
    // Los van rev- en aantal-aanduidingen houden we het deel vóór de eerste
    // spatie of haakje over als tekeningnummer.
    // Zelfde grens-truc als in findRev: `\b` faalt na een underscore.
    tekening = base
      .replace(/(^|[^A-Za-z])rev[\s._-]*[A-Za-z0-9]{1,3}(?![A-Za-z0-9])/i, '$1')
      .replace(/\(.*?\)/g, '')
      .trim()
    tekening = stripExportStamp(tekening.replace(/[_\s-]+$/, '').trim() || base)
  }

  return {
    ruweTekst: filename,
    tekening: tekening || null,
    rev: findRev(base),
    positie,
    qty: findQty(base),
    bron: 'bijlagenaam' as CandidateSource,
    attachmentFilename: filename,
  }
}

/** Bodyregels als `3x 123456` of `123456 - 3 stuks`. */
function fromBodyLine(line: string): Kandidaat | null {
  const trimmed = line.trim()
  if (trimmed.length < 4 || trimmed.length > 200) return null
  // Doorstuur-koppen zijn geen regels (§3.2 leest die apart).
  if (/^\s*>*\s*(van|from|aan|to|verzonden|sent|onderwerp|subject|cc)\s*:/i.test(trimmed)) return null

  const qty = findQty(trimmed)
  const code = findCode(trimmed)
  if (!code || qty === null) return null

  return {
    ruweTekst: trimmed,
    tekening: code,
    rev: findRev(trimmed),
    positie: null,
    qty,
    bron: 'body' as CandidateSource,
    attachmentFilename: null,
  }
}

/**
 * Een tekeningnummer in een regel tekst.
 *
 * De groepen achter het eerste getal worden herhaald gepakt: een nummer als
 * `2604307-1-2615-0091-0530-1` is één code, niet `2604307-1` met rommel erna.
 * Minstens vier cijfers aan het begin, anders vist dit posities en aantallen
 * uit een ordertabel op.
 */
function findCode(text: string): string | null {
  const m = text.match(/\b([A-Z]{0,4}[-_]?\d{4,10}(?:[-_][A-Z0-9]{1,6})*)\b/i)
  return m ? m[1] : null
}

/**
 * Ordernummer en positie vooraan een aanduiding weghalen.
 *
 * Klanten zetten hun eigen order- en positienummer vóór ons tekeningnummer:
 * `2604307-1-2615-0091-0530-1` is order 2604307, positie 1, tekening
 * 2615-0091-0530-1. Dit moet op bestandsnamen én op de regels uit de
 * orderpdf werken, anders levert dezelfde onderdeel twee regels op die niet
 * samengevoegd worden.
 */
function stripOrderPrefix(
  code: string,
  orderNumbers: string[]
): { tekening: string; positie: number | null } {
  const m = code.match(/^(\d{6,10})[-_](\d{1,3})(?:[-_](.+))?$/)
  if (!m || !orderNumbers.includes(m[1])) return { tekening: code, positie: null }
  const rest = m[3]?.trim()
  return {
    tekening: rest ? stripExportStamp(rest) : `${m[1]}-${m[2]}`,
    positie: parseInt(m[2], 10),
  }
}

/**
 * Regels uit de tekst van een meegestuurde PDF — meestal de orderregeltabel
 * van de inkooporder. Daar staan de aantallen die in de bestandsnamen ontbreken.
 */
function fromDocumentText(
  filename: string,
  tekst: string,
  orderNumbers: string[]
): Kandidaat[] {
  const out: Kandidaat[] = []
  for (const line of tekst.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length < 6 || trimmed.length > 300) continue
    const qty = findQty(trimmed)
    const code = findCode(trimmed)
    if (!code || qty === null) continue
    // Zelfde behandeling als een bestandsnaam, anders wordt het aantal uit de
    // ordertabel een losse regel naast de tekening in plaats van erbij.
    const { tekening, positie } = stripOrderPrefix(stripExportStamp(code), orderNumbers)
    out.push({
      ruweTekst: trimmed,
      tekening,
      rev: findRev(trimmed),
      positie,
      qty,
      bron: 'pdf' as CandidateSource,
      attachmentFilename: filename,
    })
  }
  return out
}

/** Twee bestanden van hetzelfde onderdeel (een pdf én een step) is één regel. */
export function dedupeKeyOf(tekening: string | null, ruweTekst: string): string {
  return (tekening ?? ruweTekst).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Het handelsdocument dat de regels mag bepalen — het eerste dat leesbaar is. */
export function leidendDocument(attachments: MailAttachment[]): MailAttachment | null {
  return (
    attachments.find(
      (a) => !a.isEmbeddedMessage && a.tekst && classifyAttachment(a.filename) === 'document'
    ) ?? null
  )
}

export interface ExtractResult {
  lines: CandidateLine[]
  /** De inkooporder of aanvraag die de regels bepaalde, of null. */
  document: string | null
}

/**
 * Regels uit een mail halen.
 *
 * De rangorde is wat hier telt (§3.4). Is er een leesbaar handelsdocument, dan
 * bepaalt dát de regels en worden de meegestuurde tekeningen eraan gehangen —
 * een tekening is een bijlage bij een onderdeel, niet een tweede bestelling van
 * datzelfde onderdeel. Pas zonder zo'n document vallen we terug op de
 * bestandsnamen, want dan is dat alles wat we hebben.
 */
export function extractLines(mail: NormalizedMail): ExtractResult {
  const orderNumbers = orderNumbersInSubject(mail.subject)
  const document = leidendDocument(mail.attachments)
  const byKey = new Map<string, CandidateLine>()
  let seq = 0

  const add = (partial: Kandidaat | null) => {
    if (!partial) return
    const key = dedupeKeyOf(partial.tekening, partial.ruweTekst)
    if (!key) return
    const existing = byKey.get(key)
    if (existing) {
      // Vul aan wat de eerste bron nog niet wist, maar overschrijf niets.
      if (existing.qty === null && partial.qty !== null) existing.qty = partial.qty
      if (existing.rev === null && partial.rev !== null) existing.rev = partial.rev
      if (existing.positie === null && partial.positie !== null) existing.positie = partial.positie
      return
    }
    byKey.set(key, {
      ...partial,
      id: `kand-${++seq}`,
      bestanden: [],
      matches: [],
      status: 'nieuw',
      artikelId: null,
      handmatig: false,
      extractor: 'regels',
      bronTekst: null,
      gegrond: null,
      bronBestand: partial.attachmentFilename,
      zekerheid: 0,
      zekerheidRedenen: [],
    })
  }

  if (document) {
    // Het document is de waarheid: alleen zijn regeltabel maakt regels.
    for (const k of fromDocumentText(document.filename, document.tekst!, orderNumbers)) add(k)
  } else {
    // Geen leesbaar document. Dan zijn de bijlagenamen het sterkste signaal dat
    // er is, en vult de tekst van de overige pdf's de aantallen aan.
    for (const att of mail.attachments) {
      if (att.isEmbeddedMessage) continue
      add(fromFilename(att.filename, orderNumbers))
    }
    for (const att of mail.attachments) {
      if (att.tekst) for (const k of fromDocumentText(att.filename, att.tekst, orderNumbers)) add(k)
    }
  }

  // De mailtekst mag altijd regels toevoegen: wat de klant erbij tikt ("en
  // graag ook 5x ...") staat in geen enkel document.
  for (const line of mail.bodyText.split(/\r?\n/)) add(fromBodyLine(line))

  const lines = [...byKey.values()]
  hangBestandenAan(lines, mail.attachments)

  // Op positie sorteren als de klant die meegaf; anders blijft de
  // bijlagevolgorde staan, en dat is meestal de volgorde van de order.
  lines.sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
  return { lines, document: document?.filename ?? null }
}

/**
 * Tekeningen bij hun regel zetten.
 *
 * Een bestand dat bij geen enkele regel hoort blijft gewoon in de bijlagenlijst
 * staan; het wordt niet stilletijgend weggegooid en ook niet alsnog een regel —
 * als het document de regels bepaalde, is dat document leidend.
 */
export function hangBestandenAan(lines: CandidateLine[], attachments: MailAttachment[]): void {
  for (const att of attachments) {
    if (att.isEmbeddedMessage) continue
    if (classifyAttachment(att.filename) !== 'tekening') continue
    for (const line of lines) {
      if (hoortBij(att.filename, line.tekening) && !line.bestanden.includes(att.filename)) {
        line.bestanden.push(att.filename)
      }
    }
  }
}
