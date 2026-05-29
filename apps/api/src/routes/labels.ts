import { Router } from 'express'
import { prisma } from '../db/client'
import { ConsumeLabelSchema } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'
import { reserveLabelBatch } from '../services/label'

const router = Router()

router.post(
  '/print',
  asyncHandler(async (req, res) => {
    const numbers = await reserveLabelBatch(req.user.id)
    const labels = await prisma.label.findMany({ where: { number: { in: numbers } } })
    res.status(201).json({ data: labels })
  })
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = req.query as { status?: string }
    const labels = await prisma.label.findMany({
      where: status ? { status: status as 'printed_unused' | 'consumed' | 'voided' } : {},
      orderBy: { number: 'asc' },
    })
    res.json({ data: labels })
  })
)

router.post(
  '/:number/consume',
  asyncHandler(async (req, res) => {
    const body = ConsumeLabelSchema.parse(req.body)
    const label = await prisma.label.findUnique({ where: { number: req.params.number } })
    if (!label) throw new AppError(404, 'NOT_FOUND', 'Label niet gevonden')
    if (label.status !== 'printed_unused') {
      throw new AppError(409, 'LABEL_TAKEN', 'Label is al gebruikt of ongeldig verklaard')
    }
    const updated = await prisma.label.update({
      where: { number: req.params.number },
      data: {
        status: 'consumed',
        consumedAt: new Date(),
        consumedRawMaterialId: body.rawMaterialId,
      },
    })
    res.json({ data: updated })
  })
)

export default router
