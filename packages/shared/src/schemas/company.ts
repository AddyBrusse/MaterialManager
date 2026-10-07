import { z } from 'zod'

export const CompanySchema = z.object({
  id:             z.string(),
  naam:           z.string(),
  adres:          z.string().nullable(),
  postcode:       z.string().nullable(),
  stad:           z.string().nullable(),
  land:           z.string(),
  telefoon:       z.string().nullable(),
  email:          z.string().nullable(),
  website:        z.string().nullable(),
  kvk:            z.string().nullable(),
  btw:            z.string().nullable(),
  iban:           z.string().nullable(),
  graphClientId:  z.string().nullable(),
  graphTenantId:  z.string().nullable(),
  /** Eigen maildomeinen, voor de doorgestuurd-check bij mail-import (§3.2). */
  eigenDomeinen:  z.array(z.string()).default([]),
  /** Een zaagrestant korter dan dit is geen bruikbaar stuk staal meer. */
  schrootDrempelMm: z.number().int().nonnegative().default(200),
  /**
   * Na hoeveel dagen zonder reactie een verstuurde offerte op het
   * projectenoverzicht als "nabellen" telt (2026-10-05). Bedrijfsbreed: het is
   * een afspraak over hoe je met klanten omgaat, niet een voorkeur per persoon.
   */
  offerteNabelDagen: z.number().int().min(1, 'Minimaal 1 dag').max(365, 'Maximaal 365 dagen').default(21),
  /**
   * Inkoop (2026-10-07): zoveel werkdagen eerder binnen dan de productie het
   * nodig heeft. Uiterlijk bestellen = nodig − levertijd − deze marge.
   */
  inkoopMargeDagen: z.number().int().min(0, 'Minimaal 0 dagen').max(30, 'Maximaal 30 werkdagen').default(2),
  updatedAt:      z.string(),
})
export type Company = z.infer<typeof CompanySchema>

export const UpdateCompanySchema = CompanySchema.omit({ id: true, updatedAt: true }).partial().extend({
  naam: z.string().min(1, 'Bedrijfsnaam is verplicht'),
})
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>
