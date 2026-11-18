import type { Prisma } from '@prisma/client'
import type { ArtikelMutatie, ArtikelVoorraad } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

type Db = typeof prisma | Prisma.TransactionClient

/**
 * De voorraad van een artikel (2026-11-18), in twee getallen:
 *
 * - **vrij**: `articles.current_stock`. Wat er ligt en aan niemand vastzit; een
 *   losse factuur haalt het eraf, een retour-credit en een telling zetten het
 *   bij. Elke wijziging komt in `artikel_mutaties`, met de stand erna.
 * - **klaar voor orders**: gereedgemeld op een productieorder en nog niet op een
 *   verstuurde pakbon. Ligt er wel, maar is van die order. Afgeleid, nooit
 *   opgeslagen: gereedmelden en leveren hebben zo elk hun eigen wegen
 *   (terminal, kantoor, ongedaan maken in de planning), en een opgeslagen
 *   getal zou bij één vergeten weg uit de pas lopen.
 *
 * Zo boekt alles één keer: een orderstuk gaat van "klaar" af bij de pakbon, een
 * voorraadstuk van "vrij" af bij de losse factuur. De picklist is papier.
 */

/** Gemaakt zoals de projectvoortgang het telt: een gereedgemelde order zonder aantal telt voor zijn volle hoeveelheid. */
const gemaakt = (o: { aantalGereed: number; status: string; qty: number }) =>
  o.aantalGereed > 0 ? o.aantalGereed : o.status === 'gereed' ? o.qty : 0

export async function klaarVoorOrders(db: Db, artikelIds?: string[]): Promise<Map<string, number>> {
  const orders = await db.productieOrder.findMany({
    where: {
      artikelId: artikelIds ? { in: artikelIds } : { not: null },
      project: { status: { not: 'geannuleerd' } },
    },
    select: { id: true, artikelId: true, aantalGereed: true, status: true, qty: true },
  })
  const klaar = orders.filter((o) => gemaakt(o) > 0)
  if (klaar.length === 0) return new Map()
  const geleverd = await db.paklijstRegel.groupBy({
    by: ['productieOrderId'],
    where: { productieOrderId: { in: klaar.map((o) => o.id) }, paklijst: { verzondenOp: { not: null } } },
    _sum: { qty: true },
  })
  const weg = new Map(geleverd.map((g) => [g.productieOrderId, g._sum.qty ?? 0]))
  const uit = new Map<string, number>()
  for (const o of klaar) {
    const n = Math.max(0, gemaakt(o) - (weg.get(o.id) ?? 0))
    if (n > 0) uit.set(o.artikelId!, (uit.get(o.artikelId!) ?? 0) + n)
  }
  return uit
}

function naarMutatie(m: Prisma.ArtikelMutatieGetPayload<object>): ArtikelMutatie {
  return {
    id: m.id, artikelId: m.artikelId, aantal: m.aantal, soort: m.soort as ArtikelMutatie['soort'],
    factuurId: m.factuurId, reden: m.reden, stand: m.stand, door: m.door, createdAt: m.createdAt.toISOString(),
  }
}

export async function voorraadVan(db: Db, artikelId: string): Promise<ArtikelVoorraad> {
  const a = await db.article.findUnique({ where: { id: artikelId }, select: { currentStock: true } })
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Dit artikel bestaat niet (meer). Ververs de pagina.')
  const [klaar, mutaties] = await Promise.all([
    klaarVoorOrders(db, [artikelId]),
    db.artikelMutatie.findMany({ where: { artikelId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])
  return { vrij: Number(a.currentStock), klaarVoorOrders: klaar.get(artikelId) ?? 0, mutaties: mutaties.map(naarMutatie) }
}

/** De vrije voorraad bij- of afboeken, met de stand erna in het logboek. */
export async function muteer(
  tx: Prisma.TransactionClient,
  m: { artikelId: string; aantal: number; soort: ArtikelMutatie['soort']; factuurId?: string | null; reden?: string | null; door: string },
): Promise<void> {
  if (m.aantal === 0) return
  const a = await tx.article.update({
    where: { id: m.artikelId },
    data: { currentStock: { increment: m.aantal } },
    select: { currentStock: true },
  })
  await tx.artikelMutatie.create({
    data: {
      artikelId: m.artikelId, aantal: m.aantal, soort: m.soort, factuurId: m.factuurId ?? null,
      reden: m.reden ?? null, stand: Number(a.currentStock), door: m.door,
    },
  })
}

/** Tellen: de stand wordt wat er geteld is, het verschil gaat in het logboek. */
export async function tel(artikelId: string, stand: number, reden: string, door: string): Promise<ArtikelVoorraad> {
  await prisma.$transaction(async (tx) => {
    const a = await tx.article.findUnique({ where: { id: artikelId }, select: { currentStock: true } })
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Dit artikel bestaat niet (meer). Ververs de pagina.')
    const verschil = stand - Number(a.currentStock)
    if (verschil === 0) {
      // Ook een telling zonder verschil is een feit: dan weet je wanneer het klopte.
      await tx.artikelMutatie.create({ data: { artikelId, aantal: 0, soort: 'hand', reden, stand, door } })
      return
    }
    await muteer(tx, { artikelId, aantal: verschil, soort: 'hand', reden, door })
  })
  return voorraadVan(prisma, artikelId)
}
