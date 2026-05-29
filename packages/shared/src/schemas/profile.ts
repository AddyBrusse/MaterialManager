import { z } from 'zod'

export const DimensionFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
})
export type DimensionField = z.infer<typeof DimensionFieldSchema>

export const VolumeFormulaSchema = z.enum(['round', 'square', 'flat', 'tube'])
export type VolumeFormula = z.infer<typeof VolumeFormulaSchema>

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dimensionSchema: z.array(DimensionFieldSchema),
  volumeFormula: VolumeFormulaSchema,
  createdAt: z.string().datetime(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const CreateProfileSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  dimensionSchema: z.array(DimensionFieldSchema).min(1),
  volumeFormula: VolumeFormulaSchema,
})
export type CreateProfile = z.infer<typeof CreateProfileSchema>

export const UpdateProfileSchema = CreateProfileSchema.partial()
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>
