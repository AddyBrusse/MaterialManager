import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { beschikbaarheidVan, gereserveerdPerStaaf, mm, OPEN_STATUSSEN } from '../services/voorraad'
import { dekkingVanProject, legVast, maakPlan } from '../services/materiaal-selectie'
import { boekZaagbonAf } from '../services/zaagbon'
import { zaagbonAfmeting } from '@stockmanager/shared'

const router = Router()

const CreateReservationSchema = z.object({
  calculatieNr: z.string(),
  // Waar dit materiaal voor vastligt. Optioneel: er wordt ook gezaagd voor werk
  // dat geen project is (voorraad, intern).
  projectId: z.string().nullable().optional(),
  artikelId: z.string().nullable().optional(),
  barId: z.string(),
  barCode: z.string(),
  barLocation: z.string(),
  barVorm: z.string(),
  pieces: z.number().int().positive(),
  productLen: z.number(),
  sawLength: z.number(),
  fysiekeLengte: z.number(),
  materiaal: z.string(),
  diameter: z.number(),
  werkstukLengte: z.number(),
  steekbreedte: z.number(),
  vlakToeslag: z.number(),
  machine: z.string(),
})

// Prisma geeft een DECIMAL-kolom terug als een Decimal-object, niet als string
// of number. De oude versie keek alleen naar `typeof v === 'string'` en liet dat
// object dus ongemoeid door, waarna JSON er een string van maakte — en aan de
// andere kant deed `0 + "870"` netjes "0870". Number() dekt alle drie de vormen.
export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  return Number(v)
}

/** Wat de zaagbon van zijn staaf nodig heeft om de maat te tonen. */
type StaafMaat = { volumeFormula: string; dimensions: Record<string, number> }

function serialize(r: {
  id: string; calculatieNr: string; projectId: string | null; artikelId: string | null; offerteRegelId: string | null
  materiaalRegelId?: string | null; barId: string; barCode: string; barLocation: string; barVorm: string
  pieces: number; productLen: unknown; sawLength: unknown; fysiekeLengte: unknown; materiaal: string
  diameter: unknown; werkstukLengte: unknown; steekbreedte: unknown; vlakToeslag: unknown; machine: string
  priority: number | null; rush: boolean; status: string; restLengteMm: unknown; completedAt: Date | null; createdAt: Date
  stangen?: unknown; restAfboeken?: boolean
}, staaf: StaafMaat | null) {
  return {
    id: r.id,
    calculatieNr: r.calculatieNr,
    projectId: r.projectId,
    artikelId: r.artikelId,
    offerteRegelId: r.offerteRegelId,
    materiaalRegelId: r.materiaalRegelId ?? null,
    barId: r.barId,
    barCode: r.barCode,
    barLocation: r.barLocation,
    barVorm: r.barVorm,
    pieces: r.pieces,
    productLen: toNum(r.productLen),
    sawLength: toNum(r.sawLength),
    fysiekeLengte: toNum(r.fysiekeLengte),
    materiaal: r.materiaal,
    diameter: toNum(r.diameter),
    /** De maat van de staaf (Ø50 mm, 250×30 mm), afgeleid bij het lezen. De
     *  bon bewaart alleen een diameter, en die is 0 bij alles wat niet rond is. */
    afmeting: zaagbonAfmeting({ barVorm: r.barVorm, diameter: toNum(r.diameter) }, staaf),
    werkstukLengte: toNum(r.werkstukLengte),
    steekbreedte: toNum(r.steekbreedte),
    vlakToeslag: toNum(r.vlakToeslag),
    machine: r.machine,
    priority: r.priority,
    rush: r.rush,
    status: r.status,
    restLengteMm: r.restLengteMm != null ? toNum(r.restLengteMm) : null,
    stangen: Array.isArray(r.stangen) ? (r.stangen as { lengteMm: number; stuks: number }[]) : null,
    restAfboeken: r.restAfboeken ?? false,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Elke bon met de maat van zijn staaf; één query voor de hele lijst. */
async function serializeAlle(rows: Parameters<typeof serialize>[0][]) {
  const ids = [...new Set(rows.map((r) => r.barId))]
  const staven = ids.length === 0 ? [] : await prisma.rawMaterial.findMany({
    where: { id: { in: ids } },
    select: { id: true, dimensions: true, profile: { select: { volumeFormula: true } } },
  })
  const perId = new Map(staven.map((s) => [s.id, {
    volumeFormula: s.profile.volumeFormula, dimensions: (s.dimensions ?? {}) as Record<string, number>,
  }]))
  return rows.map((r) => serialize(r, perId.get(r.barId) ?? null))
}

async function serializeEen(row: Parameters<typeof serialize>[0]) {
  return (await serializeAlle([row]))[0]
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // ?projectId= geeft alleen wat er voor dat project vastligt — dat is wat de
    // projectpagina nodig heeft zonder alle reserveringen op te halen.
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined
    const rows = await prisma.zaagReservering.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: await serializeAlle(rows) })
  }),
)

