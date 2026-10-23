// Materiaal kiezen voor een artikel dat opdracht geworden is.
//
// Het moment waarop een offerte geaccepteerd wordt is het moment waarop besloten
// moet worden wát er gezaagd gaat worden. Dat gebeurt hier niet automatisch: het
// programma maakt per artikel een todo aan ("materiaal selecteren"), rekent op
// verzoek het beste plan uit, en legt pas vast als iemand het gezien en
// bevestigd heeft. Materiaal stilzwijgend vastleggen is precies hoe je een
// staaf kwijtraakt die voor een spoedklus bedoeld was.
//
// Elke materiaalregel van het artikel doet mee, behalve een exoot (2026-10-23,
// `packages/shared/calc/materiaal-regels.ts`). Per regel een eigen plan: elke
// regel heeft een eigen maat, lengte en lader. Regels van hetzelfde materiaal
// worden na elkaar gekozen, niet samen op één staaf geschoven: de tweede ziet
// wat de eerste vastlegde, maar zuiniger samen nesten doet hij niet.
//
// De rekenkern zelf staat in `@stockmanager/shared` (`calc/zaagplan.ts`) en is
// puur; dit bestand haalt de gegevens erbij en schrijft het resultaat weg.
import type { Prisma } from '@prisma/client'
import {
  dekkingPerRegel, laderVoorRegel, materiaalBehoefte, materiaalVoorstellen, nogTeKiezen, voorraadRegels, ZAAG_STANDAARD,
  type ArticleEstimate, type LaderGegevens, type MateriaalBehoefte, type PlanStaaf, type RegelDekking, type TeZagen, type Voorstel,
} from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { tekortRegel } from './bestellingen'
import { gereserveerdPerStaaf, mm } from './voorraad'
import { bonnenVanOrderWaar } from './zaagbon'

type Db = Prisma.TransactionClient

/** Eén materiaalregel van een artikel zoals de calculatie hem zegt. */
export interface ArtikelMateriaal {
  /** Id van de materiaalregel in de calculatie; null = alleen het oude recept-veld. */
  regelId: string | null
  /** Naam van de regel in de calculatie. */
  naam: string
  profileId: string
  gradeId: string
  dimensions: Record<string, number>
  werkstukLengteMm: number
  /** Met de stangenlader van deze machine, of zonder. */
  lader: LaderGegevens | null
  /** "1.4301 Rond Ø30" — voor op het scherm en de bestel-todo. */
  omschrijving: string
  /** De regel mist iets (maat, lengte): er valt niets voor te kiezen tot dat ingevuld is. */
  fout: string | null
}

export interface ArtikelMaterialen {
  artikelNaam: string
  /** Uit voorraad, in de volgorde van het recept. */
  regels: ArtikelMateriaal[]
  /** Exoten: op maat besteld, niet uit voorraad (omschrijving per regel). */
  exoten: string[]
}

function maatTekst(formule: string | undefined, d: Record<string, number>): string {
  return formule === 'round' ? `Ø${d.diameter}`
    : formule === 'tube' ? `Ø${d.outerDiameter}/Ø${d.innerDiameter}`
    : Object.values(d).join('×')
}

/**
 * Alle materiaalregels van een artikel die uit de voorraad komen (2026-10-23).
 *
 * De eerste regel valt voor profiel, maat en lengte nog terug op het oude
 * recept-veld, zoals vóór 2026-10-23; een latere regel moet ze zelf hebben.
 * Een artikel zonder materiaalregels maar met een oud recept krijgt één regel
 * zonder id.
 */
