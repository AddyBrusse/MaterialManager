import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateProfileSchema, UpdateProfileSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const profiles = await prisma.profile.findMany({ orderBy: { name: 'asc' } })
    res.json({ data: profiles })
  })
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateProfileSchema.parse(req.body)
    const profile = await prisma.profile.create({ data: body })
    res.status(201).json({ data: profile })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateProfileSchema.parse(req.body)
    const profile = await prisma.profile.update({ where: { id: req.params.id }, data: body })
    res.json({ data: profile })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.profile.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
