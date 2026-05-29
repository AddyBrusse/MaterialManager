import { z } from 'zod'

export const FinishedGoodSchema = z.object({
  id: z.string().uuid(),
  artNo: z.string().regex(/^ART-\d{4}$/, 'Artikelnummer moet ART-NNNN formaat hebben'),
  name: z.string(),
  customer: z.string().nullable(),
  photoPath: z.string().nullable(),
  drawingPath: z.string().nullable(),
  locationSlotId: z.string().uuid().nullable(),
  minStock: z.number().nonnegative().nullable(),
  currentStock: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type FinishedGood = z.infer<typeof FinishedGoodSchema>

export const CreateFinishedGoodSchema = z.object({
  artNo: z.string().regex(/^ART-\d{4}$/, 'Artikelnummer moet ART-NNNN formaat hebben'),
  name: z.string().min(1, 'Naam is verplicht'),
  customer: z.string().optional(),
  locationSlotId: z.string().uuid().optional(),
  minStock: z.number().nonnegative().optional(),
})
export type CreateFinishedGood = z.infer<typeof CreateFinishedGoodSchema>

export const UpdateFinishedGoodSchema = CreateFinishedGoodSchema.omit({ artNo: true }).partial()
export type UpdateFinishedGood = z.infer<typeof UpdateFinishedGoodSchema>
