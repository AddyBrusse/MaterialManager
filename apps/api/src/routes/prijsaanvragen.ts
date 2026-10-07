import { Router } from 'express'
import { z } from 'zod'
import { PrijsaanvraagInvoerSchema, AntwoordenInvoerSchema, PrijzenAanvragenSchema, AntwoordCelSchema } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import {
  leesAanvragen, leesAanvraag, maakAanvraag, markeerVerzonden, zetAntwoorden, verwijderAanvraag,
  aanvragenPerLeverancier, markeerAlleVerzonden, zetAntwoordCel,
} from '../services/prijsaanvragen'

/** Prijsaanvragen (2026-10-06). Zie services/prijsaanvragen.ts. */
const router = Router()

router.get('/', asyncHandler(async (_req, res) => { res.json({ data: await leesAanvragen(prisma) }) }))

/** Tab Te bestellen: per leverancier één aanvraag. Met `leverancierIds`: die erbij (tab Open prijsaanvragen). */
router.post(
  '/per-leverancier',
  asyncHandler(async (req, res) => {
    const { regelIds } = PrijzenAanvragenSchema.parse(req.body)
    const extra = z.object({ leverancierIds: z.array(z.string()).min(1, 'Kies minstens één leverancier').optional() }).parse(req.body).leverancierIds
    res.status(201).json({ data: await aanvragenPerLeverancier(regelIds, req.user.name, extra) })
  }),
)

/** "Ja, allemaal verstuurd". */
router.post(
  '/verzonden',
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body)
    res.json({ data: await markeerAlleVerzonden(ids, req.user.name) })
  }),
)

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

/** Eén antwoordcel; een lege prijs wist hem. */
router.put(
  '/:id/antwoorden/:leverancierId/regels/:regelId',
  asyncHandler(async (req, res) => {
    const cel = AntwoordCelSchema.parse(req.body)
    res.json({ data: await zetAntwoordCel(req.params.id, req.params.leverancierId, req.params.regelId, cel, req.user.name) })
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
