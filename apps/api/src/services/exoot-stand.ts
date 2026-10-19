import type { Prisma } from '@prisma/client'
import { exootStand, type ExootStand } from '@stockmanager/shared'

type Db = Prisma.TransactionClient

/**
 * De stand van elk exootstuk (2026-10-16): binnen, nog niet binnen of verbruikt.
 *
 * Een stuk op 0 is verbruikt als het ooit voorraad had: dan staat er een
 * voorraadmutatie met een nieuwe stand boven 0. Dat dekt het binnen boeken
 * (`services/ontvangst.ts`) én een mutatie met de hand. Alleen stukken op 0
 * hoeven opgezocht te worden.
 */
export async function exootStandPerStuk(
  db: Db, items: { id: string; exoot: boolean; currentStock: unknown }[],
): Promise<Map<string, ExootStand>> {
  const exoten = items.filter((i) => i.exoot)
  const opNul = exoten.filter((i) => Number(i.currentStock) <= 0).map((i) => i.id)
  const ooit = new Set(opNul.length === 0 ? [] : (await db.stockMovement.findMany({
    where: { itemType: 'raw', itemId: { in: opNul }, newStock: { gt: 0 } },
    select: { itemId: true },
    distinct: ['itemId'],
  })).map((m) => m.itemId))
  return new Map(exoten.map((i) => [i.id, exootStand(Number(i.currentStock), ooit.has(i.id))]))
}
