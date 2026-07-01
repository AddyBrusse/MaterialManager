import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateRawMaterialSchema, UpdateRawMaterialSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'
import { calcWeightKg } from '../services/weight'

const router = Router()

const include = { grade: true, profile: true, surfaceFinish: true, locationSlot: { include: { location: true } } }

function withWeight(item: {
  profile: { volumeFormula: string }
  dimensions: unknown
  lengthMm: { toNumber: () => number }
  grade: { densityKgM3: { toNumber: () => number } }
}) {
  const weightKg = calcWeightKg(
    item.profile.volumeFormula,
    item.dimensions as Record<string, number>,
    item.lengthMm.toNumber(),
    item.grade.densityKgM3.toNumber()
  )
  return { ...item, weightKg: Math.round(weightKg * 1000) / 1000 }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { gradeId, profileId, locationSlotId } = req.query as Record<string, string>
    const items = await prisma.rawMaterial.findMany({
      where: {
        ...(gradeId ? { gradeId } : {}),
        ...(profileId ? { profileId } : {}),
        ...(locationSlotId ? { locationSlotId } : {}),
      },
      include,
      orderBy: { code: 'asc' },
    })
    res.json({ data: items.map(withWeight) })
  })
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await prisma.rawMaterial.findUnique({ where: { id: req.params.id }, include })
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Materiaal niet gevonden')
    res.json({ data: withWeight(item) })
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateRawMaterialSchema.parse(req.body)
    const item = await prisma.rawMaterial.create({
      data: {
        ...body,
        // A new piece starts fully intact — currentStock = full length.
        // CreateRawMaterialSchema intentionally omits currentStock (it's
        // derived, not user-supplied), so we set it here rather than
        // relying on the Prisma default of 0.
        currentStock: body.lengthMm,
      },
      include,
    })
    res.status(201).json({ data: withWeight(item) })
  })
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const lock = await prisma.lock.findUnique({
      where: { itemType_itemId: { itemType: 'raw', itemId: req.params.id } },
    })
    if (!lock || lock.userId !== req.user.id) {
      throw new AppError(409, 'LOCK_NOT_HELD', 'Je hebt geen vergrendeling op dit item')
    }
    const body = UpdateRawMaterialSchema.parse(req.body)
    const item = await prisma.rawMaterial.update({
      where: { id: req.params.id },
      data: body,
      include,
    })
    res.json({ data: withWeight(item) })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.rawMaterial.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
