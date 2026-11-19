import { z } from 'zod'

/**
 * Prijsafspraak met de klant van een artikel (2026-11-18). Een artikel hoort
 * bij één klant (`Article.relatieId`), dus een afspraak per artikel is een
 * afspraak met die klant. Heeft het artikel geen klant, dan geldt de afspraak
 * voor iedereen.
 *
 * Staffel: meerdere afspraken met een ander `vanafAantal`; de hoogste die het
 * aantal haalt, wint. Geldigheid: van en tot zijn allebei optioneel.
 */
export const PrijsafspraakSchema = z.object({
  id: z.string(),
  artikelId: z.string(),
  prijs: z.number(),
  vanafAantal: z.number().int(),
  geldigVan: z.string().nullable(),
  geldigTot: z.string().nullable(),
  kenmerk: z.string().nullable(),
  door: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Prijsafspraak = z.infer<typeof PrijsafspraakSchema>

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik een datum als 2026-12-31')

export const PrijsafspraakInvoerSchema = z.object({
  artikelId: z.string().min(1),
  prijs: z.number().positive('Vul een prijs groter dan € 0 in'),
  vanafAantal: z.number().int().min(1).default(1),
  geldigVan: datum.nullable().default(null),
  geldigTot: datum.nullable().default(null),
  kenmerk: z.string().trim().max(200).nullable().default(null),
})
export type PrijsafspraakInvoer = z.infer<typeof PrijsafspraakInvoerSchema>
