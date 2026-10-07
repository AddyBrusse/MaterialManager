import type { Prisma } from '@prisma/client'
import {
  celVoor, celBronnenVoor, goedkoopste, nodigVoorProductie, planVoor, verwachtBinnen, meldingVoor, vandaagIso,
  type Cel, type BestelRegel, type InkoopOptie, type InkoopOverzicht, type InkoopOverzichtRegel, type InkoopLeverancier, type NodigVoor,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { leesRegels, vergelijkData } from './bestellingen'
import { leverancierEmail } from './prijsaanvragen'

/**
 * Het inkoopoverzicht (2026-10-07): per regel wanneer hij nodig is voor de
 * productie, wie hem levert (gekozen, anders de goedkoopste), uiterlijk
 * bestellen en de stand. Alles afgeleid op het moment van lezen — de planning
 * schuift, en een opgeslagen "uiterlijk" zou dan achterlopen.
 */

type Db = typeof prisma | Prisma.TransactionClient

/** Zo lang blijft iets in "Binnen" staan. */
const BINNEN_DAGEN = 14

function alsOptie(leverancierId: string, naam: string, c: Cel, goedkoopst: boolean): InkoopOptie | null {
  if (c.soort === 'geen') return null
  if (c.soort === 'gevraagd') {
    return { leverancierId, naam, soort: 'gevraagd', bron: null, antwoordId: null, aanvraagId: c.aanvraagId, totaal: null, uitleg: null, levertijdDagen: null, goedkoopst: false }
  }
  return {
    leverancierId, naam, soort: 'prijs', bron: c.bron, antwoordId: c.antwoordId, aanvraagId: c.aanvraagId,
    totaal: Math.round(c.totaal * 100) / 100, uitleg: c.uitleg, levertijdDagen: c.levertijdDagen, goedkoopst,
  }
}

export interface OverzichtFilter {
  projectId?: string
  regelIds?: string[]
}

export async function leesOverzicht(db: Db, f: OverzichtFilter = {}, nu = new Date()): Promise<InkoopOverzicht> {
  const vandaag = vandaagIso(nu)
  const sinds = new Date(nu.getTime() - BINNEN_DAGEN * 86_400_000)

  // Wat er in beeld komt: alles wat open of onderweg is, en wat kort geleden binnenkwam.
  // Voor een project: alles van dat project.
  let where: Prisma.BestelRegelWhereInput
  if (f.regelIds) where = { id: { in: f.regelIds } }
  else if (f.projectId) where = { projectId: f.projectId }
  else {
    const recent = await db.ontvangst.findMany({ where: { createdAt: { gte: sinds } }, select: { regel: { select: { bestelRegelId: true } } } })
    where = { OR: [{ status: { in: ['te_bestellen', 'aangevraagd', 'besteld'] } }, { id: { in: recent.map((o) => o.regel.bestelRegelId) } }] }
  }
  const regels = await leesRegels(db, where)
  const ids = regels.map((r) => r.id)
  const projectIds = [...new Set(regels.map((r) => r.projectId).filter((x): x is string => !!x))]
  const open = regels.filter((r) => r.status === 'te_bestellen' || r.status === 'aangevraagd')

  const [company, v, orders, inkoopRegels, ontvangsten, relaties] = await Promise.all([
    db.company.findUnique({ where: { id: 'default' }, select: { inkoopMargeDagen: true } }),
    open.length ? vergelijkData(db, open.map((r) => r.id)) : null,
    db.productieOrder.findMany({ where: { projectId: { in: projectIds } }, include: { stappen: true } }),
    db.inkooporderRegel.findMany({
      where: { bestelRegelId: { in: ids }, inkooporder: { status: { not: 'vervallen' } } },
      include: { inkooporder: { select: { id: true, leverancierId: true, status: true, verzondenOp: true, createdAt: true, leverancier: { select: { naam: true } } } } },
    }),
    db.ontvangst.findMany({ where: { regel: { bestelRegelId: { in: ids } } }, select: { createdAt: true, gereserveerdVoor: true, regel: { select: { bestelRegelId: true } } } }),
    db.relatie.findMany({ where: { OR: [{ type: { in: ['leverancier', 'beide'] } }] }, select: { id: true, naam: true, email: true, contacten: true, francoBedrag: true } }),
  ])
  const marge = company?.inkoopMargeDagen ?? 2

  const naamVan = new Map(relaties.map((r) => [r.id, r.naam]))
  for (const l of v?.leveranciers ?? []) naamVan.set(l.id, l.naam)

  const nodigVan = (r: BestelRegel): NodigVoor => {
    const eigen = orders.filter((o) => o.projectId === r.projectId && (!r.offerteRegelId || o.offerteRegelId === r.offerteRegelId))
    return nodigVoorProductie(eigen.flatMap((o) => o.stappen), r.nodigVoor)
  }

  const uit: InkoopOverzichtRegel[] = regels.map((r) => {
    const nodig = r.projectId ? nodigVan(r) : { datum: null, bron: null, machine: null }
    const ink = inkoopRegels.filter((x) => x.bestelRegelId === r.id).sort((a, b) => +b.inkooporder.createdAt - +a.inkooporder.createdAt)[0]

    // De leveranciers die je kunt kiezen, met de goedkoopste gemarkeerd.
    let opties: InkoopOptie[] = []
    if (v && (r.status === 'te_bestellen' || r.status === 'aangevraagd')) {
      const bronnen = celBronnenVoor(v, r)
      const cellen = new Map(v.leveranciers.map((l) => [l.id, celVoor(r, l.id, bronnen)]))
      const beste = goedkoopste(cellen)
      opties = v.leveranciers
        .map((l) => alsOptie(l.id, l.naam, cellen.get(l.id)!, l.id === beste))
        .filter((o): o is InkoopOptie => !!o)
        .sort((a, b) => (a.totaal ?? Infinity) - (b.totaal ?? Infinity) || a.naam.localeCompare(b.naam, 'nl'))
    }

    let leverancier: InkoopOverzichtRegel['leverancier'] = null
    if (ink) {
      leverancier = {
        leverancierId: ink.inkooporder.leverancierId, naam: ink.inkooporder.leverancier.naam, soort: 'prijs', bron: r.keuze?.bron ?? null,
        antwoordId: r.keuze?.antwoordId ?? null, aanvraagId: null, totaal: Number(ink.totaal), uitleg: ink.uitleg,
        levertijdDagen: ink.levertijdDagen, goedkoopst: false, gekozen: true,
      }
    } else if (r.keuze) {
      const k = r.keuze
      leverancier = {
        leverancierId: k.leverancierId, naam: k.leverancierNaam, soort: 'prijs', bron: k.bron, antwoordId: k.antwoordId,
        aanvraagId: null, totaal: k.totaal, uitleg: k.uitleg, levertijdDagen: k.levertijdDagen,
        goedkoopst: opties.find((o) => o.leverancierId === k.leverancierId)?.goedkoopst ?? false, gekozen: true,
      }
    } else {
      const beste = opties.find((o) => o.goedkoopst) ?? opties.find((o) => o.soort === 'gevraagd')
      if (beste) leverancier = { ...beste, gekozen: false }
    }

    const verzonden = ink?.inkooporder.status === 'verzonden'
    const verwacht = verzonden ? verwachtBinnen(ink!.inkooporder.verzondenOp ? vandaagIso(ink!.inkooporder.verzondenOp) : null, ink!.levertijdDagen, ink!.verwachtDatum) : null
    // Een klaargezette order (concept) is nog niet besteld: hij telt als open.
    const plan = planVoor({ status: r.status, nodig: nodig.datum, levertijdDagen: leverancier?.levertijdDagen ?? null, verwacht }, vandaag, marge)
    const binnen = ontvangsten.filter((o) => o.regel.bestelRegelId === r.id).sort((a, b) => +b.createdAt - +a.createdAt)

    return {
      id: r.id, status: r.status, bron: r.bron, materiaal: r.materiaal, exoot: r.exoot, stuks: r.stuks, lengteMm: r.lengteMm, kg: r.kg,
      projectId: r.projectId, klantNaam: r.klantNaam, artikelNaam: r.artikelNaam, notitie: r.notitie, levertijdDatum: r.nodigVoor,
      nodig, plan, leverancier, opties,
      order: ink
        ? {
            id: ink.inkooporder.id, status: ink.inkooporder.status as 'concept' | 'verzonden', inkooporderRegelId: ink.id,
            referentie: `${ink.inkooporder.id}.${ink.positie}`, verzondenOp: ink.inkooporder.verzondenOp?.toISOString() ?? null,
            verwachtAangepast: !!ink.verwachtDatum, ontvangenStuks: ink.ontvangenStuks, leverancierNaam: ink.inkooporder.leverancier.naam,
          }
        : null,
      binnenOp: binnen[0]?.createdAt.toISOString() ?? null,
      gereserveerd: binnen.some((o) => !!o.gereserveerdVoor),
    }
  })

  const leveranciers: InkoopLeverancier[] = relaties
    .map((r) => ({ id: r.id, naam: r.naam, email: leverancierEmail(r), francoBedrag: r.francoBedrag == null ? null : Number(r.francoBedrag) }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))

  const meldingen = uit
    .map((r) => meldingVoor({
      id: r.id, materiaal: r.materiaal, projectId: r.projectId, leverancierNaam: r.leverancier?.naam ?? null,
      inkooporderId: r.order?.id ?? null, nodig: r.nodig, plan: r.plan,
    }))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .sort((a, b) => ['te_laat_besteld', 'komt_te_laat', 'nu_bestellen'].indexOf(a.stand) - ['te_laat_besteld', 'komt_te_laat', 'nu_bestellen'].indexOf(b.stand))

  return { vandaag, margeDagen: marge, regels: uit, leveranciers, meldingen }
}