/**
 * Reserveren legt materiaal vast maar boekt niets af — dat gebeurt pas bij het
 * zagen (`/:id/afboeken`).
 *
 * De hele batch gaat in één transactie en wordt vóóraf tegen de vrije lengte
 * gelegd. Twee regels op dezelfde staaf tellen daarbij bij elkaar op: los
 * passen ze allebei, samen niet, en dat is precies het geval waarin je anders
 * materiaal reserveert dat er niet is.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const items = z.array(CreateReservationSchema).parse(req.body)
    if (items.length === 0) throw new AppError(400, 'VALIDATION', 'Geen reserveringen meegestuurd')

    const created = await prisma.$transaction(async (tx) => {
      const barIds = [...new Set(items.map((i) => i.barId))]
      const staven = await tx.rawMaterial.findMany({
        where: { id: { in: barIds } },
        select: { id: true, code: true, currentStock: true },
      })
      const perId = new Map(staven.map((s) => [s.id, s]))
      const alVast = await gereserveerdPerStaaf(tx, barIds)

      // Wat deze batch zelf op elke staaf legt, opgeteld.
      const nieuw = new Map<string, number>()
      for (const item of items) {
        nieuw.set(item.barId, (nieuw.get(item.barId) ?? 0) + item.sawLength)
      }

      for (const [barId, gevraagd] of nieuw) {
        const staaf = perId.get(barId)
        if (!staaf) throw new AppError(404, 'NOT_FOUND', `Staaf ${barId} bestaat niet`)
        const vrij = Number(staaf.currentStock) - (alVast.get(barId) ?? 0)
        if (gevraagd > vrij) {
          throw new AppError(409, 'ONVOLDOENDE_VRIJ',
            `Staaf ${staaf.code} heeft nog ${mm(vrij)} vrij, gevraagd ${mm(gevraagd)}`,
            { barId, code: staaf.code, vrijMm: vrij, gevraagdMm: gevraagd })
        }
      }

      const rijen = []
      for (const [i, item] of items.entries()) {
        rijen.push(await tx.zaagReservering.create({
          data: {
            id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            ...item,
            projectId: item.projectId ?? null,
            artikelId: item.artikelId ?? null,
          },
        }))
      }
      return rijen
    })
    res.status(201).json({ data: await serializeAlle(created) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.zaagReservering.delete({ where: { id: req.params.id } }).catch(() => {
      throw new AppError(404, 'NOT_FOUND', 'Reservering niet gevonden')
    })
    res.status(204).end()
  }),
)

const PrioritySchema = z.object({ priority: z.number().int().nullable() })

router.patch(
  '/:id/priority',
  asyncHandler(async (req, res) => {
    const { priority } = PrioritySchema.parse(req.body)
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { priority },
    })
    res.json({ data: await serializeEen(row) })
  }),
)

const PlanSchema = z.object({
  jobs: z.array(z.object({ ids: z.array(z.string()), rush: z.boolean() })),
})

router.post(
  '/plan',
  asyncHandler(async (req, res) => {
    const { jobs } = PlanSchema.parse(req.body)
    await prisma.$transaction(
      jobs.flatMap((job, i) =>
        job.ids.map(id =>
          prisma.zaagReservering.update({
            where: { id },
            data: { priority: i + 1, rush: job.rush },
          }),
        ),
      ),
    )
    const rows = await prisma.zaagReservering.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ data: await serializeAlle(rows) })
  }),
)

const StatusSchema = z.object({ status: z.enum(['open', 'in_progress']) })

/**
 * Alleen heen en weer tussen open en in_progress.
 *
 * 'done' en 'geannuleerd' kunnen hier bewust niet: dat zijn de twee manieren
 * waarop een reservering zijn greep op het materiaal loslaat, en die horen via
 * `/afboeken` of `/annuleer` te gaan zodat de voorraad in dezelfde transactie
 * meebeweegt. Anders is een reservering af te sluiten zonder dat er iets
 * afgeboekt wordt.
 */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = StatusSchema.parse(req.body)
    const bestaand = await prisma.zaagReservering.findUnique({ where: { id: req.params.id } })
    if (!bestaand) throw new AppError(404, 'NOT_FOUND', 'Reservering niet gevonden')
    if (!OPEN_STATUSSEN.includes(bestaand.status as typeof OPEN_STATUSSEN[number])) {
      throw new AppError(409, 'AL_AFGEROND',
        `Deze reservering is al ${bestaand.status === 'done' ? 'afgeboekt' : 'geannuleerd'}`)
    }
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { status },
    })
    res.json({ data: await serializeEen(row) })
  }),
)

