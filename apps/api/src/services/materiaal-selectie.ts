// Materiaal kiezen voor een artikel dat opdracht geworden is.
//
// Het moment waarop een offerte geaccepteerd wordt is het moment waarop besloten
// moet worden wát er gezaagd gaat worden. Dat gebeurt hier niet automatisch: het
// programma maakt per artikel een todo aan ("materiaal selecteren"), rekent op
// verzoek het beste plan uit, en legt pas vast als iemand het gezien en
// bevestigd heeft. Materiaal stilzwijgend vastleggen is precies hoe je een
// staaf kwijtraakt die voor een spoedklus bedoeld was.
//
// De rekenkern zelf staat in `@stockmanager/shared` (`calc/zaagplan.ts`) en is
// puur; dit bestand haalt de gegevens erbij en schrijft het resultaat weg.
import type { Prisma } from '@prisma/client'
import {
  laderVoorRegel, materiaalBehoefte, materiaalVoorstellen, ZAAG_STANDAARD,
  type ArticleEstimate, type LaderGegevens, type MateriaalBehoefte, type PlanStaaf, type Voorstel,
} from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { gereserveerdPerStaaf } from './voorraad'

type Db = Prisma.TransactionClient

/** Het materiaal van een artikel zoals het recept het zegt (2026-10-09). */
export interface ArtikelMateriaal {
  artikelNaam: string
  profileId: string
  gradeId: string
  dimensions: Record<string, number>
  werkstukLengteMm: number
  /** Met de stangenlader van deze machine, of zonder. */
  lader: LaderGegevens | null
  /** "1.4301 Rond Ø30" — voor op het scherm en de bestel-todo. */
  omschrijving: string
}

export interface PlanUitkomst {
  behoefte: MateriaalBehoefte
  /** Het beste eerst; kiezen doet een mens. */
  voorstellen: Voorstel[]
  gebruikt: {
    materiaal: string
    werkstukLengteMm: number
    lader: LaderGegevens | null
    zaagsnedeMm: number
    vlakMm: number
    schrootDrempelMm: number
  }
  /** Staven die meededen, met hun vrije lengte. */
  kandidaten: PlanStaaf[]
}

/**
 * Het materiaal uit het recept: de eerste materiaalregel van de calculatie
 * (geen exoot — die is op maat besteld en wordt niet uit voorraad gekozen).
 * Profiel, afmetingen en lengte vallen terug op het oude recept-veld als de
 * regel ze niet heeft.
 */
export async function materiaalVanArtikel(db: Db, artikelId: string): Promise<ArtikelMateriaal> {
  const artikel = await db.article.findUnique({
    where: { id: artikelId },
    select: { id: true, naam: true, recipe: true, estimate: true },
  })
  if (!artikel) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')

  const recept = artikel.recipe as {
    profileId?: string; gradeId?: string
    dimensions?: Record<string, number>; lengthPerPieceMm?: number
  } | null
  const est = artikel.estimate as ArticleEstimate | null
  const regel = est?.nodes?.find((n) => n.type === 'material' && !n.exoot && n.gradeId)
  const profileId = regel?.profileId ?? recept?.profileId
  const gradeId = regel?.gradeId ?? recept?.gradeId
  const dimensions = regel?.dimensions && Object.keys(regel.dimensions).length > 0
    ? regel.dimensions : (recept?.dimensions ?? {})
  if (!profileId || !gradeId || Object.keys(dimensions).length === 0) {
    throw new AppError(409, 'GEEN_RECEPT',
      `${artikel.naam} heeft nog geen materiaal in het recept — kies eerst een materiaal in de calculatie`)
  }
  const werkstukLengteMm = Number(regel?.lengthMm ?? recept?.lengthPerPieceMm ?? 0)
  if (werkstukLengteMm <= 0) {
    throw new AppError(409, 'GEEN_LENGTE', `${artikel.naam} heeft geen werkstuklengte in het recept`)
  }

  const machines = regel?.laderMachineId
    ? await db.machine.findMany({ where: { id: regel.laderMachineId } })
    : []
  const lader = regel ? laderVoorRegel(regel, machines) : null

  const [grade, profile] = await Promise.all([
    db.grade.findUnique({ where: { id: gradeId }, select: { name: true } }),
    db.profile.findUnique({ where: { id: profileId }, select: { name: true, volumeFormula: true } }),
  ])
  const d = dimensions
  const maat = profile?.volumeFormula === 'round' ? `Ø${d.diameter}`
    : profile?.volumeFormula === 'tube' ? `Ø${d.outerDiameter}/Ø${d.innerDiameter}`
    : Object.values(d).join('×')
  return {
    artikelNaam: artikel.naam, profileId, gradeId, dimensions, werkstukLengteMm, lader,
    omschrijving: [grade?.name, profile?.name, maat].filter(Boolean).join(' '),
  }
}

/**
 * Voorstellen voor één artikel bij een bepaald aantal (2026-10-09).
 *
 * Eerst wat er gezaagd moet worden (`materiaalBehoefte`: laderstangen, gelijk
 * verdeeld), dan die lengtes tegen de voorraad (`materiaalVoorstellen`).
 * Alleen staven die op het recept passen (profiel + kwaliteit + afmeting) en
 * met de **vrije** lengte: wat al voor een ander project vastligt telt niet mee.
 * Nooit een andere kwaliteit (afgesproken 2026-10-09).
 */
