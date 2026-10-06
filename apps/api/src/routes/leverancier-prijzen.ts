import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { LeverancierPrijsInvoerSchema, waaromNietLeverancierPrijs, type LeverancierPrijs } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'

const router = Router()

type Rij = Prisma.LeverancierPrijsGetPayload<{ include: { leverancier: { select: { naam: true } } } }>
const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d))

function naarPrijs(r: Rij): LeverancierPrijs {
  return {
    id: r.id, leverancierId: r.leverancierId, leverancierNaam: r.leverancier.naam,
    rawMaterialId: r.rawMaterialId, gradeId: r.gradeId,
    prijsSoort: r.prijsSoort as LeverancierPrijs['prijsSoort'],
    prijs: Number(r.prijs), zaagkostenPerSnede: num(r.zaagkostenPerSnede), minimumBedrag: num(r.minimumBedrag),
    levertijdDagen: r.levertijdDagen, notitie: r.notitie, bijgewerktDoor: r.bijgewerktDoor,
    updatedAt: r.updatedAt.toISOString(),
  }
}
const include = { leverancier: { select: { naam: true } } } as const

/** Prijzen per leverancier (2026-10-06). Filter op materiaal, kwaliteit of leverancier. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rawMaterialId, gradeId, leverancierId } = req.query as Record<string, string | undefined>
    const rijen = await prisma.leverancierPrijs.findMany({
      where: {
        ...(leverancierId ? { leverancierId } : {}),
        // Bij een materiaal ook de prijzen van zijn kwaliteit: die gelden ook.
        ...(rawMaterialId || gradeId
          ? { OR: [...(rawMaterialId ? [{ rawMaterialId }] : []), ...(gradeId ? [{ gradeId }] : [])] }
          : {}),
      },
      include,
      orderBy: [{ updatedAt: 'desc' }],
    })
    res.json({ data: rijen.map(naarPrijs) })
  }),
)

async function controleer(body: ReturnType<typeof LeverancierPrijsInvoerSchema.parse>) {
  const reden = waaromNietLeverancierPrijs(body)
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
  const lev = await prisma.relatie.findUnique({ where: { id: body.leverancierId }, select: { type: true, naam: true } })
  if (!lev) throw new AppError(404, 'NOT_FOUND', 'Deze leverancier bestaat niet (meer). Ververs de pagina.')
  if (lev.type !== 'leverancier' && lev.type !== 'beide') {
    throw new AppError(409, 'VOORWAARDE', `${lev.naam} is geen leverancier. Zet het type van de relatie op leverancier, of kies een andere.`)
  }
}

const data = (body: ReturnType<typeof LeverancierPrijsInvoerSchema.parse>, door: string) => ({
  leverancierId: body.leverancierId,
  rawMaterialId: body.rawMaterialId ?? null,
  gradeId: body.gradeId ?? null,
  prijsSoort: body.prijsSoort,
  prijs: body.prijs,
  zaagkostenPerSnede: body.zaagkostenPerSnede ?? null,
  minimumBedrag: body.minimumBedrag ?? null,
  levertijdDagen: body.levertijdDagen ?? null,
  notitie: body.notitie?.trim() || null,
  bijgewerktDoor: door,
})

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = LeverancierPrijsInvoerSchema.parse(req.body)
    await controleer(body)
    const r = await prisma.leverancierPrijs.create({ data: data(body, req.user?.name ?? 'onbekend'), include })
    res.status(201).json({ data: naarPrijs(r) })
  }),
)

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = LeverancierPrijsInvoerSchema.parse(req.body)
    await controleer(body)
    const r = await prisma.leverancierPrijs
      .update({ where: { id: req.params.id }, data: data(body, req.user?.name ?? 'onbekend'), include })
      .catch(() => { throw new AppError(404, 'NOT_FOUND', 'Deze prijs bestaat niet (meer). Ververs de pagina.') })
    res.json({ data: naarPrijs(r) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.leverancierPrijs.delete({ where: { id: req.params.id } }).catch(() => {
      throw new AppError(404, 'NOT_FOUND', 'Deze prijs bestaat niet (meer). Ververs de pagina.')
    })
    res.status(204).end()
  }),
)

export default router
