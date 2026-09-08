import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { prisma } from '../db/client'
import { config } from '../config'
import { sanitizeFilename } from '../lib/filenames'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { MAIL_IMPORT_STATUSES, MAIL_INTENTS } from '@stockmanager/shared'
import { looksLikeMsg } from '../services/msg-parse'
import {
  buffersUitMap, buildCandidates, ingestMsgBuffer, mailImportDir, mailUitRij,
  rematchCandidates, serializeMailImport,
} from '../services/mail-import'
import { buildRapport, scoreLine } from '../services/certainty'
import { normalizeRef } from '../services/match-articles'
import type { CandidateLine, ExtractieRapport, MailAttachment } from '@stockmanager/shared'

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
  contactId: z.string().nullable().optional(),
  intent: z.enum(MAIL_INTENTS).optional(),
  status: z.enum(MAIL_IMPORT_STATUSES).optional(),
  projectId: z.string().nullable().optional(),
})

/**
 * Het rapport bijwerken na een correctie, met behoud van wat er bij het
 * inlezen gebeurde: welk model meelas en of dat toen misging.
 */
function hertelRapport(bestaand: unknown, kandidaten: CandidateLine[]) {
  const oud = (bestaand ?? null) as ExtractieRapport | null
  return buildRapport(kandidaten, {
    aiGebruikt: oud?.aiGebruikt ?? false,
    model: oud?.model ?? null,
    foutmelding: oud?.foutmelding ?? null,
    documentGebruikt: oud?.documentGebruikt ?? null,
    gescandeBijlagen: oud?.gescandeBijlagen ?? [],
  })
}

// Het reviewscherm corrigeert hier de suggesties: de juiste relatie, het juiste
// intent, en uiteindelijk 'verwerkt' of 'genegeerd'.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateMailImportSchema.parse(req.body)
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')

    // Een andere relatie betekent andere geleerde koppelingen, dus opnieuw
    // matchen — anders blijven regels op 'nieuw' staan die deze klant allang
    // een keer heeft laten koppelen.
    const relatieChanged = body.relatieId !== undefined && body.relatieId !== existing.relatieId
    const kandidaten = relatieChanged
      ? await rematchCandidates(prisma, (existing.kandidaten ?? []) as CandidateLine[], body.relatieId ?? null)
      : null

    const row = await prisma.mailImport.update({
      where: { id: req.params.id },
      data: {
        ...body,
        ...(kandidaten
          ? {
              kandidaten: kandidaten as unknown as object,
              extractie: hertelRapport(existing.extractie, kandidaten) as unknown as object,
            }
          : {}),
      },
    })
    res.json({ data: serializeMailImport(row) })
  })
)

const SetLineArticleSchema = z.object({
  artikelId: z.string().nullable(),
})

/**
 * Een regel aan een artikel koppelen — of die koppeling weer losmaken.
 *
 * Dit is waar de matcher van leert (§4): een correctie op een regel mét
 * klantnummer wordt bewaard als ArticleAlias, zodat dezelfde klant met
 * hetzelfde nummer de volgende keer meteen goed staat.
 */
router.patch(
  '/:id/regels/:lineId',
  asyncHandler(async (req, res) => {
    const { artikelId } = SetLineArticleSchema.parse(req.body)
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')

    const kandidaten = (existing.kandidaten ?? []) as CandidateLine[]
    const line = kandidaten.find((k) => k.id === req.params.lineId)
    if (!line) throw new AppError(404, 'NOT_FOUND', 'Regel niet gevonden')

    if (artikelId) {
      const article = await prisma.article.findUnique({ where: { id: artikelId } })
      if (!article) throw new AppError(400, 'VALIDATION', 'Artikel bestaat niet')
    }

    const updated = kandidaten.map((k) =>
      k.id === req.params.lineId
        ? // Een handmatige koppeling verandert de zekerheid van deze regel, dus
          // die wordt meteen opnieuw bepaald.
          scoreLine({
            ...k,
            artikelId,
            status: artikelId ? ('match' as const) : ('nieuw' as const),
            // Vastleggen dát een mens dit koos — een herberekening laat het dan staan.
            handmatig: artikelId !== null,
          })
        : k
    )

    // Alleen leren van een échte keuze: een klantnummer, een relatie, en een
    // koppeling die de matcher niet zelf al had gevonden.
    const externalRef = line.tekening?.trim()
    if (artikelId && externalRef && existing.relatieId && normalizeRef(externalRef)) {
      await prisma.articleAlias.upsert({
        where: { relatieId_externalRef: { relatieId: existing.relatieId, externalRef } },
        update: { articleId: artikelId, createdBy: req.user.name },
        create: { relatieId: existing.relatieId, externalRef, articleId: artikelId, createdBy: req.user.name },
      })
    }

    const row = await prisma.mailImport.update({
      where: { id: req.params.id },
      data: {
        kandidaten: updated as unknown as object,
        extractie: hertelRapport(existing.extractie, updated) as unknown as object,
      },
    })
    res.json({ data: serializeMailImport(row) })
  })
)

