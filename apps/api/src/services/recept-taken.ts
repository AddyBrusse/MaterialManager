import type { Prisma } from '@prisma/client'
import { kostprijsVoor } from '@stockmanager/shared'
import { bronnenLaden, calcArtikel } from './prijs-snapshot'

type Db = Prisma.TransactionClient

/**
 * De taak "Recept maken" (2026-10-28) gaat vanzelf dicht zodra de calculatie
 * van het artikel een kostprijs geeft. Niet bij elke wijziging: een recept met
 * alleen een naam of een lege machineknoop is nog geen recept — de offerte zou
 * er nog steeds € 0 van maken.
 *
 * Eén keer dicht blijft dicht. Wie later de calculatie leegmaakt, ziet dat aan
 * de prijs en de waarschuwing bij Versturen, niet aan een taak die terugkomt.
 */
export async function sluitReceptTaken(
  db: Db,
  artikel: { id: string; recipe: unknown; estimate: unknown },
): Promise<number> {
  const open = await db.todo.count({ where: { soort: 'recept_maken', artikelId: artikel.id, done: false } })
  if (open === 0) return 0
  if (kostprijsVoor(calcArtikel(artikel), await bronnenLaden(db), 1) <= 0) return 0
  const { count } = await db.todo.updateMany({
    where: { soort: 'recept_maken', artikelId: artikel.id, done: false },
    data: { done: true, completedAt: new Date() },
  })
  return count
}
