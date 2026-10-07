import { z } from 'zod'

/**
 * Inkooporders (2026-10-06, deel 3b): de gekozen regels per leverancier. Een
 * verstuurde inkooporder ligt vast; om iets te veranderen trek je hem in
 * (vervallen, met reden) en maak je een nieuwe. Het nummer blijft bestaan.
 */
export const INKOOP_STATUSSEN = ['concept', 'verzonden', 'vervallen'] as const
export type InkoopStatus = typeof INKOOP_STATUSSEN[number]

export const InkooporderRegelSchema = z.object({
  id: z.string(),
  /** "INK-2026-004.1" — onze eigen regelreferentie, ook op de pdf. */
  referentie: z.string(),
  /** M26-0042: ons nummer per regel, op het materiaal geplakt door de leverancier (2026-10-07). */
  materiaalNummer: z.string().nullable(),
  bestelRegelId: z.string(),
  materiaal: z.string(),
  exoot: z.boolean(),
  stuks: z.number().int(),
  lengteMm: z.number(),
  kg: z.number(),
  totaal: z.number(),
  uitleg: z.string(),
  levertijdDagen: z.number().int().nullable(),
  ontvangenStuks: z.number().int(),
  /** Leverdatum zoals de leverancier hem doorgaf; leeg = afgeleid. */
  verwachtDatum: z.string().nullable(),
  /** Verwacht binnen: de doorgegeven datum, anders verstuurd + levertijd (werkdagen). */
  verwacht: z.string().nullable(),
  projectId: z.string().nullable(),
  artikelNaam: z.string().nullable(),
})
export type InkooporderRegel = z.infer<typeof InkooporderRegelSchema>

export const InkooporderSchema = z.object({
  id: z.string(),
  leverancierId: z.string(),
  leverancierNaam: z.string(),
  email: z.string().nullable(),
  status: z.enum(INKOOP_STATUSSEN),
  notitie: z.string().nullable(),
  /** Hun offertenummer: de prijsaanvraag waarop ze antwoordden, als die er is. */
  referentie: z.string().nullable(),
  verzondenOp: z.string().nullable(),
  verzondenDoor: z.string().nullable(),
  vervallenOp: z.string().nullable(),
  vervallenReden: z.string().nullable(),
  vervallenDoor: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
  regels: z.array(InkooporderRegelSchema),
  totaal: z.number(),
})
export type Inkooporder = z.infer<typeof InkooporderSchema>

export const InkooporderMakenSchema = z.object({
  regelIds: z.array(z.string()).min(1, 'Kies minstens één regel'),
})

export const IntrekkenSchema = z.object({
  reden: z.string().trim().min(3, 'Vul minstens 3 tekens in'),
})

export const OntvangstInvoerSchema = z.object({
  inkooporderRegelId: z.string().min(1),
  stuks: z.number().int('Hele stuks').min(1, 'Minstens 1 stuk'),
  locationSlotId: z.string().nullable().optional(),
  notitie: z.string().max(500).nullable().optional(),
})
export type OntvangstInvoer = z.infer<typeof OntvangstInvoerSchema>

/** Eén keer iets binnen: welke regel, hoeveel, en welke staven het werden. */
export const OntvangstSchema = z.object({
  id: z.string(),
  inkooporderId: z.string(),
  referentie: z.string(),
  materiaal: z.string(),
  leverancierNaam: z.string(),
  stuks: z.number().int(),
  /** De codes in de materiaallijst (#00042). */
  codes: z.array(z.string()),
  /** Een exoot gaat meteen vast voor zijn project. */
  gereserveerdVoor: z.string().nullable(),
  notitie: z.string().nullable(),
  door: z.string(),
  createdAt: z.string(),
})
export type Ontvangst = z.infer<typeof OntvangstSchema>

/** Bestellen in één keer: regels zonder keuze krijgen de goedkoopste leverancier. */
export const BestellenSchema = z.object({ regelIds: z.array(z.string()).min(1, 'Kies minstens één regel') })
export const VerzondenAlleSchema = z.object({ ids: z.array(z.string()).min(1, 'Geen inkooporders opgegeven') })
export const LeverdatumSchema = z.object({ verwachtDatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vul een datum in').nullable() })

export const GeschiedenisItemSchema = z.object({
  datum: z.string(),
  tekst: z.string(),
  /** Een documentnummer om te openen (PA-…, INK-…). */
  document: z.string().nullable(),
})
export type GeschiedenisItem = z.infer<typeof GeschiedenisItemSchema>