/**
 * De mail opnieuw laten uitlezen.
 *
 * Nodig zodra de extractie beter is geworden, of als een eerdere poging niets
 * opleverde: de mail zelf opnieuw slepen helpt dan niet, want die wordt op zijn
 * bericht-id herkend en teruggegeven zoals hij was. Dit gooit de vorige
 * uitkomst weg — handmatige koppelingen inbegrepen — en leest opnieuw.
 *
 * Kost een nieuwe aanroep van het model, dus alleen op verzoek.
 */
router.post(
  '/:id/opnieuw',
  asyncHandler(async (req, res) => {
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')
    if (existing.projectId) {
      throw new AppError(
        409,
        'IN_USE',
        'Deze mail is al aan een project gekoppeld. Maak die koppeling eerst ongedaan.'
      )
    }

    const bijlagen = (existing.bijlagen ?? []) as MailAttachment[]
    const { kandidaten, rapport, klantRef, leverdatum } = await buildCandidates(
      prisma,
      mailUitRij(existing),
      existing.relatieId,
      buffersUitMap(existing.id, bijlagen)
    )

    const row = await prisma.mailImport.update({
      where: { id: req.params.id },
      data: {
        kandidaten: kandidaten as unknown as object,
        extractie: rapport as unknown as object,
        klantRef,
        leverdatum: leverdatum ? new Date(leverdatum) : null,
        // Een genegeerde of mislukte import komt hiermee weer in behandeling.
        status: 'nieuw',
      },
    })
    res.json({ data: serializeMailImport(row) })
  })
)

const CopyFilesSchema = z.object({
  artikelId: z.string().regex(/^[A-Za-z0-9_-]+$/, 'Ongeldig artikel-id'),
  bestanden: z.array(z.string()).min(1),
})

/**
 * Tekeningen uit een mail naar de bijlagenmap van een artikel kopiëren.
 *
 * Server-side kopiëren, niet via de browser: een STEP-assembly is zo tientallen
 * megabytes, en die eerst downloaden om hem meteen weer te uploaden is zonde van
 * de tijd én van het netwerk op de werkvloer. De bestanden blijven ook in de
 * mailmap staan — die map is het bewijsstuk van wat de klant stuurde.
 *
 * Geeft de bijlage-metadata terug in de vorm die `Article.attachments` verwacht;
 * de client zet die op het artikel.
 */
router.post(
  '/:id/bestanden-naar-artikel',
  asyncHandler(async (req, res) => {
    const body = CopyFilesSchema.parse(req.body)
    const existing = await prisma.mailImport.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')

    const bijlagen = (existing.bijlagen ?? []) as MailAttachment[]
    const bronMap = mailImportDir(existing.id)
    const doelMap = path.join(config.uploadsDir, 'attachments', body.artikelId)
    fs.mkdirSync(doelMap, { recursive: true })

    const gekopieerd: { name: string; path: string; sizeBytes: number; kind: string }[] = []
    for (const naam of body.bestanden) {
      const bijlage = bijlagen.find((b) => b.filename === naam)
      if (!bijlage?.path) continue
      const bron = path.join(bronMap, path.basename(bijlage.path))
      if (!fs.existsSync(bron)) continue

      const doelNaam = `${Date.now()}-${sanitizeFilename(naam)}`
      fs.copyFileSync(bron, path.join(doelMap, doelNaam))
      gekopieerd.push({
        name: naam,
        path: `/uploads/attachments/${body.artikelId}/${doelNaam}`,
        sizeBytes: fs.statSync(bron).size,
        // Een tekening is een tekening, of hij nu als pdf of als model komt —
        // de preview kiest zelf welke hij laat zien.
        kind: 'drawing',
      })
    }

    res.json({ data: gekopieerd })
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
