import { Router } from 'express'
import { z } from 'zod'
import { PrijsaanvraagInvoerSchema, AntwoordenInvoerSchema } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { leesAanvragen, leesAanvraag, maakAanvraag, markeerVerzonden, zetAntwoorden, verwijderAanvraag } from '../services/prijsaanvragen'

/** Prijsaanvragen (2026-10-06). Zie services/prijsaanvragen.ts. */
const router = Router()

router.get('/', asyncHandler(async (_req, res) => { res.json({ data: await leesAanvragen(prisma) }) }))

router.get('/:id', asyncHandler(async (req, res) => { res.json({ data: await leesAanvraag(prisma, req.params.id) }) }))

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await maakAanvraag(PrijsaanvraagInvoerSchema.parse(req.body), req.user.name) })
  }),
)

/** Na "Ja, verstuurd" op het scherm. */
router.post(
  '/:id/verzonden',
  asyncHandler(async (req, res) => {
    const { leverancierId } = z.object({ leverancierId: z.string().min(1) }).parse(req.body)
    res.json({ data: await markeerVerzonden(req.params.id, leverancierId, req.user.name) })
  }),
)

router.put(
  '/:id/antwoorden/:leverancierId',
  asyncHandler(async (req, res) => {
    const { antwoorden } = AntwoordenInvoerSchema.parse(req.body)
    res.json({ data: await zetAntwoorden(req.params.id, req.params.leverancierId, antwoorden, req.user.name) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await verwijderAanvraag(req.params.id)
    res.json({ data: { id: req.params.id } })
  }),
)

export default router
