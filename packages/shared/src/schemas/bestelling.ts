import { z } from 'zod'

/**
 * Inkoop (2026-10-06): wat er besteld moet worden, de prijsaanvragen aan
 * leveranciers en hun antwoorden. Een bestelregel gaat over een maat
 * (kwaliteit, vorm, afmeting, lengte × stuks), niet over een staaf: die
 * bestaat pas als hij binnen is. Een exoot wijst wel naar zijn eigen regel in
 * de materiaallijst.
 */
export const BESTEL_STATUSSEN = ['te_bestellen', 'aangevraagd', 'besteld', 'ontvangen'] as const
export type BestelStatus = typeof BESTEL_STATUSSEN[number]

/** Waar de regel vandaan komt — zodat je ziet waarom hij er staat. */
export const BESTEL_BRONNEN = ['opdracht_exoot', 'tekort', 'handmatig', 'lage_voorraad'] as const
export type BestelBron = typeof BESTEL_BRONNEN[number]

export const KEUZE_BRONNEN = ['prijslijst', 'antwoord'] as const
export type KeuzeBron = typeof KEUZE_BRONNEN[number]

/** De gekozen leverancier, met de prijs zoals die op het moment van kiezen was. */
export const BestelKeuzeSchema = z.object({
  leverancierId: z.string(),
  leverancierNaam: z.string(),
  bron: z.enum(KEUZE_BRONNEN),
  antwoordId: z.string().nullable(),
  totaal: z.number(),
  uitleg: z.string(),
  levertijdDagen: z.number().int().nullable(),
  gekozenOp: z.string(),
  gekozenDoor: z.string().nullable(),
})
export type BestelKeuze = z.infer<typeof BestelKeuzeSchema>

export const BestelRegelSchema = z.object({
  id: z.string(),
  status: z.enum(BESTEL_STATUSSEN),
  bron: z.enum(BESTEL_BRONNEN),
  gradeId: z.string(),
  profileId: z.string(),
  dimensions: z.record(z.number()),
  lengteMm: z.number(),
  stuks: z.number().int(),
  /** Bij een exoot: de exoot in de materiaallijst. */
  rawMaterialId: z.string().nullable(),
  exoot: z.boolean(),
  projectId: z.string().nullable(),
  artikelId: z.string().nullable(),
  offerteRegelId: z.string().nullable(),
  notitie: z.string().nullable(),
  // ── Afgeleid bij het lezen ──
  /** "Alu 6082 Plaat 250×30" */
  materiaal: z.string(),
  gradeNaam: z.string(),
  profielNaam: z.string(),
  volumeFormula: z.string(),
  densityKgM3: z.number(),
  /** Totaal gewicht van de regel (alle stuks), nooit opgeslagen. */
  kg: z.number(),
  projectNaam: z.string().nullable(),
  klantNaam: z.string().nullable(),
  artikelNaam: z.string().nullable(),
  /** Leverdatum van het project, als die er is. */
  nodigVoor: z.string().nullable(),
  /** Prijsaanvragen waar de regel in zit, nieuwste eerst. */
  aanvragen: z.array(z.object({ id: z.string(), verzondenOp: z.string().nullable() })),
  keuze: BestelKeuzeSchema.nullable(),
  toegevoegdDoor: z.string(),
  createdAt: z.string(),
})
export type BestelRegel = z.infer<typeof BestelRegelSchema>

const positief = (wat: string) => z.number().positive(`${wat} moet groter zijn dan 0`)

export const BestelRegelInvoerSchema = z.object({
  bron: z.enum(['handmatig', 'lage_voorraad']).default('handmatig'),
  gradeId: z.string().min(1, 'Kies een kwaliteit'),
  profileId: z.string().min(1, 'Kies een vorm'),
  dimensions: z.record(z.number()),
  lengteMm: positief('De lengte'),
  stuks: z.number().int('Hele stuks').min(1, 'Minstens 1 stuk'),
  rawMaterialId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  notitie: z.string().max(500).nullable().optional(),
})
export type BestelRegelInvoer = z.infer<typeof BestelRegelInvoerSchema>

export const BestelRegelWijzigSchema = z.object({
  lengteMm: positief('De lengte').optional(),
  stuks: z.number().int('Hele stuks').min(1, 'Minstens 1 stuk').optional(),
  notitie: z.string().max(500).nullable().optional(),
})
export type BestelRegelWijzig = z.infer<typeof BestelRegelWijzigSchema>

export const KeuzeInvoerSchema = z.object({
  leverancierId: z.string().min(1),
  bron: z.enum(KEUZE_BRONNEN),
  antwoordId: z.string().nullable().optional(),
  /** Een gekozen antwoord ook als prijs van deze leverancier bewaren. */
  bewaarPrijs: z.boolean().optional(),
})
export type KeuzeInvoer = z.infer<typeof KeuzeInvoerSchema>

// ── Prijsaanvraag ──

export const PrijsaanvraagLeverancierSchema = z.object({
  leverancierId: z.string(),
  naam: z.string(),
  email: z.string().nullable(),
  verzondenOp: z.string().nullable(),
  verzondenDoor: z.string().nullable(),
})
export type PrijsaanvraagLeverancier = z.infer<typeof PrijsaanvraagLeverancierSchema>

export const ANTWOORD_SOORTEN = ['per_kg', 'per_stuk', 'totaal'] as const
export type AntwoordSoort = typeof ANTWOORD_SOORTEN[number]

export const AntwoordSchema = z.object({
  id: z.string(),
  prijsaanvraagId: z.string(),
  bestelRegelId: z.string(),
  leverancierId: z.string(),
  prijsSoort: z.enum(ANTWOORD_SOORTEN),
  prijs: z.number(),
  zaagkostenPerSnede: z.number().nullable(),
  levertijdDagen: z.number().int().nullable(),
  notitie: z.string().nullable(),
  bijgewerktDoor: z.string().nullable(),
  updatedAt: z.string(),
})
export type Antwoord = z.infer<typeof AntwoordSchema>

export const PrijsaanvraagSchema = z.object({
  id: z.string(),
  notitie: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
  regelIds: z.array(z.string()),
  leveranciers: z.array(PrijsaanvraagLeverancierSchema),
  antwoorden: z.array(AntwoordSchema),
})
export type Prijsaanvraag = z.infer<typeof PrijsaanvraagSchema>

export const PrijsaanvraagInvoerSchema = z.object({
  regelIds: z.array(z.string()).min(1, 'Kies minstens één regel'),
  leverancierIds: z.array(z.string()).min(1, 'Kies minstens één leverancier'),
  notitie: z.string().max(1000).nullable().optional(),
})
export type PrijsaanvraagInvoer = z.infer<typeof PrijsaanvraagInvoerSchema>

export const AntwoordInvoerSchema = z.object({
  bestelRegelId: z.string(),
  prijsSoort: z.enum(ANTWOORD_SOORTEN),
  prijs: positief('De prijs'),
  zaagkostenPerSnede: z.number().nonnegative('Mag niet negatief zijn').nullable().optional(),
  levertijdDagen: z.number().int().nonnegative().nullable().optional(),
  notitie: z.string().max(500).nullable().optional(),
})
export type AntwoordInvoer = z.infer<typeof AntwoordInvoerSchema>

/** Alle antwoorden van één leverancier op één aanvraag; een lege lijst wist ze. */
export const AntwoordenInvoerSchema = z.object({ antwoorden: z.array(AntwoordInvoerSchema) })
