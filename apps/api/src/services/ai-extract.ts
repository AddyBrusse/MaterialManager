import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { CandidateLine, CandidateSource, MailAttachment, NormalizedMail } from '@stockmanager/shared'
import { config } from '../config'
import { classifyAttachment, hangBestandenAan, hoortBij, leidendDocument } from './attachment-kind'
import { looksLikePdf } from './pdf-text'

/**
 * De mail door een taalmodel laten lezen — features/60-mail-import.md §6.
 *
 * Dit is sinds 2026-09-08 de enige extractor. De vaste patronen zijn eruit: die
 * werkten alleen op de vormen die we hadden gezien, en elke klant maakt zijn pdf
 * anders. Op een echte offerteaanvraag las het patroon `4-9-2026pcs` als 2026
 * stuks omdat de leverdatum tegen de eenheid aan plakte — een fout getal dat er
 * uitziet als een gelezen aantal. Liever geen regel dan een verkeerde regel.
 *
 * Wat het model *niet* doet: kiezen welk artikel uit onze database erbij hoort.
 * Dat blijft match-articles.ts. 2615-0090-0530 en 2615-0091-0530 bestaan allebei
 * en schelen één cijfer; die keuze hoort in code die we kunnen testen, niet in
 * een model dat aannemelijk gokt.
 *
 * Drie controles op wat eruit komt, elk op een andere manier van fout gaan:
 *  1. `bronTekst` moet letterlijk in de mail of bijlage staan (verzonnen regel)
 *  2. het tekeningnummer zelf moet er letterlijk staan (verschoven cijfer)
 *  3. een tweede, onafhankelijke lezing moet dezelfde regel opleveren (toeval)
 * Geen ervan gooit een regel weg — ze bepalen de zekerheid, en een mens beslist.
 */

const AiLineSchema = z.object({
  tekening: z
    .string()
    .nullable()
    .describe('Het tekening- of artikelnummer van de klant, precies zoals het er staat. Null als er geen nummer bij staat.'),
  omschrijving: z.string().nullable().describe('De omschrijving van het onderdeel, in de taal van de klant.'),
  qty: z.number().nullable().describe('Het gevraagde aantal stuks. Null als de klant geen aantal noemt.'),
  rev: z.string().nullable().describe('Revisie-aanduiding, bijvoorbeeld "B" of "01". Null als die er niet is.'),
  positie: z.number().nullable().describe('Regel- of positienummer op de order. Null als er geen posities zijn.'),
  bronBestand: z
    .string()
    .nullable()
    .describe('De exacte bestandsnaam van de bijlage waar je deze regel uit haalde, of null als hij uit de mailtekst zelf komt.'),
  bronTekst: z
    .string()
    .describe('Het stuk tekst uit de mail of bijlage waar deze regel op gebaseerd is, LETTERLIJK overgenomen, niet geparafraseerd.'),
  zekerheid: z.number().describe('Hoe zeker je van deze regel bent, 0 tot 1.'),
})

const AiResultSchema = z.object({
  intent: z
    .enum(['offerteaanvraag', 'opdrachtbevestiging', 'onbekend'])
    .describe('Vraagt de klant een prijs (offerteaanvraag) of plaatst hij een order (opdrachtbevestiging)?'),
  document: z
    .string()
    .nullable()
    .describe('De bestandsnaam van het handelsdocument (inkooporder, aanvraag, opdrachtbevestiging) waar de regels uit komen, of null als er geen was.'),
  regels: z.array(AiLineSchema).describe('De onderdelen die de klant wil, in de volgorde van de mail of order.'),
  opmerking: z.string().nullable().describe('Korte notitie in het Nederlands als er iets opvalt dat een mens moet weten.'),
})

export type AiResult = z.infer<typeof AiResultSchema>
export type AiLine = z.infer<typeof AiLineSchema>

