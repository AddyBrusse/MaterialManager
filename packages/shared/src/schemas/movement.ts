import { z } from 'zod'

export const ItemTypeSchema = z.enum(['raw', 'finished'])
export type ItemType = z.infer<typeof ItemTypeSchema>

export const MovementKindSchema = z.enum(['delta', 'overwrite'])
export type MovementKind = z.infer<typeof MovementKindSchema>

export const MovementReasonSchema = z.enum(['received', 'used', 'scrapped', 'correction', 'other'])
export type MovementReason = z.infer<typeof MovementReasonSchema>

export const StockMovementSchema = z.object({
  id: z.string().uuid(),
  itemType: ItemTypeSchema,
  itemId: z.string().uuid(),
  userId: z.string().uuid(),
  kind: MovementKindSchema,
  amount: z.number(),
  previousStock: z.number(),
  newStock: z.number(),
  reason: MovementReasonSchema,
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type StockMovement = z.infer<typeof StockMovementSchema>

export const CreateMovementSchema = z.object({
  itemType: ItemTypeSchema,
  itemId: z.string().uuid(),
  kind: MovementKindSchema,
  amount: z.number(),
  reason: MovementReasonSchema,
  note: z.string().optional(),
})
export type CreateMovement = z.infer<typeof CreateMovementSchema>
