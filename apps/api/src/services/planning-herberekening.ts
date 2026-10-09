/**
 * Automatisch plannen op de server (2026-10-08): een herberekening vastleggen
 * en hem in zijn geheel terugzetten.
 *
 * Het scherm rekent (de geschatte tijden komen uit de calculatie, die kent
 * alleen de browser); de server leest zelf wat er nu staat als "oud" en schrijft
 * alles in één transactie. Ongedaan maken lukt helemaal of helemaal niet. Wat
 * er sindsdien op de werkvloer gebeurde, houdt het tegen — tenzij de gebruiker
 * zegt dat het gewist mag worden, en dan gaat dat in dezelfde transactie.
 */
import { Prisma } from '@prisma/client'
import {
  blokkadesVoorOngedaan, HerberekeningWijzigingSchema, orderStatusNaStappen, statusNaLevering,
  type Blokkade, type Herberekening, type HerberekeningWijziging, type HerberekenInvoer, type Project,
  type StapNu, type KlokNa,
} from '@stockmanager/shared'
import { AppError } from '../middleware/error'
import { PROJECT_INCLUDE, persist, serialize, type Db } from './project-store'
import { serialize as serializeTijd } from './tijdregistratie'
import { herstelAfboekingBijGereed } from './zaagbon'

type Rij = Prisma.PlanningHerberekeningGetPayload<object>

function leesWijzigingen(json: Prisma.JsonValue): HerberekeningWijziging[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((x) => {
    const r = HerberekeningWijzigingSchema.safeParse(x)
    return r.success ? [r.data] : []
  })
}

export function serializeHerberekening(r: Rij): Herberekening {
  return {
    id: r.id, aanleiding: r.aanleiding, door: r.door, op: r.op.toISOString(),
    wijzigingen: leesWijzigingen(r.wijzigingen),
    samenvatting: r.samenvatting ?? null,
    ongedaanOp: r.ongedaanOp?.toISOString() ?? null, ongedaanDoor: r.ongedaanDoor,
  }
}