export async function materialenVanArtikel(db: Db, artikelId: string): Promise<ArtikelMaterialen> {
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
  const knopen = voorraadRegels(est)
  const exootKnopen = (est?.nodes ?? []).filter((n) => n.type === 'material' && n.exoot)

  const ruw = knopen.length > 0
    ? knopen.map((n, i) => ({
        regelId: n.id as string | null, naam: n.name || 'Materiaal', knoop: n,
        profileId: n.profileId ?? (i === 0 ? recept?.profileId : undefined),
        gradeId: n.gradeId ?? undefined,
        dimensions: n.dimensions && Object.keys(n.dimensions).length > 0
          ? n.dimensions : (i === 0 ? recept?.dimensions ?? {} : {}),
        lengte: Number(n.lengthMm ?? (i === 0 ? recept?.lengthPerPieceMm : 0) ?? 0),
      }))
    : recept?.gradeId
      ? [{
          regelId: null, naam: 'Materiaal', knoop: null,
          profileId: recept.profileId, gradeId: recept.gradeId,
          dimensions: recept.dimensions ?? {}, lengte: Number(recept.lengthPerPieceMm ?? 0),
        }]
      : []
  if (ruw.length === 0 && exootKnopen.length === 0) {
    throw new AppError(409, 'GEEN_RECEPT',
      `${artikel.naam} heeft nog geen materiaal in het recept — kies eerst een materiaal in de calculatie`)
  }

  const laderIds = [...new Set(ruw.map((r) => r.knoop?.laderMachineId).filter((x): x is string => !!x))]
  const gradeIds = [...new Set([...ruw.map((r) => r.gradeId), ...exootKnopen.map((n) => n.gradeId)].filter((x): x is string => !!x))]
  const profileIds = [...new Set([...ruw.map((r) => r.profileId), ...exootKnopen.map((n) => n.profileId)].filter((x): x is string => !!x))]
  const [machines, grades, profiles] = await Promise.all([
    laderIds.length ? db.machine.findMany({ where: { id: { in: laderIds } } }) : Promise.resolve([]),
    db.grade.findMany({ where: { id: { in: gradeIds } }, select: { id: true, name: true } }),
    db.profile.findMany({ where: { id: { in: profileIds } }, select: { id: true, name: true, volumeFormula: true } }),
  ])
  const omschrijf = (gradeId?: string | null, profileId?: string | null, d: Record<string, number> = {}) => {
    const p = profiles.find((x) => x.id === profileId)
    return [grades.find((x) => x.id === gradeId)?.name, p?.name, Object.keys(d).length ? maatTekst(p?.volumeFormula, d) : null]
      .filter(Boolean).join(' ')
  }

  const meer = ruw.length > 1
  const regels = ruw.map((r): ArtikelMateriaal => {
    const wie = meer ? `${artikel.naam}, materiaalregel "${r.naam}",` : artikel.naam
    const fout = !r.profileId || !r.gradeId || Object.keys(r.dimensions).length === 0
      ? `${wie} heeft geen vorm of maat — vul die eerst in de calculatie in`
      : r.lengte <= 0 ? `${wie} heeft geen werkstuklengte in het recept` : null
    return {
      regelId: r.regelId, naam: r.naam,
      profileId: r.profileId ?? '', gradeId: r.gradeId ?? '', dimensions: r.dimensions,
      werkstukLengteMm: r.lengte,
      lader: r.knoop ? laderVoorRegel(r.knoop, machines) : null,
      omschrijving: omschrijf(r.gradeId, r.profileId, r.dimensions),
      fout,
    }
  })
  return {
    artikelNaam: artikel.naam, regels,
    exoten: exootKnopen.map((n) => omschrijf(n.gradeId, n.profileId, n.dimensions ?? {}) || n.name),
  }
}

export interface OrderRegelSleutel {
  projectId: string
  offerteRegelId: string
  artikelId: string
}

/**
 * Wat er per materiaalregel van deze orderregel al geregeld is: reserveringen
 * (open, bezig of al afgeboekt) en open tekort-bestelregels.
 *
 * Oudere reserveringen zonder `offerteRegelId` tellen alleen als er precies één
 * order met dit artikel in het project staat — hetzelfde filter als het
 * afboeken (`bonnenVanOrderWaar`).
 */
