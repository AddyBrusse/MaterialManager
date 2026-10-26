import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateMovementSchema } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'
import { eisRuimteVoorMutatie } from '../services/voorraad'

const router = Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { itemId } = req.query as Record<string, string>
    const movements = await prisma.stockMovement.findMany({
      where: itemId ? { itemId } : {},
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    res.json({ data: movements })
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateMovementSchema.parse(req.body)

    const movement = await prisma.$transaction(async (tx) => {
      const item = await tx.rawMaterial.findUnique({ where: { id: body.itemId } })
      if (!item) throw new AppError(404, 'NOT_FOUND', 'Materiaal niet gevonden')
      const previousStock = Number(item.currentStock)
      const newStock =
        body.kind === 'delta' ? previousStock + body.amount : body.amount
      // Niet onder wat er vastligt: eerst afboeken of annuleren (2026-10-19).
      await eisRuimteVoorMutatie(tx, item.id, previousStock, newStock)
      await tx.rawMaterial.update({
        where: { id: body.itemId },
        data: { currentStock: newStock },
      })

      return tx.stockMovement.create({
        data: {
          itemType: body.itemType,
          itemId: body.itemId,
          userId: req.user.id,
          kind: body.kind,
          amount: body.amount,
          previousStock,
          newStock,
          reason: body.reason,
          note: body.note,
        },
        include: { user: { select: { id: true, name: true } } },
      })
    })

    res.status(201).json({ data: movement })
  })
)

export default router
