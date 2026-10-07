import type { Prisma } from '@prisma/client'
import {
  kgVanRegel, maatTekst, waaromNietInkooporder, waaromNietInkoopWijzigen, waaromNietInkoopIntrekken,
  waaromNietBestellen, waaromNietLeverdatum, verwachtBinnen, vandaagIso,
  type Inkooporder, type InkoopStatus,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { nextDocId } from './doc-nummer'
import { leesRegels } from './bestellingen'
import { leverancierEmail } from './prijsaanvragen'
import { leesOverzicht } from './inkoop-overzicht'

/**
 * Inkooporders (2026-10-06, deel 3b). Eén per leverancier, met de prijs die bij
 * "Kies" is vastgelegd. Verstuurd ligt vast: intrekken (met reden) en een nieuwe
 * maken. Ontvangen staat in `services/ontvangst.ts`.
 */

type Db = typeof prisma | Prisma.TransactionClient

export const ORDER_INCLUDE = {
  leverancier: { select: { naam: true, email: true, contacten: true } },
  regels: {
    orderBy: { positie: 'asc' },
    include: { bestelRegel: { include: { grade: true, profile: true, rawMaterial: { select: { exoot: true } } } } },
  },
} as const
type Rij = Prisma.InkooporderGetPayload<{ include: typeof ORDER_INCLUDE }>

async function naarOrders(db: Db, rijen: Rij[]): Promise<Inkooporder[]> {
  const bestel = rijen.flatMap((o) => o.regels.map((r) => r.bestelRegel))
  const artikelIds = [...new Set(bestel.map((b) => b.artikelId).filter((x): x is string => !!x))]
  const antwoordIds = [...new Set(bestel.map((b) => b.keuzeAntwoordId).filter((x): x is string => !!x))]
  const [artikelen, antwoorden] = await Promise.all([
    db.article.findMany({ where: { id: { in: artikelIds } }, select: { id: true, naam: true } }),
    db.prijsaanvraagAntwoord.findMany({ where: { id: { in: antwoordIds } }, select: { id: true, prijsaanvraagId: true } }),
  ])
  const art = new Map(artikelen.map((a) => [a.id, a.naam]))
  const pa = new Map(antwoorden.map((a) => [a.id, a.prijsaanvraagId]))
  return rijen.map((o) => {
    const regels = o.regels.map((r) => {
      const b = r.bestelRegel
      const dims = b.dimensions as Record<string, number>
      const lengteMm = Number(r.lengteMm)
      return {
        id: r.id, referentie: `${o.id}.${r.positie}`, materiaalNummer: r.materiaalNummer, bestelRegelId: b.id,
        materiaal: `${b.grade.name} ${b.profile.name} ${maatTekst(b.profile.volumeFormula, dims)}`,
        exoot: !!b.rawMaterial?.exoot, stuks: r.stuks, lengteMm,
        kg: kgVanRegel({ dimensions: dims, lengteMm, stuks: r.stuks, volumeFormula: b.profile.volumeFormula, densityKgM3: Number(b.grade.densityKgM3) }),
        totaal: Number(r.totaal), uitleg: r.uitleg, levertijdDagen: r.levertijdDagen, ontvangenStuks: r.ontvangenStuks,
        verwachtDatum: r.verwachtDatum,
        verwacht: o.status === 'verzonden' ? verwachtBinnen(o.verzondenOp ? vandaagIso(o.verzondenOp) : null, r.levertijdDagen, r.verwachtDatum) : null,
        projectId: b.projectId, artikelNaam: b.artikelId ? (art.get(b.artikelId) ?? null) : null,
      }
    })
    const refs = [...new Set(o.regels.map((r) => r.bestelRegel.keuzeAntwoordId).filter((x): x is string => !!x).map((x) => pa.get(x)).filter(Boolean))]
    return {
      id: o.id, leverancierId: o.leverancierId, leverancierNaam: o.leverancier.naam, email: leverancierEmail(o.leverancier),
      status: o.status as InkoopStatus, notitie: o.notitie, referentie: refs.length ? refs.join(', ') : null,
      verzondenOp: o.verzondenOp?.toISOString() ?? null, verzondenDoor: o.verzondenDoor,
      vervallenOp: o.vervallenOp?.toISOString() ?? null, vervallenReden: o.vervallenReden, vervallenDoor: o.vervallenDoor,
      createdAt: o.createdAt.toISOString(), createdBy: o.createdBy,
      regels, totaal: Math.round(regels.reduce((t, r) => t + r.totaal, 0) * 100) / 100,
    }
  })
}

export async function leesOrders(db: Db, where: Prisma.InkooporderWhereInput = {}): Promise<Inkooporder[]> {
  return naarOrders(db, await db.inkooporder.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } }))
}

