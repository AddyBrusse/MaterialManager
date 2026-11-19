import { Router } from 'express'
import { z } from 'zod'
import { LosseCreditInvoerSchema, LosseFactuurInvoerSchema, LosseFactuurWijzigSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import {
  alleFacturen, betaaldLos, maakLosseCredit, maakLosseFactuur, nummerLos, nummerTerugLos, verkoopInfo, verstuurLos,
  verwijderLos, wijzigLos,
} from '../services/losse-facturen'

/**
 * De pagina Facturen (2026-11-18): alle facturen en credits, en de losse
 * (zonder project) maken en aanpassen. De regels staan in
 * `services/losse-facturen.ts`; een projectfactuur weigert hij hier.
 */
const router = Router()

const NaarSchema = z.object({ naarEmail: z.string().trim().max(200).nullable().optional() })

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ data: await alleFacturen() })
}))

/** Per artikel van de klant: vrij, klaar voor orders en de laatste prijs. */
router.get('/prijzen', asyncHandler(async (req, res) => {
  const relatieId = z.string().min(1, 'Kies een klant').parse(req.query.relatieId)
  res.json({ data: await verkoopInfo(relatieId) })
}))

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await maakLosseFactuur(LosseFactuurInvoerSchema.parse(req.body)) })
}))

router.post('/credit', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await maakLosseCredit(LosseCreditInvoerSchema.parse(req.body)) })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await wijzigLos(req.params.id, LosseFactuurWijzigSchema.parse(req.body)) })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await verwijderLos(req.params.id)
  res.status(204).end()
}))

/** Het nummer geven vlak voor de pdf en de mail gemaakt worden. */
router.post('/:id/nummer', asyncHandler(async (req, res) => {
  const { naarEmail } = NaarSchema.parse(req.body ?? {})
  res.json({ data: await nummerLos(req.params.id, naarEmail) })
}))

/** "Nee, niet verstuurd" en het was het laatste nummer: terug naar concept. */
router.post('/:id/nummer-terug', asyncHandler(async (req, res) => {
  res.json({ data: await nummerTerugLos(req.params.id) })
}))

router.post('/:id/verzend', asyncHandler(async (req, res) => {
  const { naarEmail } = NaarSchema.parse(req.body ?? {})
  res.json({ data: await verstuurLos(req.params.id, naarEmail, req.user.name) })
}))

router.post('/:id/betaald', asyncHandler(async (req, res) => {
  const { betaald } = z.object({ betaald: z.boolean() }).parse(req.body)
  res.json({ data: await betaaldLos(req.params.id, betaald) })
}))

export default router
