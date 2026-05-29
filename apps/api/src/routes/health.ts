import { Router } from 'express'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ data: { status: 'ok', dbConnected: true } })
  })
)

export default router