export async function leesOrder(db: Db, id: string): Promise<Inkooporder> {
  const [o] = await leesOrders(db, { id })
  if (!o) throw new AppError(404, 'NOT_FOUND', `Inkooporder ${id} bestaat niet (meer). Ververs de pagina.`)
  return o
}

/** Van gekozen regels: één concept-inkooporder per leverancier. */
export async function maakOrders(regelIds: string[], door: string): Promise<Inkooporder[]> {
  return prisma.$transaction((tx) => maakOrdersIn(tx, regelIds, door))
}

async function maakOrdersIn(tx: Prisma.TransactionClient, regelIds: string[], door: string): Promise<Inkooporder[]> {
  const regels = await leesRegels(tx, { id: { in: regelIds } })
  if (regels.length !== new Set(regelIds).size) throw new AppError(409, 'VOORWAARDE', 'Een van de regels bestaat niet meer. Ververs de pagina.')
  const reden = waaromNietInkooporder(regels)
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
  const groepen = new Map<string, typeof regels>()
  for (const r of regels) groepen.set(r.keuze!.leverancierId, [...(groepen.get(r.keuze!.leverancierId) ?? []), r])
  const ids: string[] = []
  for (const [leverancierId, rs] of groepen) {
    const id = await nextDocId(tx, 'INK')
    // Per regel een eigen materiaalnummer (260042), voor op het label.
    const nummers: string[] = []
    for (const _ of rs) nummers.push(await nextDocId(tx, 'M'))
    await tx.inkooporder.create({
      data: {
        id, leverancierId, createdBy: door,
        regels: {
          create: rs.map((r, i) => ({
            bestelRegelId: r.id, positie: i + 1, materiaalNummer: nummers[i], stuks: r.stuks, lengteMm: r.lengteMm,
            totaal: Math.round(r.keuze!.totaal * 100) / 100, uitleg: r.keuze!.uitleg, levertijdDagen: r.keuze!.levertijdDagen,
          })),
        },
      },
    })
    ids.push(id)
  }
  return leesOrders(tx, { id: { in: ids } })
}

/**
 * Bestellen in één keer (2026-10-07): regels zonder gekozen leverancier
 * krijgen de goedkoopste — dezelfde die het scherm voorstelde — en per
 * leverancier komt er een inkooporder klaar voor de mail. Pas na "Ja,
 * verstuurd" (`markeerAlleVerzonden`) staan ze als besteld.
 */
export async function bestel(regelIds: string[], door: string): Promise<Inkooporder[]> {
  return prisma.$transaction(async (tx) => {
    const ov = await leesOverzicht(tx, { regelIds })
    if (ov.regels.length !== new Set(regelIds).size) throw new AppError(409, 'VOORWAARDE', 'Een van de regels bestaat niet meer. Ververs de pagina.')
    const reden = waaromNietBestellen(ov.regels, ov.leveranciers)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    const nu = new Date()
    for (const r of ov.regels) {
      const l = r.leverancier!
      if (l.gekozen) continue
      await tx.bestelRegel.update({
        where: { id: r.id },
        data: {
          keuzeLeverancierId: l.leverancierId, keuzeBron: l.bron, keuzeAntwoordId: l.antwoordId,
          keuzeTotaal: l.totaal, keuzeUitleg: l.uitleg, keuzeLevertijdDagen: l.levertijdDagen,
          keuzeOp: nu, keuzeDoor: `${door} (goedkoopste)`,
        },
      })
    }
    return maakOrdersIn(tx, regelIds, door)
  })
}

/** "Ja, allemaal verstuurd": alle klaargezette orders in één keer. */
export async function markeerAlleVerzonden(ids: string[], door: string): Promise<Inkooporder[]> {
  const uit: Inkooporder[] = []
  for (const id of ids) uit.push(await markeerVerzonden(id, door))
  return uit
}

