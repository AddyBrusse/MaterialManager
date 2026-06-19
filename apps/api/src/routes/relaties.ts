import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateRelatieSchema, UpdateRelatieSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'

const router = Router()

function serializeRelatie(r: { createdAt: Date; contacten: unknown; [key: string]: unknown }) {
  return { ...r, createdAt: r.createdAt.toISOString(), contacten: r.contacten ?? [] }
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const relaties = await prisma.relatie.findMany({ orderBy: { naam: 'asc' } })
    res.json({ data: relaties.map(serializeRelatie) })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const relatie = await prisma.relatie.findUniqueOrThrow({ where: { id: req.params.id } })
    res.json({ data: serializeRelatie(relatie) })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateRelatieSchema.parse(req.body)
    const relatie = await prisma.relatie.create({
      data: {
        ...body,
        contacten: (body.contacten ?? []) as object[],
      },
    })
    res.status(201).json({ data: serializeRelatie(relatie) })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateRelatieSchema.parse(req.body)
    const relatie = await prisma.relatie.update({
      where: { id: req.params.id },
      data: {
        ...body,
        ...(body.contacten !== undefined ? { contacten: body.contacten as object[] } : {}),
      },
    })
    res.json({ data: serializeRelatie(relatie) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.relatie.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

export default router
