import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

const router = Router()

const CreateArticleSchema = z.object({
  id: z.string().optional(),
  naam: z.string().min(1, 'Naam is verplicht'),
  klant: z.string().nullable().optional(),
  relatieId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  tekening: z.string().nullable().optional(),
  rev: z.string().nullable().optional(),
  drawingPath: z.string().nullable().optional(),
  photoPath: z.string().nullable().optional(),
  recipe: z.unknown().optional(),
  operations: z.unknown().optional(),
  notes: z.unknown().optional(),
  attachments: z.unknown().optional(),
  estimate: z.unknown().optional(),
  locatie: z.string().nullable().optional(),
  currentStock: z.number().optional(),
  minStock: z.number().nullable().optional(),
  maxStock: z.number().nullable().optional(),
})

const UpdateArticleSchema = CreateArticleSchema.omit({ id: true }).partial()

function toNumber(v: unknown): number { return typeof v === 'string' ? parseFloat(v) : (v as number) }

function serializeArticle(a: {
  createdAt: Date; updatedAt: Date; currentStock: unknown; minStock: unknown; maxStock: unknown;
  [key: string]: unknown
}) {
  return {
    ...a,
    currentStock: toNumber(a.currentStock),
    minStock: a.minStock != null ? toNumber(a.minStock) : null,
    maxStock: a.maxStock != null ? toNumber(a.maxStock) : null,
    createdAt: (a.createdAt as Date).toISOString(),
    updatedAt: (a.updatedAt as Date).toISOString(),
  }
}

async function nextArtNo(): Promise<string> {
  const result = await prisma.$queryRaw<{ last_n: number }[]>`
    INSERT INTO doc_sequences (prefix, last_n) VALUES ('ART', 1)
    ON CONFLICT (prefix) DO UPDATE SET last_n = doc_sequences.last_n + 1
    RETURNING last_n
  `
  const n = result[0].last_n
  return `ART-${String(n).padStart(4, '0')}`
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const articles = await prisma.article.findMany({ orderBy: { naam: 'asc' } })
    res.json({ data: articles.map(serializeArticle) })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const article = await prisma.article.findUnique({ where: { id: req.params.id } })
    if (!article) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')
    res.json({ data: serializeArticle(article) })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateArticleSchema.parse(req.body)
    const id = body.id ?? await nextArtNo()
    const article = await prisma.article.create({
      data: {
        id,
        naam: body.naam,
        klant: body.klant ?? null,
        relatieId: body.relatieId ?? null,
        contactId: body.contactId ?? null,
        tekening: body.tekening ?? null,
        rev: body.rev ?? null,
        drawingPath: body.drawingPath ?? null,
        photoPath: body.photoPath ?? null,
        recipe: body.recipe as object ?? null,
        operations: (body.operations as object[]) ?? [],
        notes: (body.notes as object) ?? { workholding: '', general: '' },
        attachments: (body.attachments as object[]) ?? [],
        estimate: body.estimate as object ?? null,
        locatie: body.locatie ?? null,
        currentStock: body.currentStock ?? 0,
        minStock: body.minStock ?? null,
        maxStock: body.maxStock ?? null,
      },
    })
    res.status(201).json({ data: serializeArticle(article) })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateArticleSchema.parse(req.body)
    const existing = await prisma.article.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')
    const article = await prisma.article.update({
      where: { id: req.params.id },
      data: {
        ...body,
        recipe: body.recipe !== undefined ? (body.recipe as object ?? null) : undefined,
        operations: body.operations !== undefined ? (body.operations as object[]) : undefined,
        notes: body.notes !== undefined ? (body.notes as object) : undefined,
        attachments: body.attachments !== undefined ? (body.attachments as object[]) : undefined,
        estimate: body.estimate !== undefined ? (body.estimate as object ?? null) : undefined,
      },
    })
    res.json({ data: serializeArticle(article) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.article.delete({ where: { id: req.params.id } })
    res.status(204).end()
  }),
)

export default router
