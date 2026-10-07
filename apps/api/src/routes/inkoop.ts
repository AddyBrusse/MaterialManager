import { Router } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { leesOverzicht } from '../services/inkoop-overzicht'
import { STAND_VANDAAG } from '@stockmanager/shared'

/** Het inkoopoverzicht en de meldingen bij het belletje (2026-10-07). Zie services/inkoop-overzicht.ts. */
const router = Router()

router.get(
  '/overzicht',
  asyncHandler(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' && req.query.projectId ? req.query.projectId : undefined
    res.json({ data: await leesOverzicht(prisma, { projectId }) })
  }),
)

/** Alleen wat vandaag iets vraagt: dat is het getal in het menu. */
router.get(
  '/meldingen',
  asyncHandler(async (_req, res) => {
    const ov = await leesOverzicht(prisma)
    res.json({ data: { aantal: ov.regels.filter((r) => STAND_VANDAAG.includes(r.plan.stand)).length, meldingen: ov.meldingen } })
  }),
)

export default router
