import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateSurfaceFinishSchema, UpdateSurfaceFinishSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const surfaceFinishes = await prisma.surfaceFinish.findMany({ orderBy: { name: 'asc' } })
    res.json({ data: surfaceFinishes })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateSurfaceFinishSchema.parse(req.body)
    const surfaceFinish = await prisma.surfaceFinish.create({ data: body })
    res.status(201).json({ data: surfaceFinish })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateSurfaceFinishSchema.parse(req.body)
    const surfaceFinish = await prisma.surfaceFinish.update({ where: { id: req.params.id }, data: body })
    res.json({ data: surfaceFinish })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.surfaceFinish.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
