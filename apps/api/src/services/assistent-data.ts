// Wat de AI-assistent mag lezen (2026-10-09). Alleen lezen: elke functie hier
// geeft een momentopname terug als platte gegevens, voor het taalmodel en voor
// het bericht zonder taalmodel. Wijzigen doet een mens, via de knoppen.
import type { Prisma } from '@prisma/client'
import { vandaagIso, type Melding, type Project } from '@stockmanager/shared'
import { PROJECT_INCLUDE, serialize } from './project-store'
import { alleMeldingen } from './meldingen'
import { gereserveerdPerStaaf } from './voorraad'

type Db = Prisma.TransactionClient

const dagenTussen = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export interface OpenActies {
  vandaag: string
  meldingen: Melding[]
  todos: { titel: string; prioriteit: string; deadline: string | null; opgepaktDoor: string | null; projectId: string | null; link: string }[]
  /** Geaccepteerd, maar nog niet in productie gegeven. */
  inVoorbereiding: { projectId: string; klant: string | null; orderId: string; artikel: string; aantal: number; levering: string | null; link: string }[]
  /** Verstuurd en al `offerteNabelDagen` geen reactie. */
  offertesNabellen: { projectId: string; offerte: string; klant: string | null; verzondenOp: string; dagen: number; link: string }[]
}

async function klantNamen(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const echte = [...new Set(ids.filter((x): x is string => !!x))]
  if (!echte.length) return new Map()
  const rel = await db.relatie.findMany({ where: { id: { in: echte } }, select: { id: true, naam: true } })
  return new Map(rel.map((r) => [r.id, r.naam]))
}

