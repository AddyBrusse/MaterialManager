import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateLocationSchema, UpdateLocationSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

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

export default router
