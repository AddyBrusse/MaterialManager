import type { CandidateLine, CandidateSource, NormalizedMail } from '@stockmanager/shared'

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

/** Bijlagen die nooit een onderdeel zijn — handtekeningplaatjes en dergelijke. */
const IGNORED_EXTENSIONS = new Set(['.p7s', '.p7m', '.asc', '.vcf', '.ics', '.gif'])
const IGNORED_NAMES = /^(image\d*|oledata|winmail|logo|signature|banner)/i

/** Bestandstypen die in deze werkplaats een onderdeel aanduiden. */
const PART_EXTENSIONS = new Set([
  '.step', '.stp', '.iges', '.igs', '.sldprt', '.ipt', '.x_t', '.stl', '.dxf', '.dwg', '.pdf',
])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot === -1 ? filename : filename.slice(0, dot)).trim()
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
  for (const m of subject.matchAll(/\b(\d{6,10})\b/g)) out.add(m[1])
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
function fromFilename(filename: string, orderNumbers: string[]): Omit<CandidateLine, 'id' | 'matches' | 'status' | 'artikelId' | 'handmatig'> | null {
  const ext = extensionOf(filename)
  const base = baseNameOf(filename)
  if (!base || IGNORED_EXTENSIONS.has(ext) || IGNORED_NAMES.test(base)) return null
  if (ext && !PART_EXTENSIONS.has(ext)) return null

  let tekening = base
  let positie: number | null = null

  const orderMatch = base.match(/^(\d{6,10})[-_](\d{1,3})\b/)
  if (orderMatch && orderNumbers.includes(orderMatch[1])) {
    positie = parseInt(orderMatch[2], 10)
    // De hele naam blijft de aanduiding van het onderdeel: "2026077-001" is
    // wat de klant bedoelt, niet "2026077".
    tekening = `${orderMatch[1]}-${orderMatch[2]}`
  } else {
    // Los van rev- en aantal-aanduidingen houden we het deel vóór de eerste
    // spatie of haakje over als tekeningnummer.
    // Zelfde grens-truc als in findRev: `\b` faalt na een underscore.
    tekening = base
      .replace(/(^|[^A-Za-z])rev[\s._-]*[A-Za-z0-9]{1,3}(?![A-Za-z0-9])/i, '$1')
      .replace(/\(.*?\)/g, '')
      .trim()
    tekening = tekening.replace(/[_\s-]+$/, '').trim() || base
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
function fromBodyLine(line: string): Omit<CandidateLine, 'id' | 'matches' | 'status' | 'artikelId' | 'handmatig'> | null {
  const trimmed = line.trim()
  if (trimmed.length < 4 || trimmed.length > 200) return null
  // Doorstuur-koppen zijn geen regels (§3.2 leest die apart).
  if (/^\s*>*\s*(van|from|aan|to|verzonden|sent|onderwerp|subject|cc)\s*:/i.test(trimmed)) return null

  const qty = findQty(trimmed)
  // Een code met minstens één cijfer en wat lengte — anders vist dit gewone
  // woorden uit de begeleidende tekst op.
  const code = trimmed.match(/\b([A-Z]{0,4}[-_]?\d{4,10}(?:[-_][A-Z0-9]{1,4})?)\b/i)
  if (!code || qty === null) return null

  return {
    ruweTekst: trimmed,
    tekening: code[1],
    rev: findRev(trimmed),
    positie: null,
    qty,
    bron: 'body' as CandidateSource,
    attachmentFilename: null,
  }
}

/** Twee bestanden van hetzelfde onderdeel (een pdf én een step) is één regel. */
function dedupeKeyOf(tekening: string | null, ruweTekst: string): string {
  return (tekening ?? ruweTekst).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function extractLines(mail: NormalizedMail): CandidateLine[] {
  const orderNumbers = orderNumbersInSubject(mail.subject)
  const byKey = new Map<string, CandidateLine>()
  let seq = 0

  const add = (partial: Omit<CandidateLine, 'id' | 'matches' | 'status' | 'artikelId' | 'handmatig'> | null) => {
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
      matches: [],
      status: 'nieuw',
      artikelId: null,
      handmatig: false,
    })
  }

  // Bijlagen eerst: die wegen het zwaarst en bepalen dus de volgorde.
  for (const att of mail.attachments) {
    if (att.isEmbeddedMessage) continue // dat is een bericht, geen onderdeel
    add(fromFilename(att.filename, orderNumbers))
  }
  for (const line of mail.bodyText.split(/\r?\n/)) add(fromBodyLine(line))

  const lines = [...byKey.values()]
  // Op positie sorteren als de klant die meegaf; anders blijft de
  // bijlagevolgorde staan, en dat is meestal de volgorde van de order.
  return lines.sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
}
