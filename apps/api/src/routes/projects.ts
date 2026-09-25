import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import {
  CreateProjectSchema, UpdateProjectSchema, ProjectStatusStopSchema,
  type Project, type Offerte, type OfferteRegel, type OfferteStatus,
  waaromNietVersturen, waaromNietAccepteren, waaromNietWijzigen,
  waaromNietVerwijderen, waaromNietIntrekken, projectNaIntrekken,
  type ProductieOrder, type ProductieStap, type Paklijst, type Factuur,
  type Opdrachtbevestiging, type OBStatus,
  berekenVoortgang, basisRegels, kopieerOfferte, volgendeVersie,
} from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { PROJECT_INCLUDE, serialize, persist } from '../services/project-store'
import { snapshotBijOrder } from '../services/prijs-snapshot'
import { todosBijOpdracht } from '../services/materiaal-selectie'
import { rondAfVoorStap } from '../services/tijdregistratie'
import type { Prisma } from '@prisma/client'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString() }

type Db = typeof prisma | Prisma.TransactionClient

type DocPrefix = 'PRJ' | 'OFF' | 'PROD' | 'PL' | 'FACT' | 'CRED' | 'OB'

// Bestaat dit nummer al? Sinds de documenten eigen tabellen hebben is het id een
// globale primary key, dus moet een uitgegeven nummer echt vrij zijn.
async function docIdBezet(db: Db, prefix: DocPrefix, id: string): Promise<boolean> {
  const waar = { where: { id }, select: { id: true } }
  switch (prefix) {
    case 'PRJ':  return !!(await db.project.findUnique(waar))
    case 'OFF':  return !!(await db.offerte.findUnique(waar))
    case 'OB':   return !!(await db.opdrachtbevestiging.findUnique(waar))
    case 'PROD': return !!(await db.productieOrder.findUnique(waar))
    case 'PL':   return !!(await db.paklijst.findUnique(waar))
    // Credits delen de facturentabel maar hebben een eigen reeks: een
    // creditnota die FACT-2026-002 heet, leest in de administratie als een
    // tweede factuur.
    case 'FACT':
    case 'CRED': return !!(await db.factuur.findUnique(waar))
  }
}

// De teller in doc_sequences is leidend, maar hij kan achterlopen op wat er in de
// tabellen staat — na een teruggezette backup, of als er ooit handmatig een rij
// bij is gezet. Vroeger was dat onschuldig (documenten zaten in de JSONB-kolom
// van hun eigen project); nu zou het nummer botsen met een bestaand document.
// Daarom doortellen tot er een vrij nummer ligt, met een bovengrens zodat een
// kapotte teller niet in een oneindige lus eindigt.
async function nextDocId(db: Db, prefix: DocPrefix): Promise<string> {
  const year = new Date().getFullYear()
  for (let poging = 0; poging < 50; poging++) {
    const result = await db.$queryRaw<{ last_n: number }[]>`
      INSERT INTO doc_sequences (prefix, last_n) VALUES (${prefix}, 1)
      ON CONFLICT (prefix) DO UPDATE SET last_n = doc_sequences.last_n + 1
      RETURNING last_n
    `
    const id = `${prefix}-${year}-${String(result[0].last_n).padStart(3, '0')}`
    if (!(await docIdBezet(db, prefix, id))) return id
  }
  throw new AppError(
    500, 'INTERNAL',
    `Geen vrij ${prefix}-nummer gevonden; controleer de teller in doc_sequences`,
  )
}

/** Een voorwaarde uit `offerte-voorwaarden` die niet klopt → 409 met die zin. */
function eis(reden: string | null): void {
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
}

/** De naam van een offerteregel zoals op het scherm, voor in een melding. */
function regelNaam(p: Project, offerteRegelId: string): string {
  for (const o of p.offertes) {
    const r = o.regels.find(x => x.id === offerteRegelId)
    if (r) return `"${r.naam}"`
  }
  return offerteRegelId
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
    if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Dit project bestaat niet (meer). Ververs de pagina of ga terug naar de lijst.')
    const row = await tx.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE })
    const current = serialize(row)
    const next = await mutate(current, tx)
    await persist(tx, next)
    const saved = await tx.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE })
    return serialize(saved)
  })
}

async function getProject(id: string): Promise<Project> {
  const row = await prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE })
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Dit project bestaat niet (meer). Ververs de pagina of ga terug naar de lijst.')
  return serialize(row)
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: PROJECT_INCLUDE,
    })
    res.json({ data: rows.map(serialize) })
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
        },
        include: PROJECT_INCLUDE,
      })
    })
    res.status(201).json({ data: serialize(row) })
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
      throw new AppError(404, 'NOT_FOUND', 'Dit project bestaat niet (meer). Ververs de pagina of ga terug naar de lijst.')
    })
    res.status(204).end()
  }),
)

