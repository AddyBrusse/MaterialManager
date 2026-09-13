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
import { planZaagwerk, type PlanStaaf, type ZaagPlan, type ZaagParams } from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { gereserveerdPerStaaf } from './voorraad'

type Db = Prisma.TransactionClient

/** Zaagsnede — hoort bij de zaag en niet bij de draaibank, dus voorlopig één
 *  waarde voor de werkplaats. Per zaagbon aan te passen in de calculator. */
const STEEKBREEDTE_MM = 3
/** Afvlakken per stuk, zelfde verhaal. */
const VLAK_TOESLAG_MM = 3

export interface PlanContext {
  artikelId: string
  artikelNaam: string
  aantal: number
  /** De machine bepaalt de laderlengtes en de opspanning. */
  machineId: string | null
  /** Overschrijvingen voor deze ene bon. */
  overschrijf?: Partial<ZaagParams> & { loaderMinMm?: number; loaderMaxMm?: number }
}

export interface PlanUitkomst {
  plan: ZaagPlan
  /** Waar de maten vandaan komen, zodat het scherm het kan tonen en iemand kan
   *  zien wanneer een default gebruikt is in plaats van een echte instelling. */
  gebruikt: {
    machineNaam: string | null
    werkstukLengteMm: number
    params: ZaagParams
    loaderMinMm: number
    loaderMaxMm: number
    schrootDrempelMm: number
  }
  /** Staven die meededen, met hun vrije lengte. */
  kandidaten: PlanStaaf[]
}

/**
 * Het beste zaagplan voor één artikel bij een bepaald aantal.
 *
 * Kijkt alleen naar staven die op het recept passen (profiel + kwaliteit +
 * afmeting) en rekent met de **vrije** lengte: wat al voor een ander project
 * vastligt telt niet mee.
 */
export async function maakPlan(db: Db, ctx: PlanContext): Promise<PlanUitkomst> {
  const artikel = await db.article.findUnique({
    where: { id: ctx.artikelId },
    select: { id: true, naam: true, recipe: true },
  })
  if (!artikel) throw new AppError(404, 'NOT_FOUND', 'Artikel niet gevonden')

  const recept = artikel.recipe as {
    profileId?: string; gradeId?: string
    dimensions?: Record<string, number>; lengthPerPieceMm?: number
  } | null
  if (!recept?.profileId || !recept.gradeId) {
    throw new AppError(409, 'GEEN_RECEPT',
      `${artikel.naam} heeft nog geen recept — zonder profiel en kwaliteit valt er geen materiaal te kiezen`)
  }
  const werkstukLengteMm = Number(recept.lengthPerPieceMm ?? 0)
  if (werkstukLengteMm <= 0) {
    throw new AppError(409, 'GEEN_LENGTE',
      `${artikel.naam} heeft geen werkstuklengte in het recept`)
  }

  const machine = ctx.machineId
    ? await db.machine.findUnique({ where: { id: ctx.machineId } })
    : null
  const bedrijf = await db.company.findUnique({ where: { id: 'default' } })

  const params: ZaagParams = {
    steekbreedte: ctx.overschrijf?.steekbreedte ?? STEEKBREEDTE_MM,
    vlakToeslag: ctx.overschrijf?.vlakToeslag ?? VLAK_TOESLAG_MM,
    afsteek: ctx.overschrijf?.afsteek ?? machine?.afsteekMm ?? 3,
    opspanlengte: ctx.overschrijf?.opspanlengte ?? machine?.opspanlengteMm ?? 30,
  }
  const loaderMinMm = ctx.overschrijf?.loaderMinMm ?? machine?.barloaderMinMm ?? 500
  const loaderMaxMm = ctx.overschrijf?.loaderMaxMm ?? machine?.barloaderMaxMm ?? 1100
  const schrootDrempelMm = bedrijf?.schrootDrempelMm ?? 200

  // Alleen staven die op het recept passen. De afmetingen moeten gelijk zijn,
  // niet "groot genoeg": een Ø60 opdraaien naar Ø50 is een besluit van een mens,
  // geen automatische keuze.
  const staven = await db.rawMaterial.findMany({
    where: { profileId: recept.profileId, gradeId: recept.gradeId, currentStock: { gt: 0 } },
    include: { locationSlot: { include: { location: true } } },
  })
  const passend = staven.filter((s) => dimensiesGelijk(s.dimensions, recept.dimensions))
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

  const plan = planZaagwerk({
    aantal: ctx.aantal,
    werkstukLengteMm,
    params,
    loader: { minMm: loaderMinMm, maxMm: loaderMaxMm },
    schrootDrempelMm,
    staven: kandidaten,
  })

  return {
    plan,
    gebruikt: {
      machineNaam: machine?.name ?? null,
      werkstukLengteMm, params, loaderMinMm, loaderMaxMm, schrootDrempelMm,
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
