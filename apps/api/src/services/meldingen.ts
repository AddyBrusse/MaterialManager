// Eén meldingenlijst voor iedereen (2026-10-09). Haalt de gegevens erbij; de
// regels staan in `packages/shared/calc/meldingen.ts`. Afgeleid bij het
// lezen, nooit opgeslagen: een melding verdwijnt als het opgelost is.
import type { Prisma } from '@prisma/client'
import {
  plusWerkdagen, prijsaanvraagMelding, productieMeldingen, sorteerMeldingen, vandaagIso,
  type InkoopStand, type Melding,
} from '@stockmanager/shared'
import { PROJECT_INCLUDE, serialize } from './project-store'
import { materiaalStand } from './materiaal-stand'
import { leesOverzicht } from './inkoop-overzicht'

type Db = Prisma.TransactionClient

const ERNST_INKOOP: Partial<Record<InkoopStand, Melding['ernst']>> = { te_laat_besteld: 'rood', komt_te_laat: 'rood', nu_bestellen: 'oranje' }

export interface Meldingen {
  aantal: number
  rood: number
  meldingen: Melding[]
}

export async function alleMeldingen(db: Db, nu = new Date()): Promise<Meldingen> {
  const vandaag = vandaagIso(nu)
  const uit: Melding[] = []

  // ── Productie: orders in de hal ──
  const rows = await db.project.findMany({
    where: { productieOrders: { some: { status: { in: ['gepland', 'in_productie'] } } } },
    include: PROJECT_INCLUDE,
  })
  const sindsBinnen = new Date(`${plusWerkdagen(vandaag, -2)}T00:00:00`)
  const binnen = await db.ontvangst.findMany({
    where: { createdAt: { gte: sindsBinnen } },
    select: { regel: { select: { bestelRegel: { select: { projectId: true, offerteRegelId: true } } } } },
  })
  for (const p of rows.map(serialize)) {
    const stand = await materiaalStand(db, p)
    for (const o of p.productieOrders) {
      const m = stand.find((s) => s.orderId === o.id)
      const start = o.stappen.map((s) => s.geplandDatum).filter((d): d is string => !!d).sort()[0] ?? null
      uit.push(...productieMeldingen({
        projectId: p.id, orderId: o.id, artikelNaam: o.artikelNaam,
        inDeHal: o.status === 'gepland' || o.status === 'in_productie',
        materiaalOntbreekt: !!m && !m.vastgelegd,
        bestelRegels: m?.bestelRegels ?? [],
        materiaalVerwacht: o.materiaalVerwacht ?? null, materiaalOnbekend: !!o.materiaalOnbekend, start,
        netBinnen: binnen.some((b) => b.regel.bestelRegel.projectId === p.id && b.regel.bestelRegel.offerteRegelId === o.offerteRegelId),
      }))
    }
  }

  // ── Prijsaanvragen zonder antwoord ──
  const aanvragen = await db.prijsaanvraagLeverancier.findMany({
    where: { verzondenOp: { not: null } },
    include: {
      leverancier: { select: { naam: true } },
      prijsaanvraag: { include: { antwoorden: { select: { leverancierId: true } }, regels: { include: { bestelRegel: { select: { status: true } } } } } },
    },
  })
  for (const a of aanvragen) {
    const m = prijsaanvraagMelding({
      aanvraagId: a.prijsaanvraagId, leverancierNaam: a.leverancier.naam,
      verzondenOp: a.verzondenOp ? vandaagIso(a.verzondenOp) : null,
      heeftAntwoord: a.prijsaanvraag.antwoorden.some((x) => x.leverancierId === a.leverancierId),
      nogOpen: a.prijsaanvraag.regels.some((r) => r.bestelRegel.status === 'aangevraagd'),
    }, vandaag)
    if (m) uit.push(m)
  }

  // ── Inkoop: wat vandaag moet. Een tekort dat al als productiemelding staat niet dubbel. ──
  const ov = await leesOverzicht(db, {}, nu)
  for (const im of ov.meldingen) {
    if (uit.some((x) => x.id === `tekort:${im.regelId}`)) continue
    uit.push({
      id: `inkoop:${im.regelId}`, groep: 'inkoop', ernst: ERNST_INKOOP[im.stand] ?? 'oranje',
      titel: im.titel, tekst: im.tekst, link: `/bestellingen?regel=${im.regelId}`,
    })
  }

  const meldingen = sorteerMeldingen(uit)
  return { aantal: meldingen.filter((m) => m.ernst !== 'groen').length, rood: meldingen.filter((m) => m.ernst === 'rood').length, meldingen }
}
