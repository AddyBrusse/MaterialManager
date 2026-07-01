import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import {
  CreateProjectSchema, UpdateProjectSchema,
  type Project, type Offerte, type OfferteRegel, type OfferteStatus,
  type ProductieOrder, type ProductieStap, type Paklijst, type Factuur,
} from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import type { Prisma } from '@prisma/client'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString() }

type Db = typeof prisma | Prisma.TransactionClient

async function nextDocId(db: Db, prefix: 'PRJ' | 'OFF' | 'PROD' | 'PL' | 'FACT'): Promise<string> {
  const result = await db.$queryRaw<{ last_n: number }[]>`
    INSERT INTO doc_sequences (prefix, last_n) VALUES (${prefix}, 1)
    ON CONFLICT (prefix) DO UPDATE SET last_n = doc_sequences.last_n + 1
    RETURNING last_n
  `
  const n = result[0].last_n
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(n).padStart(3, '0')}`
}

type ProjectRow = {
  id: string; naam: string; relatieId: string | null; contactId: string | null
  klantRef: string | null; status: string; levertijdDatum: string | null
  notities: string; offertes: unknown; productieOrders: unknown
  paklijst: unknown; factuur: unknown
  createdAt: Date; updatedAt: Date
}

function serialize(row: ProjectRow): Project {
  return {
    id: row.id,
    naam: row.naam,
    relatieId: row.relatieId,
    contactId: row.contactId,
    klantRef: row.klantRef,
    status: row.status as Project['status'],
    levertijdDatum: row.levertijdDatum,
    notities: row.notities,
    offertes: (row.offertes as Offerte[]) ?? [],
    productieOrders: (row.productieOrders as ProductieOrder[]) ?? [],
    paklijst: (row.paklijst as Paklijst | null) ?? null,
    factuur: (row.factuur as Factuur | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// Every mutation below goes through this helper: it locks the project row
// (SELECT ... FOR UPDATE) inside a transaction, hands the current state to
// `mutate`, and persists whatever it returns — all on the same connection.
// Without this, concurrent requests against the same project (e.g. staging
// several articles in the ArtikelPickerModal fires one POST per article in
// quick succession) each do their own read-modify-write against the JSONB
// columns; the slower one always wins and silently discards the other's
// change. Locking the row serializes those writes per-project so nothing
// is lost, while unrelated projects are unaffected.
async function withProject(
  id: string,
  mutate: (p: Project, tx: Prisma.TransactionClient) => Project | Promise<Project>,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${id} FOR UPDATE
    `
    if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Project niet gevonden')
    const row = await tx.project.findUniqueOrThrow({ where: { id } })
    const current = serialize(row as ProjectRow)
    const next = await mutate(current, tx)
    const saved = await tx.project.update({
      where: { id },
      data: {
        naam: next.naam,
        relatieId: next.relatieId,
        contactId: next.contactId,
        klantRef: next.klantRef,
        status: next.status,
        levertijdDatum: next.levertijdDatum,
        notities: next.notities,
        offertes: next.offertes as object[],
        productieOrders: next.productieOrders as object[],
        paklijst: (next.paklijst as object) ?? null,
        factuur: (next.factuur as object) ?? null,
      },
    })
    return serialize(saved as ProjectRow)
  })
}

async function getProject(id: string): Promise<Project> {
  const row = await prisma.project.findUnique({ where: { id } })
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Project niet gevonden')
  return serialize(row as ProjectRow)
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ data: rows.map(r => serialize(r as ProjectRow)) })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = await getProject(req.params.id)
    res.json({ data: p })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateProjectSchema.parse(req.body)
    // The client suggests an ID (its own locally-seeded counter) so the
    // optimistic cache entry and the persisted row agree immediately. But
    // that counter is per-browser and can drift behind the server's (e.g. a
    // fresh profile, cleared storage) — if the suggested ID is already taken,
    // fall back to the server's own sequence instead of failing the request.
    const row = await prisma.$transaction(async (tx) => {
      const reqId = (req.body as { id?: string }).id
      const taken = reqId ? await tx.project.findUnique({ where: { id: reqId } }) : null
      const id = (reqId && !taken) ? reqId : await nextDocId(tx, 'PRJ')
      return tx.project.create({
        data: {
          id,
          naam: body.naam,
          relatieId: body.relatieId,
          contactId: body.contactId,
          klantRef: body.klantRef,
          levertijdDatum: body.levertijdDatum,
          notities: body.notities,
          offertes: [],
          productieOrders: [],
        },
      })
    })
    res.status(201).json({ data: serialize(row as ProjectRow) })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = UpdateProjectSchema.parse(req.body)
    const updated = await withProject(req.params.id, p => ({ ...p, ...body, updatedAt: now() }))
    res.json({ data: updated })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } }).catch(() => {
      throw new AppError(404, 'NOT_FOUND', 'Project niet gevonden')
    })
    res.status(204).end()
  }),
)

// ── Offerte operations ─────────────────────────────────────────────────────────

const CreateOfferteSchema = z.object({ id: z.string().optional() })

