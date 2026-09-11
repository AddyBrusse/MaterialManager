// Wat ligt er, wat ligt vast, wat is er vrij.
//
// Drie getallen per staaf, zoals elk voorraadsysteem het doet:
//
//   fysiek        wat er werkelijk ligt (`raw_materials.current_stock`, in mm)
//   gereserveerd  wat vastligt voor werk dat nog moet gebeuren
//   vrij          fysiek − gereserveerd
//
// Een reservering raakt de fysieke voorraad **niet**. Pas bij het afboeken —
// als er echt gezaagd is — gaat er lengte af, en dan vervalt de reservering in
// dezelfde transactie. Dat is het hele punt van dit bestand: zolang die twee
// dingen los van elkaar gebeuren kan een staaf dubbel geraakt worden (korter
// én nog steeds gereserveerd) of helemaal niet.
//
// Deze module is de enige plek waar "gereserveerd" gedefinieerd wordt. Eerder
// rekende elk scherm het zelf uit en waren ze het oneens: de voorraadpagina
// telde afgeronde reserveringen niet mee, de zaagcalculator wel.
import type { Prisma } from '@prisma/client'

type Db = Prisma.TransactionClient

/** Een reservering legt alleen vast zolang hij nog moet gebeuren. Afgeboekt of
 *  geannuleerd houdt niets meer vast. */
export const OPEN_STATUSSEN = ['open', 'in_progress'] as const

export interface Beschikbaarheid {
  fysiekMm: number
  gereserveerdMm: number
  vrijMm: number
}

/** Gereserveerde mm per staaf. Geeft alleen staven terug waar iets op ligt. */
export async function gereserveerdPerStaaf(
  db: Db, barIds?: string[],
): Promise<Map<string, number>> {
  const rijen = await db.zaagReservering.groupBy({
    by: ['barId'],
    where: {
      status: { in: [...OPEN_STATUSSEN] },
      ...(barIds ? { barId: { in: barIds } } : {}),
    },
    _sum: { sawLength: true },
  })
  return new Map(rijen.map((r) => [r.barId, Number(r._sum.sawLength ?? 0)]))
}

/**
 * Beschikbaarheid van één staaf.
 *
 * `negeerReservering` laat één reservering buiten beschouwing — nodig bij het
 * wijzigen van een bestaande reservering, die anders tegen zichzelf zou
 * botsen.
 */
export async function beschikbaarheidVan(
  db: Db, barId: string, negeerReservering?: string,
): Promise<Beschikbaarheid | null> {
  const staaf = await db.rawMaterial.findUnique({
    where: { id: barId }, select: { currentStock: true },
  })
  if (!staaf) return null

  const vast = await db.zaagReservering.aggregate({
    where: {
      barId,
      status: { in: [...OPEN_STATUSSEN] },
      ...(negeerReservering ? { id: { not: negeerReservering } } : {}),
    },
    _sum: { sawLength: true },
  })

  const fysiekMm = Number(staaf.currentStock)
  const gereserveerdMm = Number(vast._sum.sawLength ?? 0)
  return { fysiekMm, gereserveerdMm, vrijMm: fysiekMm - gereserveerdMm }
}

/** "1.200 mm" — voor foutmeldingen die een monteur moet kunnen lezen. */
export function mm(v: number): string {
  return `${Math.round(v).toLocaleString('nl-NL')} mm`
}
