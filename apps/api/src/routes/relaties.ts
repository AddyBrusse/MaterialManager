import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateRelatieSchema, UpdateRelatieSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

const router = Router()

function serializeRelatie(r: { createdAt: Date; contacten: unknown; francoBedrag?: unknown; [key: string]: unknown }) {
  return {
    ...r, createdAt: r.createdAt.toISOString(), contacten: r.contacten ?? [],
    francoBedrag: r.francoBedrag == null ? null : Number(r.francoBedrag),
  }
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
    // Een losse factuur draagt de klant zelf (2026-11-18); zonder relatie heeft
    // hij geen naam en adres meer, en een factuur moet te herleiden blijven.
    const facturen = await prisma.factuur.count({ where: { relatieId: req.params.id } })
    if (facturen > 0) {
      throw new AppError(409, 'VOORWAARDE',
        `Deze klant heeft ${facturen === 1 ? 'een losse factuur' : `${facturen} losse facturen`} (pagina Facturen). `
        + 'Een factuur moet bij zijn klant blijven; verwijderen kan daarom niet.')
    }
    await prisma.relatie.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

export default router
