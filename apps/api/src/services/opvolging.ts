// Opvolging (2026-10-28): de gegevens voor de twaalf glipper-regels. De regels
// zelf staan in `packages/shared/calc/opvolging.ts`; hier alleen ophalen.
// Afgeleid bij het lezen, nooit opgeslagen.
import type { Prisma } from '@prisma/client'
import {
  klokOpvolging, kostprijsVoor, projectOpvolging, receptOpvolging, todoOpvolging, vandaagIso,
  type Melding,
} from '@stockmanager/shared'
import { PROJECT_INCLUDE, serialize } from './project-store'
import { bronnenLaden, calcArtikel } from './prijs-snapshot'

type Db = Prisma.TransactionClient

/** Een order die nog gemaakt moet worden: daar moet het recept voor kloppen. */
const ORDER_OPEN = ['voorbereiding', 'gepland', 'in_productie']

export async function opvolgingMeldingen(db: Db, nu = new Date()): Promise<Melding[]> {
  const vandaag = vandaagIso(nu)
  const begin = new Date(`${vandaag}T00:00:00`)
  const [rows, klokken, todos] = await Promise.all([
    // Alles wat nog loopt, plus afgeronde projecten met een onbetaalde factuur.
    db.project.findMany({
      where: {
        status: { not: 'geannuleerd' },
        OR: [
          { status: { not: 'gefactureerd' } },
          { facturen: { some: { soort: 'factuur', verzondenOp: { not: null }, betaaldOp: null } } },
        ],
      },
      include: PROJECT_INCLUDE,
    }),
    db.tijdRegistratie.findMany({ where: { status: 'lopend' } }),
    db.todo.findMany({
      where: { done: false, dueDate: { lt: begin }, OR: [{ soort: null }, { soort: { not: 'verbeterpunt' } }] },
      include: { claimedBy: { select: { name: true } } },
    }),
  ])
  const projecten = rows.map(serialize)
  const relaties = await db.relatie.findMany({
    where: { id: { in: [...new Set(projecten.map((p) => p.relatieId).filter((x): x is string => !!x))] } },
    select: { id: true, naam: true },
  })
  const klant = new Map(relaties.map((r) => [r.id, r.naam]))

  const uit: Melding[] = []
  for (const p of projecten) uit.push(...projectOpvolging(p, p.relatieId ? klant.get(p.relatieId) ?? null : null, nu))

  for (const k of klokken) {
    const m = klokOpvolging({ ...k, lopendSinds: k.lopendSinds?.toISOString() ?? null }, nu)
    if (m) uit.push(m)
  }
  for (const t of todos) {
    const m = todoOpvolging({
      id: t.id, titel: t.title, deadline: t.dueDate ? vandaagIso(t.dueDate) : null, opgepaktDoor: t.claimedBy?.name ?? null,
    }, vandaag)
    if (m) uit.push(m)
  }

  // ── 12. Artikelen in een open offerte of order zonder recept ──
  const waar = new Map<string, Set<string>>()
  const noteer = (artikelId: string | null, projectId: string) => {
    if (!artikelId) return
    const s = waar.get(artikelId) ?? new Set<string>()
    s.add(projectId)
    waar.set(artikelId, s)
  }
  for (const p of projecten) {
    if (p.status === 'on_hold') continue
    if (p.status === 'concept' || p.status === 'offerte') {
      for (const o of p.offertes) if (o.status === 'concept' || o.status === 'verzonden') for (const r of o.regels) noteer(r.artikelId, p.id)
    }
    for (const o of p.productieOrders) if (ORDER_OPEN.includes(o.status)) noteer(o.artikelId, p.id)
  }
  if (waar.size) {
    const [artikelen, bronnen, todosRecept] = await Promise.all([
      db.article.findMany({ where: { id: { in: [...waar.keys()] } }, select: { id: true, naam: true, recipe: true, estimate: true } }),
      bronnenLaden(db),
      // De mailimport maakt voor een nieuw artikel een todo "Recept maken": dan staat het daar al.
      db.todo.findMany({ where: { done: false, soort: 'recept_maken', artikelId: { in: [...waar.keys()] } }, select: { artikelId: true } }),
    ])
    const alInTodo = new Set(todosRecept.map((t) => t.artikelId))
    for (const a of artikelen) {
      if (alInTodo.has(a.id) || kostprijsVoor(calcArtikel(a), bronnen, 1) > 0) continue
      uit.push(receptOpvolging({ id: a.id, naam: a.naam, projecten: [...waar.get(a.id)!].sort() }))
    }
  }
  return uit
}
