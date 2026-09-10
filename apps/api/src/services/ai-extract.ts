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
    .describe(
      'ALLEEN het tekeningnummer, precies zoals het er staat en verder niets: geen omschrijving, ' +
        'geen revisie, geen positienummer, geen aantal. Bijvoorbeeld "2615-0090-0530". ' +
        'Staat er geen tekeningnummer, dan null — vul hier nooit een omschrijving in.',
    ),
  omschrijving: z
    .string()
    .nullable()
    .describe(
      'ALLEEN wat het onderdeel IS, in de woorden van de klant: de benaming, vorm of het materiaal. ' +
        'Bijvoorbeeld "Steunbeugel RVS 304" of "Flens 80mm". Geen samenvatting van de regel. ' +
        'Neem hier NOOIT het tekeningnummer, de revisie, het positienummer, het aantal, de prijs of ' +
        'de leverdatum in op — die velden bestaan apart. Noemt de klant geen benaming, dan null.',
    ),
  klantArtikel: z
    .string()
    .nullable()
    .describe('Het artikelnummer van de klant zelf, als hij dat apart vermeldt (bijvoorbeeld bij "Uw artikelnummer"). Null als het er niet staat.'),
  materiaal: z
    .string()
    .nullable()
    .describe(
      'Het ruwe materiaal waar wij mee moeten werken, met vorm en maat als die erbij staan: ' +
        '"RVS-316L rondstaf 30", "S355 vierkant staf 40". Noemt de klant expliciet wat hij aanlevert ' +
        '("Materiaal wordt toegeleverd: Plaat 130x12"), neem dan dat over en niet de omschrijving van het ' +
        'eindproduct. Null als de klant geen materiaal noemt.',
    ),
  materiaalDoorKlant: z
    .boolean()
    .nullable()
    .describe(
      'Wie levert het materiaal? true bij "toegeleverd materiaal" of "materiaal wordt aangeleverd" ' +
        '(de klant brengt het), false bij "uit uw materiaal" of "materiaal door u" (wij kopen het in). ' +
        'Null als de klant er niets over zegt — raad dit niet.',
    ),
  certificaat: z
    .string()
    .nullable()
    .describe(
      'Gevraagd materiaalcertificaat, bijvoorbeeld "3.1" bij "Inclusief 3.1". Null als er geen ' +
        'certificaat gevraagd wordt.',
    ),
  prijs: z
    .number()
    .nullable()
    .describe('De stuksprijs die de klant noemt, in de valuta van het document. Alleen als die er echt staat; bij een offerteaanvraag meestal niet.'),
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
  klantRef: z
    .string()
    .nullable()
    .describe('Het order- of aanvraagnummer van de klant zelf, bijvoorbeeld "RFQ2600241" of "PUR2604307". Null als het er niet staat.'),
  leverdatum: z
    .string()
    .nullable()
    .describe('De gevraagde leverdatum als JJJJ-MM-DD. Staat er alleen een week of niets, geef dan null.'),
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
- Gaat een pdf als volledig document mee, lees hem dan DAAR en kijk naar de tabel zoals hij op de pagina staat: welk getal onder welke kolomkop hoort. De uitgeklopte tekst van diezelfde pdf is niet te vertrouwen — daarin plakken kolommen aan elkaar ("EUR 34,4925-06-2026 15" is prijs 34,49, leverdatum 25-06-2026 en aantal 15) en kan de kolomkop onder de regels staan.
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
- Staat er geen enkel onderdeel in? Geef dan een lege lijst regels terug.
- Neem ook het ordernummer van de klant en de gevraagde leverdatum over als die in het document staan. Verzin ze niet.
- Staat er een stuksprijs bij een regel, neem die dan over. Bedragen zijn per stuk, niet het regeltotaal; staat er alleen een totaal, deel dat dan niet zelf — geef dan null.
- Het artikelnummer van de klant is iets anders dan het tekeningnummer. Staan ze allebei, geef ze allebei.

Houd de velden strikt uit elkaar. Dit is waar het het vaakst misgaat:
- tekening = alléén het nummer. Niet de omschrijving erbij, niet de revisie eraan geplakt.
- omschrijving = alléén wat het onderdeel IS. Geen samenvatting van de hele regel.
- Elk gegeven staat in precies één veld. Herhaal het tekeningnummer dus niet in de omschrijving,
  en zet het aantal, de prijs, de positie of de leverdatum nergens anders dan in hun eigen veld.

