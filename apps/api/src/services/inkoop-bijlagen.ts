// Documenten van de leverancier bij de inkoop (2026-10-09): zijn offerte bij
// een prijsaanvraag, of los bij een bestelregel of inkooporder. Het bestand
// staat in UPLOADS_DIR/inkoop/; de database weet waar het bij hoort.
import type { Prisma, InkoopBijlage as Rij } from '@prisma/client'
import type { InkoopBijlage } from '@stockmanager/shared'

type Db = Prisma.TransactionClient

export function bijlageUit(b: Rij): InkoopBijlage {
  return {
    id: b.id, naam: b.naam, url: b.pad, grootte: b.grootte, createdAt: b.createdAt.toISOString(), door: b.geuploadDoor,
    prijsaanvraagId: b.prijsaanvraagId, leverancierId: b.leverancierId, bestelRegelId: b.bestelRegelId, inkooporderId: b.inkooporderId,
  }
}

/** Alle bijlagen die bij deze aanvragen, regels of inkooporders horen, in één keer. */
export async function bijlagenVoor(
  db: Db, k: { aanvraagIds?: string[]; regelIds?: string[]; inkooporderIds?: string[] },
): Promise<InkoopBijlage[]> {
  const of: Prisma.InkoopBijlageWhereInput[] = []
  if (k.aanvraagIds?.length) of.push({ prijsaanvraagId: { in: k.aanvraagIds } })
  if (k.regelIds?.length) of.push({ bestelRegelId: { in: k.regelIds } })
  if (k.inkooporderIds?.length) of.push({ inkooporderId: { in: k.inkooporderIds } })
  if (of.length === 0) return []
  const rijen = await db.inkoopBijlage.findMany({ where: { OR: of }, orderBy: { createdAt: 'asc' } })
  return rijen.map(bijlageUit)
}

/** De offerte van één leverancier op één aanvraag. */
export const vanAanvraag = (alle: InkoopBijlage[], aanvraagId: string, leverancierId: string) =>
  alle.filter((b) => b.prijsaanvraagId === aanvraagId && b.leverancierId === leverancierId)
