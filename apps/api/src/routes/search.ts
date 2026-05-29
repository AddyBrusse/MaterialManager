import { Router } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { calcWeightKg } from '../services/weight'

const router = Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q = '', type, gradeId, locationSlotId } = req.query as Record<string, string>

    const results: unknown[] = []

    if (!type || type === 'raw') {
      const raws = await prisma.rawMaterial.findMany({
        where: {
          ...(q ? { code: { contains: q, mode: 'insensitive' } } : {}),
          ...(gradeId ? { gradeId } : {}),
          ...(locationSlotId ? { locationSlotId } : {}),
        },
        include: {
          grade: true,
          profile: true,
          locationSlot: { include: { location: true } },
        },
        take: 50,
      })
      results.push(
        ...raws.map((r) => ({
          kind: 'raw',
          ...r,
          weightKg: calcWeightKg(
            r.profile.volumeFormula,
            r.dimensions as Record<string, number>,
            r.lengthMm.toNumber(),
            r.grade.densityKgM3.toNumber()
          ),
        }))
      )
    }

    if (!type || type === 'finished') {
      const finished = await prisma.finishedGood.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { artNo: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(locationSlotId ? { locationSlotId } : {}),
        },
        include: { locationSlot: { include: { location: true } } },
        take: 50,
      })
      results.push(...finished.map((f) => ({ kind: 'finished', ...f })))
    }

    res.json({ data: results })
  })
)

export default router
