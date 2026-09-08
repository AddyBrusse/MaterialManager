import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { CandidateLine, CandidateSource, NormalizedMail } from '@stockmanager/shared'
import { config } from '../config'
import { dedupeKeyOf } from './extract-lines'

/**
 * De mail door een taalmodel laten lezen — features/60-mail-import.md §6.
 *
 * Waarom: de vaste patronen in extract-lines.ts werken alleen op de vormen die
 * we hebben gezien. Elke klant maakt zijn pdf's anders, en een mail met "graag
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
  bronTekst: z
    .string()
    .describe('Het stuk tekst uit de mail of bijlage waar deze regel op gebaseerd is, LETTERLIJK overgenomen, niet geparafraseerd.'),
  zekerheid: z.number().describe('Hoe zeker je van deze regel bent, 0 tot 1.'),
})

const AiResultSchema = z.object({
  intent: z
    .enum(['offerteaanvraag', 'opdrachtbevestiging', 'onbekend'])
    .describe('Vraagt de klant een prijs (offerteaanvraag) of plaatst hij een order (opdrachtbevestiging)?'),
  regels: z.array(AiLineSchema).describe('De onderdelen die de klant wil, in de volgorde van de mail of order.'),
  opmerking: z.string().nullable().describe('Korte notitie in het Nederlands als er iets opvalt dat een mens moet weten.'),
})

export type AiResult = z.infer<typeof AiResultSchema>

const SYSTEM = `Je leest inkomende e-mail van klanten van een verspanend bedrijf (CNC-draaien en -frezen).
Klanten vragen offertes aan of plaatsen orders, meestal met een pdf (inkooporder of aanvraag) en tekeningen erbij.

Haal alleen de onderdelen eruit die de klant besteld of geoffreerd wil hebben.

Wat GEEN regel is:
- het handelsdocument zelf (inkooporder, offerte, factuur, pakbon, algemene voorwaarden)
- ordernummers, klantnummers, btw-nummers, telefoonnummers, postcodes, bedragen en datums
- adresgegevens, handtekeningen en standaard e-mailvoetteksten

Belangrijk:
- Neem tekeningnummers TEKEN VOOR TEKEN over. Verzin geen cijfers en corrigeer niets: een nummer dat één cijfer verschilt is een ander onderdeel.
- Vul niets aan wat er niet staat. Geen aantal genoemd? Dan qty null.
- Elke regel krijgt een bronTekst die LETTERLIJK in het aangeleverde materiaal staat. Kopieer die tekst, parafraseer hem niet.
- Staat er geen enkel onderdeel in? Geef dan een lege lijst regels terug.`

function attachmentsBlock(mail: NormalizedMail): string {
  const parts: string[] = []
  for (const a of mail.attachments) {
    if (a.isEmbeddedMessage) continue
    parts.push(`--- BIJLAGE: ${a.filename} (${a.sizeBytes} bytes) ---`)
    if (a.tekst) parts.push(a.tekst)
    else parts.push('(geen tekstlaag — mogelijk een scan of een 3D-model)')
  }
  return parts.join('\n')
}

export function buildPrompt(mail: NormalizedMail): string {
  return [
    `ONDERWERP: ${mail.subject}`,
    `VAN: ${mail.from?.naam ?? ''} <${mail.from?.email ?? ''}>`,
    `ONTVANGEN: ${mail.receivedAt ?? 'onbekend'}`,
    '',
    '--- BERICHT ---',
    mail.bodyText,
    '',
    attachmentsBlock(mail),
  ].join('\n')
}

/** Alles waar een bronTekst in mag staan, plat en genormaliseerd. */
export function haystack(mail: NormalizedMail): string {
  return normalize(
    [
      mail.subject,
      mail.bodyText,
      ...mail.attachments.map((a) => `${a.filename}\n${a.tekst ?? ''}`),
    ].join('\n')
  )
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
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

/** Heeft deze mail bijlagen die het model alleen als plaatje kan lezen? */
export function hasUnreadableAttachment(mail: NormalizedMail): boolean {
  return mail.attachments.some((a) => !a.isEmbeddedMessage && !a.tekst)
}

export interface AiExtractOutcome {
  regels: AiLine[]
  intent: AiResult['intent']
  opmerking: string | null
  model: string
}

export type AiLine = z.infer<typeof AiLineSchema>

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

/** Roept het model aan. Gooit door bij een fout — de aanroeper valt terug op de regelmotor. */
export async function aiExtract(mail: NormalizedMail): Promise<AiExtractOutcome> {
  const model = config.ai.model
  const response = await getClient().messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(mail) }],
    output_config: { format: zodOutputFormat(AiResultSchema) },
  })
  const parsed = response.parsed_output
  if (!parsed) throw new Error('Het model gaf geen bruikbare structuur terug')
  return { regels: parsed.regels, intent: parsed.intent, opmerking: parsed.opmerking, model }
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
 * methodes het over eens. De regelmotor blijft leidend voor de velden die hij
 * al wist: die komen uit code die we getest hebben. De AI vult aan wat leeg was
 * (vooral aantallen uit lopende tekst) en voegt regels toe die geen bijlage
 * hadden.
 */
export function mergeLines(
  deterministisch: CandidateLine[],
  ai: AiLine[],
  hay: string,
  opts: { grondingOncontroleerbaar?: boolean } = {}
): MergeResult {
  const byKey = new Map<string, CandidateLine>()
  const modelZekerheid = new Map<string, number>()
  for (const l of deterministisch) byKey.set(dedupeKeyOf(l.tekening, l.ruweTekst), { ...l })

  let seq = deterministisch.length
  for (const r of ai) {
    const ruweTekst = r.bronTekst.trim() || [r.tekening, r.omschrijving].filter(Boolean).join(' ')
    const key = dedupeKeyOf(r.tekening, ruweTekst)
    if (!key) continue

    const gegrond = isGrounded(r.bronTekst, hay)
      ? true
      : opts.grondingOncontroleerbaar
        ? null
        : false

    const bestaand = byKey.get(key)
    if (bestaand) {
      bestaand.extractor = 'beide'
      bestaand.bronTekst = r.bronTekst
      bestaand.gegrond = gegrond
      if (bestaand.qty === null && r.qty !== null) bestaand.qty = r.qty
      if (bestaand.rev === null && r.rev !== null) bestaand.rev = r.rev
      if (bestaand.positie === null && r.positie !== null) bestaand.positie = r.positie
      modelZekerheid.set(bestaand.id, r.zekerheid)
      continue
    }

    const id = `ai-${++seq}`
    byKey.set(key, {
      id,
      ruweTekst,
      tekening: r.tekening,
      rev: r.rev,
      positie: r.positie,
      qty: r.qty,
      bron: 'body' as CandidateSource,
      attachmentFilename: null,
      matches: [],
      status: 'nieuw',
      artikelId: null,
      handmatig: false,
      extractor: 'ai',
      bronTekst: r.bronTekst,
      gegrond,
      zekerheid: 0,
      zekerheidRedenen: [],
    })
    modelZekerheid.set(id, r.zekerheid)
  }

  const lines = [...byKey.values()].sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
  return { lines, modelZekerheid }
}