// ── On hold / annuleren ───────────────────────────────────────────────────────
// Beide statussen bestonden al in de enum, de badges en het filter, maar er was
// geen route die ze zette. Het project wordt niet uitgekleed: offertes,
// opdrachtbevestiging en productieorders blijven staan, inclusief afgevinkte
// stappen. Wat wél verandert is dat de planning het project overslaat — een
// stilliggend project hoort geen plek in de machinewachtrij te bezetten. Dat
// filter zit aan de kant die de wachtrij opbouwt (planningSharedUtils).

router.post(
  '/:id/status/stop',
  asyncHandler(async (req, res) => {
    const { status, reden } = ProjectStatusStopSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      if (p.status === status) {
        throw new AppError(409, 'VOORWAARDE', `Het project staat al op "${status}". Er is niets veranderd.`)
      }
      return {
        ...p,
        status,
        statusReden: reden,
        // Al gepauzeerd en nu annuleren: bewaar waar het oorspronkelijk vandaan
        // kwam, niet de tussenstand 'on_hold' — anders komt hervatten daar uit.
        statusVorige: p.status === 'on_hold' || p.status === 'geannuleerd'
          ? p.statusVorige
          : p.status,
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/status/hervat',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (p.status !== 'on_hold' && p.status !== 'geannuleerd') {
        throw new AppError(409, 'VOORWAARDE', 'Kan het project niet hervatten: het staat niet stil.')
      }
      return {
        ...p,
        status: p.statusVorige ?? 'concept',
        statusReden: null,
        statusVorige: null,
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

// ── Offerte operations ─────────────────────────────────────────────────────────

const CreateOfferteSchema = z.object({
  id: z.string().optional(),
  // Op basis van een bestaande versie: die wordt gekopieerd, anders begint de
  // nieuwe versie leeg. Zie `kopieerOfferte` voor wat er meegaat.
  vanOfferteId: z.string().optional(),
  // De regel-id's die de browser al in zijn cache gebruikt, in de volgorde van
  // de bron — zodat een bewerking direct na het kopiëren de goede regel raakt.
  regelIds: z.array(z.string()).optional(),
})

router.post(
  '/:id/offertes',
  asyncHandler(async (req, res) => {
    const body = CreateOfferteSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const id = body.id ?? await nextDocId(tx, 'OFF')
      // Een nieuwe versie VERVANGT de vorige, dus draagt ze hetzelfde nummer:
      // de klant kreeg offerte OFF-2026-014 en krijgt er een herziene versie
      // van, geen tweede offerte. Alleen de allereerste versie geeft een nieuw
      // nummer uit. Het id moet wel per versie verschillen — dat is de sleutel.
      const eerste = p.offertes[0]
      const documentNr = eerste ? eerste.documentNr : id
      const versie = volgendeVersie(p.offertes)

      let off: Offerte
      if (body.vanOfferteId) {
        const bron = p.offertes.find(o => o.id === body.vanOfferteId)
        if (!bron) throw new AppError(404, 'NOT_FOUND', 'Kan niet kopiëren: deze offerteversie bestaat niet (meer). Ververs de pagina.')
        // Een kopie herziet déze versie, dus draagt hij haar nummer. Bij een
        // project van ná de nummer-migratie is dat hetzelfde als dat van v1;
        // bij een ouder project, waar elke versie haar eigen nummer hield, is
        // het het nummer dat de klant van deze versie kent.
        off = kopieerOfferte(bron, {
          id, documentNr: bron.documentNr, versie, regelIds: body.regelIds, nu: now(),
        })
      } else {
        off = {
          id,
          documentNr,
          projectId: p.id,
          versie,
          status: 'concept',
          regels: [],
          notities: '',
          externeRef: null,
          geldigTot: null,
          verzondenOp: null,
          geaccepteerdOp: null,
          createdAt: now(),
          updatedAt: now(),
        }
      }
      return { ...p, offertes: [...p.offertes, off], updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

// Velden van een versie zelf, los van haar regels. Nu alleen de externe
// referentie; die mag ook na het versturen nog, want het is onze eigen
// boekhouding van waar de versie op antwoordde, niet iets wat de klant kreeg.
const UpdateOfferteSchema = z.object({
  externeRef: z.string().max(200, 'maximaal 200 tekens').nullable().optional(),
})

router.patch(
  '/:id/offertes/:offId',
  asyncHandler(async (req, res) => {
    const body = UpdateOfferteSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const off = p.offertes.find(o => o.id === req.params.offId)
      if (!off) throw new AppError(404, 'NOT_FOUND', 'Deze offerteversie bestaat niet (meer). Ververs de pagina.')
      // Leeg is geen referentie: "" opslaan zou een versie tonen met een
      // referentie die niets zegt, en elders `?? '—'` omzeilen.
      const externeRef =
        body.externeRef === undefined ? off.externeRef : body.externeRef?.trim() || null
      return {
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id === off.id ? { ...o, externeRef, updatedAt: now() } : o,
        ),
      }
    })
    res.json({ data: updated })
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
      eis(waaromNietWijzigen(off))
      if (!off) throw new AppError(404, 'NOT_FOUND', 'Deze offerteversie bestaat niet (meer). Ververs de pagina.')
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
  /**
   * Hoort bij de prijs en gaat er dus mee mee. De bewerkingen zijn bevroren bij
   * het aanmaken van de regel omdat de productiestappen eruit komen; wordt de
   * prijs opnieuw uit de calculatie gehaald, dan is die bevriezing van een oude
   * calculatie en moeten ze samen bijgewerkt worden — anders staat er een prijs
   * van recept A met de stappen van recept B.
   */
  bewerkingen: z.array(z.string()).optional(),
})

router.patch(
  '/:id/offertes/:offId/regels/:regelId',
  asyncHandler(async (req, res) => {
    const patch = UpdateRegelSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const off = p.offertes.find(o => o.id === req.params.offId)
      eis(waaromNietWijzigen(off))
      if (!off?.regels.some(r => r.id === req.params.regelId)) {
        throw new AppError(404, 'NOT_FOUND', 'Deze regel bestaat niet (meer) in de offerte. Ververs de pagina.')
      }
      return {
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
      }
    })
    res.json({ data: updated })
  }),
)

router.delete(
  '/:id/offertes/:offId/regels/:regelId',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      eis(waaromNietWijzigen(p.offertes.find(o => o.id === req.params.offId)))
      return {
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id !== req.params.offId ? o
            : { ...o, regels: o.regels.filter(r => r.id !== req.params.regelId), updatedAt: now() },
        ),
      }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/offertes/:offId/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      eis(waaromNietVersturen(p.offertes.find(o => o.id === req.params.offId)))
      return {
      ...p,
      status: p.status === 'concept' ? 'offerte' : p.status,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id === req.params.offId
          ? { ...o, status: 'verzonden' as OfferteStatus, verzondenOp: now(), updatedAt: now() }
          : o,
      ),
      }
    })
    res.json({ data: updated })
  }),
)

