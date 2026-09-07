import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { MAIL_IMPORT_STATUSES, MAIL_INTENTS } from '@stockmanager/shared'
import { looksLikeMsg } from '../services/msg-parse'
import { ingestMsgBuffer, mailImportDir, serializeMailImport } from '../services/mail-import'

const router = Router()

// In geheugen, niet naar schijf: het .msg wordt hier ontleed en daarna zijn
// alleen de losse bijlagen nog interessant om te bewaren. 50 MB is ruim — een
// mail met een paar tekeningen en een step-bestand past er makkelijk in.
const msgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
})

router.post(
  '/',
  msgUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'VALIDATION', 'Geen bestand ontvangen')
    // Chrome geeft geen MIME-type bij een mail die uit Outlook gesleept is
    // (gemeten, zie features/60-mail-import.md §2.1), dus de inhoud beslist.
    if (!looksLikeMsg(req.file.buffer)) {
      throw new AppError(400, 'VALIDATION', 'Dit is geen Outlook-bericht (.msg)')
    }

    let result
    try {
      result = await ingestMsgBuffer(prisma, req.file.buffer)
    } catch (err) {
      throw new AppError(422, 'PARSE_FAILED', `Bericht kon niet gelezen worden: ${(err as Error).message}`)
    }

    // 200 bij een duplicaat: er is niets nieuws gemaakt, en de client kan de
    // gebruiker naar de bestaande import sturen.
    res.status(result.duplicate ? 200 : 201).json({ data: result })
  })
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, relatieId, projectId } = req.query as Record<string, string | undefined>
    const rows = await prisma.mailImport.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(relatieId ? { relatieId } : {}),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    res.json({ data: rows.map(serializeMailImport) })
  })
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')
    res.json({ data: serializeMailImport(row) })
  })
)

const UpdateMailImportSchema = z.object({
  relatieId: z.string().nullable().optional(),
  intent: z.enum(MAIL_INTENTS).optional(),
  status: z.enum(MAIL_IMPORT_STATUSES).optional(),
  projectId: z.string().nullable().optional(),
})

// Het reviewscherm corrigeert hier de suggesties: de juiste relatie, het juiste
// intent, en uiteindelijk 'verwerkt' of 'genegeerd'.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateMailImportSchema.parse(req.body)
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')

    const row = await prisma.mailImport.update({ where: { id: req.params.id }, data: body })
    res.json({ data: serializeMailImport(row) })
  })
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')
    if (existing.projectId) {
      throw new AppError(
        409,
        'IN_USE',
        'Deze mail hoort bij een project. Verwijder eerst het project of zet de import op genegeerd.'
      )
    }

    await prisma.mailImport.delete({ where: { id: req.params.id } })
    // Bijlagen weg met de import mee — ze horen bij niets anders.
    fs.rm(mailImportDir(req.params.id), { recursive: true, force: true }, () => {
      res.json({ data: { ok: true } })
    })
  })
)

export default router