/** Alles wat iemand vandaag zou moeten oppakken — de basis van het bericht op vaste tijden. */
export async function openActies(db: Db, nu = new Date()): Promise<OpenActies> {
  const vandaag = vandaagIso(nu)
  const [m, todos, bedrijf, rows] = await Promise.all([
    alleMeldingen(db, nu),
    db.todo.findMany({
      where: { done: false },
      include: { claimedBy: { select: { name: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 40,
    }),
    db.company.findUnique({ where: { id: 'default' }, select: { offerteNabelDagen: true } }),
    db.project.findMany({
      where: { status: { notIn: ['geannuleerd', 'gefactureerd', 'concept'] } },
      include: PROJECT_INCLUDE,
    }),
  ])
  const projecten = rows.map(serialize)
  const klanten = await klantNamen(db, projecten.map((p) => p.relatieId))
  const nabel = bedrijf?.offerteNabelDagen ?? 21

  const inVoorbereiding = projecten.flatMap((p) => p.productieOrders
    .filter((o) => o.status === 'voorbereiding')
    .map((o) => ({
      projectId: p.id, klant: p.relatieId ? klanten.get(p.relatieId) ?? null : null, orderId: o.id,
      artikel: o.artikelNaam, aantal: o.qty, levering: p.levertijdDatum, link: `/projecten/${p.id}`,
    })))

  const offertesNabellen = projecten.flatMap((p) => p.offertes
    .filter((o) => o.status === 'verzonden' && o.verzondenOp)
    .map((o) => ({ o, dagen: dagenTussen(o.verzondenOp!.slice(0, 10), vandaag) }))
    .filter(({ dagen }) => dagen >= nabel)
    .map(({ o, dagen }) => ({
      projectId: p.id, offerte: o.documentNr ?? o.id, klant: p.relatieId ? klanten.get(p.relatieId) ?? null : null,
      verzondenOp: o.verzondenOp!.slice(0, 10), dagen, link: `/projecten/${p.id}`,
    })))

  return {
    vandaag,
    meldingen: m.meldingen,
    todos: todos.map((t) => ({
      titel: t.title, prioriteit: t.priority, deadline: t.dueDate ? vandaagIso(t.dueDate) : null,
      opgepaktDoor: t.claimedBy?.name ?? null, projectId: t.projectId,
      link: t.projectId ? `/projecten/${t.projectId}` : '/todos',
    })),
    inVoorbereiding,
    offertesNabellen,
  }
}

/** Projecten op nummer, naam of klant. */
export async function zoekProjecten(db: Db, zoek: string) {
  const z = zoek.trim()
  const klantIds = z
    ? (await db.relatie.findMany({ where: { naam: { contains: z, mode: 'insensitive' } }, select: { id: true } })).map((r) => r.id)
    : []
  const rows = await db.project.findMany({
    where: z ? { OR: [
      { id: { contains: z, mode: 'insensitive' } },
      { naam: { contains: z, mode: 'insensitive' } },
      { klantRef: { contains: z, mode: 'insensitive' } },
      ...(klantIds.length ? [{ relatieId: { in: klantIds } }] : []),
    ] } : { status: { notIn: ['geannuleerd', 'gefactureerd'] } },
    select: { id: true, naam: true, status: true, levertijdDatum: true, relatieId: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })
  const klanten = await klantNamen(db, rows.map((r) => r.relatieId))
  return rows.map((r) => ({
    id: r.id, naam: r.naam, status: r.status, levering: r.levertijdDatum,
    klant: r.relatieId ? klanten.get(r.relatieId) ?? null : null, link: `/projecten/${r.id}`,
  }))
}

/** Eén project: offertes, orders met stappen en planning, open bestelregels. */
export async function projectDetail(db: Db, id: string) {
  const row = await db.project.findUnique({ where: { id }, include: PROJECT_INCLUDE })
  if (!row) return null
  const p: Project = serialize(row)
  const klanten = await klantNamen(db, [p.relatieId])
  return {
    id: p.id, naam: p.naam, status: p.status, klant: p.relatieId ? klanten.get(p.relatieId) ?? null : null,
    levering: p.levertijdDatum, notities: p.notities.slice(0, 500), link: `/projecten/${p.id}`,
    offertes: p.offertes.map((o) => ({ nr: o.documentNr ?? o.id, versie: o.versie, status: o.status, verzondenOp: o.verzondenOp })),
    orders: p.productieOrders.map((o) => ({
      id: o.id, artikel: o.artikelNaam, aantal: o.qty, gereed: o.aantalGereed, status: o.status,
      materiaalVerwacht: o.materiaalVerwacht ?? null, wachtOpMateriaal: o.wachtOpMateriaal ?? false,
      stappen: o.stappen.map((s) => ({ naam: s.naam, machine: s.geplandMachine ?? s.machine, gepland: s.geplandDatum ?? null, gereed: !!s.gereedOp })),
    })),
    openBestelRegels: row.bestelRegels.map((b) => ({ status: b.status, offerteRegelId: b.offerteRegelId })),
  }
}

/** Voorraadstaven op code, kwaliteit, profiel of maat — met wat er vrij is. */
export async function zoekVoorraad(db: Db, zoek: string) {
  const woorden = zoek.toLowerCase().split(/\s+/).filter(Boolean)
  const staven = await db.rawMaterial.findMany({
    where: { currentStock: { gt: 0 } },
    include: { grade: { select: { name: true } }, profile: { select: { name: true } } },
    orderBy: { code: 'asc' },
  })
  const passend = staven.filter((s) => {
    const tekst = `${s.code} ${s.grade.name} ${s.profile.name} ${JSON.stringify(s.dimensions)}`.toLowerCase()
    return woorden.every((w) => tekst.includes(w))
  }).slice(0, 30)
  const res = await gereserveerdPerStaaf(db, passend.map((s) => s.id))
  return passend.map((s) => {
    const fysiek = Number(s.currentStock)
    const vast = res.get(s.id) ?? 0
    return {
      code: s.code, kwaliteit: s.grade.name, profiel: s.profile.name, maten: s.dimensions,
      fysiekMm: fysiek, gereserveerdMm: vast, vrijMm: Math.max(0, fysiek - vast), exoot: s.exoot,
    }
  })
}
