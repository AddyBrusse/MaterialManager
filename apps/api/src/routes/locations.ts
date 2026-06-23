import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { CreateLocationSchema, UpdateLocationSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

const router = Router()

const CreateSlotBodySchema = z.object({
  level1: z.string().min(1, 'Level1 is verplicht'),
  level2: z.string().nullable().optional(),
})

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const locations = await prisma.location.findMany({
      orderBy: { label: 'asc' },
      include: { slots: true },
    })
    res.json({ data: locations })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateLocationSchema.parse(req.body)
    const location = await prisma.location.create({ data: body, include: { slots: true } })
    res.status(201).json({ data: location })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateLocationSchema.parse(req.body)
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: body,
      include: { slots: true },
    })
    res.json({ data: location })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.location.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

router.post(
  '/:id/slots',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateSlotBodySchema.parse(req.body)
    const location = await prisma.location.findUnique({ where: { id: req.params.id } })
    if (!location) throw new AppError(404, 'NOT_FOUND', 'Locatie niet gevonden')
    const slot = await prisma.locationSlot.create({
      data: { locationId: req.params.id, level1: body.level1, level2: body.level2 ?? null },
    })
    res.status(201).json({ data: slot })
  })
)

router.delete(
  '/:id/slots/:slotId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.locationSlot.delete({ where: { id: req.params.slotId } })
    res.status(204).end()
  })
)

export default router
