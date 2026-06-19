import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/async-handler'
import { buildOffertePdf } from '../services/offerte-pdf'
import { OfferteSchema } from '@stockmanager/shared'

const router = Router()

const OffertePdfBodySchema = z.object({
  project: z.object({
    id: z.string(),
    naam: z.string(),
    klantNaam: z.string().optional(),
    contactNaam: z.string().optional(),
    klantRef: z.string().nullable(),
    levertijdDatum: z.string().nullable(),
  }),
  offerte: OfferteSchema,
})

router.post(
  '/offerte',
  asyncHandler(async (req, res) => {
    const { project, offerte } = OffertePdfBodySchema.parse(req.body)
    const buf = await buildOffertePdf(project, offerte)
    const filename = `Offerte-${offerte.id}-v${offerte.versie}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buf.length)
    res.end(buf)
  })
)

export default router
