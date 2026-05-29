import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateFinishedGoodSchema, UpdateFinishedGoodSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

const include = { locationSlot: { include: { location: true } } }

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.finishedGood.findMany({ include, orderBy: { artNo: 'asc' } })
    res.json({ data: items })
  })
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.finishedGood.findUnique({ where: { id: req.params.id }, include })
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')
    res.json({ data: item })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateFinishedGoodSchema.parse(req.body)
    const item = await prisma.finishedGood.create({ data: body, include })
    res.status(201).json({ data: item })
  })
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const lock = await prisma.lock.findUnique({
      where: { itemType_itemId: { itemType: 'finished', itemId: req.params.id } },
    })
    if (!lock || lock.userId !== req.user.id) {
      throw new AppError(409, 'LOCK_NOT_HELD', 'Je hebt geen vergrendeling op dit artikel')
    }
    const body = UpdateFinishedGoodSchema.parse(req.body)
    const item = await prisma.finishedGood.update({
      where: { id: req.params.id },
      data: body,
      include,
    })
    res.json({ data: item })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.finishedGood.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
