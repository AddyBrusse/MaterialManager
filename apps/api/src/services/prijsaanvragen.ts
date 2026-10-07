import type { Prisma } from '@prisma/client'
import {
  waaromNietPrijsaanvraag, waaromNietBestelRegelWijzigen, waaromNietPrijzenAanvragen,
  type Prijsaanvraag, type PrijsaanvraagInvoer, type AntwoordInvoer, type AntwoordCel, type RelatieContact,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { nextDocId } from './doc-nummer'
import { leesRegels, naarAntwoord } from './bestellingen'

/**
 * Prijsaanvragen (2026-10-06): één aanvraag, per leverancier een eigen mail.
 * Een leverancier staat pas als "verstuurd" na "Ja, verstuurd" op het scherm —
 * een klaargezette mail is nog niet de deur uit.
 */

type Db = typeof prisma | Prisma.TransactionClient

const INCLUDE = {
  regels: { select: { bestelRegelId: true } },
  leveranciers: { include: { leverancier: { select: { naam: true, email: true, contacten: true } } } },
  antwoorden: true,
} as const
type Rij = Prisma.PrijsaanvraagGetPayload<{ include: typeof INCLUDE }>

/** Het adres voor een aanvraag: dat van de relatie, anders de eerste contactpersoon met een adres. */
export function leverancierEmail(l: { email: string | null; contacten: unknown }): string | null {
  if (l.email) return l.email
  const c = ((l.contacten ?? []) as RelatieContact[]).find((x) => x.email)
  return c?.email ?? null
}

function naarAanvraag(r: Rij): Prijsaanvraag {
  return {
    id: r.id, notitie: r.notitie, createdAt: r.createdAt.toISOString(), createdBy: r.createdBy,
    regelIds: r.regels.map((x) => x.bestelRegelId),
    leveranciers: r.leveranciers
      .map((l) => ({
        leverancierId: l.leverancierId, naam: l.leverancier.naam, email: leverancierEmail(l.leverancier),
        verzondenOp: l.verzondenOp?.toISOString() ?? null, verzondenDoor: l.verzondenDoor,
      }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl')),
    antwoorden: r.antwoorden.map(naarAntwoord),
  }
}

export async function leesAanvragen(db: Db): Promise<Prijsaanvraag[]> {
  const rijen = await db.prijsaanvraag.findMany({ include: INCLUDE, orderBy: { createdAt: 'desc' } })
  return rijen.map(naarAanvraag)
}

export async function leesAanvraag(db: Db, id: string): Promise<Prijsaanvraag> {
  const r = await db.prijsaanvraag.findUnique({ where: { id }, include: INCLUDE })
  if (!r) throw new AppError(404, 'NOT_FOUND', `Prijsaanvraag ${id} bestaat niet (meer). Ververs de pagina.`)
  return naarAanvraag(r)
}

export async function maakAanvraag(invoer: PrijsaanvraagInvoer, door: string): Promise<Prijsaanvraag> {
  return prisma.$transaction(async (tx) => {
    const regels = await leesRegels(tx, { id: { in: invoer.regelIds } })
    if (regels.length !== new Set(invoer.regelIds).size) {
      throw new AppError(409, 'VOORWAARDE', 'Een van de regels bestaat niet meer. Ververs de pagina en kies opnieuw.')
    }
    const reden = waaromNietPrijsaanvraag(regels, invoer.leverancierIds)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    const levs = await tx.relatie.findMany({ where: { id: { in: invoer.leverancierIds } }, select: { id: true, naam: true, type: true } })
    const geen = levs.find((l) => l.type !== 'leverancier' && l.type !== 'beide')
    if (geen) throw new AppError(409, 'VOORWAARDE', `${geen.naam} is geen leverancier. Zet het type van de relatie op leverancier, of kies een andere.`)
    if (levs.length !== new Set(invoer.leverancierIds).size) {
      throw new AppError(409, 'VOORWAARDE', 'Een van de leveranciers bestaat niet meer. Ververs de pagina.')
    }
    const id = await nextDocId(tx, 'PA')
    await tx.prijsaanvraag.create({
      data: {
        id, notitie: invoer.notitie ?? null, createdBy: door,
        regels: { create: [...new Set(invoer.regelIds)].map((bestelRegelId) => ({ bestelRegelId })) },
        leveranciers: { create: [...new Set(invoer.leverancierIds)].map((leverancierId) => ({ leverancierId })) },
      },
    })
    return leesAanvraag(tx, id)
  })
}

/** Na "Ja, verstuurd": vastleggen, en de regels gaan naar "aangevraagd". */
export async function markeerVerzonden(id: string, leverancierId: string, door: string): Promise<Prijsaanvraag> {
  return prisma.$transaction(async (tx) => {
    const a = await leesAanvraag(tx, id)
    const l = a.leveranciers.find((x) => x.leverancierId === leverancierId)
    if (!l) throw new AppError(404, 'NOT_FOUND', `Deze leverancier staat niet op ${id}.`)
    if (!l.verzondenOp) {
      await tx.prijsaanvraagLeverancier.update({
        where: { prijsaanvraagId_leverancierId: { prijsaanvraagId: id, leverancierId } },
        data: { verzondenOp: new Date(), verzondenDoor: door },
      })
    }
    // Alleen vooruit: wat al besteld of binnen is, blijft dat.
    await tx.bestelRegel.updateMany({ where: { id: { in: a.regelIds }, status: 'te_bestellen' }, data: { status: 'aangevraagd' } })
    return leesAanvraag(tx, id)
  })
}

/** Alle antwoorden van één leverancier op deze aanvraag: wat er niet meer in staat, gaat weg. */
export async function zetAntwoorden(id: string, leverancierId: string, antwoorden: AntwoordInvoer[], door: string): Promise<Prijsaanvraag> {
  return prisma.$transaction(async (tx) => {
    const a = await leesAanvraag(tx, id)
    if (!a.leveranciers.some((x) => x.leverancierId === leverancierId)) {
      throw new AppError(404, 'NOT_FOUND', `Deze leverancier staat niet op ${id}.`)
    }
    const vreemd = antwoorden.find((x) => !a.regelIds.includes(x.bestelRegelId))
    if (vreemd) throw new AppError(409, 'VOORWAARDE', `Een van de regels hoort niet bij ${id}. Ververs de pagina.`)
    const regels = await leesRegels(tx, { id: { in: antwoorden.map((x) => x.bestelRegelId) } })
    const vast = regels.find((r) => r.status === 'besteld' || r.status === 'ontvangen')
    if (vast) throw new AppError(409, 'VOORWAARDE', waaromNietBestelRegelWijzigen(vast)!)

    await tx.prijsaanvraagAntwoord.deleteMany({
      where: { prijsaanvraagId: id, leverancierId, bestelRegelId: { notIn: antwoorden.map((x) => x.bestelRegelId) } },
    })
    for (const x of antwoorden) {
      const data = {
        prijsSoort: x.prijsSoort, prijs: x.prijs, zaagkostenPerSnede: x.zaagkostenPerSnede ?? null,
        levertijdDagen: x.levertijdDagen ?? null, notitie: x.notitie ?? null, bijgewerktDoor: door,
      }
      await tx.prijsaanvraagAntwoord.upsert({
        where: { prijsaanvraagId_bestelRegelId_leverancierId: { prijsaanvraagId: id, bestelRegelId: x.bestelRegelId, leverancierId } },
        create: { ...data, prijsaanvraagId: id, bestelRegelId: x.bestelRegelId, leverancierId },
        update: data,
      })
    }
    return leesAanvraag(tx, id)
  })
}

export async function verwijderAanvraag(id: string): Promise<void> {
  const a = await leesAanvraag(prisma, id)
  const weg = a.leveranciers.find((l) => l.verzondenOp)
  if (weg) {
    throw new AppError(409, 'VOORWAARDE', `${id} is al verstuurd aan ${weg.naam}. Hij blijft staan, zodat je ziet wat er gevraagd is.`)
  }
  await prisma.prijsaanvraag.delete({ where: { id } })
}


/**
 * Prijzen aanvragen vanuit de tabbladen (2026-10-07): per leverancier één
 * aanvraag met alle regels die bij hem staan, zodat elke leverancier één mail
 * krijgt. Zonder `extra` gelden de leveranciers op de regels (tab Te bestellen);
 * met `extra` komen die leveranciers erbij voor regels die al aangevraagd zijn.
 */
export async function aanvragenPerLeverancier(regelIds: string[], door: string, extra?: string[]): Promise<Prijsaanvraag[]> {
  return prisma.$transaction(async (tx) => {
    const regels = await leesRegels(tx, { id: { in: regelIds } })
    if (regels.length !== new Set(regelIds).size) throw new AppError(409, 'VOORWAARDE', 'Een van de regels bestaat niet meer. Ververs de pagina.')
    const rels = await tx.relatie.findMany({ where: { type: { in: ['leverancier', 'beide'] } }, select: { id: true, naam: true, email: true, contacten: true } })
    const levs = rels.map((r) => ({ id: r.id, naam: r.naam, email: leverancierEmail(r) }))
    const vraag = regels.map((r) => ({ ...r, leverancierIds: extra ?? r.leverancierIds, status: extra && r.status === 'aangevraagd' ? 'te_bestellen' as const : r.status }))
    const reden = waaromNietPrijzenAanvragen(vraag, levs)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    if (extra) {
      for (const r of regels) {
        await tx.bestelRegel.update({ where: { id: r.id }, data: { leverancierIds: [...new Set([...r.leverancierIds, ...extra])] } })
      }
    }
    const ids: string[] = []
    for (const levId of [...new Set(vraag.flatMap((r) => r.leverancierIds))]) {
      const eigen = vraag.filter((r) => r.leverancierIds.includes(levId)).map((r) => r.id)
      const id = await nextDocId(tx, 'PA')
      await tx.prijsaanvraag.create({
        data: {
          id, createdBy: door,
          regels: { create: eigen.map((bestelRegelId) => ({ bestelRegelId })) },
          leveranciers: { create: [{ leverancierId: levId }] },
        },
      })
      ids.push(id)
    }
    const uit = await Promise.all(ids.map((id) => leesAanvraag(tx, id)))
    return uit
  })
}

/** "Ja, allemaal verstuurd": elke leverancier op deze aanvragen staat als verstuurd. */
export async function markeerAlleVerzonden(ids: string[], door: string): Promise<Prijsaanvraag[]> {
  const uit: Prijsaanvraag[] = []
  for (const id of ids) {
    const a = await leesAanvraag(prisma, id)
    for (const l of a.leveranciers) await markeerVerzonden(id, l.leverancierId, door)
    uit.push(await leesAanvraag(prisma, id))
  }
  return uit
}

/** Eén cel in tab 2 (regel × leverancier): bewaren, of wissen bij een lege prijs. */
export async function zetAntwoordCel(id: string, leverancierId: string, regelId: string, cel: AntwoordCel, door: string): Promise<Prijsaanvraag> {
  return prisma.$transaction(async (tx) => {
    const a = await leesAanvraag(tx, id)
    if (!a.leveranciers.some((x) => x.leverancierId === leverancierId)) throw new AppError(404, 'NOT_FOUND', `Deze leverancier staat niet op ${id}.`)
    if (!a.regelIds.includes(regelId)) throw new AppError(409, 'VOORWAARDE', `Deze regel hoort niet bij ${id}. Ververs de pagina.`)
    const [regel] = await leesRegels(tx, { id: regelId })
    if (regel && (regel.status === 'besteld' || regel.status === 'ontvangen')) throw new AppError(409, 'VOORWAARDE', waaromNietBestelRegelWijzigen(regel)!)
    const sleutel = { prijsaanvraagId_bestelRegelId_leverancierId: { prijsaanvraagId: id, bestelRegelId: regelId, leverancierId } }
    if (cel.prijs == null) {
      await tx.prijsaanvraagAntwoord.deleteMany({ where: { prijsaanvraagId: id, bestelRegelId: regelId, leverancierId } })
    } else {
      const data = {
        prijsSoort: cel.prijsSoort, prijs: cel.prijs, zaagkostenPerSnede: cel.prijsSoort === 'totaal' ? null : (cel.zaagkostenPerSnede ?? null),
        levertijdDagen: cel.levertijdDagen ?? null, bijgewerktDoor: door,
      }
      await tx.prijsaanvraagAntwoord.upsert({ where: sleutel, create: { ...data, prijsaanvraagId: id, bestelRegelId: regelId, leverancierId }, update: data })
    }
    return leesAanvraag(tx, id)
  })
}
