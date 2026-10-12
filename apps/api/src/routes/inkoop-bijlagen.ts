import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { z } from 'zod'
import { prisma } from '../db/client'
import { config } from '../config'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { sanitizeFilename } from '../lib/filenames'
import { bijlageUit } from '../services/inkoop-bijlagen'

const router = Router()

/** Pdf, afbeelding of een opgeslagen mail — wat een leverancier zoal stuurt. */
const TOEGESTAAN = /^(application\/pdf|image\/(png|jpeg|gif|webp)|message\/rfc822|application\/vnd\.ms-outlook|application\/octet-stream)$/
const MAP = path.join(config.uploadsDir, 'inkoop')

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(MAP, { recursive: true }); cb(null, MAP) },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!TOEGESTAAN.test(file.mimetype)) cb(new AppError(400, 'VALIDATION', `Dit soort bestand kan hier niet bij (${file.mimetype}). Gebruik een pdf, afbeelding of opgeslagen mail.`))
    else cb(null, true)
  },
})

const Doel = z.object({
  prijsaanvraagId: z.string().optional(),
  leverancierId: z.string().optional(),
  bestelRegelId: z.string().optional(),
  inkooporderId: z.string().optional(),
})

/**
 * Een document van de leverancier toevoegen (2026-10-09). Precies één doel:
 * een aanvraag + leverancier (zijn offerte, geldt voor alle regels van die
 * aanvraag), een bestelregel, of een inkooporder.
 */
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const weg = () => { if (req.file) fs.rm(req.file.path, { force: true }, () => {}) }
    try {
      if (!req.file) throw new AppError(400, 'VALIDATION', 'Geen bestand ontvangen')
      const d = Doel.parse(req.body)
      const doelen = [d.prijsaanvraagId && d.leverancierId, d.bestelRegelId, d.inkooporderId].filter(Boolean).length
      if (doelen !== 1) throw new AppError(400, 'VALIDATION', 'Zeg waar het document bij hoort: een aanvraag met leverancier, een bestelregel of een inkooporder')
      if (d.prijsaanvraagId) {
        const lev = await prisma.prijsaanvraagLeverancier.findUnique({
          where: { prijsaanvraagId_leverancierId: { prijsaanvraagId: d.prijsaanvraagId, leverancierId: d.leverancierId! } },
        })
        if (!lev) throw new AppError(404, 'NOT_FOUND', `Deze leverancier staat niet op ${d.prijsaanvraagId}`)
      }
      if (d.bestelRegelId && !(await prisma.bestelRegel.findUnique({ where: { id: d.bestelRegelId }, select: { id: true } }))) {
        throw new AppError(404, 'NOT_FOUND', 'Deze bestelregel bestaat niet (meer). Ververs de pagina.')
      }
      if (d.inkooporderId && !(await prisma.inkooporder.findUnique({ where: { id: d.inkooporderId }, select: { id: true } }))) {
        throw new AppError(404, 'NOT_FOUND', `Inkooporder ${d.inkooporderId} bestaat niet`)
      }
      const rij = await prisma.inkoopBijlage.create({
        data: {
          naam: req.file.originalname, pad: `/uploads/inkoop/${req.file.filename}`, grootte: req.file.size, mime: req.file.mimetype,
          prijsaanvraagId: d.prijsaanvraagId ?? null, leverancierId: d.prijsaanvraagId ? d.leverancierId! : null,
          bestelRegelId: d.bestelRegelId ?? null, inkooporderId: d.inkooporderId ?? null, geuploadDoor: req.user.name,
        },
      })
      res.status(201).json({ data: bijlageUit(rij) })
    } catch (e) {
      weg()
      throw e
    }
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const rij = await prisma.inkoopBijlage.findUnique({ where: { id: req.params.id } })
    if (!rij) throw new AppError(404, 'NOT_FOUND', 'Dit document is al weg')
    await prisma.inkoopBijlage.delete({ where: { id: rij.id } })
    // Het bestand pas na de database: liever een los bestand op schijf dan een regel die naar niets wijst.
    fs.rm(path.join(MAP, path.basename(rij.pad)), { force: true }, () => {})
    res.json({ data: { ok: true } })
  }),
)

export default router