export async function dekkingVanOrderRegel(
  db: Db, sleutel: OrderRegelSleutel, regelIds: (string | null)[], aantal: number,
): Promise<RegelDekking[]> {
  const orders = await db.productieOrder.findMany({
    where: { projectId: sleutel.projectId, artikelId: sleutel.artikelId }, select: { offerteRegelId: true },
  })
  const enigeMetArtikel = new Set(orders.map((o) => o.offerteRegelId)).size <= 1
  const [reserveringen, tekorten] = await Promise.all([
    db.zaagReservering.findMany({
      where: bonnenVanOrderWaar(sleutel, enigeMetArtikel),
      select: { materiaalRegelId: true, pieces: true, status: true },
    }),
    db.bestelRegel.findMany({
      where: {
        bron: 'tekort', projectId: sleutel.projectId,
        OR: [
          { offerteRegelId: sleutel.offerteRegelId },
          ...(enigeMetArtikel ? [{ offerteRegelId: null, artikelId: sleutel.artikelId }] : []),
        ],
      },
      select: { materiaalRegelId: true, status: true },
    }),
  ])
  return dekkingPerRegel(regelIds, aantal, reserveringen, tekorten)
}

export interface RegelDekkingMetNaam extends RegelDekking {
  naam: string
  materiaal: string
  fout: string | null
}

/** Per orderregel van de opdracht: wat er per materiaalregel geregeld is. */
export interface OrderRegelDekking {
  offerteRegelId: string
  regels: RegelDekkingMetNaam[]
  /** Exoten van het artikel: komen via de bestelling, niet uit voorraad. */
  exoten: string[]
}

/**
 * De dekking van alle orderregels van een project — voor de Opdracht-tab, die
 * "1 van 2 materialen" toont zonder het zelf uit te rekenen.
 */
