import { Router } from 'express'
import { prisma } from '../db/client'
import { CreateTodoSchema, UpdateTodoSchema, SetCalendarEventSchema } from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

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
    await prisma.todo.delete({ where: { id: req.params.id } })
    res.status(204).end()
  })
)

export default router
