import MsgReader from '@kenjiuno/msgreader'
import type { FieldsData } from '@kenjiuno/msgreader/lib/MsgReader'
import type { MailAddress, MailAttachment, NormalizedMail } from '@stockmanager/shared'

/**
 * Parsen van een gesleept Outlook-bericht (.msg) naar de genormaliseerde vorm
 * uit features/60-mail-import.md §3.1.
 *
 * .msg is een OLE2 compound file met MAPI-property-streams — geen open
 * mailformaat, en niet elk veld zit er altijd in. Een bericht dat nooit door
 * Exchange is gegaan mist bijvoorbeeld afzender, message-id én transport
 * headers; dat is geen fout maar een geval om af te handelen. Alles hieronder
 * gaat er dus van uit dat elk veld kan ontbreken.
 */

/** Eerste 8 bytes van elk OLE2 compound file. Betrouwbaarder dan de extensie. */
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/**
 * MsgReader wil een ArrayBuffer. Een Node Buffer is vaak een venster op een
 * gedeelde pool, dus `buf.buffer` doorgeven zou de bytes van de buren
 * meenemen — altijd het eigen bereik uitsnijden.
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export function looksLikeMsg(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(OLE2_MAGIC)
}

export interface ParsedMsg {
  mail: NormalizedMail
  /**
   * Berichten die als bijlage meekwamen. "Doorsturen als bijlage" levert hier
   * het originele klantbericht op, mét echte kop — zie §3.2. De keuze welk
   * bericht het eigenlijke is, ligt bij de afzender-resolutie, niet hier.
   */
  embedded: NormalizedMail[]
}

function cleanAddress(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Exchange-afzenders dragen soms een X.500 DN in plaats van een adres
  // (/O=EXCHANGELABS/OU=…/CN=…). Dat is geen e-mailadres; liever niets dan iets
  // wat op een adres lijkt maar nergens op matcht.
  if (trimmed.startsWith('/') || !trimmed.includes('@')) return null
  return trimmed
}

function senderOf(d: FieldsData): MailAddress | null {
  const email =
    cleanAddress(d.senderSmtpAddress) ??
    cleanAddress(d.senderEmail) ??
    // Bij mail via Exchange staat het adres soms alleen in lastModifierName.
    cleanAddress(d.lastModifierName)
  const naam = d.senderName?.trim() || null
  if (!email && !naam) return null
  return { naam, email }
}

function recipientsOf(d: FieldsData, kind: 'to' | 'cc'): MailAddress[] {
  return (d.recipients ?? [])
    .filter((r) => (r.recipType ?? 'to') === kind)
    .map((r) => ({
      naam: r.name?.trim() || null,
      email: cleanAddress(r.email) ?? cleanAddress(r.name),
    }))
}

/** MAPI-datums komen als RFC-1123 string binnen; ISO maakt ze vergelijkbaar. */
function toIso(value: string | undefined): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function attachmentsOf(d: FieldsData): MailAttachment[] {
  return (d.attachments ?? []).map((a) => ({
    // Een embedded bericht heeft vaak geen fileName; het onderwerp is dan het
    // enige dat de gebruiker herkent.
    filename: a.fileName ?? `${a.innerMsgContentFields?.subject ?? 'bericht'}.msg`,
    sizeBytes: a.contentLength ?? 0,
    path: null,
    isEmbeddedMessage: Boolean(a.innerMsgContent),
  }))
}

function toNormalized(d: FieldsData, source: NormalizedMail['source']): NormalizedMail {
  return {
    source,
    messageId: d.messageId?.trim() || null,
    subject: (d.subject ?? d.normalizedSubject ?? '').trim(),
    bodyText: d.body ?? '',
    bodyHtml: d.bodyHtml ?? null,
    // Ontvangen gaat vóór verzonden: bij doorgestuurde mail is dat het moment
    // dat hij hier binnenkwam.
    receivedAt: toIso(d.messageDeliveryTime) ?? toIso(d.clientSubmitTime) ?? null,
    from: senderOf(d),
    to: recipientsOf(d, 'to'),
    cc: recipientsOf(d, 'cc'),
    attachments: attachmentsOf(d),
    rawHeaders: d.headers ?? null,
  }
}

export function parseMsg(buf: Buffer, source: NormalizedMail['source'] = 'drop'): ParsedMsg {
  if (!looksLikeMsg(buf)) {
    throw new Error('Bestand is geen Outlook-bericht (.msg)')
  }
  const reader = new MsgReader(toArrayBuffer(buf))
  const data = reader.getFileData()
  if (data.dataType !== 'msg') {
    throw new Error('Bestand kon niet als Outlook-bericht gelezen worden')
  }

  const embedded = (data.attachments ?? [])
    .filter((a) => a.innerMsgContent && a.innerMsgContentFields)
    .map((a) => toNormalized(a.innerMsgContentFields as FieldsData, source))

  return { mail: toNormalized(data, source), embedded }
}

/** Bytes van één bijlage, op index in `mail.attachments`. */
export function attachmentBytes(buf: Buffer, index: number): Buffer {
  const reader = new MsgReader(toArrayBuffer(buf))
  reader.getFileData()
  const att = reader.getAttachment(index)
  return Buffer.from(att.content)
}
