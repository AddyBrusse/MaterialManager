import { z } from 'zod'

export const RelatieContactSchema = z.object({
  id: z.string(),
  naam: z.string().min(1, 'Naam is verplicht'),
  functie: z.string().nullable().optional(),
  telefoon: z.string().nullable().optional(),
  mobiel: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
})
export type RelatieContact = z.infer<typeof RelatieContactSchema>

export const RelatieSchema = z.object({
  id: z.string(),
  naam: z.string().min(1, 'Naam is verplicht'),
  type: z.enum(['klant', 'leverancier', 'beide']),
  actief: z.boolean().default(true),

  // Bedrijfscontact
  telefoon: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  emailFactuur: z.string().nullable().optional(),
  emailOfferte: z.string().nullable().optional(),
  website: z.string().nullable().optional(),

  // Vestigingsadres
  straat: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  stad: z.string().nullable().optional(),
  land: z.string().default('Nederland'),

  // Factuuradres
  factuurAdresZelfde: z.boolean().default(true),
  factuurStraat: z.string().nullable().optional(),
  factuurPostcode: z.string().nullable().optional(),
  factuurStad: z.string().nullable().optional(),
  factuurLand: z.string().nullable().optional(),

  // Afleveradres
  afleverAdresZelfde: z.boolean().default(true),
  afleverStraat: z.string().nullable().optional(),
  afleverPostcode: z.string().nullable().optional(),
  afleverStad: z.string().nullable().optional(),
  afleverLand: z.string().nullable().optional(),

  // Financieel
  kvk: z.string().nullable().optional(),
  btw: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  betalingstermijn: z.number().int().nonnegative().nullable().optional(),

  // Meta
  notities: z.string().nullable().optional(),
  contacten: z.array(RelatieContactSchema).default([]),
  createdAt: z.string(),
})
export type Relatie = z.infer<typeof RelatieSchema>

export const CreateRelatieSchema = RelatieSchema.omit({ id: true, createdAt: true })
export type CreateRelatie = z.infer<typeof CreateRelatieSchema>

export const UpdateRelatieSchema = CreateRelatieSchema.partial()
export type UpdateRelatie = z.infer<typeof UpdateRelatieSchema>