router.delete(
  '/:id/offertes/:offId',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      eis(waaromNietVerwijderen(p.offertes.find(o => o.id === req.params.offId)))
      // De regels gaan mee via onDelete: Cascade; er hangt verder niets aan
      // een concept (orders, prijshistorie en todo's ontstaan bij accepteren).
      return projectNaIntrekken({
        ...p,
        updatedAt: now(),
        offertes: p.offertes.filter(o => o.id !== req.params.offId),
      })
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/offertes/:offId/intrek',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      eis(waaromNietIntrekken(p.offertes.find(o => o.id === req.params.offId)))
      return projectNaIntrekken({
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id === req.params.offId ? { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() } : o,
        ),
      })
    })
    res.json({ data: updated })
  }),
)

// Een offerte als begin van een nieuw project: een herhaalorder, of dezelfde
// onderdelen voor een andere klant. Project en offerte in één transactie —
// anders blijft er bij een fout een leeg project achter dat niemand bedoelde.
const NaarProjectSchema = z.object({
  naam: z.string().trim().min(1),
  relatieId: z.string().nullable(),
  contactId: z.string().nullable(),
  externeRef: z.string().max(200).nullable(),
  regelIds: z.array(z.string()).optional(),
})

router.post(
  '/:id/offertes/:offId/naar-project',
  asyncHandler(async (req, res) => {
    const body = NaarProjectSchema.parse(req.body)
    const bronProject = await getProject(req.params.id)
    const bron = bronProject.offertes.find(o => o.id === req.params.offId)
    if (!bron) {
      throw new AppError(404, 'NOT_FOUND', 'Kan niet kopiëren: deze offerteversie bestaat niet (meer). Ververs de pagina.')
    }
    const nieuw = await prisma.$transaction(async (tx) => {
      const projectId = await nextDocId(tx, 'PRJ')
      const row = await tx.project.create({
        data: {
          id: projectId,
          naam: body.naam,
          relatieId: body.relatieId,
          contactId: body.contactId,
          // Niet mee: klantreferentie en levertijd horen bij déze bestelling,
          // notities bij dít project.
          klantRef: null,
          levertijdDatum: null,
          notities: '',
        },
        include: PROJECT_INCLUDE,
      })
      // Een nieuw nummer: voor de klant is dit een nieuwe offerte, geen
      // herziening van die uit het andere project.
      const offId = await nextDocId(tx, 'OFF')
      const off = {
        ...kopieerOfferte(bron, {
          id: offId, documentNr: offId, versie: 1, regelIds: body.regelIds, nu: now(), projectId,
        }),
        externeRef: body.externeRef?.trim() || null,
        notities: '',
      }
      await persist(tx, { ...serialize(row), offertes: [off] })
      return serialize(await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: PROJECT_INCLUDE }))
    })
    res.status(201).json({ data: nieuw })
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
      eis(waaromNietAccepteren(acceptedOfferte, p.offertes))
      if (!acceptedOfferte) throw new AppError(404, 'NOT_FOUND', 'Deze offerteversie bestaat niet (meer). Ververs de pagina.')

      // Prijshistorie: dit is het moment waarop er echt iets verkocht is, en de
      // enige plek in de code waar een order ontstaat. Wat de klant betaalt komt
      // van de regel, de kostprijs wordt erbij berekend bij dat aantal.
      const relatie = p.relatieId
        ? await tx.relatie.findUnique({ where: { id: p.relatieId }, select: { naam: true } })
        : null
      await snapshotBijOrder(tx, {
        regels: acceptedOfferte.regels,
        projectId: p.id,
        offerteId: acceptedOfferte.id,
        relatieId: p.relatieId,
        klant: relatie?.naam ?? null,
        door: req.user.id,
      })

      // Nu er een opdracht ligt moet er besloten worden wát er gezaagd gaat
      // worden. Dat doet het programma niet zelf: per artikel komt er een todo
      // "materiaal selecteren", en die opent het keuzescherm met een voorstel.
      // Stilzwijgend materiaal vastleggen is precies hoe je een staaf kwijtraakt
      // die voor een spoedklus bedoeld was.
      await todosBijOpdracht(tx, {
        projectId: p.id,
        projectNaam: p.naam,
        regels: acceptedOfferte.regels.map(r => ({
          id: r.id, artikelId: r.artikelId, naam: r.naam, qty: r.qty,
        })),
        door: req.user.id,
      })

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
          aantalGereed: 0,
          stappen,
          status: 'gepland' as const,
          createdAt: now(),
          updatedAt: now(),
        })
      }

      // Auto-create opdrachtbevestiging from the accepted offerte's regels
      const ob: Opdrachtbevestiging = {
        id: await nextDocId(tx, 'OB'),
        projectId: p.id,
        offerteId: req.params.offId,
        regels: acceptedOfferte.regels,
        levertijdDatum: p.levertijdDatum,
        notities: '',
        status: 'concept',
        verzondenOp: null,
        createdAt: now(),
        updatedAt: now(),
      }

      return {
        ...p,
        status: 'bevestigd',
        updatedAt: now(),
        opdrachtbevestiging: ob,
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

// ── Opdrachtbevestiging operations ────────────────────────────────────────────

router.patch(
  '/:id/opdrachtbevestiging',
  asyncHandler(async (req, res) => {
    const patch = z.object({ notities: z.string().optional(), levertijdDatum: z.string().nullable().optional() }).parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      if (!p.opdrachtbevestiging) throw new AppError(404, 'NOT_FOUND', 'Er is nog geen opdrachtbevestiging. Die ontstaat bij het accepteren van een offerte.')
      return {
        ...p,
        updatedAt: now(),
        opdrachtbevestiging: { ...p.opdrachtbevestiging, ...patch, updatedAt: now() },
      }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/opdrachtbevestiging/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (!p.opdrachtbevestiging) throw new AppError(404, 'NOT_FOUND', 'Er is nog geen opdrachtbevestiging. Die ontstaat bij het accepteren van een offerte.')
      return {
        ...p,
        updatedAt: now(),
        opdrachtbevestiging: {
          ...p.opdrachtbevestiging,
          status: 'verzonden' as OBStatus,
          verzondenOp: now(),
          updatedAt: now(),
        },
      }
    })
    res.json({ data: updated })
  }),
)