const AfboekenSchema = z.object({
  /** Gemeten restlengte van de staaf ná het zagen, in mm. */
  restLengteMm: z.number().nonnegative().nullable(),
  /** De zager heeft de rest als onbruikbaar bestempeld: de staaf gaat naar 0. */
  schroot: z.boolean().optional(),
  note: z.string().optional(),
})

/**
 * Afboeken: het moment waarop er werkelijk gezaagd is.
 *
 * Drie dingen horen bij elkaar en gebeuren daarom in één transactie:
 *   1. de staaf wordt korter (of gaat naar 0 bij schroot),
 *   2. er komt een voorraadmutatie met reden `used` of `scrapped`,
 *   3. de reservering gaat naar `done` en laat het materiaal los.
 *
 * Eerder deed de zaagflow 1 en 3 als twee losse verzoeken, allebei met een
 * weggeslikte fout. Lukte het één en het ander niet, dan stond er op het scherm
 * "klaar" terwijl de staaf nog vastlag of nog zijn oude lengte had.
 */
router.post(
  '/:id/afboeken',
  asyncHandler(async (req, res) => {
    const body = AfboekenSchema.parse(req.body)

    const uitkomst = await prisma.$transaction(async (tx) => {
      const reservering = await tx.zaagReservering.findUnique({ where: { id: req.params.id } })
      if (!reservering) throw new AppError(404, 'NOT_FOUND', 'Reservering niet gevonden')
      return boekZaagbonAf(tx, reservering, body, req.user.id)
    })

    res.json({
      data: {
        reservering: await serializeEen(uitkomst.row),
        mutatieId: uitkomst.mutatie.id,
        schroot: uitkomst.schroot,
        vorigeVoorraadMm: uitkomst.vorigeVoorraad,
        nieuweVoorraadMm: uitkomst.nieuweVoorraad,
      },
    })
  }),
)

/**
 * Annuleren: het materiaal komt vrij zonder dat er iets afgeboekt wordt.
 *
 * De reservering blijft staan in plaats van verwijderd te worden — dat een
 * zaagbon geannuleerd is, is zelf informatie. Verwijderen (DELETE) blijft
 * bestaan voor een vergissing die nooit had moeten bestaan.
 */
router.post(
  '/:id/annuleer',
  asyncHandler(async (req, res) => {
    const bestaand = await prisma.zaagReservering.findUnique({ where: { id: req.params.id } })
    if (!bestaand) throw new AppError(404, 'NOT_FOUND', 'Reservering niet gevonden')
    if (bestaand.status === 'done') {
      throw new AppError(409, 'AL_AFGEBOEKT',
        'Deze reservering is al afgeboekt; annuleren zou de mutatie niet terugdraaien')
    }
    const row = await prisma.zaagReservering.update({
      where: { id: req.params.id },
      data: { status: 'geannuleerd' },
    })
    res.json({ data: await serializeEen(row) })
  }),
)

