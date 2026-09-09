import type { AttachmentBuffers } from './ai-extract'
import { aiExtract, buildLines } from './ai-extract'
import { isZip, pakZipUit } from './zip-uitpakken'
import type { ExtractedAttachment } from './msg-parse'
import { parseMsg, readAttachments } from './msg-parse'
import { MAX_TEXT_CHARS, pdfText } from './pdf-text'
import type { CandidateLine, NormalizedMail } from '@stockmanager/shared'
import type { AiExtractOutcome } from './ai-extract'

/**
 * Een .msg klaarmaken om gelezen te worden — zonder database.
 *
 * Dit is het stuk dat `ingestMsgBuffer` en de scoreset (`score-mails.ts`) delen.
 * Het moet één functie zijn: zodra de scoreset zijn eigen voorbereiding krijgt
 * meet hij een pad dat in productie niet bestaat, en dan is de score een
 * geruststelling in plaats van een meting.
 *
 * Wat hier gebeurt en waarom het in deze volgorde moet:
 *  1. zips uitpakken — de tekeningen zitten erin en moeten losse bijlagen zijn
 *  2. pdf-tekst lezen — de aantallen staan in de inkooporder
 *  3. `mail.attachments` opnieuw opbouwen uit de uitgepakte lijst, niet uit de
 *     lijst van de parser: die kent de inhoud van de zip niet
 */

/**
 * De bijlagenlijst met de inhoud van meegestuurde zips erbij.
 *
 * De uitgepakte bestanden komen direct achter hun zip te staan, zodat de
 * volgorde begrijpelijk blijft als je de mail later terugkijkt. Een naam die al
 * voorkomt wordt overgeslagen: twee bijlagen met dezelfde naam zouden elkaar op
 * schijf en in de inhoudsmap overschrijven.
 */
export function metZipInhoud(bijlagen: ExtractedAttachment[]): ExtractedAttachment[] {
  if (!bijlagen.some((a) => !a.isEmbeddedMessage && isZip(a.filename))) return bijlagen

  const uit: ExtractedAttachment[] = []
  const namen = new Set(bijlagen.map((a) => a.filename.toLowerCase()))
  for (const a of bijlagen) {
    uit.push(a)
    if (a.isEmbeddedMessage || !isZip(a.filename)) continue
    for (const f of pakZipUit(a.content)) {
      if (namen.has(f.filename.toLowerCase())) continue
      namen.add(f.filename.toLowerCase())
      uit.push({ filename: f.filename, content: f.content, isEmbeddedMessage: false })
    }
  }
  return uit
}

export interface Voorbereid {
  mail: NormalizedMail
  embedded: NormalizedMail[]
  buffers: AttachmentBuffers
  /** De bijlagen mét inhoud, in dezelfde volgorde als `mail.attachments`. */
  extracted: ExtractedAttachment[]
  /** De volledige uitgelezen pdf-tekst per bijlage — ongekort, voor op schijf. */
  teksten: (string | null)[]
}

export async function bereidVoor(
  buf: Buffer,
  source: NormalizedMail['source'] = 'drop'
): Promise<Voorbereid> {
  const { mail, embedded } = parseMsg(buf, source)

  const extracted = metZipInhoud(readAttachments(buf))
  const teksten = await Promise.all(
    extracted.map((a) => (a.isEmbeddedMessage ? Promise.resolve(null) : pdfText(a.content)))
  )

  const origineel = new Map(mail.attachments.map((a) => [a.filename, a]))
  mail.attachments = extracted.map((a, i) => {
    const bestaand = origineel.get(a.filename)
    return {
      filename: a.filename,
      sizeBytes: a.content.length,
      path: bestaand?.path ?? null,
      isEmbeddedMessage: a.isEmbeddedMessage,
      tekst: teksten[i] ? teksten[i]!.slice(0, MAX_TEXT_CHARS) : null,
      tekstPath: null,
    }
  })

  const inhoud = new Map(extracted.map((a) => [a.filename, a.content]))
  return {
    mail,
    embedded,
    buffers: { get: (naam: string) => inhoud.get(naam) },
    extracted,
    teksten,
  }
}

export interface Gelezen {
  mail: NormalizedMail
  uitkomst: AiExtractOutcome
  lines: CandidateLine[]
}

/**
 * De mail door het model halen en er kandidaatregels van maken.
 *
 * Alles tot en met `buildLines` — dus zonder het opzoeken van artikelen, want
 * dat is `match-articles.ts` en heeft de database nodig. De scoreset meet
 * precies dit: hoe goed we de mail *lezen*.
 */
export async function leesMail(voorbereid: Voorbereid): Promise<Gelezen> {
  const uitkomst = await aiExtract(voorbereid.mail, voorbereid.buffers)
  const { lines } = buildLines(uitkomst.regels, voorbereid.mail, {
    scans: new Set(uitkomst.scans),
    document: uitkomst.document,
    bevestiging: uitkomst.bevestiging,
  })
  return { mail: voorbereid.mail, uitkomst, lines }
}
