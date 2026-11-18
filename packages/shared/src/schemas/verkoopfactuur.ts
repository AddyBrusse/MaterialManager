import { z } from 'zod'
import { FACTUUR_SOORTEN } from './project'

/**
 * Elke factuur en credit, met of zonder project (2026-11-18), zoals de pagina
 * Facturen hem toont. Een **losse** factuur hoort bij de klant (`relatieId`) en
 * niet bij een project: voor artikelen uit voorraad met een prijsafspraak,
 * zonder offerte, opdracht en pakbon. Een projectfactuur staat hier ook, maar
 * wordt op de Facturen-tab van zijn project gemaakt en aangepast.
 */
export const VerkoopFactuurRegelSchema = z.object({
  /** Projectfactuur: de orderregel. Losse factuur: leeg. */
  offerteRegelId: z.string().nullable(),
  /** Losse factuur: het artikel, of leeg bij een vrije regel (verzendkosten). */
  artikelId: z.string().nullable(),
  naam: z.string(),
  qty: z.number(),
  eenheid: z.string(),
  verkoopprijs: z.number(),
  totaal: z.number(),
})
export type VerkoopFactuurRegel = z.infer<typeof VerkoopFactuurRegelSchema>

export const VerkoopFactuurSchema = z.object({
  id: z.string(),
  soort: z.enum(FACTUUR_SOORTEN),
  crediteertFactuurId: z.string().nullable(),
  projectId: z.string().nullable(),
  projectNaam: z.string().nullable(),
  relatieId: z.string().nullable(),
  klantNaam: z.string().nullable(),
  contactId: z.string().nullable(),
  klantRef: z.string().nullable(),
  /** Losse factuur: de dag dat het de deur uit ging. Leeg = de factuurdatum. */
  leverdatum: z.string().nullable(),
  /** Losse credit zonder factuur: waarom. */
  reden: z.string().nullable(),
  /** Losse credit: stuks terug op voorraad bij versturen. */
  retour: z.boolean(),
  regels: z.array(VerkoopFactuurRegelSchema),
  btwPct: z.number(),
  subtotaal: z.number(),
  btwBedrag: z.number(),
  totaalInclBtw: z.number(),
  notities: z.string(),
  vervaldatum: z.string().nullable(),
  verzondenOp: z.string().nullable(),
  naarEmail: z.string().nullable(),
  betaaldOp: z.string().nullable(),
  createdAt: z.string(),
})
export type VerkoopFactuur = z.infer<typeof VerkoopFactuurSchema>

// ── Invoer ──────────────────────────────────────────────────────────────────

export const LosseRegelInvoerSchema = z.object({
  artikelId: z.string().nullable().default(null),
  naam: z.string().trim().min(1, 'Geef de regel een omschrijving').max(200),
  qty: z.number().positive('Vul een aantal groter dan 0 in'),
  eenheid: z.string().trim().min(1).max(20).default('st'),
  verkoopprijs: z.number().min(0, 'De prijs kan niet negatief zijn'),
})
export type LosseRegelInvoer = z.infer<typeof LosseRegelInvoerSchema>

const dag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik een datum als 2026-11-18')

export const LosseFactuurInvoerSchema = z.object({
  relatieId: z.string().min(1, 'Kies een klant'),
  contactId: z.string().nullable().default(null),
  klantRef: z.string().trim().max(200).nullable().default(null),
  leverdatum: dag.nullable().default(null),
  notities: z.string().max(2000).default(''),
  naarEmail: z.string().trim().max(200).nullable().optional(),
  regels: z.array(LosseRegelInvoerSchema),
})
export type LosseFactuurInvoer = z.infer<typeof LosseFactuurInvoerSchema>

/** Aanpassen zolang hij niet verstuurd is. De klant ligt vast zodra hij een nummer heeft. */
export const LosseFactuurWijzigSchema = LosseFactuurInvoerSchema.partial().extend({
  reden: z.string().trim().max(500).nullable().optional(),
  retour: z.boolean().optional(),
})
export type LosseFactuurWijzig = z.infer<typeof LosseFactuurWijzigSchema>

/**
 * Een credit bij een losse factuur (`factuurId`), of helemaal los (`relatieId`
 * + `reden`): een prijscorrectie, een bonus, een retour zonder factuur.
 * Zonder regels neemt een credit op een factuur alles wat er nog open staat.
 */
export const LosseCreditInvoerSchema = z.object({
  factuurId: z.string().nullable().default(null),
  relatieId: z.string().nullable().default(null),
  reden: z.string().trim().max(500).nullable().default(null),
  retour: z.boolean().default(false),
  regels: z.array(LosseRegelInvoerSchema).optional(),
})
export type LosseCreditInvoer = z.infer<typeof LosseCreditInvoerSchema>

/** Voor de regels van een losse factuur: wat er per artikel van die klant te kiezen valt. */
export const ArtikelVerkoopInfoSchema = z.object({
  artikelId: z.string(),
  /** Vrije voorraad: wat er ligt en niet voor een order klaarstaat. */
  vrij: z.number(),
  /** Gereedgemeld voor een order, nog niet geleverd: ligt er wel, maar is niet vrij. */
  klaarVoorOrders: z.number(),
  /** Wat de klant de laatste keer betaalde (prijshistorie, bij accepteren). */
  laatste: z.object({ prijs: z.number(), aantal: z.number(), datum: z.string() }).nullable(),
})
export type ArtikelVerkoopInfo = z.infer<typeof ArtikelVerkoopInfoSchema>

export const ArtikelMutatieSchema = z.object({
  id: z.string(),
  artikelId: z.string(),
  aantal: z.number(),
  soort: z.enum(['factuur', 'credit', 'hand']),
  factuurId: z.string().nullable(),
  reden: z.string().nullable(),
  stand: z.number(),
  door: z.string(),
  createdAt: z.string(),
})
export type ArtikelMutatie = z.infer<typeof ArtikelMutatieSchema>

export const ArtikelVoorraadSchema = z.object({
  vrij: z.number(),
  klaarVoorOrders: z.number(),
  mutaties: z.array(ArtikelMutatieSchema),
})
export type ArtikelVoorraad = z.infer<typeof ArtikelVoorraadSchema>

export const VoorraadTellingSchema = z.object({
  /** De getelde stand, in stuks. */
  stand: z.number().min(0, 'Een telling kan niet negatief zijn'),
  reden: z.string().trim().min(3, 'Zeg waarom: "geteld", "kapot", "extra gemaakt"').max(300),
})
export type VoorraadTelling = z.infer<typeof VoorraadTellingSchema>
