import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

const VALID_PREFIXES = ['PRJ', 'OFF', 'PROD', 'PL', 'FACT'] as const
type DocPrefix = typeof VALID_PREFIXES[number]

const NextSchema = z.object({
  prefix: z.enum(VALID_PREFIXES),
})

function formatDocId(prefix: DocPrefix, n: number): string {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(n).padStart(3, '0')}`
}

router.post(
  '/next',
  asyncHandler(async (req, res) => {
    const { prefix } = NextSchema.parse(req.body)
    const result = await prisma.$queryRaw<{ last_n: number }[]>`
      INSERT INTO doc_sequences (prefix, last_n) VALUES (${prefix}, 1)
      ON CONFLICT (prefix) DO UPDATE SET last_n = doc_sequences.last_n + 1
      RETURNING last_n
    `
    const n = result[0].last_n
    res.json({ data: { id: formatDocId(prefix, n), n } })
  }),
)

export default router
