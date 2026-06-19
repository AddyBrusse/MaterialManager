import { z } from 'zod'

export const UserRoleSchema = z.enum(['admin', 'user'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const UserSchema = z.object({
  id:          z.string().uuid(),
  name:        z.string().min(1).max(100),
  achternaam:  z.string().nullable(),
  titel:       z.string().nullable(),
  email:       z.string().email().nullable(),
  telefoon:    z.string().nullable(),
  role:        UserRoleSchema,
  avatarPath:  z.string().nullable(),
  createdAt:   z.string().datetime(),
})
export type User = z.infer<typeof UserSchema>

export const CreateUserSchema = z.object({
  name:       z.string().min(1, 'Voornaam is verplicht').max(100),
  achternaam: z.string().max(100).nullable().default(null),
  titel:      z.string().max(100).nullable().default(null),
  email:      z.string().email('Ongeldig e-mailadres').nullable().default(null),
  telefoon:   z.string().max(30).nullable().default(null),
  role:       UserRoleSchema.default('user'),
})
export type CreateUser = z.infer<typeof CreateUserSchema>

export const UpdateUserSchema = CreateUserSchema.partial()
export type UpdateUser = z.infer<typeof UpdateUserSchema>
