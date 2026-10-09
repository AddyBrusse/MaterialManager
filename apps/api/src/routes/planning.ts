import { Router } from 'express'
import { HerberekenInvoerSchema, OngedaanInvoerSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { prisma } from '../db/client'
import * as plan from '../services/planning-herberekening'

/**
 * Automatisch plannen (2026-10-08). Het scherm rekent; hier wordt het in één
 * keer vastgelegd, en in één keer teruggezet. Zie services/planning-herberekening.ts.
 */
const router = Router()

router.get('/herberekeningen', asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
  res.json({ data: await plan.lijst(prisma, limit) })
}))

router.post('/herberekeningen', asyncHandler(async (req, res) => {
  const invoer = HerberekenInvoerSchema.parse(req.body)
  const r = await prisma.$transaction((db) => plan.pasToe(db, invoer, req.user.name), { timeout: 30000 })
  res.status(201).json({ data: r })
}))

/** Wat ongedaan maken nu zou tegenhouden — de melding toont het vóór de klik. */
router.get('/herberekeningen/:id/blokkades', asyncHandler(async (req, res) => {
  res.json({ data: await plan.bekijkBlokkades(prisma, req.params.id) })
}))

router.post('/herberekeningen/:id/ongedaan', asyncHandler(async (req, res) => {
  const { wis } = OngedaanInvoerSchema.parse(req.body ?? {})
  const r = await prisma.$transaction((db) => plan.maakOngedaan(db, req.params.id, wis, req.user), { timeout: 30000 })
  res.json({ data: r })
}))

export default router
