// Lezen en schrijven van een project met alles wat eraan hangt.
//
// De documenten staan sinds 2026-09-09 in eigen tabellen (zie
// decisions/90-decisions-log.md), maar de API levert nog steeds één genest
// `Project` op — de planningwachtrij, de projecttabel en de tabs bouwen daarop.
// Dit bestand is de vertaling tussen die twee vormen en de enige plek die de
// tabellen kent.
import type { Prisma } from '@prisma/client'
import { AppError } from '../middleware/error'
import type {
  Project, Offerte, OfferteRegel, OfferteStatus, Opdrachtbevestiging, OBStatus,
  ProductieOrder, ProductieOrderStatus, ProductieStap, Paklijst, Factuur,
} from '@stockmanager/shared'

export type Db = Prisma.TransactionClient

// Alles wat aan een project hangt, in de volgorde waarin het gelezen hoort te
// worden: regels op sortOrder, stappen op volgorde, offertes op versie.
export const PROJECT_INCLUDE = {
  offertes: { include: { regels: { orderBy: { sortOrder: 'asc' } } }, orderBy: { versie: 'asc' } },
  opdrachtbevestiging: { include: { regels: { orderBy: { sortOrder: 'asc' } } } },
  productieOrders: { include: { stappen: { orderBy: { volgorde: 'asc' } } }, orderBy: { createdAt: 'asc' } },
  paklijsten: { include: { regels: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } },
  facturen: { include: { regels: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProjectInclude

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>

// ── Lezen ─────────────────────────────────────────────────────────────────────

type RegelRow = {
  id: string; sortOrder: number; artikelId: string | null; naam: string
  omschrijving: string; qty: number; eenheid: string; verkoopprijs: number
  totaal: number; bewerkingen: string[]
}

function leesRegel(r: RegelRow): OfferteRegel {
  return {
    id: r.id,
    sortOrder: r.sortOrder,
    artikelId: r.artikelId,
    naam: r.naam,
    omschrijving: r.omschrijving,
    qty: r.qty,
    eenheid: r.eenheid,
    verkoopprijs: r.verkoopprijs,
    totaal: r.totaal,
    bewerkingen: r.bewerkingen,
  }
}

export function serialize(row: ProjectRow): Project {
  const paklijstRow = row.paklijsten[0] ?? null
  const factuurRow = row.facturen[0] ?? null
  return {
    id: row.id,
    naam: row.naam,
    relatieId: row.relatieId,
    contactId: row.contactId,
    klantRef: row.klantRef,
    status: row.status as Project['status'],
    levertijdDatum: row.levertijdDatum,
    notities: row.notities,
    offertes: row.offertes.map((o): Offerte => ({
      id: o.id,
      projectId: o.projectId,
      versie: o.versie,
      status: o.status as OfferteStatus,
      regels: o.regels.map(leesRegel),
      notities: o.notities,
      geldigTot: o.geldigTot,
      verzondenOp: o.verzondenOp,
      geaccepteerdOp: o.geaccepteerdOp,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    opdrachtbevestiging: row.opdrachtbevestiging
      ? ({
          id: row.opdrachtbevestiging.id,
          projectId: row.opdrachtbevestiging.projectId,
          offerteId: row.opdrachtbevestiging.offerteId,
          regels: row.opdrachtbevestiging.regels.map(leesRegel),
          levertijdDatum: row.opdrachtbevestiging.levertijdDatum,
          notities: row.opdrachtbevestiging.notities,
          status: row.opdrachtbevestiging.status as OBStatus,
          verzondenOp: row.opdrachtbevestiging.verzondenOp,
          createdAt: row.opdrachtbevestiging.createdAt.toISOString(),
          updatedAt: row.opdrachtbevestiging.updatedAt.toISOString(),
        } satisfies Opdrachtbevestiging)
      : null,
    productieOrders: row.productieOrders.map((o): ProductieOrder => ({
      id: o.id,
      projectId: o.projectId,
      offerteRegelId: o.offerteRegelId,
      artikelId: o.artikelId,
      artikelNaam: o.artikelNaam,
      qty: o.qty,
      eenheid: o.eenheid,
      status: o.status as ProductieOrderStatus,
      stappen: o.stappen.map((s): ProductieStap => ({
        id: s.id,
        volgorde: s.volgorde,
        naam: s.naam,
        machine: s.machine,
        gereedOp: s.gereedOp,
        gereedDoor: s.gereedDoor,
        geplandDatum: s.geplandDatum,
        geplandMachine: s.geplandMachine,
        queuePosition: s.queuePosition,
        notBefore: s.notBefore,
      })),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    paklijst: paklijstRow
      ? ({
          id: paklijstRow.id,
          projectId: paklijstRow.projectId,
          regels: paklijstRow.regels.map(r => ({
            productieOrderId: r.productieOrderId,
            artikelNaam: r.artikelNaam,
            qty: r.qty,
            eenheid: r.eenheid,
          })),
          notities: paklijstRow.notities,
          verzondenOp: paklijstRow.verzondenOp,
          createdAt: paklijstRow.createdAt.toISOString(),
        } satisfies Paklijst)
      : null,
    factuur: factuurRow
      ? ({
          id: factuurRow.id,
          projectId: factuurRow.projectId,
          offerteId: factuurRow.offerteId,
          regels: factuurRow.regels.map(r => ({
            offerteRegelId: r.offerteRegelId,
            naam: r.naam,
            qty: r.qty,
            eenheid: r.eenheid,
            verkoopprijs: r.verkoopprijs,
            totaal: r.totaal,
          })),
          btwPct: factuurRow.btwPct,
          subtotaal: factuurRow.subtotaal,
          btwBedrag: factuurRow.btwBedrag,
          totaalInclBtw: factuurRow.totaalInclBtw,
          notities: factuurRow.notities,
          vervaldatum: factuurRow.vervaldatum,
          verzondenOp: factuurRow.verzondenOp,
          createdAt: factuurRow.createdAt.toISOString(),
        } satisfies Factuur)
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── Schrijven ─────────────────────────────────────────────────────────────────

// De paklijst- en factuurregel hebben in het gedeelde schema geen eigen id —
// ze worden herkend aan de order of de offerteregel waar ze bij horen. Voor de
// tabel is er wel een sleutel nodig, en die moet bij elk opnieuw wegschrijven
// hetzelfde zijn, anders wordt elke rij bij elke bewaaractie verwijderd en
// opnieuw aangemaakt. Vandaar afleiden in plaats van genereren; een dubbele
// sleutel binnen één document krijgt de index erachter.
export function regelSleutels(docId: string, keys: string[]): string[] {
  const gezien = new Set<string>()
  return keys.map((key, i) => {
    const basis = `${docId}:${key || i}`
    if (!gezien.has(basis)) { gezien.add(basis); return basis }
    return `${basis}#${i}`
  })
}

function d(iso: string): Date { return new Date(iso) }

// Document-id's zijn sinds de eigen tabellen globale primary keys. Zolang alles
// in de JSONB-kolom van één project zat, was een dubbel id hooguit verwarrend;
// nu zou een upsert op een id dat al bij een ánder project hoort het document
// van dat project stilletjes overschrijven. Dat is precies wat er gebeurde toen
// `nextDocId` een nummer uitgaf dat al bestond (een teruggezette backup, een
// handmatige rij, een sequence die achterloopt): een geaccepteerde offerte van
// een ander project werd teruggezet naar concept. Liever een luide fout dan
// stille schade — vandaar deze controle vóór elk schrijven.
async function eisEigendom(
  zoek: (id: string) => Promise<{ projectId: string } | null>,
  ids: string[],
  projectId: string,
  wat: string,
): Promise<void> {
  for (const id of ids) {
    const bestaand = await zoek(id)
    if (bestaand && bestaand.projectId !== projectId) {
      throw new AppError(
        409, 'CONFLICT',
        `${wat} ${id} hoort al bij project ${bestaand.projectId}`,
      )
    }
  }
}

export async function persist(tx: Db, next: Project): Promise<void> {
  await eisEigendom(
    id => tx.offerte.findUnique({ where: { id }, select: { projectId: true } }),
    next.offertes.map(o => o.id), next.id, 'Offerte',
  )
  await eisEigendom(
    id => tx.opdrachtbevestiging.findUnique({ where: { id }, select: { projectId: true } }),
    next.opdrachtbevestiging ? [next.opdrachtbevestiging.id] : [], next.id, 'Opdrachtbevestiging',
  )
  await eisEigendom(
    id => tx.productieOrder.findUnique({ where: { id }, select: { projectId: true } }),
    next.productieOrders.map(o => o.id), next.id, 'Productieorder',
  )
  await eisEigendom(
    id => tx.paklijst.findUnique({ where: { id }, select: { projectId: true } }),
    next.paklijst ? [next.paklijst.id] : [], next.id, 'Paklijst',
  )
  await eisEigendom(
    id => tx.factuur.findUnique({ where: { id }, select: { projectId: true } }),
    next.factuur ? [next.factuur.id] : [], next.id, 'Factuur',
  )

  await tx.project.update({
    where: { id: next.id },
    data: {
      naam: next.naam,
      relatieId: next.relatieId,
      contactId: next.contactId,
      klantRef: next.klantRef,
      status: next.status,
      levertijdDatum: next.levertijdDatum,
      notities: next.notities,
    },
  })

  // ── Offertes ──
  await tx.offerte.deleteMany({
    where: { projectId: next.id, id: { notIn: next.offertes.map(o => o.id) } },
  })
  for (const o of next.offertes) {
    const velden = {
      versie: o.versie,
      status: o.status,
      notities: o.notities,
      geldigTot: o.geldigTot,
      verzondenOp: o.verzondenOp,
      geaccepteerdOp: o.geaccepteerdOp,
      updatedAt: d(o.updatedAt),
    }
    await tx.offerte.upsert({
      where: { id: o.id },
      create: { id: o.id, projectId: next.id, createdAt: d(o.createdAt), ...velden },
      update: velden,
    })
    await tx.offerteRegel.deleteMany({
      where: { offerteId: o.id, id: { notIn: o.regels.map(r => r.id) } },
    })
    for (const [i, r] of o.regels.entries()) {
      const rv = {
        sortOrder: r.sortOrder ?? i + 1,
        artikelId: r.artikelId,
        naam: r.naam,
        omschrijving: r.omschrijving,
        qty: r.qty,
        eenheid: r.eenheid,
        verkoopprijs: r.verkoopprijs,
        totaal: r.totaal,
        bewerkingen: r.bewerkingen,
      }
      await tx.offerteRegel.upsert({
        where: { id: r.id },
        create: { id: r.id, offerteId: o.id, ...rv },
        update: rv,
      })
    }
  }

  // ── Opdrachtbevestiging ──
  const ob = next.opdrachtbevestiging
  if (!ob) {
    await tx.opdrachtbevestiging.deleteMany({ where: { projectId: next.id } })
  } else {
    await tx.opdrachtbevestiging.deleteMany({
      where: { projectId: next.id, id: { not: ob.id } },
    })
    const velden = {
      offerteId: ob.offerteId,
      levertijdDatum: ob.levertijdDatum,
      notities: ob.notities,
      status: ob.status,
      verzondenOp: ob.verzondenOp,
      updatedAt: d(ob.updatedAt),
    }
    await tx.opdrachtbevestiging.upsert({
      where: { id: ob.id },
      create: { id: ob.id, projectId: next.id, createdAt: d(ob.createdAt), ...velden },
      update: velden,
    })
    await tx.obRegel.deleteMany({
      where: { obId: ob.id, id: { notIn: ob.regels.map(r => r.id) } },
    })
    for (const [i, r] of ob.regels.entries()) {
      const rv = {
        sortOrder: r.sortOrder ?? i + 1,
        artikelId: r.artikelId,
        naam: r.naam,
        omschrijving: r.omschrijving,
        qty: r.qty,
        eenheid: r.eenheid,
        verkoopprijs: r.verkoopprijs,
        totaal: r.totaal,
        bewerkingen: r.bewerkingen,
      }
      await tx.obRegel.upsert({
        where: { id: r.id },
        create: { id: r.id, obId: ob.id, ...rv },
        update: rv,
      })
    }
  }

  // ── Productieorders ──
  await tx.productieOrder.deleteMany({
    where: { projectId: next.id, id: { notIn: next.productieOrders.map(o => o.id) } },
  })
  for (const o of next.productieOrders) {
    const velden = {
      offerteRegelId: o.offerteRegelId,
      artikelId: o.artikelId,
      artikelNaam: o.artikelNaam,
      qty: o.qty,
      eenheid: o.eenheid,
      status: o.status,
      updatedAt: d(o.updatedAt),
    }
    await tx.productieOrder.upsert({
      where: { id: o.id },
      create: { id: o.id, projectId: next.id, createdAt: d(o.createdAt), ...velden },
      update: velden,
    })
    await tx.productieStap.deleteMany({
      where: { orderId: o.id, id: { notIn: o.stappen.map(s => s.id) } },
    })
    for (const [i, s] of o.stappen.entries()) {
      const sv = {
        volgorde: s.volgorde ?? i + 1,
        naam: s.naam,
        machine: s.machine,
        gereedOp: s.gereedOp,
        gereedDoor: s.gereedDoor,
        geplandDatum: s.geplandDatum ?? null,
        geplandMachine: s.geplandMachine ?? null,
        queuePosition: s.queuePosition ?? null,
        notBefore: s.notBefore ?? null,
      }
      await tx.productieStap.upsert({
        where: { id: s.id },
        create: { id: s.id, orderId: o.id, ...sv },
        update: sv,
      })
    }
  }

  // ── Paklijst ──
  const pl = next.paklijst
  if (!pl) {
    await tx.paklijst.deleteMany({ where: { projectId: next.id } })
  } else {
    await tx.paklijst.deleteMany({ where: { projectId: next.id, id: { not: pl.id } } })
    const velden = { notities: pl.notities, verzondenOp: pl.verzondenOp }
    await tx.paklijst.upsert({
      where: { id: pl.id },
      create: { id: pl.id, projectId: next.id, createdAt: d(pl.createdAt), ...velden },
      update: velden,
    })
    const ids = regelSleutels(pl.id, pl.regels.map(r => r.productieOrderId))
    await tx.paklijstRegel.deleteMany({ where: { paklijstId: pl.id, id: { notIn: ids } } })
    for (const [i, r] of pl.regels.entries()) {
      const rv = {
        sortOrder: i + 1,
        productieOrderId: r.productieOrderId,
        artikelNaam: r.artikelNaam,
        qty: r.qty,
        eenheid: r.eenheid,
      }
      await tx.paklijstRegel.upsert({
        where: { id: ids[i] },
        create: { id: ids[i], paklijstId: pl.id, ...rv },
        update: rv,
      })
    }
  }

  // ── Factuur ──
  const f = next.factuur
  if (!f) {
    await tx.factuur.deleteMany({ where: { projectId: next.id } })
  } else {
    await tx.factuur.deleteMany({ where: { projectId: next.id, id: { not: f.id } } })
    const velden = {
      offerteId: f.offerteId,
      btwPct: f.btwPct,
      subtotaal: f.subtotaal,
      btwBedrag: f.btwBedrag,
      totaalInclBtw: f.totaalInclBtw,
      notities: f.notities,
      vervaldatum: f.vervaldatum,
      verzondenOp: f.verzondenOp,
    }
    await tx.factuur.upsert({
      where: { id: f.id },
      create: { id: f.id, projectId: next.id, createdAt: d(f.createdAt), ...velden },
      update: velden,
    })
    const ids = regelSleutels(f.id, f.regels.map(r => r.offerteRegelId))
    await tx.factuurRegel.deleteMany({ where: { factuurId: f.id, id: { notIn: ids } } })
    for (const [i, r] of f.regels.entries()) {
      const rv = {
        sortOrder: i + 1,
        offerteRegelId: r.offerteRegelId,
        naam: r.naam,
        qty: r.qty,
        eenheid: r.eenheid,
        verkoopprijs: r.verkoopprijs,
        totaal: r.totaal,
      }
      await tx.factuurRegel.upsert({
        where: { id: ids[i] },
        create: { id: ids[i], factuurId: f.id, ...rv },
        update: rv,
      })
    }
  }
}
