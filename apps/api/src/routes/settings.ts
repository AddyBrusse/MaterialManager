import { Router } from 'express'
import { prisma } from '../db/client'
import { UpdateCompanySchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/company',
  asyncHandler(async (_req, res) => {
    let company = await prisma.company.findUnique({ where: { id: 'default' } })
    if (!company) {
      company = await prisma.company.create({ data: { id: 'default', naam: '' } })
    }
    res.json({ data: company })
  }),
)

router.put(
  '/company',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateCompanySchema.parse(req.body)
    const company = await prisma.company.upsert({
      where: { id: 'default' },
      update: body,
      create: { id: 'default', ...body },
    })
    res.json({ data: company })
  }),
)

export default router