router.post(
  '/:id/offertes',
  asyncHandler(async (req, res) => {
    const body = CreateOfferteSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const off: Offerte = {
        id: body.id ?? await nextDocId(tx, 'OFF'),
        projectId: p.id,
        versie: p.offertes.length + 1,
        status: 'concept',
        regels: [],
        notities: '',
        geldigTot: null,
        verzondenOp: null,
        geaccepteerdOp: null,
        createdAt: now(),
        updatedAt: now(),
      }
      return { ...p, offertes: [...p.offertes, off], updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

const AddRegelSchema = z.object({
  id: z.string().optional(),
  artikelId: z.string().nullable(),
  naam: z.string(),
  omschrijving: z.string(),
  qty: z.number(),
  eenheid: z.string(),
  verkoopprijs: z.number(),
  bewerkingen: z.array(z.string()),
})

router.post(
  '/:id/offertes/:offId/regels',
  asyncHandler(async (req, res) => {
    const body = AddRegelSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const off = p.offertes.find(o => o.id === req.params.offId)
      if (!off) throw new AppError(404, 'NOT_FOUND', 'Offerte niet gevonden')
      const regel: OfferteRegel = {
        id: body.id ?? `regel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sortOrder: off.regels.length + 1,
        artikelId: body.artikelId,
        naam: body.naam,
        omschrijving: body.omschrijving,
        qty: body.qty,
        eenheid: body.eenheid,
        verkoopprijs: body.verkoopprijs,
        totaal: Math.round(body.qty * body.verkoopprijs * 100) / 100,
        bewerkingen: body.bewerkingen,
      }
      return {
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id === off.id ? { ...o, regels: [...o.regels, regel], updatedAt: now() } : o,
        ),
      }
    })
    res.status(201).json({ data: updated })
  }),
)

const UpdateRegelSchema = z.object({
  naam: z.string().optional(),
  omschrijving: z.string().optional(),
  qty: z.number().optional(),
  eenheid: z.string().optional(),
  verkoopprijs: z.number().optional(),
})

router.patch(
  '/:id/offertes/:offId/regels/:regelId',
  asyncHandler(async (req, res) => {
    const patch = UpdateRegelSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id !== req.params.offId) return o
        return {
          ...o,
          updatedAt: now(),
          regels: o.regels.map(r => {
            if (r.id !== req.params.regelId) return r
            const u = { ...r, ...patch }
            u.totaal = Math.round(u.qty * u.verkoopprijs * 100) / 100
            return u
          }),
        }
      }),
    }))
    res.json({ data: updated })
  }),
)

router.delete(
  '/:id/offertes/:offId/regels/:regelId',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id !== req.params.offId ? o
          : { ...o, regels: o.regels.filter(r => r.id !== req.params.regelId), updatedAt: now() },
      ),
    }))
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/offertes/:offId/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => ({
      ...p,
      status: p.status === 'concept' ? 'offerte' : p.status,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id === req.params.offId
          ? { ...o, status: 'verzonden' as OfferteStatus, verzondenOp: now(), updatedAt: now() }
          : o,
      ),
    }))
    res.json({ data: updated })
  }),
)

const AccepteerSchema = z.object({ userName: z.string() })

router.post(
  '/:id/offertes/:offId/accepteer',
  asyncHandler(async (req, res) => {
    const { userName } = AccepteerSchema.parse(req.body)
    void userName

    const updated = await withProject(req.params.id, async (p, tx) => {
      const acceptedOfferte = p.offertes.find(o => o.id === req.params.offId)
      if (!acceptedOfferte) throw new AppError(404, 'NOT_FOUND', 'Offerte niet gevonden')

      const newOrders: ProductieOrder[] = []
      for (const regel of acceptedOfferte.regels) {
        const stappen: ProductieStap[] = regel.bewerkingen.length > 0
          ? regel.bewerkingen.map((naam, i) => ({
              id: `stap_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
              volgorde: i + 1,
              naam,
              machine: naam,
              gereedOp: null,
              gereedDoor: null,
            }))
          : []
        newOrders.push({
          id: await nextDocId(tx, 'PROD'),
          projectId: p.id,
          offerteRegelId: regel.id,
          artikelId: regel.artikelId,
          artikelNaam: regel.naam,
          qty: regel.qty,
          eenheid: regel.eenheid,
          stappen,
          status: 'gepland' as const,
          createdAt: now(),
          updatedAt: now(),
        })
      }

      return {
        ...p,
        status: 'bevestigd',
        updatedAt: now(),
        offertes: p.offertes.map(o => {
          if (o.id === req.params.offId) {
            return { ...o, status: 'geaccepteerd' as OfferteStatus, geaccepteerdOp: now(), updatedAt: now() }
          }
          if (o.status !== 'geaccepteerd') {
            return { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() }
          }
          return o
        }),
        productieOrders: [...p.productieOrders, ...newOrders],
      }
    })
    res.json({ data: updated })
  }),
)

// ── Productie order operations ─────────────────────────────────────────────────

const CheckStapSchema = z.object({ userName: z.string() })

