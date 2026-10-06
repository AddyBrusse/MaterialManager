import type { Prisma } from '@prisma/client'
import {
  waaromNietPrijsaanvraag, waaromNietBestelRegelWijzigen,
  type Prijsaanvraag, type PrijsaanvraagInvoer, type AntwoordInvoer, type RelatieContact,
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
