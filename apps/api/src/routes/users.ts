import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateUserSchema, UpdateUserSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../middleware/error'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })
    res.json({ data: users })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateUserSchema.parse(req.body)
    const user = await prisma.user.create({ data: body })
    res.status(201).json({ data: user })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateUserSchema.parse(req.body)
    const user = await prisma.user.update({ where: { id: req.params.id }, data: body })
    res.json({ data: user })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw new AppError(400, 'VALIDATION', 'Je kunt jezelf niet verwijderen')
    }
    await prisma.user.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
