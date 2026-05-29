import { z } from 'zod'

export const LabelStatusSchema = z.enum(['printed_unused', 'consumed', 'voided'])
export type LabelStatus = z.infer<typeof LabelStatusSchema>

export const LabelSchema = z.object({
  number: z.string().regex(/^#\d{5}$/),
  batchId: z.string().uuid(),
  status: LabelStatusSchema,
  printedAt: z.string().datetime(),
  printedById: z.string().uuid(),
  consumedAt: z.string().datetime().nullable(),
  consumedRawMaterialId: z.string().uuid().nullable(),
})
export type Label = z.infer<typeof LabelSchema>

export const ConsumeLabelSchema = z.object({
  rawMaterialId: z.string().uuid(),
})
export type ConsumeLabel = z.infer<typeof ConsumeLabelSchema>