/** Wat er per staaf vastligt en wat er vrij is — de voorraadpagina en de
 *  zaagcalculator lezen hier allebei uit, zodat ze het niet oneens kunnen zijn. */
router.get(
  '/beschikbaarheid/:barId',
  asyncHandler(async (req, res) => {
    const b = await beschikbaarheidVan(prisma, req.params.barId)
    if (!b) throw new AppError(404, 'NOT_FOUND', 'Staaf niet gevonden')
    res.json({ data: b })
  }),
)

// ── Materiaalselectie ─────────────────────────────────────────────────────────

const PlanSchemaIn = z.object({
  artikelId: z.string(),
  aantal: z.number().int().positive(),
  /** Met project en orderregel telt wat er al vastligt mee (2026-10-23). */
  projectId: z.string().optional(),
  offerteRegelId: z.string().optional(),
})

/**
 * Wat zou het programma kiezen? Rekent alleen, legt niets vast — per
 * materiaalregel van het artikel (2026-10-23).
 *
 * Het scherm toont de voorstellen vóórdat er iets gereserveerd wordt:
 * materiaal stilzwijgend vastleggen is precies hoe je een staaf kwijtraakt die
 * voor een spoedklus bedoeld was.
 */
router.post(
  '/materiaal-plan',
  asyncHandler(async (req, res) => {
    const body = PlanSchemaIn.parse(req.body)
    res.json({ data: await maakPlan(prisma, body) })
  }),
)

/** Per orderregel van het project: wat er per materiaalregel geregeld is (2026-10-23). */
router.get(
  '/materiaal-dekking',
  asyncHandler(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : ''
    if (!projectId) throw new AppError(400, 'VALIDATIE', 'Geef een project op (?projectId=)')
    res.json({ data: await dekkingVanProject(prisma, projectId) })
  }),
)

const BevestigSchema = PlanSchemaIn.extend({
  projectId: z.string(),
  calculatieNr: z.string(),
  /** Welke materiaalregel van het artikel; leeg = de eerste. */
  materiaalRegelId: z.string().nullable().optional(),
  /** Het voorstel dat de gebruiker gezien en gekozen heeft. Bewust niet
   *  opnieuw uitgerekend: tussen tonen en bevestigen kan de voorraad veranderd
   *  zijn, en dan hoort de reservering te botsen in plaats van stilletjes iets
   *  anders vast te leggen. Leeg als er niets ligt en alles besteld wordt. */
  regels: z.array(z.object({
    barId: z.string(),
    stangen: z.array(z.object({ lengteMm: z.number().positive(), stuks: z.number().int().positive() })).min(1),
    stuks: z.number().int().positive(),
    verbruikMm: z.number().positive(),
    /** De rest meteen afboeken (2026-10-09): de hele vrije lengte gaat vast. */
    restAfboeken: z.boolean().default(false),
  })),
  /** De todo die hiermee afgerond wordt — pas als elke materiaalregel geregeld is. */
  todoId: z.string().optional(),
  /** De orderregel waar dit materiaal voor is. */
  offerteRegelId: z.string().optional(),
  /** Tekort waarvoor een bestelregel en bestel-todo moeten komen. */
  tekort: z.object({ stuks: z.number().int().positive(), mm: z.number().positive() }).optional(),
})

/**
 * Het voorstel van één materiaalregel vastleggen (`legVast`): reserveringen
 * aanmaken, bij een tekort de bestelregel klaarzetten en de todo afvinken
 * zodra elke regel geregeld is. Alles in één transactie.
 */
router.post(
  '/materiaal-plan/bevestig',
  asyncHandler(async (req, res) => {
    const body = BevestigSchema.parse(req.body)
    const uit = await prisma.$transaction((tx) => legVast(tx, body, req.user))
    res.status(201).json({
      data: {
        reserveringen: await serializeAlle(uit.reserveringen),
        bestelTodoId: uit.bestelTodoId,
        todoKlaar: uit.todoKlaar,
        dekking: uit.dekking,
      },
    })
  }),
)

export default router
