import { Router } from 'express'
import { prisma } from '../db/client'
import { AcquireLockSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

const IDLE_MS = 5 * 60 * 1000

function isIdle(lastHeartbeat: Date): boolean {
  return Date.now() - lastHeartbeat.getTime() > IDLE_MS
}

router.get(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const { itemType } = req.query as { itemType?: string }
    if (!itemType || (itemType !== 'raw' && itemType !== 'finished')) {
      throw new AppError(400, 'VALIDATION', 'itemType query param vereist (raw|finished)')
    }
    const lock = await prisma.lock.findUnique({
      where: { itemType_itemId: { itemType, itemId: req.params.itemId } },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!lock) return res.json({ data: null })
    res.json({
      data: {
        userId: lock.userId,
        userName: lock.user.name,
        acquiredAt: lock.acquiredAt,
        lastHeartbeat: lock.lastHeartbeat,
        isIdle: isIdle(lock.lastHeartbeat),
      },
    })
  })
)

router.post(
  '/:itemId/acquire',
  asyncHandler(async (req, res) => {
    const { itemType } = AcquireLockSchema.parse(req.body)
    const existing = await prisma.lock.findUnique({
      where: { itemType_itemId: { itemType, itemId: req.params.itemId } },
      include: { user: { select: { id: true, name: true } } },
    })

    if (existing) {
      if (existing.userId === req.user.id) {
        await prisma.lock.update({
          where: { itemType_itemId: { itemType, itemId: req.params.itemId } },
          data: { lastHeartbeat: new Date() },
        })
        return res.json({ data: { acquired: true } })
      }
      throw new AppError(
        409,
        'LOCK_HELD',
        `Item wordt bewerkt door ${existing.user.name}`
      )
    }

    await prisma.lock.create({
      data: {
        itemType,
        itemId: req.params.itemId,
        userId: req.user.id,
        acquiredAt: new Date(),
        lastHeartbeat: new Date(),
      },
    })
    res.status(201).json({ data: { acquired: true } })
  })
)

router.post(
  '/:itemId/heartbeat',
  asyncHandler(async (req, res) => {
    const { itemType } = AcquireLockSchema.parse(req.body)
    const lock = await prisma.lock.findUnique({
      where: { itemType_itemId: { itemType, itemId: req.params.itemId } },
    })
    if (!lock || lock.userId !== req.user.id) {
      throw new AppError(409, 'LOCK_NOT_HELD', 'Je hebt geen vergrendeling op dit item')
    }
    await prisma.lock.update({
      where: { itemType_itemId: { itemType, itemId: req.params.itemId } },
      data: { lastHeartbeat: new Date() },
    })
    res.json({ data: { ok: true } })
  })
)

router.post(
  '/:itemId/release',
  asyncHandler(async (req, res) => {
    const { itemType } = AcquireLockSchema.parse(req.body)
    await prisma.lock.deleteMany({
      where: { itemType, itemId: req.params.itemId, userId: req.user.id },
    })
    res.status(204).end()
  })
)

router.post(
  '/:itemId/force-release',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { itemType } = AcquireLockSchema.parse(req.body)
    await prisma.lock.deleteMany({ where: { itemType, itemId: req.params.itemId } })
    res.status(204).end()
  })
)

router.post(
  '/:itemId/request',
  asyncHandler(async (req, res) => {
    const { itemType } = AcquireLockSchema.parse(req.body)
    await prisma.lockRequest.create({
      data: {
        itemType,
        itemId: req.params.itemId,
        requestedById: req.user.id,
      },
    })
    res.status(201).json({ data: { ok: true } })
  })
)

export default router
