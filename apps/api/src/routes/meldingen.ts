import { Router } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { alleMeldingen } from '../services/meldingen'

/** Eén meldingenlijst voor iedereen (2026-10-09), zie services/meldingen.ts. */
const router = Router()

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ data: await alleMeldingen(prisma) })
}))

export default router