const SYSTEM = `Je leest inkomende e-mail van klanten van een verspanend bedrijf (CNC-draaien en -frezen).
Klanten vragen offertes aan of plaatsen orders, meestal met een pdf (inkooporder of aanvraag) en tekeningen erbij.

Haal alleen de onderdelen eruit die de klant besteld of geoffreerd wil hebben.

RANGORDE — dit is het belangrijkste:
- Is er een handelsdocument (inkooporder, aanvraag, opdrachtbevestiging), dan bepaalt DAT de regels. Neem de regeltabel daaruit over, met de aantallen en posities die erin staan.
- Meegestuurde tekeningen en 3D-modellen zijn bijlagen BIJ die regels. Maak er nooit een aparte regel van, ook niet als de bestandsnaam een tekeningnummer bevat dat al in het document staat.
- Is er GEEN leesbaar handelsdocument, dan pas haal je de onderdelen uit de mailtekst en de bestandsnamen.

Wat GEEN regel is:
- het handelsdocument zelf (inkooporder, offerte, factuur, pakbon, algemene voorwaarden)
- ordernummers, klantnummers, btw-nummers, telefoonnummers, postcodes, bedragen en datums
- adresgegevens, handtekeningen en standaard e-mailvoetteksten

Belangrijk:
- Neem tekeningnummers TEKEN VOOR TEKEN over. Verzin geen cijfers en corrigeer niets: een nummer dat één cijfer verschilt is een ander onderdeel.
- Vul niets aan wat er niet staat. Geen aantal genoemd? Dan qty null.
- Elke regel krijgt een bronTekst die LETTERLIJK in het aangeleverde materiaal staat. Kopieer die tekst, parafraseer hem niet.
- Zet in bronBestand de exacte bestandsnaam van de bijlage waar de regel uit komt, of null als hij uit de mailtekst komt.
- Staat er geen enkel onderdeel in? Geef dan een lege lijst regels terug.`

// ── De invoer voor het model ──────────────────────────────────────────────────

/** Ruim voor een inkooporder, en ver onder de 32 MB die de API per verzoek aankan. */
const MAX_SCAN_BYTES = 8 * 1024 * 1024
/** Meer dan dit aan gescande bijlagen meesturen kost veel en levert zelden meer op. */
const MAX_SCANS = 3

export interface AttachmentBuffers {
  /** Bestandsnaam → inhoud. Alleen beschikbaar bij het binnenhalen, niet bij herberekenen. */
  get(filename: string): Buffer | undefined
}

/**
 * Welke bijlagen moet het model als afbeelding zien?
 *
 * Een gescande inkooporder heeft geen tekstlaag, dus `pdfText` levert niets op.
 * Precies het document dat de regels zou moeten bepalen is dan onzichtbaar —
 * waargenomen op echte mail van een klant (2026-09-08). Het model kan zo'n pdf
 * gewoon bekíjken, dus die sturen we mee als document-blok.
 *
 * Documenten eerst: als er maar plek is voor een paar, moet de inkooporder erbij
 * zitten en niet drie tekeningen.
 */
export function scansVoorModel(mail: NormalizedMail, buffers: AttachmentBuffers): MailAttachment[] {
  const zonderTekst = mail.attachments.filter(
    (a) => !a.isEmbeddedMessage && !a.tekst && a.sizeBytes <= MAX_SCAN_BYTES && looksLikePdf(buffers.get(a.filename) ?? Buffer.alloc(0))
  )
  const rang = (a: MailAttachment) => (classifyAttachment(a.filename) === 'document' ? 0 : 1)
  return zonderTekst.sort((a, b) => rang(a) - rang(b)).slice(0, MAX_SCANS)
}

function attachmentsBlock(mail: NormalizedMail, scans: Set<string>): string {
  const parts: string[] = []
  for (const a of mail.attachments) {
    if (a.isEmbeddedMessage) continue
    const soort = classifyAttachment(a.filename)
    parts.push(`--- BIJLAGE: ${a.filename} (${soort}, ${a.sizeBytes} bytes) ---`)
    if (a.tekst) parts.push(a.tekst)
    else if (scans.has(a.filename)) parts.push('(geen tekstlaag — deze pdf is hieronder als afbeelding meegestuurd)')
    else parts.push('(geen tekstlaag — een 3D-model of een bijlage die niet te lezen is)')
  }
  return parts.join('\n')
}

export function buildPrompt(mail: NormalizedMail, scans: Set<string> = new Set()): string {
  return [
    `ONDERWERP: ${mail.subject}`,
    `VAN: ${mail.from?.naam ?? ''} <${mail.from?.email ?? ''}>`,
    `ONTVANGEN: ${mail.receivedAt ?? 'onbekend'}`,
    '',
    '--- BERICHT ---',
    mail.bodyText,
    '',
    attachmentsBlock(mail, scans),
  ].join('\n')
}

// ── Gronding ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Alles waarin een bronTekst letterlijk terug te vinden moet zijn. */
export function haystack(mail: NormalizedMail): string {
  return normalize(
    [
      mail.subject,
      mail.bodyText,
      ...mail.attachments.map((a) => `${a.filename}\n${a.tekst ?? ''}`),
    ].join('\n')
  )
}

/**
 * Staat de aangehaalde tekst er echt?
 *
 * Letterlijk vergelijken is te streng: uit een pdf komt de tekst met andere
 * spaties en regelovergangen dan het model teruggeeft. Daarom eerst
 * genormaliseerd zoeken, en anders kijken of alle losse woorden voorkomen —
 * dat vangt een citaat dat uit twee pdf-kolommen is samengeraapt, maar niet
 * een tekeningnummer dat nergens staat.
 */