export async function dekkingVanProject(db: Db, projectId: string): Promise<OrderRegelDekking[]> {
  const ob = await db.opdrachtbevestiging.findUnique({
    where: { projectId }, include: { regels: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!ob) return []
  const uit: OrderRegelDekking[] = []
  for (const r of ob.regels) {
    if (!r.artikelId) continue
    let alles: ArtikelMaterialen
    try {
      alles = await materialenVanArtikel(db, r.artikelId)
    } catch (e) {
      // Artikel weg of zonder materiaal: dan valt er per regel niets te tellen.
      if (e instanceof AppError) { uit.push({ offerteRegelId: r.id, regels: [], exoten: [] }); continue }
      throw e
    }
    const d = await dekkingVanOrderRegel(db,
      { projectId, offerteRegelId: r.id, artikelId: r.artikelId }, alles.regels.map((x) => x.regelId), r.qty)
    uit.push({
      offerteRegelId: r.id,
      regels: alles.regels.map((m, i) => ({ ...d[i], naam: m.naam, materiaal: m.omschrijving, fout: m.fout })),
      exoten: alles.exoten,
    })
  }
  return uit
}

export interface PlanGebruikt {
  materiaal: string
  werkstukLengteMm: number
  lader: LaderGegevens | null
  zaagsnedeMm: number
  vlakMm: number
  schrootDrempelMm: number
}

/** Het plan van één materiaalregel. */
export interface PlanRegel {
  regelId: string | null
  naam: string
  materiaal: string
  fout: string | null
  dekking: RegelDekking
  /** Wat er nog gezaagd moet worden; null als er niets meer te kiezen is. */
  behoefte: MateriaalBehoefte | null
  /** Het beste eerst; kiezen doet een mens. */
  voorstellen: Voorstel[]
  gebruikt: PlanGebruikt
  /** Staven die meededen, met hun vrije lengte. */
  kandidaten: PlanStaaf[]
}

export interface PlanUitkomst {
  regels: PlanRegel[]
  exoten: string[]
}

/** Vrije staven van precies dit materiaal (profiel + kwaliteit + maat). */
async function kandidatenVoor(db: Db, mat: ArtikelMateriaal): Promise<PlanStaaf[]> {
  // De afmetingen moeten gelijk zijn, niet "groot genoeg": een Ø60 opdraaien
  // naar Ø50 is een besluit van een mens, geen automatische keuze.
  const staven = await db.rawMaterial.findMany({
    // Geen exoten: die zijn op maat voor één klant besteld (2026-10-06).
    where: { profileId: mat.profileId, gradeId: mat.gradeId, currentStock: { gt: 0 }, exoot: false },
    include: { locationSlot: { include: { location: true } } },
  })
  const passend = staven.filter((s) => dimensiesGelijk(s.dimensions, mat.dimensions))
  const vast = await gereserveerdPerStaaf(db, passend.map((s) => s.id))
  return passend
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
}

/**
 * Voorstellen per materiaalregel bij een bepaald aantal (2026-10-09, per regel
 * sinds 2026-10-23).
 *
 * Eerst wat er nog gezaagd moet worden (`materiaalBehoefte` over de stuks die
 * nog niet vastliggen), dan die lengtes tegen de voorraad
 * (`materiaalVoorstellen`). Alleen staven die op de regel passen en met de
 * **vrije** lengte: wat al voor een ander project vastligt telt niet mee.
 * Nooit een andere kwaliteit (afgesproken 2026-10-09).
 */
export async function maakPlan(
  db: Db, ctx: { artikelId: string; aantal: number; projectId?: string; offerteRegelId?: string },
): Promise<PlanUitkomst> {
  const { regels, exoten } = await materialenVanArtikel(db, ctx.artikelId)
  const bedrijf = await db.company.findUnique({ where: { id: 'default' } })
  const schrootDrempelMm = bedrijf?.schrootDrempelMm ?? 200
  const regelIds = regels.map((r) => r.regelId)
  const dekking = ctx.projectId && ctx.offerteRegelId
    ? await dekkingVanOrderRegel(db, { projectId: ctx.projectId, offerteRegelId: ctx.offerteRegelId, artikelId: ctx.artikelId }, regelIds, ctx.aantal)
    : dekkingPerRegel(regelIds, ctx.aantal, [], [])

  const uit: PlanRegel[] = []
  for (const [i, mat] of regels.entries()) {
    const d = dekking[i]
    const gebruikt: PlanGebruikt = {
      materiaal: mat.omschrijving, werkstukLengteMm: mat.werkstukLengteMm, lader: mat.lader,
      zaagsnedeMm: ZAAG_STANDAARD.steekbreedte, vlakMm: ZAAG_STANDAARD.vlakToeslag, schrootDrempelMm,
    }
    const basis = { regelId: mat.regelId, naam: mat.naam, materiaal: mat.omschrijving, fout: mat.fout, dekking: d, gebruikt }
    const nog = nogTeKiezen(d)
    if (mat.fout || nog === 0) {
      uit.push({ ...basis, behoefte: null, voorstellen: [], kandidaten: [] })
      continue
    }
    const behoefte = materiaalBehoefte(mat.werkstukLengteMm, mat.lader, nog)
    const kandidaten = await kandidatenVoor(db, mat)
    const voorstellen = materiaalVoorstellen({
      stangen: behoefte.stangen, zaagsnedeMm: ZAAG_STANDAARD.steekbreedte, schrootDrempelMm, staven: kandidaten,
    })
    uit.push({ ...basis, behoefte, voorstellen, kandidaten })
  }
  return { regels: uit, exoten }
}

/** Afmetingen van staaf en recept moeten op de millimeter overeenkomen. */
export function dimensiesGelijk(staaf: unknown, recept: Record<string, number> | undefined): boolean {
  if (!recept) return false
  const d = (staaf ?? {}) as Record<string, unknown>
  const sleutels = Object.keys(recept)
  if (sleutels.length === 0) return false
  return sleutels.every((k) => Number(d[k]) === Number(recept[k]))
}

export interface VastleggenVraag {
  artikelId: string
  aantal: number
  projectId: string
  calculatieNr: string
  /** Welke materiaalregel; leeg = de eerste (zoals vóór 2026-10-23). */
  materiaalRegelId?: string | null
  /** Het voorstel dat de gebruiker gezien en gekozen heeft. Leeg mag als er
   *  niets op voorraad ligt en alles op de bestellijst gaat. */
  regels: { barId: string; stangen: TeZagen[]; stuks: number; verbruikMm: number; restAfboeken: boolean }[]
  todoId?: string
  offerteRegelId?: string
  tekort?: { stuks: number; mm: number }
}

export interface VastleggenUitkomst {
  reserveringen: Prisma.ZaagReserveringGetPayload<object>[]
  bestelTodoId: string | null
  /** Alle materiaalregels van deze orderregel geregeld: de todo is dicht. */
  todoKlaar: boolean
  dekking: RegelDekking[]
}

/**
 * Het voorstel van één materiaalregel vastleggen: reserveringen aanmaken, bij
 * een tekort een bestelregel en bestel-todo klaarzetten, en de todo afvinken
 * zodra élke materiaalregel geregeld is. In de transactie van de aanroeper.
 */
export async function legVast(
  db: Db, vraag: VastleggenVraag, door: { id: string; name: string },
): Promise<VastleggenUitkomst> {
  const alles = await materialenVanArtikel(db, vraag.artikelId)
  const regelId = vraag.materiaalRegelId === undefined ? alles.regels[0]?.regelId : vraag.materiaalRegelId
  const mat = alles.regels.find((r) => r.regelId === regelId)
  if (!mat) {
    throw new AppError(409, 'VOORWAARDE',
      'Deze materiaalregel staat niet (meer) in de calculatie van het artikel. Ververs het scherm en kies opnieuw.')
  }
  if (mat.fout) throw new AppError(409, 'VOORWAARDE', mat.fout)
  if (vraag.regels.length === 0 && !vraag.tekort) {
    throw new AppError(400, 'VALIDATIE', 'Er is geen staaf gekozen en geen tekort om te bestellen')
  }

  const barIds = vraag.regels.map((r) => r.barId)
  if (new Set(barIds).size !== barIds.length) {
    throw new AppError(400, 'VALIDATIE', 'Een staaf staat twee keer in het voorstel')
  }
  const staven = await db.rawMaterial.findMany({
    where: { id: { in: barIds } },
    include: { grade: true, profile: true },
  })
  const perId = new Map(staven.map((s) => [s.id, s]))
  const alVast = await gereserveerdPerStaaf(db, barIds)

  const gemaakt = []
  for (const [i, r] of vraag.regels.entries()) {
    const staaf = perId.get(r.barId)
    if (!staaf) throw new AppError(404, 'NOT_FOUND', `Staaf ${r.barId} bestaat niet`)
    // Nooit een andere kwaliteit of maat dan de regel (2026-10-09).
    if (staaf.gradeId !== mat.gradeId || staaf.profileId !== mat.profileId || !dimensiesGelijk(staaf.dimensions, mat.dimensions)) {
      throw new AppError(409, 'VOORWAARDE', `Staaf ${staaf.code} is niet het materiaal van deze regel (${mat.omschrijving})`)
    }
    // Dezelfde controle als bij handmatig reserveren: tussen het tonen van het
    // voorstel en het bevestigen kan iemand anders er materiaal af gehaald hebben.
    const vrij = Number(staaf.currentStock) - (alVast.get(staaf.id) ?? 0)
    if (r.verbruikMm > vrij) {
      throw new AppError(409, 'ONVOLDOENDE_VRIJ',
        `Staaf ${staaf.code} heeft nog ${mm(vrij)} vrij, gevraagd ${mm(r.verbruikMm)} — het voorstel is ingehaald door een andere reservering`,
        { barId: staaf.id, code: staaf.code, vrijMm: vrij, gevraagdMm: r.verbruikMm })
    }
    gemaakt.push(await db.zaagReservering.create({
      data: {
        id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        calculatieNr: vraag.calculatieNr,
        projectId: vraag.projectId,
        artikelId: vraag.artikelId,
        offerteRegelId: vraag.offerteRegelId ?? null,
        materiaalRegelId: mat.regelId,
        barId: staaf.id,
        barCode: staaf.code,
        barLocation: '',
        barVorm: staaf.profile.name,
        pieces: r.stuks,
        productLen: mat.werkstukLengteMm + ZAAG_STANDAARD.vlakToeslag + (mat.lader?.afsteekMm ?? 0),
        // Rest afboeken: de hele vrije lengte, zodat niemand anders er nog op rekent.
        sawLength: r.restAfboeken ? vrij : r.verbruikMm,
        fysiekeLengte: Number(staaf.currentStock),
        materiaal: staaf.grade.name,
        diameter: Number((staaf.dimensions as Record<string, number>)?.diameter ?? 0),
        werkstukLengte: mat.werkstukLengteMm,
        steekbreedte: ZAAG_STANDAARD.steekbreedte,
        vlakToeslag: ZAAG_STANDAARD.vlakToeslag,
        machine: mat.lader?.machineNaam ?? '',
        stangen: r.stangen as unknown as Prisma.InputJsonValue,
        restAfboeken: r.restAfboeken,
      },
    }))
  }

  let bestelTodoId: string | null = null
  if (vraag.tekort) {
    bestelTodoId = await bestelTodo(db, {
      projectId: vraag.projectId, artikelId: vraag.artikelId, artikelNaam: alles.artikelNaam,
      materiaal: mat.omschrijving, tekortStuks: vraag.tekort.stuks, tekortMm: vraag.tekort.mm, door: door.id,
    })
    // En op de bestellijst, zodat het tekort ook echt besteld kan worden (2026-10-06).
    await tekortRegel(db, {
      projectId: vraag.projectId, artikelId: vraag.artikelId, offerteRegelId: vraag.offerteRegelId ?? null,
      materiaalRegelId: mat.regelId, gradeId: mat.gradeId, profileId: mat.profileId, dimensions: mat.dimensions,
      tekortMm: vraag.tekort.mm, door: door.name,
    })
  }

  // De todo gaat pas dicht als élke materiaalregel geregeld is (2026-10-23).
  // Zonder orderregel is dat niet na te gaan; dan zoals vroeger meteen.
  const dekking = vraag.offerteRegelId
    ? await dekkingVanOrderRegel(db,
        { projectId: vraag.projectId, offerteRegelId: vraag.offerteRegelId, artikelId: vraag.artikelId },
        alles.regels.map((r) => r.regelId), vraag.aantal)
    : []
  const todoKlaar = dekking.every((d) => d.klaar)
  if (todoKlaar) {
    await db.todo.updateMany({
      where: vraag.todoId
        ? { id: vraag.todoId, done: false }
        : { soort: 'materiaal_selecteren', done: false, projectId: vraag.projectId, offerteRegelId: vraag.offerteRegelId ?? '__geen__' },
      data: { done: true, completedAt: new Date() },
    })
  }

  return { reserveringen: gemaakt, bestelTodoId, todoKlaar, dekking }
}

/**
 * Todo's bij het aanmaken van een opdracht: per artikel één "materiaal
 * selecteren".
 *
 * Bewust todo's en geen automatische reserveringen — zie de kop van dit
 * bestand. Regels zonder artikel krijgen niets: daar valt geen recept bij te
 * zoeken. Een artikel met alleen exoten ook niet (2026-10-23): die komen via
 * de bestelling binnen en worden bij ontvangst gereserveerd; er valt niets uit
 * de voorraad te kiezen.
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

  const artikelen = await db.article.findMany({
    where: { id: { in: metArtikel.map((r) => r.artikelId!) } }, select: { id: true, estimate: true },
  })
  const alleenExoot = new Set(artikelen.filter((a) => {
    const nodes = (a.estimate as ArticleEstimate | null)?.nodes ?? []
    return nodes.some((n) => n.type === 'material') && voorraadRegels({ nodes }).length === 0
  }).map((a) => a.id))
  const kandidaat = metArtikel.filter((r) => !alleenExoot.has(r.artikelId!))
  if (kandidaat.length === 0) return 0

  // Nooit twee keer dezelfde todo: een offerte kan opnieuw geaccepteerd worden.
  const bestaand = await db.todo.findMany({
    where: {
      soort: 'materiaal_selecteren',
      projectId: ctx.projectId,
      offerteRegelId: { in: kandidaat.map((r) => r.id) },
    },
    select: { offerteRegelId: true },
  })
  const al = new Set(bestaand.map((t) => t.offerteRegelId))
  const nieuw = kandidaat.filter((r) => !al.has(r.id))
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
 * laat zien — dan is het tekort vastgesteld en niet langer een vermoeden. Eén
 * per materiaal: twee materiaalregels met een tekort zijn twee bestellingen.
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
      title: { startsWith: `Bestellen: ${ctx.materiaal} voor ` },
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
