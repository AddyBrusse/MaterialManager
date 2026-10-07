import { Router } from 'express'
import { z } from 'zod'
import {
  BestelRegelInvoerSchema, BestelRegelWijzigSchema, KeuzeInvoerSchema, BESTEL_STATUSSEN,
  waaromNietBestelRegelWijzigen, waaromNietBestelRegelVerwijderen, waaromNietKiezen,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { leesRegel, leesRegels, vergelijkData, kies } from '../services/bestellingen'
import { geschiedenis } from '../services/inkoop-geschiedenis'

/** Bestelregels (2026-10-06): wat er besteld moet worden. Zie services/bestellingen.ts. */
const router = Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = z.enum(BESTEL_STATUSSEN).optional().parse(req.query.status || undefined)
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined
    res.json({ data: await leesRegels(prisma, { ...(status ? { status } : {}), ...(projectId ? { projectId } : {}) }) })
  }),
)

/** Alles voor de vergelijking: `?ids=a,b,c`. */
router.get(
  '/vergelijk',
  asyncHandler(async (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) throw new AppError(400, 'VALIDATION', 'Kies eerst één of meer regels om te vergelijken.')
    res.json({ data: await vergelijkData(prisma, ids) })
  }),
)

router.get('/:id/geschiedenis', asyncHandler(async (req, res) => { res.json({ data: await geschiedenis(req.params.id) }) }))

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = BestelRegelInvoerSchema.parse(req.body)
    // Alleen een exoot draagt zijn eigen regel uit de materiaallijst mee: een
    // gewone bestelling gaat over een maat, niet over een staaf die er al ligt.
    const m = body.rawMaterialId
      ? await prisma.rawMaterial.findUnique({ where: { id: body.rawMaterialId }, select: { exoot: true } })
      : null
    const r = await prisma.bestelRegel.create({
      data: {
        bron: body.bron, gradeId: body.gradeId, profileId: body.profileId, dimensions: body.dimensions,
        lengteMm: body.lengteMm, stuks: body.stuks, rawMaterialId: m?.exoot ? body.rawMaterialId : null,
        projectId: body.projectId ?? null, notitie: body.notitie ?? null, toegevoegdDoor: req.user.name,
      },
    })
    res.status(201).json({ data: await leesRegel(prisma, r.id) })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = BestelRegelWijzigSchema.parse(req.body)
    const r = await leesRegel(prisma, req.params.id)
    const maatOfAantal = body.lengteMm !== undefined || body.stuks !== undefined
    const reden = maatOfAantal ? waaromNietBestelRegelWijzigen(r) : null
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    // Andere maat of aantal: de gekozen prijs gold voor de oude, dus die vervalt.
    const keuzeWeg = maatOfAantal && (body.lengteMm !== r.lengteMm || body.stuks !== r.stuks)
    await prisma.bestelRegel.update({
      where: { id: r.id },
      data: {
        ...body,
        ...(keuzeWeg ? { keuzeLeverancierId: null, keuzeBron: null, keuzeAntwoordId: null, keuzeTotaal: null, keuzeUitleg: null, keuzeLevertijdDagen: null, keuzeOp: null, keuzeDoor: null } : {}),
      },
    })
    res.json({ data: await leesRegel(prisma, r.id) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await leesRegel(prisma, req.params.id)
    const reden = waaromNietBestelRegelVerwijderen(r)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    if (await prisma.inkooporderRegel.count({ where: { bestelRegelId: r.id } })) {
      throw new AppError(409, 'VOORWAARDE', `${r.materiaal} stond op een ingetrokken inkooporder; die geschiedenis blijft bewaard, dus de regel kan niet weg.`)
    }
    await prisma.bestelRegel.delete({ where: { id: r.id } })
    res.json({ data: { id: r.id } })
  }),
)

router.put(
  '/:id/keuze',
  asyncHandler(async (req, res) => {
    const body = KeuzeInvoerSchema.parse(req.body)
    res.json({ data: await kies(req.params.id, body, req.user.name) })
  }),
)

router.delete(
  '/:id/keuze',
  asyncHandler(async (req, res) => {
    const r = await leesRegel(prisma, req.params.id)
    // Een keuze wissen mag tot de regel op een inkooporder staat.
    if (r.status === 'besteld' || r.status === 'ontvangen') throw new AppError(409, 'VOORWAARDE', waaromNietKiezen(r, { soort: 'geen' })!)
    await prisma.bestelRegel.update({
      where: { id: r.id },
      data: { keuzeLeverancierId: null, keuzeBron: null, keuzeAntwoordId: null, keuzeTotaal: null, keuzeUitleg: null, keuzeLevertijdDagen: null, keuzeOp: null, keuzeDoor: null },
    })
    res.json({ data: await leesRegel(prisma, r.id) })
  }),
)

export default router
