import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateGradeSchema, UpdateGradeSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

function serialize(g: { densityKgM3: { toNumber: () => number }; pricePerKg: { toNumber: () => number } | null; [key: string]: unknown }) {
  return {
    ...g,
    densityKgM3: g.densityKgM3.toNumber(),
    pricePerKg: g.pricePerKg != null ? g.pricePerKg.toNumber() : null,
  }
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const grades = await prisma.grade.findMany({ orderBy: { name: 'asc' } })
    res.json({ data: grades.map(serialize) })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateGradeSchema.parse(req.body)
    const grade = await prisma.grade.create({ data: body })
    res.status(201).json({ data: serialize(grade) })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateGradeSchema.parse(req.body)
    const grade = await prisma.grade.update({ where: { id: req.params.id }, data: body })
    res.json({ data: serialize(grade) })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.grade.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
