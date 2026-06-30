import { z } from 'zod'

export const RawMaterialSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^#\d{5}$/, 'Code moet #NNNNN formaat hebben'),
  gradeId: z.string().uuid(),
  profileId: z.string().uuid(),
  surfaceFinishId: z.string().uuid().nullable(),
  dimensions: z.record(z.number()),
  lengthMm: z.number().positive(),
  locationSlotId: z.string().uuid().nullable(),
  photoPath: z.string().nullable(),
  minStock: z.number().nonnegative().nullable(),
  currentStock: z.number(),
  weightKg: z.number().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type RawMaterial = z.infer<typeof RawMaterialSchema>

export const CreateRawMaterialSchema = z.object({
  code: z.string().regex(/^#\d{5}$/, 'Code moet #NNNNN formaat hebben'),
  gradeId: z.string().uuid(),
  profileId: z.string().uuid(),
  surfaceFinishId: z.string().uuid().optional(),
  dimensions: z.record(z.number()),
  lengthMm: z.number().positive('Lengte moet positief zijn'),
  locationSlotId: z.string().uuid().optional(),
  minStock: z.number().nonnegative().optional(),
})
export type CreateRawMaterial = z.infer<typeof CreateRawMaterialSchema>

export const UpdateRawMaterialSchema = CreateRawMaterialSchema.omit({ code: true }).partial()
export type UpdateRawMaterial = z.infer<typeof UpdateRawMaterialSchema>
