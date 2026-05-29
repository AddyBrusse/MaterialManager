import { z } from 'zod'

export const UserRoleSchema = z.enum(['admin', 'user'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  role: UserRoleSchema,
  avatarPath: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type User = z.infer<typeof UserSchema>

export const CreateUserSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht').max(100),
  role: UserRoleSchema.default('user'),
})
export type CreateUser = z.infer<typeof CreateUserSchema>

export const UpdateUserSchema = CreateUserSchema.partial()
export type UpdateUser = z.infer<typeof UpdateUserSchema>
