// Prijshistorie van een artikel wegschrijven.
//
// Twee meetmomenten, één tabel (`artikel_prijs_snapshots`, kolom `bron`):
//
//   'calculatie' — het recept is opgeslagen en de kostprijs is veranderd.
//                  Geeft het verloop tussen orders door; zonder deze punten
//                  heeft een artikel dat twee keer per jaar besteld wordt twee
//                  stipjes en geen lijn.
//   'order'      — een offerte is geaccepteerd. Dit is het harde punt: wat de
//                  klant werkelijk betaalt, bij dit aantal, met de kostprijs
//                  van dat moment ernaast.
//
// De kostprijs wordt hier serverside berekend met `@stockmanager/shared`, niet
// door de frontend meegestuurd: anders hangt je historie af van welk scherm de
// order toevallig aanmaakte.
import type { Prisma } from '@prisma/client'
import { kostprijsOpbouw, type CalcArtikel, type PrijsBronnen } from '@stockmanager/shared'

type Db = Prisma.TransactionClient

/** Prisma levert Decimal; de rekenkern wil number. */
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}

export async function bronnenLaden(db: Db): Promise<PrijsBronnen> {
  const [grades, profiles, machines] = await Promise.all([
    db.grade.findMany(),
    db.profile.findMany(),
    db.machine.findMany(),
  ])
  return {
    grades: grades.map((g) => ({
      id: g.id,
      densityKgM3: num(g.densityKgM3),
      pricePerKg: g.pricePerKg != null ? num(g.pricePerKg) : undefined,
    })),
    profiles: profiles.map((p) => ({ id: p.id, volumeFormula: p.volumeFormula })),
    machines: machines.map((m) => ({
      id: m.id,
      machineRatePerHour: num(m.machineRatePerHour),
      operatorRatePerHour: num(m.operatorRatePerHour),
    })),
  }
}

/** Prisma's JSON-kolommen zijn `unknown` — hier de vorm die de rekenkern wil. */
function calcArtikel(row: { recipe: unknown; estimate: unknown }): CalcArtikel {
  return {
    recipe: (row.recipe ?? null) as CalcArtikel['recipe'],
    estimate: (row.estimate ?? null) as CalcArtikel['estimate'],
  }
}

interface Meting {
  qty: number
  kostprijsPerStuk: number
  kostprijsBasis: number
  verkoopprijsBasis: number
  verkoopprijsPerStuk: number | null
  margePct: number | null
  kostprijsTotaal: number
  verkoopprijsTotaal: number | null
  materiaalPerStuk: number
  instellenPerStuk: number
  bewerkingPerStuk: number
  externPerStuk: number
}

/** Rond op centen af — anders staat er €12.333333333 in de historie. */
function cent(v: number): number {
  return Math.round(v * 100) / 100
}

function meet(
  artikel: CalcArtikel, bronnen: PrijsBronnen, qty: number, verkoopPerStuk: number | null,
): Meting | null {
  const opbouw = kostprijsOpbouw(artikel, bronnen, qty)
  if (!opbouw) return null
  // De vergelijkbare maat: dezelfde calculatie, herrekend bij 1 stuk. Zonder
  // deze zou de grafiek bij elke grote order een duik maken die alleen over de
  // batchgrootte gaat en niet over de prijs.
  const basis = qty === 1 ? opbouw : (kostprijsOpbouw(artikel, bronnen, 1) ?? opbouw)
  const verkoop = verkoopPerStuk ?? cent(opbouw.sell)
  return {
    qty,
    kostprijsPerStuk: cent(opbouw.cost),
    kostprijsBasis: cent(basis.cost),
    verkoopprijsBasis: cent(basis.sell),
    verkoopprijsPerStuk: verkoop,
    margePct: opbouw.cost > 0 ? Math.round(((verkoop / opbouw.cost) - 1) * 1000) / 10 : null,
    kostprijsTotaal: cent(opbouw.cost * qty),
    verkoopprijsTotaal: cent(verkoop * qty),
    materiaalPerStuk: cent(opbouw.materialTotal),
    instellenPerStuk: cent(opbouw.setupTotal),
    bewerkingPerStuk: cent(opbouw.cycleTotal),
    externPerStuk: cent(opbouw.externalTotal),
  }
}

/**
 * Snapshot na het opslaan van een calculatie — alleen als er iets veranderd is.
 *
 * Zonder die controle krijg je een punt bij elke keer opslaan, ook als iemand
 * alleen een notitie aanpaste, en wordt de grafiek een rij identieke stippen.
 * Vergeleken wordt op centen: een afrondingsrestje is geen prijswijziging.
 */
export async function snapshotBijCalculatie(
  db: Db, artikelId: string, row: { recipe: unknown; estimate: unknown }, door: string | null,
): Promise<void> {
  const artikel = calcArtikel(row)
  if (!artikel.estimate) return
  const bronnen = await bronnenLaden(db)
  const m = meet(artikel, bronnen, 1, null)
  if (!m) return

  const vorige = await db.artikelPrijsSnapshot.findFirst({
    where: { artikelId, bron: 'calculatie' },
    orderBy: { gemetenOp: 'desc' },
  })
  if (vorige
    && cent(vorige.kostprijsBasis) === m.kostprijsBasis
    && cent(vorige.verkoopprijsBasis) === m.verkoopprijsBasis) return

  await db.artikelPrijsSnapshot.create({
    data: { artikelId, bron: 'calculatie', gemetenOp: new Date(), door, ...m },
  })
}

export interface OrderRegel {
  artikelId: string | null
  id: string
  qty: number
  verkoopprijs: number
}

/**
 * Snapshots bij het accepteren van een offerte: één rij per regel die aan een
 * artikel hangt. De verkoopprijs komt van de regel (dát is wat de klant
 * betaalt), de kostprijs wordt hier berekend bij het aantal van die regel.
 */
export async function snapshotBijOrder(
  db: Db,
  ctx: {
    regels: OrderRegel[]
    projectId: string; offerteId: string
    relatieId: string | null; klant: string | null
    door: string | null
  },
): Promise<number> {
  const metArtikel = ctx.regels.filter((r) => r.artikelId)
  if (metArtikel.length === 0) return 0

  const bronnen = await bronnenLaden(db)
  const artikelen = await db.article.findMany({
    where: { id: { in: metArtikel.map((r) => r.artikelId as string) } },
    select: { id: true, recipe: true, estimate: true },
  })
  const perId = new Map(artikelen.map((a) => [a.id, a]))
  const gemetenOp = new Date()

  const rijen = metArtikel.flatMap((regel) => {
    const row = perId.get(regel.artikelId as string)
    if (!row) return []
    const m = meet(calcArtikel(row), bronnen, regel.qty, regel.verkoopprijs)
    // Geen calculatie? Dan is er geen kostprijs om te bewaren, en een rij met
    // kostprijs 0 zou de grafiek naar beneden trekken alsof het gratis was.
    if (!m) return []
    return [{
      artikelId: regel.artikelId as string,
      bron: 'order',
      gemetenOp,
      projectId: ctx.projectId,
      offerteId: ctx.offerteId,
      offerteRegelId: regel.id,
      relatieId: ctx.relatieId,
      klant: ctx.klant,
      door: ctx.door,
      ...m,
    }]
  })

  if (rijen.length === 0) return 0
  await db.artikelPrijsSnapshot.createMany({ data: rijen })
  return rijen.length
}
