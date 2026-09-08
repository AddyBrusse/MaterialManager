/**
 * Wat voor soort bijlage is dit? — features/60-mail-import.md §3.4.
 *
 * Dit onderscheid stuurt de hele extractie. Een klantmail draagt meestal twee
 * dingen: het handelsdocument (de inkooporder of de aanvraag) en de tekeningen
 * die erbij horen. Die twee horen niet gelijk behandeld te worden.
 *
 *  - Het document zégt wat de klant wil: welke onderdelen, hoeveel, in welke
 *    volgorde. Als we dat kunnen lezen, is dat de waarheid.
 *  - Een tekening is een bijlage bíj een regel, geen regel op zichzelf. Zonder
 *    dit onderscheid leverde één onderdeel twee regels op: één uit de
 *    ordertabel en één uit de bestandsnaam van de tekening (waargenomen op
 *    echte mail van een klant, 2026-09-08).
 */

/** Bijlagen die nooit een onderdeel zijn — handtekeningplaatjes en dergelijke. */
const IGNORED_EXTENSIONS = new Set(['.p7s', '.p7m', '.asc', '.vcf', '.ics', '.gif'])
const IGNORED_NAMES = /^(image\d*|oledata|winmail|logo|signature|banner)/i

/** Namen waaraan een handelsdocument te herkennen is. */
const DOCUMENT_NAMES =
  /(purchase[\s_-]*order|inkooporder|bestelbon|bestelling|order[\s_-]*(bevestiging|confirmation)|offerte|aanvraag|quotation|\bquote\b|\brfq\b|invoice|factuur|pakbon|packing[\s_-]*list|voorwaarden|terms)/i

/** Bestandstypen die in deze werkplaats een onderdeel aanduiden. */
const PART_EXTENSIONS = new Set([
  '.step', '.stp', '.iges', '.igs', '.sldprt', '.ipt', '.x_t', '.stl', '.dxf', '.dwg', '.pdf',
])

export const ATTACHMENT_KINDS = ['document', 'tekening', 'overig'] as const
export type AttachmentKind = typeof ATTACHMENT_KINDS[number]

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot === -1 ? filename : filename.slice(0, dot)).trim()
}

export function classifyAttachment(filename: string): AttachmentKind {
  const ext = extensionOf(filename)
  const base = baseNameOf(filename)
  if (!base || IGNORED_EXTENSIONS.has(ext) || IGNORED_NAMES.test(base)) return 'overig'
  if (DOCUMENT_NAMES.test(base)) return 'document'
  // Een onderdeel wordt hier altijd met een nummer aangeduid. Een bijlage die
  // alleen uit woorden bestaat ("scan.pdf", "tekeningen.pdf") is geen tekening.
  if (!/\d{3,}/.test(base)) return 'overig'
  if (ext && !PART_EXTENSIONS.has(ext)) return 'overig'
  return 'tekening'
}

/**
 * Hoort deze tekening bij deze regel?
 *
 * De klant noemt zijn tekening `<order>-<positie>-<ons nummer>-<rev>`, dus het
 * onze zit erin besloten. Vergelijken gebeurt op alleen letters en cijfers,
 * want punt, streep en underscore verschillen per systeem. Kort niet
 * vergelijken: drie tekens komen overal in voor.
 */
const MIN_OVERLAP = 6

export function hoortBij(bestandsnaam: string, tekening: string | null): boolean {
  if (!tekening) return false
  const a = normalize(baseNameOf(bestandsnaam))
  const b = normalize(tekening)
  if (b.length < MIN_OVERLAP || a.length < MIN_OVERLAP) return false
  return a.includes(b) || b.includes(a)
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
