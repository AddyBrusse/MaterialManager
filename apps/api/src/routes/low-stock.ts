import { Router } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [rawItems, finishedItems] = await Promise.all([
      prisma.rawMaterial.findMany({
        where: { minStock: { not: null } },
      }),
      prisma.finishedGood.findMany({
        where: { minStock: { not: null } },
      }),
    ])

    const lowRaw = rawItems.filter((r) => r.minStock && r.currentStock < r.minStock)
    const lowFinished = finishedItems.filter((f) => f.minStock && f.currentStock < f.minStock)

    res.json({
      data: {
        count: lowRaw.length + lowFinished.length,
        raw: lowRaw,
        finished: lowFinished,
      },
    })
  })
)

export default router
