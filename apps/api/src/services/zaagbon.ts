// Een zaagbon afboeken: het moment waarop het materiaal echt verbruikt is.
//
// Twee ingangen, één handeling. De Zaagflow boekt af met een gemeten rest; het
// gereedmelden van een order boekt de bonnen af die dan nog openstaan, met een
// uitgerekende rest (besloten 2026-10-01). Zonder dat tweede bleef materiaal na
// het werk gereserveerd staan en rekende de nacalculatie met de calculatie in
// plaats van met wat er van de staaf af ging.
import type { Prisma, ZaagReservering } from '@prisma/client'
import type { Project } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { OPEN_STATUSSEN } from './voorraad'

type Db = Prisma.TransactionClient

/** Een rest hieronder is geen bruikbaar stuk staal meer. Ook in de zaagflow
 *  gebruikt om de zager naar een keuze te duwen. */
export const MIN_REST_MM = 100

export interface AfboekInvoer {
  /** De rest ná het zagen, in mm. Leeg = niets over. */
  restLengteMm: number | null
  /** Als onbruikbaar bestempeld: de staaf gaat naar 0. */
  schroot?: boolean
  note?: string
}

/**
 * Drie dingen horen bij elkaar en gebeuren daarom in de transactie van de
 * aanroeper:
 *   1. de staaf wordt korter (of gaat naar 0 bij schroot),
 *   2. er komt een voorraadmutatie met reden `used` of `scrapped`,
 *   3. de reservering gaat naar `done` en laat het materiaal los.
 */
export async function boekZaagbonAf(
  db: Db, reservering: ZaagReservering, invoer: AfboekInvoer, userId: string,
) {
  if (reservering.status === 'done') {
    throw new AppError(409, 'AL_AFGEBOEKT', 'Deze reservering is al afgeboekt')
  }
  if (reservering.status === 'geannuleerd') {
    throw new AppError(409, 'GEANNULEERD', 'Deze reservering is geannuleerd en kan niet afgeboekt worden')
  }

  const staaf = await db.rawMaterial.findUnique({ where: { id: reservering.barId } })
  if (!staaf) throw new AppError(404, 'NOT_FOUND', 'De staaf van deze reservering bestaat niet meer')

  const gemeten = invoer.restLengteMm ?? 0
  const vorigeVoorraad = Number(staaf.currentStock)
  // Bij het kiezen al besloten dat de rest weg mag (2026-10-09): `sawLength`
  // is dan de hele vrije lengte. Wat een ander project op deze staaf heeft
  // liggen blijft staan.
  const restWeg = reservering.restAfboeken
  // Een rest onder de drempel is geen staaf meer, ook zonder dat iemand
  // 'schroot' aanvinkt: hij ligt straks in de bak en niet in het rek.
  const schroot = restWeg || invoer.schroot === true || gemeten < MIN_REST_MM
  const nieuweVoorraad = restWeg
    ? Math.max(0, vorigeVoorraad - Number(reservering.sawLength))
    : schroot ? 0 : gemeten

  await db.rawMaterial.update({
    where: { id: staaf.id },
    data: { currentStock: nieuweVoorraad },
  })

  const mutatie = await db.stockMovement.create({
    data: {
      itemType: 'raw',
      itemId: staaf.id,
      userId,
      kind: 'overwrite',
      amount: nieuweVoorraad,
      previousStock: vorigeVoorraad,
      newStock: nieuweVoorraad,
      reason: schroot ? 'scrapped' : 'used',
      note: (invoer.note ?? `Zaagbon ${reservering.calculatieNr}`) + (restWeg ? ' — rest afgeboekt (bij het kiezen besloten)' : ''),
    },
  })

  const row = await db.zaagReservering.update({
    where: { id: reservering.id },
    data: { status: 'done', restLengteMm: invoer.restLengteMm, completedAt: new Date() },
  })

  return { row, mutatie, schroot, vorigeVoorraad, nieuweVoorraad }
}

/**
 * De zaagbonnen die bij een order horen en nog openstaan.
 *
 * Via de orderregel (`offerteRegelId`). Oudere bonnen hebben die niet en hangen
 * alleen aan project + artikel; die tellen alleen als er precies één order met
 * dat artikel in het project staat. Bij twee is niet te zeggen van welke order
 * de staaf was, en dan liever niet afboeken dan de verkeerde.
 */