router.post(
  '/:id/orders/:orderId/stap/:stapId/check',
  asyncHandler(async (req, res) => {
    const { userName } = CheckStapSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === req.params.stapId && !s.gereedOp
            ? { ...s, gereedOp: now(), gereedDoor: userName }
            : s,
        )
        const allDone = stappen.every(s => s.gereedOp)
        const anyDone = stappen.some(s => s.gereedOp)
        const status: ProductieOrder['status'] = allDone ? 'gereed' : anyDone ? 'in_productie' : 'gepland'
        return { ...o, stappen, status, updatedAt: now() }
      })
      const status = p.status === 'bevestigd' ? 'productie' : p.status
      return { ...p, productieOrders, status, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/orders/:orderId/stap/:stapId/uncheck',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === req.params.stapId ? { ...s, gereedOp: null, gereedDoor: null } : s,
        )
        const allDone = stappen.every(s => s.gereedOp)
        const anyDone = stappen.some(s => s.gereedOp)
        const status: ProductieOrder['status'] = allDone ? 'gereed' : anyDone ? 'in_productie' : 'gepland'
        return { ...o, stappen, status, updatedAt: now() }
      })
      return { ...p, productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

const PlanStapSchema = z.object({
  geplandDatum: z.string().nullable(),
  geplandMachine: z.string().nullable(),
})

router.patch(
  '/:id/orders/:orderId/stap/:stapId/plan',
  asyncHandler(async (req, res) => {
    const { geplandDatum, geplandMachine } = PlanStapSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === req.params.stapId ? { ...s, geplandDatum, geplandMachine } : s,
        )
        return { ...o, stappen, updatedAt: now() }
      })
      return { ...p, productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/orders/:orderId/unplan',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s =>
          s.gereedOp ? s : { ...s, geplandDatum: null, geplandMachine: null },
        )
        return { ...o, stappen, updatedAt: now() }
      })
      return { ...p, productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/orders/:orderId/gereed',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o =>
        o.id === req.params.orderId ? { ...o, status: 'gereed' as const, updatedAt: now() } : o,
      )
      const status = p.status === 'bevestigd' ? 'productie' : p.status
      return { ...p, productieOrders, status, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// ── Paklijst ──────────────────────────────────────────────────────────────────

router.post(
  '/:id/paklijst',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, async (p, tx) => {
      if (p.paklijst) throw new AppError(409, 'CONFLICT', 'Paklijst bestaat al')
      const gereed = p.productieOrders.filter(o => o.status === 'gereed')
      if (gereed.length === 0) throw new AppError(400, 'BAD_REQUEST', 'Geen gereed productie orders')

      const paklijst: Paklijst = {
        id: await nextDocId(tx, 'PL'),
        projectId: p.id,
        regels: gereed.map(o => ({
          productieOrderId: o.id,
          artikelNaam: o.artikelNaam,
          qty: o.qty,
          eenheid: o.eenheid,
        })),
        notities: '',
        verzondenOp: null,
        createdAt: now(),
      }

      return { ...p, paklijst, status: 'paklijst', updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

router.post(
  '/:id/paklijst/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (!p.paklijst) throw new AppError(404, 'NOT_FOUND', 'Geen paklijst')
      return {
        ...p,
        paklijst: { ...p.paklijst, verzondenOp: now() },
        status: 'verzonden',
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

// ── Factuur ────────────────────────────────────────────────────────────────────

const CreateFactuurSchema = z.object({ btwPct: z.number().optional() })

router.post(
  '/:id/factuur',
  asyncHandler(async (req, res) => {
    const { btwPct = 21 } = CreateFactuurSchema.parse(req.body)
    const updated = await withProject(req.params.id, async (p, tx) => {
      if (p.factuur) throw new AppError(409, 'CONFLICT', 'Factuur bestaat al')
      const accepted = p.offertes.find(o => o.status === 'geaccepteerd')
      if (!accepted) throw new AppError(400, 'BAD_REQUEST', 'Geen geaccepteerde offerte')

      const regels = accepted.regels.map(r => ({
        offerteRegelId: r.id,
        naam: r.naam,
        qty: r.qty,
        eenheid: r.eenheid,
        verkoopprijs: r.verkoopprijs,
        totaal: r.totaal,
      }))

      const subtotaal = Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
      const btwBedrag = Math.round(subtotaal * (btwPct / 100) * 100) / 100
      const totaalInclBtw = Math.round((subtotaal + btwBedrag) * 100) / 100

      const vervalDate = new Date()
      vervalDate.setDate(vervalDate.getDate() + 30)

      const factuur: Factuur = {
        id: await nextDocId(tx, 'FACT'),
        projectId: p.id,
        offerteId: accepted.id,
        regels,
        btwPct,
        subtotaal,
        btwBedrag,
        totaalInclBtw,
        notities: '',
        vervaldatum: vervalDate.toISOString().split('T')[0],
        verzondenOp: null,
        createdAt: now(),
      }

      return { ...p, factuur, status: 'gefactureerd', updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

router.post(
  '/:id/factuur/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (!p.factuur) throw new AppError(404, 'NOT_FOUND', 'Geen factuur')
      return { ...p, factuur: { ...p.factuur, verzondenOp: now() }, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

export default router