/** De leverdatum zoals de leverancier hem doorgaf; `null` = terug naar verstuurd + levertijd. */
export async function zetLeverdatum(id: string, regelId: string, datum: string | null, door: string): Promise<Inkooporder> {
  return prisma.$transaction(async (tx) => {
    const o = await leesOrder(tx, id)
    const r = o.regels.find((x) => x.id === regelId)
    if (!r) throw new AppError(404, 'NOT_FOUND', `Deze regel staat niet op ${id}.`)
    const reden = waaromNietLeverdatum(o, r, datum)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    await tx.inkooporderRegel.update({
      where: { id: regelId },
      data: { verwachtDatum: datum, verwachtAangepastOp: new Date(), verwachtAangepastDoor: door },
    })
    return leesOrder(tx, id)
  })
}

async function vereisConcept(db: Db, id: string): Promise<Inkooporder> {
  const o = await leesOrder(db, id)
  const reden = waaromNietInkoopWijzigen(o)
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
  return o
}

export async function regelEraf(id: string, regelId: string): Promise<Inkooporder | null> {
  return prisma.$transaction(async (tx) => {
    const o = await vereisConcept(tx, id)
    if (!o.regels.some((r) => r.id === regelId)) throw new AppError(404, 'NOT_FOUND', `Deze regel staat niet op ${id}.`)
    await tx.inkooporderRegel.delete({ where: { id: regelId } })
    // Een concept zonder regels heeft geen nut meer.
    if (o.regels.length === 1) { await tx.inkooporder.delete({ where: { id } }); return null }
    return leesOrder(tx, id)
  })
}

export async function verwijderConcept(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const o = await vereisConcept(tx, id)
    await tx.inkooporder.delete({ where: { id } })
    // Een leverancier die Bestellen zelf koos (de goedkoopste) was geen besluit
    // van iemand: weg met de order, dan rekent de lijst weer met de prijs van nu.
    await tx.bestelRegel.updateMany({
      where: { id: { in: o.regels.map((r) => r.bestelRegelId) }, keuzeDoor: { endsWith: ' (goedkoopste)' } },
      data: { keuzeLeverancierId: null, keuzeBron: null, keuzeAntwoordId: null, keuzeTotaal: null, keuzeUitleg: null, keuzeLevertijdDagen: null, keuzeOp: null, keuzeDoor: null },
    })
  })
}

/** Na "Ja, verstuurd": vast, en de regels gaan naar "Besteld". */
export async function markeerVerzonden(id: string, door: string): Promise<Inkooporder> {
  return prisma.$transaction(async (tx) => {
    const o = await leesOrder(tx, id)
    if (o.status === 'vervallen') throw new AppError(409, 'VOORWAARDE', `${id} is ingetrokken en gaat niet meer de deur uit.`)
    if (o.regels.length === 0) throw new AppError(409, 'VOORWAARDE', `${id} heeft geen regels.`)
    if (o.status === 'concept') {
      await tx.inkooporder.update({ where: { id }, data: { status: 'verzonden', verzondenOp: new Date(), verzondenDoor: door } })
      await tx.bestelRegel.updateMany({
        where: { id: { in: o.regels.map((r) => r.bestelRegelId) }, status: { in: ['te_bestellen', 'aangevraagd', 'buffer'] } },
        data: { status: 'besteld' },
      })
    }
    return leesOrder(tx, id)
  })
}

/**
 * Intrekken (afgesproken 2026-10-06): de order blijft staan als vervallen, met
 * reden; de regels gaan terug naar de inkoopbuffer, met hun gekozen
 * leverancier, zodat je meteen een nieuwe maakt.
 */
export async function trekIn(id: string, reden: string, door: string): Promise<Inkooporder> {
  return prisma.$transaction(async (tx) => {
    const o = await leesOrder(tx, id)
    const nee = waaromNietInkoopIntrekken(o)
    if (nee) throw new AppError(409, 'VOORWAARDE', nee)
    await tx.inkooporder.update({ where: { id }, data: { status: 'vervallen', vervallenOp: new Date(), vervallenReden: reden, vervallenDoor: door } })
    const bestelIds = o.regels.map((r) => r.bestelRegelId)
    // Terug in de inkoopbuffer (2026-10-07), met hun gekozen leverancier: daar
    // bestel je opnieuw, of zet je ze nog een stap terug.
    await tx.bestelRegel.updateMany({ where: { id: { in: bestelIds } }, data: { status: 'buffer' } })
    return leesOrder(tx, id)
  })
}
