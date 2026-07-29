import { z } from 'zod'

// Locks cover more entities than stock movements do, so they get their own
// item-type enum instead of reusing the movement ItemTypeSchema ('raw' |
// 'finished'). 'project' was added so a project detail page can be locked to
// a single editing user. itemId is a plain string (project ids look like
// "PRJ-2026-001", not UUIDs).
export const LockItemTypeSchema = z.enum(['raw', 'finished', 'project'])
export type LockItemType = z.infer<typeof LockItemTypeSchema>

export const LockSchema = z.object({
  itemType: LockItemTypeSchema,
  itemId: z.string(),
  userId: z.string().uuid(),
  userName: z.string(),
  acquiredAt: z.string().datetime(),
  lastHeartbeat: z.string().datetime(),
  isIdle: z.boolean(),
})
export type Lock = z.infer<typeof LockSchema>

export const AcquireLockSchema = z.object({
  itemType: LockItemTypeSchema,
})
export type AcquireLock = z.infer<typeof AcquireLockSchema>