/** Projecten op slot in vaste volgorde: zo kan een gewone projectwijziging er niet tussendoor schrijven. */
async function opSlot(db: Db, projectIds: string[]) {
  for (const id of [...new Set(projectIds)].sort()) {
    await db.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`
  }
}

export async function pasToe(db: Db, invoer: HerberekenInvoer, door: string): Promise<Herberekening> {
  const ids = invoer.wijzigingen.map((w) => w.stapId)
  const stappen = await db.productieStap.findMany({ where: { id: { in: ids } }, include: { order: { select: { id: true, projectId: true } } } })
  const perId = new Map(stappen.map((s) => [s.id, s]))
  const ontbreekt = ids.filter((id) => !perId.has(id))
  if (ontbreekt.length) {
    throw new AppError(409, 'VERANDERD', `${ontbreekt.length} stap(pen) bestaan niet meer. Ververs de planning en reken opnieuw.`)
  }
  await opSlot(db, stappen.map((s) => s.order.projectId))

  // Na het slot opnieuw lezen: dit is de stand die we gaan overschrijven.
  const nu = await db.productieStap.findMany({ where: { id: { in: ids } } })
  const nuPerId = new Map(nu.map((s) => [s.id, s]))
  const wijzigingen: HerberekeningWijziging[] = invoer.wijzigingen.map((w) => {
    const s = nuPerId.get(w.stapId)!
    return {
      stapId: w.stapId, projectId: perId.get(w.stapId)!.order.projectId, orderId: s.orderId,
      oud: { geplandDatum: s.geplandDatum, geplandMachine: s.geplandMachine, queuePosition: s.queuePosition, prioriteit: s.prioriteit, machineWacht: s.machineWacht },
      nieuw: {
        geplandDatum: w.geplandDatum, geplandMachine: w.geplandMachine, queuePosition: w.queuePosition, prioriteit: w.prioriteit,
        machineWacht: w.machineWacht ?? s.machineWacht,
      },
    }
  })
  for (const w of wijzigingen) await db.productieStap.update({ where: { id: w.stapId }, data: w.nieuw })
  const rij = await db.planningHerberekening.create({
    data: {
      aanleiding: invoer.aanleiding, door,
      wijzigingen: wijzigingen as unknown as Prisma.InputJsonValue,
      samenvatting: (invoer.samenvatting ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
  return serializeHerberekening(rij)
}

async function moetBestaan(db: Db, id: string): Promise<Rij> {
  const r = await db.planningHerberekening.findUnique({ where: { id } })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Deze herberekening bestaat niet (meer). Ververs de planning.')
  return r
}

/** Alleen de nieuwste die nog niet terug is, kan terug — anders blijft een latere half staan. */
async function eisNieuwste(db: Db, r: Rij) {
  if (r.ongedaanOp) throw new AppError(409, 'VOORWAARDE', 'Deze herberekening is al ongedaan gemaakt.')
  const nieuwer = await db.planningHerberekening.findFirst({ where: { op: { gt: r.op }, ongedaanOp: null }, orderBy: { op: 'desc' } })
  if (nieuwer) {
    throw new AppError(409, 'VOORWAARDE',
      `Er is daarna nog een keer gepland ("${nieuwer.aanleiding}"). Maak die eerst ongedaan; anders blijft hij half staan.`)
  }
}

export async function blokkades(db: Db, r: Rij): Promise<Blokkade[]> {
  const w = leesWijzigingen(r.wijzigingen)
  const ids = w.map((x) => x.stapId)
  const stappen = await db.productieStap.findMany({ where: { id: { in: ids } } })
  const perId = new Map<string, StapNu>(stappen.map((s) => [s.id, {
    id: s.id, naam: s.naam, volgorde: s.volgorde, gereedOp: s.gereedOp, gereedDoor: s.gereedDoor,
    geplandDatum: s.geplandDatum, geplandMachine: s.geplandMachine, queuePosition: s.queuePosition, prioriteit: s.prioriteit,
    machineWacht: s.machineWacht,
  }]))
  const klokRijen = await db.tijdRegistratie.findMany({ where: { stapId: { in: ids }, gestartOp: { gte: r.op } } })
  const klokken: KlokNa[] = klokRijen.map((k) => {
    const t = serializeTijd(k)
    return { id: k.id, stapId: k.stapId, gestartOp: t.gestartOp, machineNaam: k.machineNaam, door: k.userNaam, seconden: t.seconden }
  })
  return blokkadesVoorOngedaan(w, perId, klokken, r.op.toISOString())
}

export async function bekijkBlokkades(db: Db, id: string): Promise<Blokkade[]> {
  const r = await moetBestaan(db, id)
  await eisNieuwste(db, r)
  return blokkades(db, r)
}

/**
 * Zet de planning terug. Met `wis`: eerst wat de werkvloer sindsdien deed aan
 * deze stappen terugdraaien — klokken weg (de gemeten tijd gaat verloren, dat
 * stond in de melding), gereedmelding eraf, en was het de laatste stap, de
 * automatische materiaalafboeking terug op voorraad.
 */
export async function maakOngedaan(
  db: Db, id: string, wis: boolean, door: { id: string; name: string },
): Promise<{ herberekening: Herberekening; projectIds: string[] }> {
  const r = await moetBestaan(db, id)
  const w = leesWijzigingen(r.wijzigingen)
  const projectIds = [...new Set(w.map((x) => x.projectId))]
  await opSlot(db, projectIds)
  await eisNieuwste(db, r)

  const lijst = await blokkades(db, r)
  const werkvloer = lijst.filter((b) => b.soort !== 'gewijzigd')
  if (lijst.length && !wis) {
    throw new AppError(409, 'BLOKKADE', 'Sinds deze planning is er iets veranderd. Wis dat eerst, of laat de planning staan.', { blokkades: lijst })
  }

  if (wis && werkvloer.length) {
    const klokStappen = werkvloer.filter((b) => b.soort === 'gestart').map((b) => b.stapId)
    if (klokStappen.length) await db.tijdRegistratie.deleteMany({ where: { stapId: { in: klokStappen }, gestartOp: { gte: r.op } } })

    const gereed = werkvloer.filter((b) => b.soort === 'gereed')
    for (const pid of new Set(gereed.map((b) => b.projectId))) {
      const ophalen = await db.project.findUnique({ where: { id: pid }, include: PROJECT_INCLUDE })
      if (!ophalen) continue
      const voor = serialize(ophalen)
      const terug = new Set(gereed.filter((b) => b.projectId === pid).map((b) => b.stapId))
      const productieOrders = voor.productieOrders.map((o) => {
        if (!o.stappen.some((s) => terug.has(s.id))) return o
        const stappen = o.stappen.map((s) => (terug.has(s.id) ? { ...s, gereedOp: null, gereedDoor: null } : s))
        return { ...o, stappen, status: orderStatusNaStappen(o, stappen), updatedAt: new Date().toISOString() }
      })
      const basis: Project = { ...voor, productieOrders, updatedAt: new Date().toISOString() }
      const na = { ...basis, status: statusNaLevering(basis) }
      await persist(db, na)
      // Werd een order daardoor weer open, dan ging zijn materiaal er bij het
      // gereedmelden automatisch af: dat terug op voorraad.
      for (const o of na.productieOrders) {
        const was = voor.productieOrders.find((x) => x.id === o.id)
        if (was?.status === 'gereed' && o.status !== 'gereed') await herstelAfboekingBijGereed(db, voor, o.id, r.op, door.id)
      }
    }
  }

  for (const x of w) {
    const bestaat = await db.productieStap.findUnique({ where: { id: x.stapId }, select: { id: true } })
    if (bestaat) await db.productieStap.update({ where: { id: x.stapId }, data: x.oud })
  }
  const rij = await db.planningHerberekening.update({
    where: { id }, data: { ongedaanOp: new Date(), ongedaanDoor: door.name },
  })
  return { herberekening: serializeHerberekening(rij), projectIds }
}

export async function lijst(db: Db, limit: number): Promise<Herberekening[]> {
  const rijen = await db.planningHerberekening.findMany({ orderBy: { op: 'desc' }, take: limit })
  return rijen.map(serializeHerberekening)
}
