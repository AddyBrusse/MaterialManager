import type { Prisma } from '@prisma/client'
import { maatTekst, statusNaOntvangst, waaromNietOntvangen, stukNummers, type Ontvangst, type OntvangstInvoer } from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { leesOrder } from './inkooporders'

/**
 * Ontvangen (2026-10-06, deel 3b), ook in delen. Elk stuk wordt een regel in de
 * materiaallijst, met een voorraadmutatie "ontvangen". Een exoot gaat op zijn
 * eigen lengte en wordt meteen gereserveerd voor zijn project — via een gewone
 * reservering, zodat `services/voorraad.ts` hem als vastgelegd telt en het
 * gereedmelden van de order hem afboekt.
 */

type Tx = Prisma.TransactionClient

/** Het volgende vrije #NNNNN, zoals het scherm ze maakt. */
async function volgendeCode(tx: Tx): Promise<number> {
  const codes = await tx.rawMaterial.findMany({ where: { code: { startsWith: '#' } }, select: { code: true } })
  return codes.reduce((max, { code }) => {
    const n = /^#\d{5}$/.test(code) ? Number(code.slice(1)) : 0
    return n > max ? n : max
  }, 0) + 1
}
const code = (n: number) => `#${String(n).padStart(5, '0')}`

export async function ontvang(invoer: OntvangstInvoer, gebruiker: { id: string; name: string }): Promise<Ontvangst> {
  return prisma.$transaction(async (tx) => {
    const rij = await tx.inkooporderRegel.findUnique({
      where: { id: invoer.inkooporderRegelId },
      include: { bestelRegel: { include: { grade: true, profile: true, rawMaterial: true } } },
    })
    if (!rij) throw new AppError(404, 'NOT_FOUND', 'Deze inkooporderregel bestaat niet (meer). Ververs de pagina.')
    const order = await leesOrder(tx, rij.inkooporderId)
    const regel = order.regels.find((r) => r.id === rij.id)!
    const reden = waaromNietOntvangen(order, regel, invoer.stuks)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)

    const b = rij.bestelRegel
    const exoot = b.rawMaterial?.exoot ? b.rawMaterial : null
    const project = b.projectId ? await tx.project.findUnique({ where: { id: b.projectId }, select: { id: true } }) : null
    const lengte = exoot ? Number(exoot.lengthMm) : Number(rij.lengteMm)
    const slot = invoer.locationSlotId ?? null
    const ids: string[] = []
    const codes: string[] = []
    let volgende = await volgendeCode(tx)
    // Het nummer van het label wordt het nummer in de voorraad (2026-10-07).
    // Een oudere order zonder materiaalnummer houdt de #NNNNN-codes.
    const labelCodes = rij.materiaalNummer ? stukNummers(rij.materiaalNummer, rij.stuks, rij.ontvangenStuks, invoer.stuks) : null
    const codeVoor = (i: number) => labelCodes?.[i] ?? code(volgende++)
    // De exoot zelf staat al in de lijst (op 0): het eerste stuk vult die regel.
    let exootVrij = !!exoot && Number(exoot.currentStock) === 0
      && (await tx.zaagReservering.count({ where: { barId: exoot.id } })) === 0

    for (let i = 0; i < invoer.stuks; i++) {
      let staaf
      if (exoot && exootVrij) {
        staaf = await tx.rawMaterial.update({
          where: { id: exoot.id },
          data: { currentStock: lengte, ...(labelCodes ? { code: codeVoor(i) } : {}), ...(slot ? { locationSlotId: slot } : {}) },
        })
        exootVrij = false
      } else {
        staaf = await tx.rawMaterial.create({
          data: {
            code: codeVoor(i), gradeId: b.gradeId, profileId: b.profileId, dimensions: b.dimensions as object,
            lengthMm: lengte, currentStock: lengte, locationSlotId: slot,
            ...(exoot ? { exoot: true, klantId: exoot.klantId, artikelId: exoot.artikelId } : {}),
          },
        })
      }
      ids.push(staaf.id)
      codes.push(staaf.code)
      await tx.stockMovement.create({
        data: {
          itemType: 'raw', itemId: staaf.id, userId: gebruiker.id, kind: 'delta', amount: lengte,
          previousStock: 0, newStock: lengte, reason: 'received',
          note: `Ontvangen op ${regel.referentie} (${order.leverancierNaam})${invoer.notitie ? ` — ${invoer.notitie}` : ''}`,
        },
      })
      if (exoot && project) {
        const dims = b.dimensions as Record<string, number>
        await tx.zaagReservering.create({
          data: {
            id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            calculatieNr: project.id, projectId: project.id, artikelId: b.artikelId, offerteRegelId: b.offerteRegelId,
            barId: staaf.id, barCode: staaf.code, barLocation: '', barVorm: b.profile.name,
            pieces: 1, productLen: lengte, sawLength: lengte, fysiekeLengte: lengte,
            materiaal: b.grade.name, diameter: Number(dims.diameter ?? 0), werkstukLengte: lengte,
            steekbreedte: 0, vlakToeslag: 0, machine: 'Exoot — op maat geleverd',
          },
        })
      }
    }

    await tx.inkooporderRegel.update({ where: { id: rij.id }, data: { ontvangenStuks: { increment: invoer.stuks } } })
    const binnen = await tx.inkooporderRegel.aggregate({
      where: { bestelRegelId: b.id, inkooporder: { status: { not: 'vervallen' } } }, _sum: { ontvangenStuks: true },
    })
    await tx.bestelRegel.update({ where: { id: b.id }, data: { status: statusNaOntvangst(b.stuks, binnen._sum.ontvangenStuks ?? 0) } })

    const o = await tx.ontvangst.create({
      data: {
        inkooporderRegelId: rij.id, stuks: invoer.stuks, rawMaterialIds: ids, codes,
        gereserveerdVoor: exoot && project ? project.id : null, notitie: invoer.notitie ?? null, door: gebruiker.name,
      },
    })
    return {
      id: o.id, inkooporderId: order.id, referentie: regel.referentie,
      materiaal: `${b.grade.name} ${b.profile.name} ${maatTekst(b.profile.volumeFormula, b.dimensions as Record<string, number>)}`,
      leverancierNaam: order.leverancierNaam, stuks: o.stuks, codes, gereserveerdVoor: o.gereserveerdVoor,
      notitie: o.notitie, door: o.door, createdAt: o.createdAt.toISOString(),
    }
  })
}

export async function leesOntvangsten(): Promise<Ontvangst[]> {
  const rijen = await prisma.ontvangst.findMany({
    orderBy: { createdAt: 'desc' }, take: 200,
    include: {
      regel: {
        include: {
          inkooporder: { include: { leverancier: { select: { naam: true } } } },
          bestelRegel: { include: { grade: true, profile: true } },
        },
      },
    },
  })
  return rijen.map((o) => ({
    id: o.id, inkooporderId: o.regel.inkooporderId, referentie: `${o.regel.inkooporderId}.${o.regel.positie}`,
    materiaal: `${o.regel.bestelRegel.grade.name} ${o.regel.bestelRegel.profile.name} ${maatTekst(o.regel.bestelRegel.profile.volumeFormula, o.regel.bestelRegel.dimensions as Record<string, number>)}`,
    leverancierNaam: o.regel.inkooporder.leverancier.naam, stuks: o.stuks, codes: o.codes as string[],
    gereserveerdVoor: o.gereserveerdVoor, notitie: o.notitie, door: o.door, createdAt: o.createdAt.toISOString(),
  }))
}