export async function maakPlan(db: Db, ctx: { artikelId: string; aantal: number }): Promise<PlanUitkomst> {
  const mat = await materiaalVanArtikel(db, ctx.artikelId)
  const bedrijf = await db.company.findUnique({ where: { id: 'default' } })
  const schrootDrempelMm = bedrijf?.schrootDrempelMm ?? 200
  const behoefte = materiaalBehoefte(mat.werkstukLengteMm, mat.lader, ctx.aantal)

  // De afmetingen moeten gelijk zijn, niet "groot genoeg": een Ø60 opdraaien
  // naar Ø50 is een besluit van een mens, geen automatische keuze.
  const staven = await db.rawMaterial.findMany({
    // Geen exoten: die zijn op maat voor één klant besteld (2026-10-06).
    where: { profileId: mat.profileId, gradeId: mat.gradeId, currentStock: { gt: 0 }, exoot: false },
    include: { locationSlot: { include: { location: true } } },
  })
  const passend = staven.filter((s) => dimensiesGelijk(s.dimensions, mat.dimensions))
  const vast = await gereserveerdPerStaaf(db, passend.map((s) => s.id))

  const kandidaten: PlanStaaf[] = passend
    .map((s) => ({
      id: s.id,
      code: s.code,
      vrijMm: Number(s.currentStock) - (vast.get(s.id) ?? 0),
      locatie: s.locationSlot
        ? [s.locationSlot.location.label, s.locationSlot.level1, s.locationSlot.level2]
            .filter(Boolean).join(' · ')
        : null,
    }))
    .filter((s) => s.vrijMm > 0)

  const voorstellen = materiaalVoorstellen({
    stangen: behoefte.stangen, zaagsnedeMm: ZAAG_STANDAARD.steekbreedte, schrootDrempelMm, staven: kandidaten,
  })

  return {
    behoefte,
    voorstellen,
    gebruikt: {
      materiaal: mat.omschrijving, werkstukLengteMm: mat.werkstukLengteMm, lader: mat.lader,
      zaagsnedeMm: ZAAG_STANDAARD.steekbreedte, vlakMm: ZAAG_STANDAARD.vlakToeslag, schrootDrempelMm,
    },
    kandidaten,
  }
}

/** Afmetingen van staaf en recept moeten op de millimeter overeenkomen. */
function dimensiesGelijk(staaf: unknown, recept: Record<string, number> | undefined): boolean {
  if (!recept) return false
  const d = (staaf ?? {}) as Record<string, unknown>
  const sleutels = Object.keys(recept)
  if (sleutels.length === 0) return false
  return sleutels.every((k) => Number(d[k]) === Number(recept[k]))
}

/**
 * Todo's bij het aanmaken van een opdracht: per artikel één "materiaal
 * selecteren".
 *
 * Bewust todo's en geen automatische reserveringen — zie de kop van dit
 * bestand. Regels zonder artikel krijgen niets: daar valt geen recept bij te
 * zoeken.
 */
export async function todosBijOpdracht(
  db: Db,
  ctx: {
    projectId: string
    projectNaam: string
    regels: { id: string; artikelId: string | null; naam: string; qty: number }[]
    door: string
  },
): Promise<number> {
  const metArtikel = ctx.regels.filter((r) => r.artikelId)
  if (metArtikel.length === 0) return 0

  // Nooit twee keer dezelfde todo: een offerte kan opnieuw geaccepteerd worden.
  const bestaand = await db.todo.findMany({
    where: {
      soort: 'materiaal_selecteren',
      projectId: ctx.projectId,
      offerteRegelId: { in: metArtikel.map((r) => r.id) },
    },
    select: { offerteRegelId: true },
  })
  const al = new Set(bestaand.map((t) => t.offerteRegelId))
  const nieuw = metArtikel.filter((r) => !al.has(r.id))
  if (nieuw.length === 0) return 0

  await db.todo.createMany({
    data: nieuw.map((r) => ({
      title: `Materiaal selecteren: ${r.naam} (${r.qty}×) — ${ctx.projectNaam}`,
      soort: 'materiaal_selecteren',
      projectId: ctx.projectId,
      artikelId: r.artikelId,
      offerteRegelId: r.id,
      priority: 'high' as const,
      createdByUserId: ctx.door,
    })),
  })
  return nieuw.length
}

/**
 * Een bestel-todo voor wat er niet uit de voorraad te halen is.
 *
 * Wordt aangemaakt op het moment dat iemand een plan bevestigt dat een tekort
 * laat zien — dan is het tekort vastgesteld en niet langer een vermoeden.
 */
export async function bestelTodo(
  db: Db,
  ctx: {
    projectId: string
    artikelId: string
    artikelNaam: string
    materiaal: string
    tekortStuks: number
    tekortMm: number
    door: string
  },
): Promise<string | null> {
  const bestaand = await db.todo.findFirst({
    where: {
      soort: 'bestellen', done: false,
      projectId: ctx.projectId, artikelId: ctx.artikelId,
    },
    select: { id: true },
  })
  if (bestaand) return null

  const todo = await db.todo.create({
    data: {
      title: `Bestellen: ${ctx.materiaal} voor ${ctx.artikelNaam} — ${ctx.tekortStuks} stuks tekort (${Math.ceil(ctx.tekortMm)} mm)`,
      soort: 'bestellen',
      projectId: ctx.projectId,
      artikelId: ctx.artikelId,
      priority: 'high',
      createdByUserId: ctx.door,
    },
  })
  return todo.id
}
