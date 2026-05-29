import { z } from 'zod'

export const GradeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  densityKgM3: z.number().positive(),
  createdAt: z.string().datetime(),
})
export type Grade = z.infer<typeof GradeSchema>

export const CreateGradeSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  densityKgM3: z.number().positive('Dichtheid moet positief zijn'),
})
export type CreateGrade = z.infer<typeof CreateGradeSchema>

export const UpdateGradeSchema = CreateGradeSchema.partial()
export type UpdateGrade = z.infer<typeof UpdateGradeSchema>
