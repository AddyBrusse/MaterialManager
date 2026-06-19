import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateMachineSchema, UpdateMachineSchema } from '@stockmanager/shared'
import { requireAdmin } from '../middleware/require-admin'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const machines = await prisma.machine.findMany({ orderBy: { name: 'asc' } })
    const data = machines.map(m => ({
      ...m,
      machineRatePerHour: Number(m.machineRatePerHour),
      operatorRatePerHour: Number(m.operatorRatePerHour),
      createdAt: m.createdAt.toISOString(),
    }))
    res.json({ data })
  }),
)

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateMachineSchema.parse(req.body)
    const machine = await prisma.machine.create({ data: body })
    res.status(201).json({
      data: {
        ...machine,
        machineRatePerHour: Number(machine.machineRatePerHour),
        operatorRatePerHour: Number(machine.operatorRatePerHour),
        createdAt: machine.createdAt.toISOString(),
      },
    })
  }),
)

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpdateMachineSchema.parse(req.body)
    const machine = await prisma.machine.update({ where: { id: req.params.id }, data: body })
    res.json({
      data: {
        ...machine,
        machineRatePerHour: Number(machine.machineRatePerHour),
        operatorRatePerHour: Number(machine.operatorRatePerHour),
        createdAt: machine.createdAt.toISOString(),
      },
    })
  }),
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.machine.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

export default router
