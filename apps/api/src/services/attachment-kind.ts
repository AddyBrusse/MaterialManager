import type { CandidateLine, MailAttachment } from '@stockmanager/shared'

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

/**
 * Namen waaraan een handelsdocument te herkennen is.
 *
 * Let op de eigen woordgrens in plaats van `\b`: een underscore telt als
 * woordteken, dus `\brfq\b` matcht níet in `Purchase offer_RFQ2600241` — en dat
 * is precies de vorm die uit een klantsysteem komt. Dezelfde val als in
 * findRev; hier kostte hij een verkeerd gelezen offerteaanvraag.
 */
const GRENS = '(?:^|[^A-Za-z])'
const DOCUMENT_NAMES = new RegExp(
  `(purchase[\\s_-]*(order|offer|enquiry)|inkoop(order|offerte)|verkooporder|bestelbon|bestelling` +
    `|order[\\s_-]*(bevestiging|confirmation)|offerte|offer[\\s_-]*aanvraag|aanvraag|quotation` +
    `|${GRENS}(quote|rfq|rfi)(?![A-Za-z0-9])|invoice|factuur|pakbon|packing[\\s_-]*list|voorwaarden|terms)`,
  'i'
)

/**
 * Waaraan een handelsdocument te herkennen is aan zijn *inhoud*.
 *
 * Betrouwbaarder dan de bestandsnaam, want die verzint elk klantsysteem anders.
 * "Purchase offer_RFQ2600241.pdf" werd op zijn naam als tekening gezien, terwijl
 * er in de tekst gewoon "Offerteaanvraag" en "Inkoopofferte" staat.
 */
const DOCUMENT_TEKST =
  /(offerteaanvraag|inkoopofferte|inkooporder|purchase[\s_-]*(order|offer)|request for quotation|opdrachtbevestiging|order confirmation|proforma|pakbon|factuur|invoice)/i

/**
 * Tekenpakket-formaten. Deze zijn per definitie een onderdeel: een step of een
 * dwg is nooit een scan, een folder of een handtekeningplaatje.
 */
const CAD_EXTENSIONS = new Set([
  '.step', '.stp', '.iges', '.igs', '.sldprt', '.ipt', '.x_t', '.stl', '.dxf', '.dwg',
])

/**
 * Namen die zeggen wát het bestand is in plaats van wélk onderdeel: "scan.pdf",
 * "tekeningen.pdf", "bijlage 2.pdf". Alleen voor pdf's nodig — die zijn zowel de
 * drager van een tekening als van alles wat er verder wordt meegestuurd.
 *
 * Dit verving een regel die eiste dat er minstens drie cijfers in de naam stonden,
 * op de aanname dat een onderdeel altijd een nummer draagt. Dat klopt voor de ene
 * klant en niet voor de andere: bij een bestelling van Veratio (21-05-2026) heetten
 * de tekeningen `Motor Housing_v2.pdf` en `Lower foam pin.pdf`, en die vielen
 * allemaal buiten de boot — zeven tekeningen die nergens aan gehangen werden.
 */
const GENERIEKE_NAMEN =
  /^(scan|scans|tekening|tekeningen|drawing|drawings|document|documenten|bijlage|bijlagen|attachment|attachments|afbeelding|afbeeldingen|foto|fotos|bestand|bestanden|file|files|pagina|page)\b/i

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

