import { z } from 'zod'

// ── Bron, intent, status ──────────────────────────────────────────────────────

/** Waar de mail vandaan kwam. Fase 1 gebruikt 'drop', fase 2 'graph'. */
export const MAIL_SOURCES = ['drop', 'graph', 'plak'] as const
export type MailSource = typeof MAIL_SOURCES[number]

export const MAIL_INTENTS = ['offerteaanvraag', 'opdrachtbevestiging', 'onbekend'] as const
export type MailIntent = typeof MAIL_INTENTS[number]

export const MAIL_IMPORT_STATUSES = ['nieuw', 'verwerkt', 'genegeerd', 'fout'] as const
export type MailImportStatus = typeof MAIL_IMPORT_STATUSES[number]

// ── Genormaliseerde mail ──────────────────────────────────────────────────────
// Elke bron (gesleept .msg, Graph, plaktekst) wordt naar deze vorm gebracht.
// Alles hierna in de pipeline kent alleen deze vorm en niet zijn herkomst.

export const MailAddressSchema = z.object({
  naam: z.string().nullable(),
  email: z.string().nullable(),
})
export type MailAddress = z.infer<typeof MailAddressSchema>

export const MailAttachmentSchema = z.object({
  filename: z.string(),
  sizeBytes: z.number().int(),
  /** Pad onder uploadsDir zodra opgeslagen; null zolang het bestand nog in geheugen zit. */
  path: z.string().nullable(),
  /** Een .msg-bijlage die zelf een bericht is (doorgestuurd als bijlage). */
  isEmbeddedMessage: z.boolean(),
  /**
   * Uitgelezen tekst van een PDF, ingekort voor weergave. Null als het geen
   * PDF is of als er geen tekstlaag in zit (een scan).
   */
  tekst: z.string().nullable().default(null),
  /** De volledige uitgelezen tekst als bestand, naast de bijlage zelf. */
  tekstPath: z.string().nullable().default(null),
})
export type MailAttachment = z.infer<typeof MailAttachmentSchema>

export const NormalizedMailSchema = z.object({
  source: z.enum(MAIL_SOURCES),
  /** PidTagInternetMessageId / Message-ID header. Ontbreekt bij niet-verzonden mail. */
  messageId: z.string().nullable(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable(),
  /** ISO datetime, of null als de mail geen ontvangstdatum draagt. */
  receivedAt: z.string().nullable(),
  from: MailAddressSchema.nullable(),
  to: z.array(MailAddressSchema),
  cc: z.array(MailAddressSchema),
  attachments: z.array(MailAttachmentSchema),
  /** Ruwe RFC822 transport headers als het bericht die draagt. */
  rawHeaders: z.string().nullable(),
})
export type NormalizedMail = z.infer<typeof NormalizedMailSchema>

// ── Afzender-resolutie ────────────────────────────────────────────────────────
// Zie features/60-mail-import.md §3.2. Klanten mailen rechtstreeks én er wordt
// intern doorgestuurd, dus de envelope-afzender is soms een collega.

export const SENDER_ORIGINS = ['direct', 'doorgestuurd', 'onbekend'] as const
export type SenderOrigin = typeof SENDER_ORIGINS[number]

export const SENDER_CONFIDENCE = ['hoog', 'midden', 'laag'] as const
export type SenderConfidence = typeof SENDER_CONFIDENCE[number]

export const SenderResolutionSchema = z.object({
  origin: z.enum(SENDER_ORIGINS),
  /** De vermoedelijke klant — niet noodzakelijk de afzender van het bestand. */
  klant: MailAddressSchema.nullable(),
  /** Gevuld als de mail intern is doorgestuurd: wie stuurde hem door. */
  doorgestuurdDoor: MailAddressSchema.nullable(),
  confidence: z.enum(SENDER_CONFIDENCE),
  /** Nederlandse uitleg voor het reviewscherm — waarom deze uitkomst. */
  reden: z.string(),
})
export type SenderResolution = z.infer<typeof SenderResolutionSchema>

// ── Kandidaat-regel uit extractie ─────────────────────────────────────────────

export const CANDIDATE_SOURCES = ['bijlagenaam', 'onderwerp', 'body', 'sheet', 'pdf'] as const
export type CandidateSource = typeof CANDIDATE_SOURCES[number]

/**
 * Hoe zeker is de koppeling met een bestaand artikel?
 *  match   — één duidelijke treffer, mag voorgevuld worden
 *  twijfel — meerdere kandidaten of een zwakke treffer; mens kiest
 *  nieuw   — niets gevonden; dit wordt een nieuw artikel of handwerk
 */
export const MATCH_STATUSES = ['match', 'twijfel', 'nieuw'] as const
export type MatchStatus = typeof MATCH_STATUSES[number]

export const ArticleMatchSchema = z.object({
  artikelId: z.string(),
  naam: z.string(),
  tekening: z.string().nullable(),
  rev: z.string().nullable(),
  /** 0–1. Alleen bedoeld om te sorteren en te classificeren, niet om te tonen. */
  score: z.number(),
  /** Nederlandse uitleg voor het reviewscherm: waaróm deze treffer. */
  reden: z.string(),
})
export type ArticleMatch = z.infer<typeof ArticleMatchSchema>

export const CandidateLineSchema = z.object({
  id: z.string(),
  ruweTekst: z.string(),
  tekening: z.string().nullable(),
  rev: z.string().nullable(),
  positie: z.number().int().nullable(),
  qty: z.number().nullable(),
  bron: z.enum(CANDIDATE_SOURCES),
  /** Bijlage waar deze regel vandaan komt, als die er is. */
  attachmentFilename: z.string().nullable(),
  /** Beste kandidaten uit de artikeldatabase, hoogste score eerst. */
  matches: z.array(ArticleMatchSchema).default([]),
  status: z.enum(MATCH_STATUSES).default('nieuw'),
  /** Het gekozen artikel — voorgevuld bij 'match', anders pas na bevestiging. */
  artikelId: z.string().nullable().default(null),
  /**
   * Door een mens gekozen, niet door de matcher. Alleen zo'n keuze overleeft
   * een herberekening: een automatische treffer mag opnieuw bepaald worden,
   * een handmatige nooit stilletjes worden overschreven.
   */
  handmatig: z.boolean().default(false),
})
export type CandidateLine = z.infer<typeof CandidateLineSchema>

// ── MailImport (rij in de database) ───────────────────────────────────────────

export const MailImportSchema = z.object({
  id: z.string(),
  source: z.enum(MAIL_SOURCES),
  messageId: z.string().nullable(),
  /** Idempotentie-sleutel: messageId als die er is, anders een hash. Altijd gevuld. */
  dedupeKey: z.string(),
  afzenderNaam: z.string().nullable(),
  afzenderEmail: z.string().nullable(),
  onderwerp: z.string(),
  ontvangenOp: z.string().nullable(),
  bodyText: z.string(),
  bodyHtmlPath: z.string().nullable(),
  bijlagen: z.array(MailAttachmentSchema),
  resolutie: SenderResolutionSchema.nullable(),
  relatieId: z.string().nullable(),
  intent: z.enum(MAIL_INTENTS),
  kandidaten: z.array(CandidateLineSchema),
  status: z.enum(MAIL_IMPORT_STATUSES),
  projectId: z.string().nullable(),
  foutmelding: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MailImport = z.infer<typeof MailImportSchema>