// ── Productie order operations ─────────────────────────────────────────────────

const CheckStapSchema = z.object({
  userName: z.string(),
  /**
   * Hoeveel stuks er uit deze stap zijn gekomen. De terminal weet dat; het
   * kantoorscherm dat een stap afvinkt meestal niet en laat hem weg.
   */
  aantalStuks: z.number().int().nonnegative().nullable().optional(),
})

router.post(
  '/:id/orders/:orderId/stap/:stapId/check',
  asyncHandler(async (req, res) => {
    const { userName, aantalStuks } = CheckStapSchema.parse(req.body)
    const updated = await withProject(req.params.id, async (p, tx) => {
      // Eerst de klok, dan de stap: een gereedgemelde stap met een lopende
      // klok telt door tot iemand hem toevallig ziet, en de nacalculatie
      // groeit dan na afloop van het werk nog dagen door.
      await rondAfVoorStap(tx, req.params.stapId, aantalStuks ?? null)
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
  // Optional. Omitted (not merely `null`) means "leave whatever
  // queuePosition this step already has alone" — a plan call that doesn't
  // care about queue rank shouldn't accidentally wipe one out.
  queuePosition: z.number().nullable().optional(),
})

router.patch(
  '/:id/orders/:orderId/stap/:stapId/plan',
  asyncHandler(async (req, res) => {
    const body = PlanStapSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s => {
          if (s.id !== req.params.stapId) return s
          const next = { ...s, geplandDatum: body.geplandDatum, geplandMachine: body.geplandMachine }
          if ('queuePosition' in body) next.queuePosition = body.queuePosition
          // Unplanning (both null) always clears queue state too, even if
          // the caller didn't explicitly say so — a backlog item can't
          // still hold a rank in a machine's queue.
          if (body.geplandDatum == null && body.geplandMachine == null) {
            next.queuePosition = null
            next.notBefore = null
          }
          return next
        })
        return { ...o, stappen, updatedAt: now() }
      })
      return { ...p, productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

const SetHoldSchema = z.object({
  notBefore: z.string().nullable(),
})

router.patch(
  '/:id/orders/:orderId/stap/:stapId/hold',
  asyncHandler(async (req, res) => {
    const { notBefore } = SetHoldSchema.parse(req.body)
    const updated = await withProject(req.params.id, (p) => {
      const productieOrders = p.productieOrders.map(o => {
        if (o.id !== req.params.orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === req.params.stapId ? { ...s, notBefore } : s,
        )
        return { ...o, stappen, updatedAt: now() }
      })
      return { ...p, productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

const OrderGereedSchema = z.object({
  /**
   * Hoeveel goede stuks er uit de order zijn gekomen. Weggelaten = de volle
   * hoeveelheid. Minder dan qty betekent dat er nog werk ligt: de order blijft
   * dan in productie staan, want "gereed" met 34 van de 40 zou zeggen dat de
   * overige 6 nooit meer komen.
   */
  aantal: z.number().nonnegative().optional(),
})

router.post(
  '/:id/orders/:orderId/gereed',
  asyncHandler(async (req, res) => {
    const { aantal } = OrderGereedSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const order = p.productieOrders.find(o => o.id === req.params.orderId)
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Deze productieorder bestaat niet (meer). Ververs de pagina.')
      const gereed = aantal ?? order.qty
      if (gereed > order.qty) {
        throw new AppError(
          409, 'VOORWAARDE',
          `Kan niet gereedmelden: ${gereed} stuks is meer dan de ${order.qty} die besteld zijn. Vul hoogstens ${order.qty} in.`,
        )
      }
      const productieOrders = p.productieOrders.map(o =>
        o.id === req.params.orderId
          ? {
              ...o,
              aantalGereed: gereed,
              status: (gereed >= o.qty ? 'gereed' : 'in_productie') as ProductieOrder['status'],
              updatedAt: now(),
            }
          : o,
      )
      const status = p.status === 'bevestigd' ? 'productie' : p.status
      return { ...p, productieOrders, status, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// ── Paklijst ──────────────────────────────────────────────────────────────────

// Een pakbon gaat over wat er NU klaarligt, niet over de hele order. Bij een
// deellevering zijn dat 10 van de 40 stuks, en de volgende bon pakt er 12. Elke
// bon is een eigen document met een eigen nummer; hij laat niets vervallen.
const CreatePaklijstSchema = z.object({
  /** Per orderregel hoeveel er mee de deur uit gaat. Leeg = alles wat klaarligt. */
  regels: z.array(z.object({
    offerteRegelId: z.string(),
    qty: z.number().positive(),
  })).optional(),
})

router.post(
  '/:id/paklijst',
  asyncHandler(async (req, res) => {
    const body = CreatePaklijstSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const voortgang = berekenVoortgang(p)

      // Wat er klaarligt per orderregel: gemaakt min wat er al geleverd is.
      // Zonder dat aftrekken zou de tweede pakbon dezelfde stuks nog een keer
      // meesturen, en telt het project 44 geleverde stuks van de 40.
      const klaarPerRegel = new Map(voortgang.regels.map(r => [r.offerteRegelId, r.klaar]))

      const gevraagd = body.regels ?? voortgang.regels
        .filter(r => r.klaar > 0)
        .map(r => ({ offerteRegelId: r.offerteRegelId, qty: r.klaar }))

      if (gevraagd.length === 0) {
        throw new AppError(409, 'VOORWAARDE', 'Kan geen paklijst maken: er ligt nog niets klaar om te leveren. Meld eerst stuks gereed op de Productie-tab.')
      }

      for (const g of gevraagd) {
        const klaar = klaarPerRegel.get(g.offerteRegelId) ?? 0
        if (g.qty > klaar) {
          throw new AppError(
            409, 'VOORWAARDE',
            `Kan geen paklijst maken: voor regel ${regelNaam(p, g.offerteRegelId)} staan er ${g.qty} op de paklijst, maar er liggen er maar ${klaar} klaar.`,
          )
        }
      }

      // De productieorder erbij zoeken voor de naam en de eenheid. Meerdere
      // orders kunnen naar dezelfde orderregel wijzen; de eerste volstaat,
      // want de pakbon legt de orderregel zelf vast.
      const orderVan = (regelId: string) =>
        p.productieOrders.find(o => o.offerteRegelId === regelId)
      const regelVan = (regelId: string) =>
        basisRegels(p).find(r => r.id === regelId)

      const paklijst: Paklijst = {
        id: await nextDocId(tx, 'PL'),
        projectId: p.id,
        regels: gevraagd.map(g => {
          const order = orderVan(g.offerteRegelId)
          const regel = regelVan(g.offerteRegelId)
          return {
            productieOrderId: order?.id ?? '',
            offerteRegelId: g.offerteRegelId,
            artikelNaam: order?.artikelNaam ?? regel?.naam ?? g.offerteRegelId,
            qty: g.qty,
            eenheid: order?.eenheid ?? regel?.eenheid ?? 'st',
          }
        }),
        notities: '',
        verzondenOp: null,
        createdAt: now(),
      }

      return { ...p, paklijsten: [...p.paklijsten, paklijst], status: 'paklijst', updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

router.post(
  '/:id/paklijst/:paklijstId/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const pl = p.paklijsten.find(x => x.id === req.params.paklijstId)
      if (!pl) throw new AppError(404, 'NOT_FOUND', 'Deze paklijst bestaat niet (meer). Ververs de pagina.')
      const paklijsten = p.paklijsten.map(x =>
        x.id === pl.id ? { ...x, verzondenOp: now() } : x,
      )
      // Het project heet pas 'verzonden' als alles weg is. Bij een deellevering
      // ligt er nog werk, en dan zou die status liegen.
      const na = berekenVoortgang({ ...p, paklijsten })
      const status = na.klaar === 0 && na.teMaken === 0 ? 'verzonden' : p.status
      return { ...p, paklijsten, status, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// ── Factuur ────────────────────────────────────────────────────────────────────

// Factureren gaat over wat er GELEVERD is en nog niet gefactureerd. Dat is bij
// een deellevering minder dan de hele offerte; de rest volgt op de volgende
// factuur.
const CreateFactuurSchema = z.object({
  btwPct: z.number().optional(),
  regels: z.array(z.object({
    offerteRegelId: z.string(),
    qty: z.number().positive(),
  })).optional(),
})

function geldbedragen(regels: { totaal: number }[], btwPct: number) {
  const subtotaal = Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
  const btwBedrag = Math.round(subtotaal * (btwPct / 100) * 100) / 100
  return { subtotaal, btwBedrag, totaalInclBtw: Math.round((subtotaal + btwBedrag) * 100) / 100 }
}

router.post(
  '/:id/factuur',
  asyncHandler(async (req, res) => {
    const { btwPct = 21, regels: gevraagd } = CreateFactuurSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const accepted = p.offertes.find(o => o.status === 'geaccepteerd')
      if (!accepted) throw new AppError(409, 'VOORWAARDE', 'Kan niet factureren: er is nog geen geaccepteerde offerte.')

      const voortgang = berekenVoortgang(p)
      const openPerRegel = new Map(voortgang.regels.map(r => [r.offerteRegelId, r.teFactureren]))

      const keuze = gevraagd ?? voortgang.regels
        .filter(r => r.teFactureren > 0)
        .map(r => ({ offerteRegelId: r.offerteRegelId, qty: r.teFactureren }))

      if (keuze.length === 0) {
        throw new AppError(409, 'VOORWAARDE', 'Kan geen factuur maken: alles wat geleverd is, is al gefactureerd.')
      }
      for (const g of keuze) {
        const open = openPerRegel.get(g.offerteRegelId) ?? 0
        if (g.qty > open) {
          throw new AppError(
            409, 'VOORWAARDE',
            `Kan geen factuur maken: voor regel ${regelNaam(p, g.offerteRegelId)} worden er ${g.qty} gefactureerd, maar er staan er maar ${open} open.`,
          )
        }
      }

      const bron = basisRegels(p)
      const regels = keuze.map(g => {
        const r = bron.find(x => x.id === g.offerteRegelId)
        const prijs = r?.verkoopprijs ?? 0
        return {
          offerteRegelId: g.offerteRegelId,
          naam: r?.naam ?? g.offerteRegelId,
          qty: g.qty,
          eenheid: r?.eenheid ?? 'st',
          verkoopprijs: prijs,
          totaal: Math.round(g.qty * prijs * 100) / 100,
        }
      })

      const vervalDate = new Date()
      vervalDate.setDate(vervalDate.getDate() + 30)

      const factuur: Factuur = {
        id: await nextDocId(tx, 'FACT'),
        soort: 'factuur',
        crediteertFactuurId: null,
        projectId: p.id,
        offerteId: accepted.id,
        regels,
        btwPct,
        ...geldbedragen(regels, btwPct),
        notities: '',
        vervaldatum: vervalDate.toISOString().split('T')[0],
        verzondenOp: null,
        createdAt: now(),
      }

      const facturen = [...p.facturen, factuur]
      // Pas 'gefactureerd' als er niets meer openstaat — anders zegt de status
      // dat het project klaar is terwijl er nog een tweede levering aankomt.
      const na = berekenVoortgang({ ...p, facturen })
      const status = na.teFactureren === 0 && na.teMaken === 0 && na.klaar === 0
        ? 'gefactureerd' : p.status

      return { ...p, facturen, status, updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

// ── Creditfactuur ─────────────────────────────────────────────────────────────

// Een credit is geen negatieve factuur: de factuur die hij crediteert is
// verstuurd en blijft staan. De credit is een eigen document dat ernaast telt.
const CreateCreditSchema = z.object({
  factuurId: z.string(),
  regels: z.array(z.object({
    offerteRegelId: z.string(),
    qty: z.number().positive(),
  })).optional(),
  notities: z.string().optional(),
})

router.post(
  '/:id/credit',
  asyncHandler(async (req, res) => {
    const body = CreateCreditSchema.parse(req.body)
    const updated = await withProject(req.params.id, async (p, tx) => {
      const bron = p.facturen.find(f => f.id === body.factuurId)
      if (!bron) throw new AppError(404, 'NOT_FOUND', 'Deze factuur bestaat niet (meer). Ververs de pagina.')
      if (bron.soort === 'credit') {
        throw new AppError(409, 'VOORWAARDE', 'Een creditfactuur kun je niet crediteren. Maak zo nodig een nieuwe factuur.')
      }

      // Wat er van deze factuur nog te crediteren valt: de gefactureerde
      // aantallen min wat er eerder al gecrediteerd is.
      const eerder = new Map<string, number>()
      for (const c of p.facturen.filter(f => f.crediteertFactuurId === bron.id)) {
        for (const r of c.regels) {
          eerder.set(r.offerteRegelId, (eerder.get(r.offerteRegelId) ?? 0) + r.qty)
        }
      }
      const openPerRegel = new Map(bron.regels.map(r =>
        [r.offerteRegelId, r.qty - (eerder.get(r.offerteRegelId) ?? 0)]))

      const keuze = body.regels ?? bron.regels
        .map(r => ({ offerteRegelId: r.offerteRegelId, qty: openPerRegel.get(r.offerteRegelId) ?? 0 }))
        .filter(r => r.qty > 0)

      if (keuze.length === 0) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet crediteren: deze factuur is al volledig gecrediteerd.')
      }
      for (const g of keuze) {
        const open = openPerRegel.get(g.offerteRegelId) ?? 0
        if (g.qty > open) {
          throw new AppError(
            409, 'VOORWAARDE',
            `Kan niet crediteren: voor regel ${regelNaam(p, g.offerteRegelId)} worden er ${g.qty} gecrediteerd, maar er valt er maar ${open} te crediteren.`,
          )
        }
      }

      const regels = keuze.map(g => {
        const r = bron.regels.find(x => x.offerteRegelId === g.offerteRegelId)
        const prijs = r?.verkoopprijs ?? 0
        return {
          offerteRegelId: g.offerteRegelId,
          naam: r?.naam ?? g.offerteRegelId,
          qty: g.qty,
          eenheid: r?.eenheid ?? 'st',
          verkoopprijs: prijs,
          totaal: Math.round(g.qty * prijs * 100) / 100,
        }
      })

      const credit: Factuur = {
        id: await nextDocId(tx, 'CRED'),
        soort: 'credit',
        crediteertFactuurId: bron.id,
        projectId: p.id,
        offerteId: bron.offerteId,
        regels,
        btwPct: bron.btwPct,
        ...geldbedragen(regels, bron.btwPct),
        notities: body.notities ?? '',
        vervaldatum: null,
        verzondenOp: null,
        createdAt: now(),
      }

      return { ...p, facturen: [...p.facturen, credit], updatedAt: now() }
    })
    res.status(201).json({ data: updated })
  }),
)

router.post(
  '/:id/factuur/:factuurId/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const f = p.facturen.find(x => x.id === req.params.factuurId)
      if (!f) throw new AppError(404, 'NOT_FOUND', 'Deze factuur bestaat niet (meer). Ververs de pagina.')
      const facturen = p.facturen.map(x =>
        x.id === f.id ? { ...x, verzondenOp: now() } : x,
      )
      return { ...p, facturen, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// ── Revert operations ─────────────────────────────────────────────────────────
// Each endpoint reverts the project exactly one step backwards.
// Guards are enforced server-side so reverting never silently discards
// in-progress production work.

// Bevestigd/OB → Offerte
// Blocked if any production step has been checked off.
router.post(
  '/:id/revert/bevestigd',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (!['bevestigd', 'productie'].includes(p.status)) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug naar de offertefase: het project is niet bevestigd en niet in productie.')
      }
      const hasWork = p.productieOrders.some(o => o.stappen.some(s => s.gereedOp))
      if (hasWork) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug naar de offertefase: er zijn al productiestappen gereedgemeld. Trek die gereedmeldingen eerst in op de Productie-tab.')
      }
      // Revert accepted offerte → concept/verzonden, lift vervallen offertes back to concept
      const offertes = p.offertes.map(o => {
        if (o.status === 'geaccepteerd') {
          return { ...o, status: (o.verzondenOp ? 'verzonden' : 'concept') as OfferteStatus, geaccepteerdOp: null, updatedAt: now() }
        }
        if (o.status === 'vervallen') {
          return { ...o, status: 'concept' as OfferteStatus, updatedAt: now() }
        }
        return o
      })
      const hasVerzonden = offertes.some(o => o.status === 'verzonden')
      return {
        ...p,
        status: hasVerzonden ? 'offerte' : 'concept',
        opdrachtbevestiging: null,
        productieOrders: [],
        offertes,
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

// Productie → Bevestigd
// Blocked if any order is marked gereed.
router.post(
  '/:id/revert/productie',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (p.status !== 'productie') throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: het project is niet in productie.')
      const hasGereed = p.productieOrders.some(o => o.status === 'gereed')
      if (hasGereed) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: er zijn al orders gereedgemeld. Trek die gereedmeldingen eerst in op de Productie-tab.')
      }
      const productieOrders = p.productieOrders.map(o => ({
        ...o,
        status: 'gepland' as const,
        stappen: o.stappen.map(s => ({ ...s, gereedOp: null, gereedDoor: null })),
        updatedAt: now(),
      }))
      return { ...p, status: 'bevestigd', productieOrders, updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// Paklijst → Productie
// Haalt de laatste pakbon weg. Een verstuurde bon blijft: die ligt bij de
// klant en kan niet meer ongedaan gemaakt worden.
router.post(
  '/:id/revert/paklijst',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const laatste = p.paklijsten[p.paklijsten.length - 1]
      if (!laatste) throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: er is geen paklijst om in te trekken.')
      if (laatste.verzondenOp) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: de paklijst is al verzonden, de goederen zijn de deur uit.')
      }
      const paklijsten = p.paklijsten.filter(x => x.id !== laatste.id)
      return {
        ...p,
        paklijsten,
        status: paklijsten.length > 0 ? p.status : 'productie',
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

// Verzonden → Paklijst: de laatste verzending terugdraaien.
router.post(
  '/:id/revert/verzonden',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const laatste = [...p.paklijsten].reverse().find(x => x.verzondenOp)
      if (!laatste) throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: er is geen verzonden paklijst.')
      const paklijsten = p.paklijsten.map(x =>
        x.id === laatste.id ? { ...x, verzondenOp: null } : x,
      )
      return { ...p, paklijsten, status: 'paklijst', updatedAt: now() }
    })
    res.json({ data: updated })
  }),
)

// Gefactureerd → Verzonden: de laatste factuur weghalen, als die nog niet weg is.
// Is hij wél verstuurd, dan hoort er een creditfactuur te komen en geen
// verwijdering — een verstuurde factuur uitgummen laat een gat in de nummering.
router.post(
  '/:id/revert/gefactureerd',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const laatste = [...p.facturen].reverse().find(f => f.soort === 'factuur')
      if (!laatste) throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: er is geen factuur.')
      if (laatste.verzondenOp) {
        throw new AppError(
          409, 'VOORWAARDE',
          'Kan de factuur niet intrekken: hij is al verstuurd. Maak een creditfactuur in plaats daarvan.',
        )
      }
      if (p.facturen.some(f => f.crediteertFactuurId === laatste.id)) {
        throw new AppError(409, 'VOORWAARDE', 'Kan de factuur niet intrekken: er hangt al een creditfactuur aan.')
      }
      return {
        ...p,
        facturen: p.facturen.filter(f => f.id !== laatste.id),
        status: 'verzonden',
        updatedAt: now(),
      }
    })
    res.json({ data: updated })
  }),
)

export default router