export function isGrounded(bronTekst: string, hay: string): boolean {
  const needle = normalize(bronTekst)
  if (!needle) return false
  if (hay.includes(needle)) return true
  const woorden = needle.split(' ').filter((w) => w.length >= 3)
  if (woorden.length === 0) return false
  return woorden.every((w) => hay.includes(w))
}

/**
 * De gronding van één regel — per regel, niet per mail.
 *
 * Een eerdere versie zette de controle voor de héle mail uit zodra er één
 * onleesbare bijlage bij zat. Daarmee kon een verzonnen regel uit de mailtekst
 * meeliften op het feit dat er toevallig een scan bij zat. De vraag is niet of
 * er ergens een scan is, maar of déze regel uit een scan komt.
 */
export function grondingVan(regel: AiLine, hay: string, scans: Set<string>): boolean | null {
  if (isGrounded(regel.bronTekst, hay)) return true
  if (regel.bronBestand && scans.has(regel.bronBestand)) return null // uit een scan: niets om in te zoeken
  return false
}

// ── De aanroep ────────────────────────────────────────────────────────────────

export function aiEnabled(): boolean {
  return Boolean(config.ai.apiKey) && config.ai.mailEnabled
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey ?? undefined })
  return client
}

/**
 * Een leesbare reden voor het reviewscherm.
 *
 * De SDK gooit de ruwe JSON van de API mee in `message`; dat is niets waard voor
 * iemand die een offerte zit na te kijken. Wat hij moet weten is of dit iets is
 * dat vanzelf overgaat of dat er een sleutel gezet moet worden.
 */
export function aiFoutTekst(err: unknown): string {
  const status = (err as { status?: number } | null)?.status
  if (status === 401 || status === 403) return 'geen geldige API-sleutel'
  if (status === 429) return 'de limiet van de API is bereikt'
  if (status === 400) return 'het model wees de aanvraag af (mail te groot?)'
  if (typeof status === 'number' && status >= 500) return 'de API is tijdelijk niet bereikbaar'
  return err instanceof Error ? err.message : String(err)
}

export interface AiExtractOutcome {
  regels: AiLine[]
  /** De regels uit de tweede lezing, of null als die niet is gedaan. */
  bevestiging: AiLine[] | null
  intent: AiResult['intent']
  document: string | null
  opmerking: string | null
  model: string
  /** De bijlagen die als afbeelding zijn meegestuurd omdat er geen tekstlaag in zat. */
  scans: string[]
}

/** Eén lezing van de mail. Gooit door bij een fout — de aanroeper vertelt het de gebruiker. */
async function leesEenmaal(
  mail: NormalizedMail,
  scans: { filename: string; inhoud: Buffer }[],
  scanNamen: Set<string>
): Promise<AiResult> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: buildPrompt(mail, scanNamen) },
  ]
  for (const scan of scans) {
    const buf = scan.inhoud
    content.push({ type: 'text', text: `--- AFBEELDING VAN BIJLAGE: ${scan.filename} ---` })
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
    })
  }

  const response = await getClient().messages.parse({
    model: config.ai.model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { effort: config.ai.effort, format: zodOutputFormat(AiResultSchema) },
  })
  const parsed = response.parsed_output
  if (!parsed) throw new Error('Het model gaf geen bruikbare structuur terug')
  return parsed
}

/**
 * De mail lezen, en de uitkomst laten bevestigen door een tweede lezing.
 *
 * Twee losse aanroepen op dezelfde invoer. Waar ze hetzelfde zeggen is dat het
 * sterkste signaal dat we hebben; waar ze uiteenlopen is dat precies de regel om
 * na te kijken. Dit verving het "twee motoren zijn het eens"-signaal dat wegviel
 * toen de patroonmotor eruit ging, en het is een sterker signaal: de tweede
 * lezing kijkt naar dezelfde tabel in plaats van naar een bestandsnaam.
 *
 * Het kost wel twee keer de invoer-tokens. Uit met MAIL_AI_CONTROLE=uit.
 */
export async function aiExtract(
  mail: NormalizedMail,
  buffers: AttachmentBuffers
): Promise<AiExtractOutcome> {
  const scans = scansVoorModel(mail, buffers)
  const scanNamen = new Set(scans.map((s) => s.filename))
  const metInhoud = scans.map((a) => ({ ...a, inhoud: buffers.get(a.filename)! }))

  const eerste = await leesEenmaal(mail, metInhoud, scanNamen)
  let bevestiging: AiResult | null = null
  if (config.ai.controle) {
    // Faalt de controlelezing, dan telt dat als "niet gecontroleerd" en niet als
    // een mislukte import: de eerste lezing is er nog.
    bevestiging = await leesEenmaal(mail, metInhoud, scanNamen).catch(() => null)
  }

  return {
    regels: eerste.regels,
    bevestiging: bevestiging?.regels ?? null,
    intent: eerste.intent,
    document: eerste.document,
    opmerking: eerste.opmerking,
    model: config.ai.model,
    scans: [...scanNamen],
  }
}

