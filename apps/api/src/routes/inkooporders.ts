import { Router } from 'express'
import { InkooporderMakenSchema, IntrekkenSchema, OntvangstInvoerSchema } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { leesOrders, leesOrder, maakOrders, regelEraf, verwijderConcept, markeerVerzonden, trekIn } from '../services/inkooporders'
import { ontvang, leesOntvangsten } from '../services/ontvangst'

/** Inkooporders en ontvangen (2026-10-06, deel 3b). Zie services/inkooporders.ts en ontvangst.ts. */
const router = Router()

router.get('/', asyncHandler(async (_req, res) => { res.json({ data: await leesOrders(prisma) }) }))

router.get('/ontvangsten', asyncHandler(async (_req, res) => { res.json({ data: await leesOntvangsten() }) }))

router.post(
  '/ontvangsten',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await ontvang(OntvangstInvoerSchema.parse(req.body), { id: req.user.id, name: req.user.name }) })
  }),
)

router.get('/:id', asyncHandler(async (req, res) => { res.json({ data: await leesOrder(prisma, req.params.id) }) }))

/** Van gekozen bestelregels: één concept per leverancier. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { regelIds } = InkooporderMakenSchema.parse(req.body)
    res.status(201).json({ data: await maakOrders(regelIds, req.user.name) })
  }),
)

router.delete('/:id/regels/:regelId', asyncHandler(async (req, res) => {
  res.json({ data: await regelEraf(req.params.id, req.params.regelId) })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await verwijderConcept(req.params.id)
  res.json({ data: { id: req.params.id } })
}))

/** Na "Ja, verstuurd" op het scherm. */
router.post('/:id/verzonden', asyncHandler(async (req, res) => {
  res.json({ data: await markeerVerzonden(req.params.id, req.user.name) })
}))

router.post('/:id/intrekken', asyncHandler(async (req, res) => {
  const { reden } = IntrekkenSchema.parse(req.body)
  res.json({ data: await trekIn(req.params.id, reden, req.user.name) })
}))

export default router
