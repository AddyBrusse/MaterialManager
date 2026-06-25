import { z } from 'zod'

export const SurfaceFinishSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
})
export type SurfaceFinish = z.infer<typeof SurfaceFinishSchema>

export const CreateSurfaceFinishSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
})
export type CreateSurfaceFinish = z.infer<typeof CreateSurfaceFinishSchema>

export const UpdateSurfaceFinishSchema = CreateSurfaceFinishSchema.partial()
export type UpdateSurfaceFinish = z.infer<typeof UpdateSurfaceFinishSchema>