// ── Van modelregels naar kandidaten ───────────────────────────────────────────

/** Twee aanduidingen van hetzelfde onderdeel op één noemer brengen. */
export function dedupeKeyOf(tekening: string | null, ruweTekst: string): string {
  return (tekening ?? ruweTekst).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface BuildResult {
  lines: CandidateLine[]
  /** Zelfgerapporteerde zekerheid per regel-id, voor certainty.ts. */
  modelZekerheid: Map<string, number>
}

/**
 * Staat het tekeningnummer zélf letterlijk in de bron?
 *
 * De scherpste van de drie controles. Vergelijken op alleen letters en cijfers,
 * want punt, streep en underscore verschillen per systeem — maar geen enkel
 * cijfer mag verschillen. Precies dáár zit de dure fout: 2615-0090-0530 en
 * 2615-0091-0530 bestaan allebei.
 */
export function tekeningStaatErIn(tekening: string | null, hay: string): boolean {
  if (!tekening) return false
  const naakt = tekening.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (naakt.length < 4) return false
  return hay.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(naakt)
}

/** Is deze regel ook door de tweede lezing gevonden, met hetzelfde aantal? */
export function bevestigdDoor(regel: AiLine, tweede: AiLine[] | null): boolean | null {
  if (tweede === null) return null
  const key = dedupeKeyOf(regel.tekening, regel.bronTekst)
  const match = tweede.find((t) => dedupeKeyOf(t.tekening, t.bronTekst) === key)
  if (!match) return false
  return match.qty === regel.qty
}

/**
 * De regels van het model omzetten naar kandidaten, met de drie controles erop.
 *
 * Er wordt niets weggegooid op grond van een controle — een regel die zakt komt
 * gewoon met een lage zekerheid in het reviewscherm, en een mens beslist. Wél
 * weggelaten wordt een regel die een tekéning beschrijft terwijl er een leidend
 * document is: dat is geen tweede bestelling maar een bijlage bij een regel.
 */
export function buildLines(
  ai: AiLine[],
  mail: NormalizedMail,
  opts: { scans?: Set<string>; document?: string | null; bevestiging?: AiLine[] | null } = {}
): BuildResult {
  const scans = opts.scans ?? new Set<string>()
  const hay = haystack(mail)
  const document = opts.document ?? leidendDocument(mail.attachments)?.filename ?? null
  const byKey = new Map<string, CandidateLine>()
  const modelZekerheid = new Map<string, number>()
  let seq = 0

  for (const r of ai) {
    const ruweTekst = r.bronTekst.trim() || [r.tekening, r.omschrijving].filter(Boolean).join(' ')
    const key = dedupeKeyOf(r.tekening, ruweTekst)
    if (!key || byKey.has(key)) continue
    if (document && komtVanTekening(r, document)) continue

    const uitScan = Boolean(r.bronBestand && scans.has(r.bronBestand))
    const id = `ai-${++seq}`
    byKey.set(key, {
      id,
      ruweTekst,
      tekening: r.tekening,
      rev: r.rev,
      positie: r.positie,
      qty: r.qty,
      bron: (r.bronBestand ? 'pdf' : 'body') as CandidateSource,
      attachmentFilename: r.bronBestand,
      bestanden: [],
      matches: [],
      status: 'nieuw',
      artikelId: null,
      handmatig: false,
      extractor: 'ai',
      bronTekst: r.bronTekst,
      gegrond: grondingVan(r, hay, scans),
      // Uit een scan valt niets terug te zoeken: onbekend, niet fout.
      tekeningGegrond: tekeningStaatErIn(r.tekening, hay) ? true : uitScan ? null : false,
      bevestigd: bevestigdDoor(r, opts.bevestiging ?? null),
      bronBestand: r.bronBestand,
      zekerheid: 0,
      zekerheidRedenen: [],
    })
    modelZekerheid.set(id, r.zekerheid)
  }

  const lines = [...byKey.values()]
  hangBestandenAan(lines, mail.attachments)
  lines.sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
  return { lines, modelZekerheid }
}

/** Een regel die uit een tekeningbestand komt in plaats van uit het document. */
function komtVanTekening(regel: AiLine, document: string): boolean {
  if (!regel.bronBestand || regel.bronBestand === document) return false
  return classifyAttachment(regel.bronBestand) === 'tekening' || hoortBij(regel.bronBestand, regel.tekening)
}
