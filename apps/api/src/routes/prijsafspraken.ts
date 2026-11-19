import { Router } from 'express'
import { z } from 'zod'
import { PrijsafspraakInvoerSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { lijst, maak, verwijder, wijzig } from '../services/prijsafspraken'

const router = Router()

const FilterSchema = z.object({ artikelId: z.string().optional(), relatieId: z.string().optional() })
const WijzigSchema = PrijsafspraakInvoerSchema.omit({ artikelId: true }).partial()

/** Alle afspraken, of die van één artikel (`?artikelId=`) of van de artikelen van één klant (`?relatieId=`). */
router.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await lijst(FilterSchema.parse(req.query)) })
}))

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await maak(PrijsafspraakInvoerSchema.parse(req.body), req.user.name) })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await wijzig(req.params.id, WijzigSchema.parse(req.body), req.user.name) })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await verwijder(req.params.id)
  res.status(204).end()
}))

export default router
