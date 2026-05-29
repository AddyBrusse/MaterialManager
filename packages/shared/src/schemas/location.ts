import { z } from 'zod'

export const LocationKindSchema = z.enum(['rack', 'cabinet'])
export type LocationKind = z.infer<typeof LocationKindSchema>

export const LocationSlotSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  level1: z.string(),
  level2: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type LocationSlot = z.infer<typeof LocationSlotSchema>

export const LocationSchema = z.object({
  id: z.string().uuid(),
  kind: LocationKindSchema,
  label: z.string(),
  createdAt: z.string().datetime(),
  slots: z.array(LocationSlotSchema).optional(),
})
export type Location = z.infer<typeof LocationSchema>

export const CreateLocationSchema = z.object({
  kind: LocationKindSchema,
  label: z.string().min(1, 'Label is verplicht'),
})
export type CreateLocation = z.infer<typeof CreateLocationSchema>

export const UpdateLocationSchema = CreateLocationSchema.partial()
export type UpdateLocation = z.infer<typeof UpdateLocationSchema>

export const CreateLocationSlotSchema = z.object({
  locationId: z.string().uuid(),
  level1: z.string().min(1),
  level2: z.string().optional(),
})
export type CreateLocationSlot = z.infer<typeof CreateLocationSlotSchema>
