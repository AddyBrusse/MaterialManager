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
  updatedAt:      z.string(),
})
export type Company = z.infer<typeof CompanySchema>

export const UpdateCompanySchema = CompanySchema.omit({ id: true, updatedAt: true }).partial().extend({
  naam: z.string().min(1, 'Bedrijfsnaam is verplicht'),
})
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>
