import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import * as nacalc from '../services/nacalculatie'
import { snapshotBijCalculatie } from '../services/prijs-snapshot'

const router = Router()

router.get('/project/:projectId', asyncHandler(async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } })
  if (!project) throw new AppError(404, 'NOT_FOUND', 'Project niet gevonden')
  res.json({ data: await nacalc.voorProject(prisma, req.params.projectId) })
}))

router.get('/order/:orderId', asyncHandler(async (req, res) => {
  const n = await nacalc.voorOrder(prisma, req.params.orderId)
  if (!n) throw new AppError(404, 'NOT_FOUND', 'Order heeft geen artikel of geen calculatie')
  res.json({ data: n })
}))

router.get('/artikel/:artikelId', asyncHandler(async (req, res) => {
  const artikel = await prisma.article.findUnique({ where: { id: req.params.artikelId } })
  if (!artikel) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')
  res.json({ data: await nacalc.voorArtikel(prisma, req.params.artikelId) })
}))

/**
 * Samenvatting voor de artikelenlijst: één regel per artikel dat gemeten is.
 *
 * In één query in plaats van per artikel, want de lijst toont ze allemaal
 * tegelijk en n+1 queries over de hele artikelenlijst is merkbaar traag.
 */
router.get('/artikelen', asyncHandler(async (_req, res) => {
  const orders = await prisma.productieOrder.findMany({
    where: { artikelId: { not: null } },
    select: { id: true, artikelId: true },
  })
  const perArtikel = new Map<string, string[]>()
  for (const o of orders) {
    if (!o.artikelId) continue
    const lijst = perArtikel.get(o.artikelId) ?? []
    lijst.push(o.id)
    perArtikel.set(o.artikelId, lijst)
  }

  const samenvatting: {
    artikelId: string; aantalOrders: number; gemetenOrders: number
    verschilPct: number | null; laatsteMeting: string | null
  }[] = []

  for (const [artikelId, orderIds] of perArtikel) {
    const n = await nacalc.voorArtikel(prisma, artikelId)
    const laatste = await prisma.tijdRegistratie.findFirst({
      where: { artikelId, status: 'afgerond' },
      orderBy: { gestoptOp: 'desc' },
      select: { gestoptOp: true },
    })
    samenvatting.push({
      artikelId,
      aantalOrders: orderIds.length,
      gemetenOrders: n.gemetenOrders,
      verschilPct: n.verschilPct,
      laatsteMeting: laatste?.gestoptOp ? laatste.gestoptOp.toISOString() : null,
    })
  }
  res.json({ data: samenvatting })
}))

/**
 * De norm bijstellen naar wat gemeten is.
 *
 * Raakt de calculatie van het artikel zelf, dus werkt door in elke volgende
 * offerte. De prijssnapshot erachteraan zorgt dat de bijstelling ook als punt in
 * het prijsverloop van het artikel verschijnt — anders zie je later wel dat de
 * kostprijs sprong maar niet waarom.
 */
const StelNormBijSchema = z.object({
  instelMin:      z.number().nonnegative().optional(),
  cycleMinPerStuk: z.number().nonnegative().optional(),
}).refine(
  (v) => v.instelMin != null || v.cycleMinPerStuk != null,
  { message: 'Geef minstens één norm op om bij te stellen' },
)

router.post('/artikel/:artikelId/norm', asyncHandler(async (req, res) => {
  const body = StelNormBijSchema.parse(req.body)
  const artikelId = req.params.artikelId

  const data = await prisma.$transaction(async (db) => {
    const artikel = await db.article.findUnique({ where: { id: artikelId } })
    if (!artikel) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')
    if (!artikel.estimate) {
      throw new AppError(409, 'CONFLICT', 'Dit artikel heeft nog geen calculatie')
    }
    await nacalc.stelNormBij(db, artikelId, body)

    // Opnieuw lezen: de snapshot moet de bijgestelde calculatie meten, niet die
    // van voor de wijziging.
    const bijgewerkt = await db.article.findUnique({ where: { id: artikelId } })
    if (bijgewerkt) {
      await snapshotBijCalculatie(
        db, artikelId,
        { recipe: bijgewerkt.recipe, estimate: bijgewerkt.estimate },
        req.user.name,
      )
    }
    return nacalc.voorArtikel(db, artikelId)
  })

  res.json({ data })
}))

export default router