Een ordertabel met "Pos. 10 | 2615-0090-0530 rev B | Steunbeugel RVS 304 | 25 st | € 12,50" wordt:
  positie 10, tekening "2615-0090-0530", rev "B", omschrijving "Steunbeugel RVS 304", qty 25, prijs 12.50
En dus NIET: omschrijving "Pos. 10 2615-0090-0530 rev B Steunbeugel RVS 304 25 st".
Staat er geen aparte benaming naast het nummer, dan is omschrijving null — niet het nummer nog een keer.

Materiaal en certificaat horen ook in hun eigen veld, niet in de omschrijving:
- materiaal = het RUWE MATERIAAL waar wij mee moeten werken, met vorm en maat: "RVS-316L rondstaf 30".
  Zegt de klant expliciet wát hij aanlevert ("Materiaal wordt toegeleverd: ...", "uit RVS-316L"),
  dan is DAT het materiaal — ook als er elders in dezelfde regel staat waar het eindproduct van gemaakt is.
  "Stalen flens 120x120x12, volgens tekening ... Materiaal wordt toegeleverd: Plaat 130x12"
  wordt dus materiaal "Plaat 130x12", niet "Stalen flens 120x120x12": dat laatste beschrijft het onderdeel.
- materiaalDoorKlant = wie het levert. "Toegeleverd materiaal" betekent dat de klant het aanlevert (true).
  "Uit uw materiaal" betekent dat wij het inkopen (false). Zegt de klant er niets over, dan null.
- certificaat = bijvoorbeeld "3.1" als er om een materiaalcertificaat gevraagd wordt.

"2x  Toegeleverd materiaal RVS-316L rondstaf 30" wordt dus:
  qty 2, materiaal "RVS-316L rondstaf 30", materiaalDoorKlant true, omschrijving null.
