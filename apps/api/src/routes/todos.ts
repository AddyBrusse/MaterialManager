import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import multer from 'multer'
import { prisma } from '../db/client'
import {
  CreateTodoSchema, UpdateTodoSchema, SetCalendarEventSchema, CreateVerbeterpuntSchema,
  VerbeterpuntContextSchema, waaromNietVerbeterpuntenExporteren,
} from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import {
  MAX_SCHERMAFBEELDING, bewaarSchermafbeelding, verwijderSchermafbeelding, maakExportZip,
} from '../services/verbeterpunten'

const router = Router()

const include = {
  createdBy: { select: { name: true } },
  claimedBy: { select: { name: true } },
}

function serialize(t: any) {
  const { createdBy, claimedBy, ...rest } = t
  return { ...rest, createdByName: createdBy.name, claimedByName: claimedBy?.name ?? null }
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const todos = await prisma.todo.findMany({
      include,
      orderBy: [{ done: 'asc' }, { priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })
    res.json({ data: todos.map(serialize) })
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateTodoSchema.parse(req.body)
    const todo = await prisma.todo.create({
      data: {
        ...body,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdByUserId: req.user.id,
      },
      include,
    })
    res.status(201).json({ data: serialize(todo) })
  })
)

// ── Verbeterpunten (knop "Dit klopt niet", 2026-10-24) ──────────────────────
// Multipart: `gegevens` (JSON volgens CreateVerbeterpuntSchema) en optioneel
// `schermafbeelding`. In het geheugen ontvangen, zodat er pas iets op schijf
// komt als de gegevens kloppen.
const ontvangSchermafbeelding = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SCHERMAFBEELDING, files: 1 },
}).single('schermafbeelding')

function ontvang(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => ontvangSchermafbeelding(req, res, (err: unknown) => {
    if (!err) return resolve()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return reject(new AppError(413, 'PAYLOAD_TOO_LARGE', `De schermafbeelding is groter dan ${MAX_SCHERMAFBEELDING / 1024 / 1024} MB. Er is niets opgeslagen.`))
    }
    reject(err instanceof multer.MulterError ? new AppError(400, 'VALIDATION', `De schermafbeelding kwam niet goed aan (${err.code}). Er is niets opgeslagen.`) : err)
  }))
}

router.post(
  '/verbeterpunt',
  asyncHandler(async (req, res) => {
    await ontvang(req, res)
    let gegevens: unknown
    try {
      gegevens = JSON.parse(String(req.body?.gegevens ?? ''))
    } catch {
      throw new AppError(400, 'VALIDATION', 'De gegevens van het verbeterpunt kwamen onleesbaar aan. Er is niets opgeslagen.')
    }
    const body = CreateVerbeterpuntSchema.parse(gegevens)
    const id = randomUUID()
    const pad = req.file ? bewaarSchermafbeelding(id, req.file.buffer, req.file.mimetype) : null
    try {
      const todo = await prisma.todo.create({
        data: {
          id,
          title: body.zin,
          soort: 'verbeterpunt',
          paginaUrl: body.paginaUrl,
          paginaNaam: body.paginaNaam,
          schermafbeelding: pad,
          // Zonder bestand is er geen schermafbeelding, wat de browser ook zei.
          context: { ...body.context, schermafbeelding: pad ? body.context.schermafbeelding : 'geen' },
          createdByUserId: req.user.id,
        },
        include,
      })
      res.status(201).json({ data: serialize(todo) })
    } catch (e) {
      // Geen todo, dan ook geen los bestand dat nergens bij hoort.
      verwijderSchermafbeelding(pad)
      throw e
    }
  })
)

/** Alle open verbeterpunten als zip: één tekstbestand plus de schermafbeeldingen. */
router.get(
  '/verbeterpunten/export',
  asyncHandler(async (_req, res) => {
    const todos = await prisma.todo.findMany({
      where: { soort: 'verbeterpunt', done: false },
      include,
      orderBy: { createdAt: 'asc' },
    })
    const reden = waaromNietVerbeterpuntenExporteren(todos.length)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    const nu = new Date()
    const zip = maakExportZip(todos.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      createdByName: t.createdBy.name,
      paginaUrl: t.paginaUrl,
      paginaNaam: t.paginaNaam,
      schermafbeelding: t.schermafbeelding,
      // Een rij van vóór een schemawijziging mag de export niet breken.
      context: VerbeterpuntContextSchema.safeParse(t.context).data ?? null,
    })), nu)
    const datum = nu.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="verbeterpunten-${datum}.zip"`)
    res.send(Buffer.from(zip))
  })
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateTodoSchema.parse(req.body)
    const todo = await prisma.todo.update({
      where: { id: req.params.id },
      data: {
        ...body,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
      },
      include,
    })
    res.json({ data: serialize(todo) })
  })
)

router.patch(
  '/:id/claim',
  asyncHandler(async (req, res) => {
    const existing = await prisma.todo.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Taak niet gevonden')
    const isMine = existing.claimedByUserId === req.user.id
    const todo = await prisma.todo.update({
      where: { id: req.params.id },
      data: isMine
        ? { claimedByUserId: null, claimedAt: null }
        : { claimedByUserId: req.user.id, claimedAt: new Date() },
      include,
    })
    res.json({ data: serialize(todo) })
  })
)

router.patch(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const done = Boolean(req.body?.done ?? true)
    const todo = await prisma.todo.update({
      where: { id: req.params.id },
      data: { done, completedAt: done ? new Date() : null },
      include,
    })
    res.json({ data: serialize(todo) })
  })
)

router.patch(
  '/:id/calendar-event',
  asyncHandler(async (req, res) => {
    const body = SetCalendarEventSchema.parse(req.body)
    const todo = await prisma.todo.update({
      where: { id: req.params.id },
      data: { calendarEventId: body.calendarEventId },
      include,
    })
    res.json({ data: serialize(todo) })
  })
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const todo = await prisma.todo.delete({ where: { id: req.params.id } })
    // Na de rij, niet ervoor: mislukt het verwijderen, dan staat de afbeelding
    // er nog bij. Andersom bleef een punt over zonder zijn schermafbeelding.
    verwijderSchermafbeelding(todo.schermafbeelding)
    res.status(204).end()
  })
)

export default router
