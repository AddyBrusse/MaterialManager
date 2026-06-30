import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

const router = Router()

const CreateReservationSchema = z.object({
  calculatieNr: z.string(),
  barId: z.string(),
  barCode: z.string(),
  barLocation: z.string(),
  barVorm: z.string(),
  pieces: z.number().int().positive(),
  productLen: z.number(),
  sawLength: z.number(),
  fysiekeLengte: z.number(),
  materiaal: z.string(),
  diameter: z.number(),
  werkstukLengte: z.number(),
  steekbreedte: z.number(),
  vlakToeslag: z.number(),
  machine: z.string(),
})

function toNum(v: unknown): number { return typeof v === 'string' ? parseFloat(v) : (v as number) }

function serialize(r: {
  id: string; calculatieNr: string; barId: string; barCode: string; barLocation: string; barVorm: string
  pieces: number; productLen: unknown; sawLength: unknown; fysiekeLengte: unknown; materiaal: string
  diameter: unknown; werkstukLengte: unknown; steekbreedte: unknown; vlakToeslag: unknown; machine: string
  priority: number | null; rush: boolean; status: string; restLengteMm: unknown; completedAt: Date | null; createdAt: Date
}) {
  return {
    id: r.id,
    calculatieNr: r.calculatieNr,
    barId: r.barId,
    barCode: r.barCode,
    barLocation: r.barLocation,
    barVorm: r.barVorm,
    pieces: r.pieces,
    productLen: toNum(r.productLen),
    sawLength: toNum(r.sawLength),
    fysiekeLengte: toNum(r.fysiekeLengte),
    materiaal: r.materiaal,
    diameter: toNum(r.diameter),
    werkstukLengte: toNum(r.werkstukLengte),
    steekbreedte: toNum(r.steekbreedte),
    vlakToeslag: toNum(r.vlakToeslag),
    machine: r.machine,
    priority: r.priority,
    rush: r.rush,
    status: r.status,
    restLengteMm: r.restLengteMm != null ? toNum(r.restLengteMm) : null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.zaagReservering.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ data: rows.map(serialize) })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const items = z.array(CreateReservationSchema).parse(req.body)
    const created = await prisma.$transaction(
      items.map((item, i) =>
        prisma.zaagReservering.create({
          data: {
            id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            ...item,
          },
        }),
      ),
    )
    res.status(201).json({ data: created.map(serialize) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.zaagReservering.delete({ where: { id: req.params.id } }).catch(() => {
      throw new AppError(404, 'NOT_FOUND', 'Reservering niet gevonden')
    })
    res.status(204).end()
  }),
)

const PrioritySchema = z.object({ priority: z.number().int().nullable() })

router.patch(
  '/:id/priority',
  asyncHandler(async (req, res) => {
    const { priority } = PrioritySchema.parse(req.body)
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { priority },
    })
    res.json({ data: serialize(row) })
  }),
)

const PlanSchema = z.object({
  jobs: z.array(z.object({ ids: z.array(z.string()), rush: z.boolean() })),
})

router.post(
  '/plan',
  asyncHandler(async (req, res) => {
    const { jobs } = PlanSchema.parse(req.body)
    await prisma.$transaction(
      jobs.flatMap((job, i) =>
        job.ids.map(id =>
          prisma.zaagReservering.update({
            where: { id },
            data: { priority: i + 1, rush: job.rush },
          }),
        ),
      ),
    )
    const rows = await prisma.zaagReservering.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ data: rows.map(serialize) })
  }),
)

const StatusSchema = z.object({ status: z.enum(['open', 'in_progress', 'done']) })

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = StatusSchema.parse(req.body)
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { status },
    })
    res.json({ data: serialize(row) })
  }),
)

const CompleteSchema = z.object({ restLengteMm: z.number().nullable() })

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const { restLengteMm } = CompleteSchema.parse(req.body)
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { status: 'done', restLengteMm, completedAt: new Date() },
    })
    res.json({ data: serialize(row) })
  }),
)

export default router