export function classifyAttachment(filename: string, tekst?: string | null): AttachmentKind {
  const ext = extensionOf(filename)
  const base = baseNameOf(filename)
  if (!base || IGNORED_EXTENSIONS.has(ext) || IGNORED_NAMES.test(base)) return 'overig'
  // Inhoud gaat vóór naam: wat er in het document staat liegt niet, een
  // bestandsnaam uit een vreemd systeem wel.
  if (tekst && DOCUMENT_TEKST.test(tekst.slice(0, 4000))) return 'document'
  if (DOCUMENT_NAMES.test(base)) return 'document'
  // Een tekenpakket-formaat is altijd een onderdeel, hoe het bestand ook heet.
  if (CAD_EXTENSIONS.has(ext)) return 'tekening'
  // Een pdf kan alles zijn. Draagt hij een naam die alleen zegt wát het is in
  // plaats van wélk onderdeel, dan is het geen tekening.
  if (ext === '.pdf') return GENERIEKE_NAMEN.test(base) ? 'overig' : 'tekening'
  return 'overig'
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

/**
 * Het handelsdocument dat de regels bepaalt — het eerste dat we vinden.
 *
 * Een scan telt net zo goed mee: het model krijgt die als afbeelding en kan hem
 * gewoon lezen. Alleen een tekstlaag eisen zou juist de gescande inkooporder
 * buitensluiten, en dat is precies het document waar het om gaat.
 */
export function leidendDocument(attachments: MailAttachment[]): MailAttachment | null {
  return (
    attachments.find(
      (a) => !a.isEmbeddedMessage && classifyAttachment(a.filename, a.tekst) === 'document'
    ) ?? null
  )
}

/**
 * Tekeningen bij hun regel zetten.
 *
 * Een bestand dat bij geen enkele regel hoort blijft gewoon in de bijlagenlijst
 * staan; het wordt niet stilzwijgend weggegooid en ook niet alsnog een regel —
 * als het document de regels bepaalde, is dat document leidend.
 */
export function hangBestandenAan(
  lines: CandidateLine[],
  attachments: MailAttachment[],
  document?: string | null,
): void {
  const tekeningen = attachments.filter(
    (a) =>
      !a.isEmbeddedMessage &&
      // Het leidende document is geen tekening bij een regel, ook niet als de
      // classificatie hem zo zou lezen: een inkooporder met een cryptische naam
      // en zonder tekstlaag is van buiten niet van een tekening te onderscheiden.
      a.filename !== document &&
      classifyAttachment(a.filename) === 'tekening',
  )

  function koppel(line: CandidateLine, filename: string): void {
    if (!line.bestanden.includes(filename)) line.bestanden.push(filename)
  }

  // Stap 1 — het tekeningnummer zit in de bestandsnaam. Het sterkste signaal, en
  // het enige dat ook klopt als er vijf regels en vijf tekeningen zijn.
  for (const att of tekeningen) {
    for (const line of lines) {
      if (hoortBij(att.filename, line.tekening)) koppel(line, att.filename)
    }
  }

  // Stap 2 — het model zegt zelf uit welke bijlage de regel komt. Wijst dat naar
  // een tekening, dan hoort die tekening bij die regel; dat is geen gok maar een
  // uitspraak over dit specifieke document. Vangt de gevallen waarin de klant
  // zijn bestand anders noemt dan zijn tekeningnummer.
  for (const line of lines) {
    const bron = line.attachmentFilename
    if (bron && tekeningen.some((a) => a.filename === bron)) koppel(line, bron)
  }

  // Stap 3 — het vangnet: één regel die na stap 1 en 2 nog nérgens een bestand
  // aan heeft hangen, krijgt de losse tekeningen uit de mail. Zonder dit wordt
  // een nieuw artikel aangemaakt terwijl de tekening in de mailmap blijft
  // liggen — precies waarvoor de klant hem meestuurde.
  //
  // Twee voorwaarden houden het eerlijk. Eén regel, want bij meer regels is niet
  // te zeggen welke tekening waarbij hoort en is de verkeerde tekening aan een
  // artikel hangen erger dan geen tekening. En alleen als die regel nog niets
  // heeft: heeft stap 1 al op het nummer gematcht, dan is een overgebleven
  // tekening juist een aanwijzing dat hij ergens anders bij hoort.
  if (lines.length === 1 && lines[0].bestanden.length === 0) {
    for (const att of tekeningen) koppel(lines[0], att.filename)
  }
}