En "1x  Uit uw materiaal RVS-316L Inclusief 3.1" wordt:
  qty 1, materiaal "RVS-316L", materiaalDoorKlant false, certificaat "3.1", omschrijving null.`

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
 * Eén bijlage zoals het model hem krijgt.
 *
 * `zonderTekst` en "gaat native mee" zijn sinds 2026-09-09 níet meer hetzelfde.
 * Het eerste bepaalt of de gronding iets terug kan zoeken, het tweede of de pdf
 * als document-blok meegaat. Een inkooporder mét tekstlaag gaat wél native mee
 * en is wél terugzoekbaar.
 */
export interface ModelBijlage {
  bijlage: MailAttachment
  /** Geen tekstlaag: er valt niets in terug te zoeken, dus de gronding weet het niet. */
  zonderTekst: boolean
}

function isPdf(a: MailAttachment, buffers: AttachmentBuffers): boolean {
  return (
    !a.isEmbeddedMessage &&
    a.sizeBytes <= MAX_SCAN_BYTES &&
    looksLikePdf(buffers.get(a.filename) ?? Buffer.alloc(0))
  )
}

/**
 * Welke pdf's stuurt het model als document-blok mee?
 *
 * Twee redenen, en die zijn los van elkaar ontstaan:
 *
 * 1. **Geen tekstlaag.** Een gescande inkooporder levert niets op via `pdfText`;
 *    precies het document dat de regels bepaalt is dan onzichtbaar. Waargenomen
 *    op echte klantmail (2026-09-08).
 *
 * 2. **Het is het handelsdocument.** Ook mét tekstlaag. `pdfText` levert de
 *    woorden op maar gooit de tabel weg, en juist de tabel is de betekenis. Op
 *    de bestelling van Veratio (2690655) komt er letterlijk `€34,4925-06-2026 15`
 *    uit — prijs, leverdatum en aantal aan elkaar geplakt, en de kolomkoppen
 *    staan ónder de regels. Zo ontstond destijds ook de `4-9-2026pcs`-bug. Het
 *    model kan de pdf gewoon bekijken; dan blijft de tabel een tabel.
 *
 * Tekeningen gaan hier NIET in mee zolang er een handelsdocument is (§3.1b
 * trap 1 en 2). Dat document bepaalt de regels, dus een tekening voegt niets toe
 * aan het lezen — en er passen er maar een paar in. Op de Veratio-bestelling zou
 * het model twee van de acht tekeningen te zien krijgen, wat erger is dan geen:
 * die twee lijken dan bijzonder. Het koppelen van tekeningen aan regels gaat op
 * naam (attachment-kind.ts); pas als een regel daarmee géén bestand krijgt, is
 * er reden om een tekening alsnog mee te sturen — dat is trap 3, nog niet
 * gebouwd.
 *
 * Zonder handelsdocument geldt de oude regel: dan is een pdf zonder tekstlaag
 * het enige wat er nog te lezen valt.
 */
export function documentenVoorModel(
  mail: NormalizedMail,
  buffers: AttachmentBuffers
): ModelBijlage[] {
  const document = leidendDocument(mail.attachments)?.filename ?? null

  // Met MAIL_AI_DOCUMENT=tekst valt alles terug op de oude regel: alleen een pdf
  // zónder tekstlaag gaat mee. Zo is na te meten wat het native meesturen doet.
  const leidendeMag = config.ai.documentNative

  const kandidaten = mail.attachments
    .filter((a) => isPdf(a, buffers))
    // Mét document: alleen het document en wat er verder als document telt (een
    // order van twee losse pdf's). Zonder document: alles zonder tekstlaag.
    .filter((a) =>
      document
        ? a.filename === document || classifyAttachment(a.filename) === 'document'
        : !a.tekst
    )
    // Een leesbare tweede documentpagina gaat al als tekst mee; die hoeft niet
    // ook nog eens native.
    .filter((a) => !a.tekst || (leidendeMag && a.filename === document))

  const rang = (a: MailAttachment) => (a.filename === document ? 0 : 1)
  return kandidaten
    .sort((a, b) => rang(a) - rang(b))
    .slice(0, MAX_SCANS)
    .map((bijlage) => ({ bijlage, zonderTekst: !bijlage.tekst }))
}

function attachmentsBlock(mail: NormalizedMail, native: Set<string>): string {
  const parts: string[] = []
  for (const a of mail.attachments) {
    if (a.isEmbeddedMessage) continue
    const soort = classifyAttachment(a.filename)
    parts.push(`--- BIJLAGE: ${a.filename} (${soort}, ${a.sizeBytes} bytes) ---`)
    if (native.has(a.filename)) {
      // De uitgeklopte tekst hier óók nog neerzetten is schadelijk: dan ziet het
      // model naast de pdf ook de versie waar de kolommen uit gevallen zijn, en
      // die is korter en makkelijker te lezen. Precies de verkeerde bron.
      parts.push('(deze pdf is hieronder volledig meegestuurd — lees hem daar, niet hier)')
    } else if (a.tekst) {
      parts.push(a.tekst)
    } else {
      parts.push('(geen tekstlaag — een 3D-model of een bijlage die niet te lezen is)')
    }
  }
  return parts.join('\n')
}

export function buildPrompt(mail: NormalizedMail, native: Set<string> = new Set()): string {
  return [
    `ONDERWERP: ${mail.subject}`,
    `VAN: ${mail.from?.naam ?? ''} <${mail.from?.email ?? ''}>`,
    `ONTVANGEN: ${mail.receivedAt ?? 'onbekend'}`,
    '',
    '--- BERICHT ---',
    mail.bodyText,
    '',
    attachmentsBlock(mail, native),
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
export function getClient(): Anthropic {
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
  /** Het ordernummer van de klant en de gevraagde leverdatum, als die er staan. */
  klantRef: string | null
  leverdatum: string | null
  intent: AiResult['intent']
  document: string | null
  opmerking: string | null
  model: string
  /**
   * Bijlagen zonder tekstlaag. Hier valt niets in terug te zoeken, dus een regel
   * die hieruit komt krijgt "gronding onbekend" in plaats van "niet gegrond".
   */
  scans: string[]
  /** Bijlagen die als volledige pdf zijn meegestuurd, met of zonder tekstlaag. */
  nativeBlokken: string[]
}

/** Eén lezing van de mail. Gooit door bij een fout — de aanroeper vertelt het de gebruiker. */
async function leesEenmaal(
  mail: NormalizedMail,
  native: { filename: string; inhoud: Buffer }[],
  nativeNamen: Set<string>
): Promise<AiResult> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: buildPrompt(mail, nativeNamen) },
  ]
  for (const doc of native) {
    content.push({ type: 'text', text: `--- VOLLEDIGE PDF VAN BIJLAGE: ${doc.filename} ---` })
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: doc.inhoud.toString('base64') },
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
  const native = documentenVoorModel(mail, buffers)
  const nativeNamen = new Set(native.map((d) => d.bijlage.filename))
  const zonderTekst = native.filter((d) => d.zonderTekst).map((d) => d.bijlage.filename)
  const metInhoud = native.map((d) => ({
    filename: d.bijlage.filename,
    inhoud: buffers.get(d.bijlage.filename)!,
  }))

  const eerste = await leesEenmaal(mail, metInhoud, nativeNamen)
  let bevestiging: AiResult | null = null
  if (config.ai.controle) {
    // Faalt de controlelezing, dan telt dat als "niet gecontroleerd" en niet als
    // een mislukte import: de eerste lezing is er nog.
    bevestiging = await leesEenmaal(mail, metInhoud, nativeNamen).catch(() => null)
  }

  return {
    regels: eerste.regels,
    bevestiging: bevestiging?.regels ?? null,
    intent: eerste.intent,
    document: eerste.document,
    klantRef: eerste.klantRef,
    leverdatum: eerste.leverdatum,
    opmerking: eerste.opmerking,
    model: config.ai.model,
    scans: zonderTekst,
    nativeBlokken: [...nativeNamen],
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
 * De omschrijving ontdoen van wat al in een eigen veld staat.
 *
 * Het model krijgt te horen dat een omschrijving géén samenvatting van de regel
 * is, maar een prompt is een verzoek en geen garantie. Zonder deze controle
 * belandt "Pos. 10 2615-0090-0530 rev B Steunbeugel" in de omschrijving, en dan
 * staat het tekeningnummer op twee plekken — of alleen daar, waardoor het
 * koppelen van tekeningbestanden (dat op het nummer matcht) niets meer vindt.
 *
 * Er wordt alleen weggehaald wat aantoonbaar dubbel is: het tekeningnummer en de
 * revisie. Wat er daarna overblijft is de benaming; blijft er niets zinnigs
 * over, dan is de omschrijving leeg — dat is eerlijker dan het nummer nog eens.
 */
export function schoonOmschrijving(
  omschrijving: string | null,
  tekening: string | null,
  rev: string | null,
): string | null {
  if (!omschrijving) return null
  let uit = omschrijving
  if (tekening) {
    // Ook varianten met andere scheidingstekens: 2615.0090.0530 naast 2615-0090-0530.
    const patroon = tekening
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((deel) => deel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^A-Za-z0-9]*')
    if (patroon) uit = uit.replace(new RegExp(patroon, 'gi'), ' ')
  }
  if (rev) uit = uit.replace(new RegExp(`\\brev\\.?\\s*${rev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
  uit = uit
    // "Pos. 10" gaat als geheel weg; alleen het woord weghalen laat de 10 staan.
    .replace(/\b(pos\.?|positie|item|regel)\s*\d+\b/gi, ' ')
    .replace(/\b(pos\.?|positie|rev\.?|revisie)\b/gi, ' ')
    .replace(/[\s.,;:_\-|]+/g, ' ')
    .trim()
  // Alleen nog cijfers en losse leestekens over? Dan stond er geen benaming.
  return /[A-Za-z]{2,}/.test(uit) ? uit : null
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
  opts: {
    scans?: Set<string>
    document?: string | null
    bevestiging?: AiLine[] | null
    /** Bestandsnaam → nummer uit het titelblok, als dat gelezen is (§3.2). */
    titelblokken?: ReadonlyMap<string, string>
  } = {}
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
      klantArtikel: r.klantArtikel,
      klantPrijs: r.prijs,
      omschrijving: schoonOmschrijving(r.omschrijving, r.tekening, r.rev),
      materiaal: r.materiaal,
      materiaalDoorKlant: r.materiaalDoorKlant,
      certificaat: r.certificaat,
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
  hangBestandenAan(lines, mail.attachments, document, opts.titelblokken)
  lines.sort((a, b) => (a.positie ?? 9999) - (b.positie ?? 9999))
  return { lines, modelZekerheid }
}

/** Een regel die uit een tekeningbestand komt in plaats van uit het document. */
function komtVanTekening(regel: AiLine, document: string): boolean {
  if (!regel.bronBestand || regel.bronBestand === document) return false
  return classifyAttachment(regel.bronBestand) === 'tekening' || hoortBij(regel.bronBestand, regel.tekening)
}
