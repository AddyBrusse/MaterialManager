import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import {
  StartTijdSchema, StopTijdSchema, WisselTijdSchema, CorrigeerTijdSchema,
} from '@stockmanager/shared'
import * as tijd from '../services/tijdregistratie'

const router = Router()

/**
 * Wat loopt er nu — de vraag die de wachtrij en de terminal elke paar seconden
 * stellen. Lopend én gepauzeerd, want een klok op pauze is werk dat nog open staat.
 */
router.get('/lopend', asyncHandler(async (_req, res) => {
  res.json({ data: await tijd.lopend(prisma) })
}))

/** De registraties van één dag, voor het scherm Tijdregistratie. */
router.get('/dag', asyncHandler(async (req, res) => {
  const datum = typeof req.query.datum === 'string' ? req.query.datum : null
  const dag = datum ? new Date(`${datum}T00:00:00`) : new Date()
  if (Number.isNaN(dag.getTime())) throw new AppError(400, 'VALIDATION', 'Ongeldige datum')
  const begin = new Date(dag); begin.setHours(0, 0, 0, 0)
  const eind = new Date(begin); eind.setDate(eind.getDate() + 1)

  const rijen = await prisma.tijdRegistratie.findMany({
    where: { gestartOp: { gte: begin, lt: eind } },
    orderBy: { gestartOp: 'desc' },
  })
  res.json({ data: rijen.map(tijd.serialize) })
}))

/** Alle registraties van één stap — de geschiedenis onder de klok. */
router.get('/stap/:stapId', asyncHandler(async (req, res) => {
  const rijen = await prisma.tijdRegistratie.findMany({
    where: { stapId: req.params.stapId },
    orderBy: { gestartOp: 'asc' },
  })
  res.json({ data: rijen.map(tijd.serialize) })
}))

/** Alle registraties van één order — wat de nacalculatie eronder laat zien. */
router.get('/order/:orderId', asyncHandler(async (req, res) => {
  const rijen = await prisma.tijdRegistratie.findMany({
    where: { orderId: req.params.orderId },
    orderBy: { gestartOp: 'asc' },
  })
  res.json({ data: rijen.map(tijd.serialize) })
}))

router.post('/start', asyncHandler(async (req, res) => {
  const body = StartTijdSchema.parse(req.body)
  const rij = await prisma.$transaction((db) => tijd.start(db, body, req.user))
  res.status(201).json({ data: rij })
}))

router.post('/:id/pauze', asyncHandler(async (req, res) => {
  res.json({ data: await prisma.$transaction((db) => tijd.pauzeer(db, req.params.id)) })
}))

router.post('/:id/hervat', asyncHandler(async (req, res) => {
  res.json({ data: await prisma.$transaction((db) => tijd.hervat(db, req.params.id)) })
}))

/**
 * Wisselen van instellen naar draaien, of van bemand naar onbemand. Sluit de
 * lopende regel af en begint een nieuwe — die twee horen in de nacalculatie in
 * verschillende posten.
 */
router.post('/:id/wissel', asyncHandler(async (req, res) => {
  const body = WisselTijdSchema.parse(req.body)
  res.json({ data: await prisma.$transaction((db) => tijd.wissel(db, req.params.id, body, req.user)) })
}))

router.post('/:id/stop', asyncHandler(async (req, res) => {
  const body = StopTijdSchema.parse(req.body)
  res.json({
    data: await prisma.$transaction((db) => tijd.stop(db, req.params.id, body.aantalStuks, body.notitie)),
  })
}))

/**
 * Corrigeren. De gemeten waarde blijft staan naast de correctie — dat verschil
 * is zelf een signaal, en een reden is verplicht.
 */
router.post('/:id/corrigeer', asyncHandler(async (req, res) => {
  const body = CorrigeerTijdSchema.parse(req.body)
  res.json({ data: await prisma.$transaction((db) => tijd.corrigeer(db, req.params.id, body, req.user)) })
}))

/** Verwijderen mag alleen zolang er niets mee gerekend is. */
const VerwijderSchema = z.object({ reden: z.string().min(3, 'Geef een reden op') })
router.delete('/:id', asyncHandler(async (req, res) => {
  VerwijderSchema.parse(req.body ?? {})
  const r = await prisma.tijdRegistratie.findUnique({ where: { id: req.params.id } })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Tijdregistratie niet gevonden')
  await prisma.tijdRegistratie.delete({ where: { id: req.params.id } })
  res.status(204).end()
}))

export default router
