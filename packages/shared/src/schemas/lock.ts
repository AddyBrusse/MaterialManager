import { z } from 'zod'
import { ItemTypeSchema } from './movement'

export const LockSchema = z.object({
  itemType: ItemTypeSchema,
  itemId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string(),
  acquiredAt: z.string().datetime(),
  lastHeartbeat: z.string().datetime(),
  isIdle: z.boolean(),
})
export type Lock = z.infer<typeof LockSchema>

export const AcquireLockSchema = z.object({
  itemType: ItemTypeSchema,
})
export type AcquireLock = z.infer<typeof AcquireLockSchema>
