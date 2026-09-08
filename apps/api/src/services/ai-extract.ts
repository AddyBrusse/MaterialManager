import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { CandidateLine, CandidateSource, MailAttachment, NormalizedMail } from '@stockmanager/shared'
import { config } from '../config'
import { dedupeKeyOf, hangBestandenAan } from './extract-lines'
import { classifyAttachment, hoortBij } from './attachment-kind'
import { looksLikePdf } from './pdf-text'

/**
 * De mail door een taalmodel laten lezen — features/60-mail-import.md §6.
 *
 * Waarom: de vaste patronen in extract-lines.ts werken alleen op de vormen die
 * we hebben gezien. Elke klant maakt zijn pdf anders, en een mail met "graag
 * 10x de signaalplaat en 4x tekening 2615-0091-0530" heeft helemaal geen vorm.
 * Het model leest gewoon wat er staat.
 *
 * Wat het model *niet* doet: kiezen welk artikel uit onze database erbij hoort.
 * Dat blijft match-articles.ts. 2615-0090-0530 en 2615-0091-0530 bestaan allebei
 * en schelen één cijfer; die keuze hoort in code die we kunnen testen, niet in
 * een model dat aannemelijk gokt.
 *
 * Tegen verzinsels: elke regel moet een `bronTekst` meebrengen die letterlijk in
 * de mail of de bijlage staat. Kan het model dat niet, dan blijft de regel wel
 * staan (misschien klopt hij) maar met een duidelijk lagere zekerheid en een
 * waarschuwing in het reviewscherm.
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
  intent: AiResult['intent']
  document: string | null
  opmerking: string | null
  model: string
  /** De bijlagen die als afbeelding zijn meegestuurd omdat er geen tekstlaag in zat. */
  scans: string[]
}

/** Roept het model aan. Gooit door bij een fout — de aanroeper valt terug op de regelmotor. */
export async function aiExtract(
  mail: NormalizedMail,
  buffers: AttachmentBuffers
): Promise<AiExtractOutcome> {
  const model = config.ai.model
  const scans = scansVoorModel(mail, buffers)
  const scanNamen = new Set(scans.map((s) => s.filename))

  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: buildPrompt(mail, scanNamen) },
  ]
  for (const scan of scans) {
    const buf = buffers.get(scan.filename)
    if (!buf) continue
    content.push({ type: 'text', text: `--- AFBEELDING VAN BIJLAGE: ${scan.filename} ---` })
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
    })
  }

  const response = await getClient().messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(AiResultSchema) },
  })
  const parsed = response.parsed_output
  if (!parsed) throw new Error('Het model gaf geen bruikbare structuur terug')
  return {
    regels: parsed.regels,
    intent: parsed.intent,
    document: parsed.document,
    opmerking: parsed.opmerking,
    model,
    scans: [...scanNamen],
  }
}

// ── Samenvoegen met de regelmotor ─────────────────────────────────────────────

export interface MergeResult {
  lines: CandidateLine[]
  /** Zelfgerapporteerde zekerheid per regel-id, voor certainty.ts. */
  modelZekerheid: Map<string, number>
}

/**
 * De twee motoren naast elkaar leggen.
 *
 * Regels die allebei vonden zijn het sterkst — daar zijn twee onafhankelijke
 * methodes het over eens. Buiten het handelsdocument blijft de regelmotor
 * leidend voor wat hij al wist: dat komt uit code die we getest hebben.
 *
 * Bínnen het document is het andersom, en dat is een correctie op de eerste
 * versie. De regelmotor leest een pdf als losse regels tekst; het model ziet de
 * kolommen. Op een echte offerteaanvraag stond `As ø50x178 4 4-9-2026pcs` — de
 * leverdatum plakte tegen de eenheid — en las het patroon 2026 stuks. Waar het
 * model de ordertabel zelf heeft gelezen, wint dus het model voor aantal en
 * positie.
 *
 * De rangorde uit §3.4 geldt hier net zo goed: is er een leidend document, dan
 * mag een AI-regel die alleen een tekeningbestand beschrijft geen nieuwe regel
 * worden. Zonder die grens levert een order met tekeningen erbij nog steeds
 * dubbele regels op, ook al leest het model het document goed.
 */
export function mergeLines(
  deterministisch: CandidateLine[],
  ai: AiLine[],
  hay: string,
  opts: { scans?: Set<string>; document?: string | null; attachments?: MailAttachment[] } = {}
): MergeResult {
  const scans = opts.scans ?? new Set<string>()
  const byKey = new Map<string, CandidateLine>()
  const modelZekerheid = new Map<string, number>()
  for (const l of deterministisch) byKey.set(dedupeKeyOf(l.tekening, l.ruweTekst), { ...l })

  let seq = deterministisch.length
  for (const r of ai) {
    const ruweTekst = r.bronTekst.trim() || [r.tekening, r.omschrijving].filter(Boolean).join(' ')
    const key = dedupeKeyOf(r.tekening, ruweTekst)
    if (!key) continue

    const gegrond = grondingVan(r, hay, scans)
    const bestaand = byKey.get(key)
    if (bestaand) {
      bestaand.extractor = 'beide'
      bestaand.bronTekst = r.bronTekst
      bestaand.gegrond = gegrond
      bestaand.bronBestand = r.bronBestand ?? bestaand.bronBestand
      // Uit de ordertabel wint het model, elders wint het geteste patroon.
      const uitTabel = opts.document != null && r.bronBestand === opts.document
      const neem = (oud: number | null, nieuw: number | null) =>
        nieuw !== null && (oud === null || uitTabel) ? nieuw : oud
      bestaand.qty = neem(bestaand.qty, r.qty)
      bestaand.positie = neem(bestaand.positie, r.positie)
      if (bestaand.rev === null && r.rev !== null) bestaand.rev = r.rev
      modelZekerheid.set(bestaand.id, r.zekerheid)
      continue
    }

    // Het document is leidend: een losse tekening mag er geen regel bij maken.
    if (opts.document && komtVanTekening(r, opts.document)) continue

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
      gegrond,
      bronBestand: r.bronBestand,
      zekerheid: 0,
      zekerheidRedenen: [],
    })
    modelZekerheid.set(id, r.zekerheid)
  }

  const lines = [...byKey.values()]
  if (opts.attachments) hangBestandenAan(lines, opts.attachments)
  lines.sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
  return { lines, modelZekerheid }
}

/** Een AI-regel die uit een tekeningbestand komt in plaats van uit het document. */
function komtVanTekening(regel: AiLine, document: string): boolean {
  if (!regel.bronBestand || regel.bronBestand === document) return false
  return classifyAttachment(regel.bronBestand) === 'tekening' || hoortBij(regel.bronBestand, regel.tekening)
}
