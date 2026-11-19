import type { Prisma } from '@prisma/client'
import { waaromNietPrijsafspraak, type Prijsafspraak, type PrijsafspraakInvoer } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

/**
 * Prijsafspraken per artikel (2026-11-18). De regels (staffel, geldigheid,
 * geen overlap) staan in `packages/shared/calc/prijsafspraak.ts`; hier alleen
 * lezen en schrijven, met dezelfde vraag als het scherm.
 */

type Rij = Prisma.PrijsafspraakGetPayload<object>

const naar = (r: Rij): Prijsafspraak => ({
  ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
})

export async function lijst(filter: { artikelId?: string; relatieId?: string }): Promise<Prijsafspraak[]> {
  const rijen = await prisma.prijsafspraak.findMany({
    where: {
      ...(filter.artikelId ? { artikelId: filter.artikelId } : {}),
      ...(filter.relatieId ? { artikel: { relatieId: filter.relatieId } } : {}),
    },
    orderBy: [{ artikelId: 'asc' }, { vanafAantal: 'asc' }, { geldigVan: 'asc' }],
  })
  return rijen.map(naar)
}

async function eisMogelijk(tx: Prisma.TransactionClient, invoer: PrijsafspraakInvoer, zonder?: string) {
  // Het artikel vastzetten, zodat twee mensen niet tegelijk een overlappende afspraak opslaan.
  const [a] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM articles WHERE id = ${invoer.artikelId} FOR UPDATE`
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Dit artikel bestaat niet (meer). Ververs de pagina.')
  const bestaande = await tx.prijsafspraak.findMany({ where: { artikelId: invoer.artikelId, NOT: zonder ? { id: zonder } : undefined } })
  const reden = waaromNietPrijsafspraak(invoer, bestaande.map(naar))
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
}

export function maak(invoer: PrijsafspraakInvoer, door: string): Promise<Prijsafspraak> {
  return prisma.$transaction(async (tx) => {
    await eisMogelijk(tx, invoer)
    return naar(await tx.prijsafspraak.create({ data: { ...invoer, door } }))
  })
}

export function wijzig(id: string, patch: Partial<PrijsafspraakInvoer>, door: string): Promise<Prijsafspraak> {
  return prisma.$transaction(async (tx) => {
    const oud = await tx.prijsafspraak.findUnique({ where: { id } })
    if (!oud) throw new AppError(404, 'NOT_FOUND', 'Deze prijsafspraak bestaat niet (meer). Ververs de pagina.')
    // Een afspraak verhuist niet naar een ander artikel: dan is het een nieuwe.
    const invoer: PrijsafspraakInvoer = {
      artikelId: oud.artikelId,
      prijs: patch.prijs ?? oud.prijs,
      vanafAantal: patch.vanafAantal ?? oud.vanafAantal,
      geldigVan: patch.geldigVan !== undefined ? patch.geldigVan : oud.geldigVan,
      geldigTot: patch.geldigTot !== undefined ? patch.geldigTot : oud.geldigTot,
      kenmerk: patch.kenmerk !== undefined ? patch.kenmerk : oud.kenmerk,
    }
    await eisMogelijk(tx, invoer, id)
    return naar(await tx.prijsafspraak.update({ where: { id }, data: { ...invoer, door } }))
  })
}

export async function verwijder(id: string): Promise<void> {
  const weg = await prisma.prijsafspraak.deleteMany({ where: { id } })
  if (weg.count === 0) throw new AppError(404, 'NOT_FOUND', 'Deze prijsafspraak bestaat niet (meer). Ververs de pagina.')
}