export async function openBonnenVanOrder(
  db: Db, p: Project, order: Project['productieOrders'][number],
): Promise<ZaagReservering[]> {
  const enigeMetArtikel =
    order.artikelId !== null &&
    p.productieOrders.filter((o) => o.artikelId === order.artikelId).length === 1
  return db.zaagReservering.findMany({
    where: {
      ...bonnenVanOrderWaar({ ...order, projectId: p.id }, enigeMetArtikel),
      status: { in: [...OPEN_STATUSSEN] },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/** Het filter achter `openBonnenVanOrder`, ook voor de nacalculatie. */
export function bonnenVanOrderWaar(
  order: { projectId: string; offerteRegelId: string; artikelId: string | null },
  enigeMetArtikel: boolean,
): Prisma.ZaagReserveringWhereInput {
  return {
    projectId: order.projectId,
    OR: [
      { offerteRegelId: order.offerteRegelId },
      ...(enigeMetArtikel && order.artikelId ? [{ offerteRegelId: null, artikelId: order.artikelId }] : []),
    ],
  }
}

/**
 * Orders die door deze handeling gereed werden: hun open zaagbonnen afboeken.
 *
 * De rest is de staaf min wat er volgens de bon af ging (`sawLength`). Gemeten is hij niet —
 * daarom staat dat in de voorraadmutatie, en is hij via Voorraad te corrigeren.
 * Liggen er twee bonnen op dezelfde staaf, dan na elkaar: de tweede rekent met
 * wat de eerste overliet.
 *
 * Geeft het aantal afgeboekte bonnen terug.
 */
export async function boekAfBijGereed(
  db: Db, voor: Project, na: Project, userId: string,
): Promise<number> {
  let aantal = 0
  for (const order of na.productieOrders) {
    if (order.status !== 'gereed') continue
    const was = voor.productieOrders.find((o) => o.id === order.id)
    if (was?.status === 'gereed') continue

    for (const bon of await openBonnenVanOrder(db, na, order)) {
      const staaf = await db.rawMaterial.findUnique({ where: { id: bon.barId } })
      if (!staaf) continue
      // Wat er volgens de bon af gaat is `sawLength`; `fysiekeLengte` is de
      // lengte van de staaf bij het reserveren (rekende tot 2026-10-09 hier
      // ten onrechte mee, en dan ging de hele staaf als schroot weg).
      const rest = Math.max(0, Number(staaf.currentStock) - Number(bon.sawLength))
      await boekZaagbonAf(db, bon, {
        restLengteMm: rest,
        note: `Zaagbon ${bon.calculatieNr} — automatisch bij gereedmelden van ${order.artikelNaam}; rest uitgerekend, niet gemeten`,
      }, userId)
      aantal += 1
    }
  }
  return aantal
}

/**
 * Het tegenovergestelde van `boekAfBijGereed`, voor ongedaan maken van de
 * planning (2026-10-08): zet de zaagbonnen van deze order die sinds `sinds`
 * automatisch zijn afgeboekt terug. De staaf krijgt zijn lengte van vóór de
 * afboeking terug — met een eigen mutatie, zodat de voorraadhistorie laat zien
 * wat er gebeurd is in plaats van dat de afboeking verdwijnt — en de bon gaat
 * weer open. Was er daarna nog iets met de staaf gebeurd, dan weigert hij:
 * blind terugzetten zou dat overschrijven.
 */
export async function herstelAfboekingBijGereed(
  db: Db, project: Project, orderId: string, sinds: Date, userId: string,
): Promise<number> {
  const order = project.productieOrders.find((o) => o.id === orderId)
  if (!order) return 0
  const enigeMetArtikel = order.artikelId !== null && project.productieOrders.filter((o) => o.artikelId === order.artikelId).length === 1
  const bonnen = await db.zaagReservering.findMany({
    where: { ...bonnenVanOrderWaar({ ...order, projectId: project.id }, enigeMetArtikel), status: 'done', completedAt: { gte: sinds } },
  })
  const paren = []
  for (const bon of bonnen) {
    const mutatie = await db.stockMovement.findFirst({
      where: { itemId: bon.barId, createdAt: { gte: sinds }, note: { startsWith: `Zaagbon ${bon.calculatieNr} — automatisch bij gereedmelden` } },
      orderBy: { createdAt: 'desc' },
    })
    // Zonder automatische mutatie is hij met de hand afgeboekt (Zaagflow,
    // gemeten rest): dat was een echte meting en blijft staan.
    if (mutatie) paren.push({ bon, mutatie })
  }
  // Nieuwste eerst: liggen er twee bonnen op één staaf, dan rekende de tweede
  // met wat de eerste overliet, en moet hij er dus als eerste af.
  paren.sort((a, b) => b.mutatie.createdAt.getTime() - a.mutatie.createdAt.getTime())
  const eigen = new Set(paren.map((p) => p.mutatie.id))
  for (const { bon, mutatie } of paren) {
    const later = await db.stockMovement.findMany({
      where: { itemId: bon.barId, createdAt: { gt: mutatie.createdAt } }, select: { id: true },
    })
    if (later.some((m) => !eigen.has(m.id))) {
      throw new AppError(409, 'VOORWAARDE',
        `Kan de afboeking van zaagbon ${bon.calculatieNr} niet terugzetten: met staaf ${bon.barCode} is daarna nog iets gebeurd. Zet dat eerst recht in de voorraad.`)
    }
    const staaf = await db.rawMaterial.findUnique({ where: { id: bon.barId } })
    if (!staaf) continue
    const terug = Number(mutatie.previousStock)
    await db.rawMaterial.update({ where: { id: staaf.id }, data: { currentStock: terug } })
    const correctie = await db.stockMovement.create({
      data: {
        itemType: 'raw', itemId: staaf.id, userId, kind: 'overwrite', amount: terug,
        previousStock: Number(staaf.currentStock), newStock: terug, reason: 'correction',
        note: `Zaagbon ${bon.calculatieNr} — afboeking teruggezet (planning ongedaan gemaakt)`,
      },
    })
    eigen.add(correctie.id)
    // Of hij vóór de afboeking 'open' of 'in_progress' stond, is niet bewaard;
    // allebei houden ze het materiaal vast (services/voorraad.ts).
    await db.zaagReservering.update({ where: { id: bon.id }, data: { status: 'open', restLengteMm: null, completedAt: null } })
  }
  return paren.length
}
