import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import {
  CreateProjectSchema, UpdateProjectSchema, ProjectStatusStopSchema,
  type Project, type Offerte, type OfferteRegel, type OfferteStatus,
  waaromNietVersturen, waaromNietAccepteren, waaromNietWijzigen,
  waaromNietVerwijderen, waaromNietIntrekken, projectNaIntrekken,
  waaromNietVersturenOB, obInhoud, wijzigOpdracht,
  type ProductieOrder, type ProductieStap, type Paklijst, type Factuur,
  type Opdrachtbevestiging, type OBStatus,
  berekenVoortgang, basisRegels, kopieerOfferte, volgendeVersie,
  isVrijgegeven, orderStatusNaStappen, vrijgeven, terugNaarVoorbereiding,
  waaromNietVrijgeven, waaromNietTerugNaarVoorbereiding,
  statusNaLevering, waaromNietPakbon, waaromNietDeelsGereed,
  voorstelPakbon, pakbonRegels, waaromNietPakbonVersturen, waaromNietPakbonWijzigen,
  BTW_PCT, factuurBedragen, factuurRegels, factuurMailadres, voorstelFactuur, voorstelCredit,
  waaromNietFactuur, waaromNietCredit, waaromNietFactuurWijzigen, waaromNietFactuurVersturen,
  waaromNietBetaald, vervaldatumVanaf, waaromNietProjectVerwijderen,
} from '@stockmanager/shared'
import { asyncHandler } from '../lib/async-handler'
import { AppError } from '../middleware/error'
import { PROJECT_INCLUDE, serialize, persist } from '../services/project-store'
import { snapshotBijOrder } from '../services/prijs-snapshot'
import { todosBijOpdracht } from '../services/materiaal-selectie'
import { rondAfVoorStap } from '../services/tijdregistratie'
import { boekAfBijGereed } from '../services/zaagbon'
import { nextDocId } from '../services/doc-nummer'
import type { Prisma } from '@prisma/client'

const router = Router()

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString() }

type Db = typeof prisma | Prisma.TransactionClient

/** Een voorwaarde uit `offerte-voorwaarden` die niet klopt → 409 met die zin. */
function eis(reden: string | null): void {
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)
}

/**
 * Een productieorder voor een regel: de bewerkingen worden de stappen. Het id
 * vult de aanroeper in — bij accepteren meteen, bij een wijziging achteraf
 * (zie de wijzig-route), zodat er geen nummer verloren gaat aan een order die
 * uiteindelijk niet nodig bleek.
 */
function orderVoorRegel(p: Project, regel: OfferteRegel, qty: number, id: string): ProductieOrder {
  return {
    id,
    projectId: p.id,
    offerteRegelId: regel.id,
    artikelId: regel.artikelId,
    artikelNaam: regel.naam,
    qty,
    eenheid: regel.eenheid,
    aantalGereed: 0,
    stappen: regel.bewerkingen.map((naam, i) => ({
      id: `stap_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      volgorde: i + 1,
      naam,
      machine: naam,
      gereedOp: null,
      gereedDoor: null,
    })),
    // Eerst voorbereiding: kantoor geeft vrij wanneer het de hal in mag
    // (calc/vrijgeven.ts). Ook een regel die later bij de opdracht komt.
    status: 'voorbereiding' as const,
    createdAt: now(),
    updatedAt: now(),
  }
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
    // Het nummer geeft de server, per jaar (2026-10-05). Tot dan stelde de
    // browser er een voor uit een eigen teller per pc; die liep uit de pas met
    // andere pc's en begon nooit opnieuw in januari. Een meegestuurd id wordt
    // genegeerd.
    const row = await prisma.$transaction(async (tx) => {
      const id = await nextDocId(tx, 'PRJ')
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
    // Wat de deur uit is, blijft (2026-10-05) — zie waaromNietProjectVerwijderen.
    eis(waaromNietProjectVerwijderen(await getProject(req.params.id)))
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

// Geen `id` meer van de browser (2026-10-05): het nummer geeft de server, per
// jaar. Een meegestuurd id wordt genegeerd (zod laat onbekende velden weg).
const CreateOfferteSchema = z.object({
  // Op basis van een bestaande versie: die wordt gekopieerd, anders begint de
  // nieuwe versie leeg. Zie `kopieerOfferte` voor wat er meegaat.
  vanOfferteId: z.string().optional(),
  // De regel-id's die de browser al in zijn cache gebruikt, in de volgorde van
  // de bron — zodat een bewerking direct na het kopiëren de goede regel raakt.
  regelIds: z.array(z.string()).optional(),
  /** Een directe opdracht in voorbereiding: wordt geaccepteerd zonder versturen. */
  direct: z.boolean().optional(),
})

router.post(
  '/:id/offertes',
  asyncHandler(async (req, res) => {
    const body = CreateOfferteSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const id = await nextDocId(tx, 'OFF')
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
          direct: body.direct ?? false,
          vervallenDoor: null,
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
          o.id === req.params.offId
            ? { ...o, status: 'vervallen' as OfferteStatus, vervallenDoor: 'intrekken' as const, updatedAt: now() }
            : o,
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

const AccepteerSchema = z.object({
  userName: z.string(),
  /** Waarmee de klant opdracht gaf — gevraagd in het accepteer-venster. */
  opdrachtRef: z.string().max(200).nullable().optional(),
})

router.post(
  '/:id/offertes/:offId/accepteer',
  asyncHandler(async (req, res) => {
    const { opdrachtRef } = AccepteerSchema.parse(req.body)
    const offId = req.params.offId

    const updated = await withProject(req.params.id, async (p, tx) => {
      const acceptedOfferte = p.offertes.find(o => o.id === offId)
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
        newOrders.push(orderVoorRegel(p, regel, regel.qty, await nextDocId(tx, 'PROD')))
      }

      // Auto-create opdrachtbevestiging from the accepted offerte's regels
      const ob: Opdrachtbevestiging = {
        id: await nextDocId(tx, 'OB'),
        projectId: p.id,
        offerteId: offId,
        regels: acceptedOfferte.regels,
        levertijdDatum: p.levertijdDatum,
        notities: '',
        // Wat in het accepteer-venster is ingevuld; anders de referentie van het
        // project (afgesproken 2026-09-28): vaak is dat al het inkoopnummer.
        opdrachtRef: opdrachtRef?.trim() || p.klantRef?.trim() || null,
        status: 'concept',
        verzondenOp: null,
        verzendingen: [],
        wijzigingen: [],
        createdAt: now(),
        updatedAt: now(),
      }

      return {
        ...p,
        status: 'bevestigd',
        updatedAt: now(),
        opdrachtbevestiging: ob,
        offertes: p.offertes.map(o => {
          if (o.id === offId) {
            return {
              ...o,
              status: 'geaccepteerd' as OfferteStatus,
              geaccepteerdOp: now(),
              // Een directe opdracht is nooit als offerte verstuurd; zijn
              // referentie is die van de opdracht.
              externeRef: o.externeRef ?? (o.direct ? opdrachtRef?.trim() || null : null),
              updatedAt: now(),
            }
          }
          if (o.status !== 'geaccepteerd' && o.status !== 'vervallen') {
            return { ...o, status: 'vervallen' as OfferteStatus, vervallenDoor: 'acceptatie' as const, updatedAt: now() }
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

// Wat er op de opdrachtbevestiging aan te passen is. De levertijd is die van
// het project (één datum, besloten 2026-09-28): wie hem hier wijzigt, wijzigt
// hem voor de kop van de pagina, de planning en de pdf tegelijk.
const UpdateObSchema = z.object({
  notities: z.string().max(2000).optional(),
  opdrachtRef: z.string().max(200).nullable().optional(),
  levertijdDatum: z.string().nullable().optional(),
})

const GEEN_OB = 'Er is nog geen opdrachtbevestiging. Die ontstaat bij het accepteren van een offerte.'

router.patch(
  '/:id/opdrachtbevestiging',
  asyncHandler(async (req, res) => {
    const patch = UpdateObSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      if (!p.opdrachtbevestiging) throw new AppError(404, 'NOT_FOUND', GEEN_OB)
      const ob = p.opdrachtbevestiging
      return {
        ...p,
        levertijdDatum: patch.levertijdDatum === undefined ? p.levertijdDatum : patch.levertijdDatum,
        updatedAt: now(),
        opdrachtbevestiging: {
          ...ob,
          notities: patch.notities ?? ob.notities,
          opdrachtRef: patch.opdrachtRef === undefined ? ob.opdrachtRef : patch.opdrachtRef?.trim() || null,
          updatedAt: now(),
        },
      }
    })
    res.json({ data: updated })
  }),
)

// Versturen gebeurt in Outlook; de app zet de mail klaar en vraagt daarna of
// hij echt verstuurd is. Pas dán komt deze aanroep — met wat de klant kreeg,
// zodat de kaart later kan zeggen wat er sindsdien veranderd is.
const VerzendObSchema = z.object({ naar: z.string().max(320).nullable().optional() })

router.post(
  '/:id/opdrachtbevestiging/verzend',
  asyncHandler(async (req, res) => {
    const { naar } = VerzendObSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      eis(waaromNietVersturenOB(p))
      const ob = p.opdrachtbevestiging!
      const nu = now()
      return {
        ...p,
        updatedAt: nu,
        opdrachtbevestiging: {
          ...ob,
          status: 'verzonden' as OBStatus,
          // De eerste datum blijft staan; elke volgende keer staat in het log.
          verzondenOp: ob.verzondenOp ?? nu,
          verzendingen: [
            ...(ob.verzendingen ?? []),
            { op: nu, door: req.user.name, naar: naar?.trim() || null, inhoud: obInhoud(p)! },
          ],
          updatedAt: nu,
        },
      }
    })
    res.json({ data: updated })
  }),
)

// ── Opdracht aanpassen ────────────────────────────────────────────────────────
// Na acceptatie blijft de opdracht aan te passen — ook als de productie al
// loopt (besloten 2026-09-28). De logica staat in `wijzigOpdracht` (shared); hier
// alleen wat de database nodig heeft: nummers voor nieuwe orders, todo's voor
// het materiaal, en het logboek.

const RegelErbijSchema = z.object({
  artikelId: z.string().nullable(),
  naam: z.string().min(1),
  omschrijving: z.string(),
  qty: z.number().positive(),
  eenheid: z.string(),
  verkoopprijs: z.number().nonnegative(),
  bewerkingen: z.array(z.string()),
})

const WijzigOpdrachtSchema = z.discriminatedUnion('soort', [
  z.object({ soort: z.literal('aantal'), regelId: z.string(), qty: z.number().positive() }),
  z.object({ soort: z.literal('prijs'), regelId: z.string(), verkoopprijs: z.number().nonnegative() }),
  z.object({ soort: z.literal('weg'), regelId: z.string() }),
  z.object({ soort: z.literal('erbij'), regels: z.array(RegelErbijSchema).min(1) }),
])

router.post(
  '/:id/opdracht/wijzig',
  asyncHandler(async (req, res) => {
    const w = WijzigOpdrachtSchema.parse(req.body)
    const updated = await withProject(req.params.id, async (p, tx) => {
      if (!p.opdrachtbevestiging) throw new AppError(409, 'VOORWAARDE', 'Er is nog geen opdracht om aan te passen.')
      if (w.soort !== 'erbij' && !p.opdrachtbevestiging.regels.some(r => r.id === w.regelId)) {
        throw new AppError(404, 'NOT_FOUND', 'Deze regel staat niet (meer) in de opdracht. Ververs de pagina.')
      }
      let teller = 0
      const { project: next, tekst } = wijzigOpdracht(p, w, {
        nu: now(),
        nieuwRegelId: () => `regel_${Date.now()}_${teller++}_${Math.random().toString(36).slice(2, 6)}`,
        nieuweOrder: (regel, qty) => orderVoorRegel(p, regel, qty, `NIEUW-${teller++}`),
      })

      // Pas nu nummers uitgeven: alleen voor orders die er echt komen.
      const orders: ProductieOrder[] = []
      for (const o of next.productieOrders) {
        orders.push(o.id.startsWith('NIEUW-') ? { ...o, id: await nextDocId(tx, 'PROD') } : o)
      }

      if (w.soort === 'erbij') {
        const oud = new Set(p.opdrachtbevestiging.regels.map(r => r.id))
        await todosBijOpdracht(tx, {
          projectId: p.id,
          projectNaam: p.naam,
          regels: next.opdrachtbevestiging!.regels.filter(r => !oud.has(r.id))
            .map(r => ({ id: r.id, artikelId: r.artikelId, naam: r.naam, qty: r.qty })),
          door: req.user.id,
        })
      }
      if (w.soort === 'weg') {
        // Materiaal kiezen voor een regel die er niet meer is, hoeft niet meer.
        // Reserveringen blijven staan: vrijgeven gaat alleen via Reserveringen.
        await tx.todo.deleteMany({
          where: { projectId: p.id, offerteRegelId: w.regelId, done: false, soort: 'materiaal_selecteren' },
        })
      }

      const ob = next.opdrachtbevestiging!
      return {
        ...next,
        productieOrders: orders,
        opdrachtbevestiging: {
          ...ob,
          wijzigingen: [...(ob.wijzigingen ?? []), { op: now(), door: req.user.name, tekst }],
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
        // Gestopt blijft gestopt; afvinken op een order in voorbereiding geeft hem vrij.
        return { ...o, stappen, status: orderStatusNaStappen(o, stappen), updatedAt: now() }
      })
      const basis = { ...p, productieOrders, status: p.status === 'bevestigd' ? 'productie' as const : p.status, updatedAt: now() }
      const next = { ...basis, status: statusNaLevering(basis) }
      // Was dit de laatste stap, dan is het materiaal verbruikt (2026-10-01).
      await boekAfBijGereed(tx, p, next, req.user.id)
      return next
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
        // Gestopt blijft gestopt; afvinken op een order in voorbereiding geeft hem vrij.
        return { ...o, stappen, status: orderStatusNaStappen(o, stappen), updatedAt: now() }
      })
      const next = { ...p, productieOrders, updatedAt: now() }
      // Een order die weer open gaat, haalt het project terug uit "Gereed voor levering".
      return { ...next, status: statusNaLevering(next) }
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
    const updated = await withProject(req.params.id, async (p, tx) => {
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
              status: (o.status === 'gestopt' ? 'gestopt' : gereed >= o.qty ? 'gereed' : 'in_productie') as ProductieOrder['status'],
              updatedAt: now(),
            }
          : o,
      )
      const basis = { ...p, productieOrders, status: p.status === 'bevestigd' ? 'productie' as const : p.status, updatedAt: now() }
      const next = { ...basis, status: statusNaLevering(basis) }
      await boekAfBijGereed(tx, p, next, req.user.id)
      return next
    })
    res.json({ data: updated })
  }),
)

const DeelsGereedSchema = z.object({
  /** Het totaal dat nu klaar is, niet wat erbij kwam. */
  aantal: z.number(),
})

/**
 * Deels gereed melden vanaf de terminal (besloten 2026-10-02): "10 van de 20
 * zijn klaar", zodat die 10 op een pakbon kunnen zonder dat kantoor iets
 * invult. Alleen omhoog en niet tot het volle aantal — zie
 * `waaromNietDeelsGereed`. De terminal mag deze ene route schrijven
 * (`middleware/terminal-scope.ts`).
 */
router.post(
  '/:id/orders/:orderId/deels-gereed',
  asyncHandler(async (req, res) => {
    const { aantal } = DeelsGereedSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const order = p.productieOrders.find(o => o.id === req.params.orderId)
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Deze productieorder bestaat niet (meer). Ververs de pagina.')
      const nee = waaromNietDeelsGereed(order, aantal)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const productieOrders = p.productieOrders.map(o =>
        o.id === order.id
          ? { ...o, aantalGereed: aantal, status: 'in_productie' as ProductieOrder['status'], updatedAt: now() }
          : o,
      )
      const basis = { ...p, productieOrders, status: p.status === 'bevestigd' ? 'productie' as const : p.status, updatedAt: now() }
      return { ...basis, status: statusNaLevering(basis) }
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
      // Zonder keuze: de regels die helemaal klaar zijn (voorstelPakbon). Een
      // concept mag leeg zijn; je vult hem op de Pakbonnen-tab (2026-10-02).
      const gevraagd = body.regels ?? voorstelPakbon(p)
      const nee = waaromNietPakbon(p, gevraagd, { leegMag: !body.regels })
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)

      const paklijst: Paklijst = {
        id: await nextDocId(tx, 'PL'),
        projectId: p.id,
        regels: pakbonRegels(p, gevraagd),
        notities: '',
        verzondenOp: null,
        createdAt: now(),
      }

      const next = { ...p, paklijsten: [...p.paklijsten, paklijst], updatedAt: now() }
      // Niet meer altijd "Paklijst": bij een deellevering is het project nog in productie.
      return { ...next, status: statusNaLevering(next) }
    })
    res.status(201).json({ data: updated })
  }),
)

const WijzigPaklijstSchema = z.object({
  regels: z.array(z.object({ offerteRegelId: z.string(), qty: z.number() })),
})

/**
 * Een concept-pakbon aanpassen op de Pakbonnen-tab: aantal per regel, regel
 * weg, regel erbij. De hele lijst in één keer, zodat er nooit een halve
 * wijziging blijft staan. Zijn eigen stuks tellen daarbij weer als klaar.
 */
router.patch(
  '/:id/paklijst/:paklijstId',
  asyncHandler(async (req, res) => {
    const { regels } = WijzigPaklijstSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const id = req.params.paklijstId
      const nee = waaromNietPakbonWijzigen(p, id) ?? waaromNietPakbon(p, regels, { pakbonId: id, leegMag: true })
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const paklijsten = p.paklijsten.map(x => (x.id === id ? { ...x, regels: pakbonRegels(p, regels) } : x))
      const next = { ...p, paklijsten, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    res.json({ data: updated })
  }),
)

/** Een concept-pakbon weggooien, ook als het niet de laatste is. */
router.delete(
  '/:id/paklijst/:paklijstId',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const id = req.params.paklijstId
      const nee = waaromNietPakbonWijzigen(p, id)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const next = { ...p, paklijsten: p.paklijsten.filter(x => x.id !== id), updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    res.json({ data: updated })
  }),
)

router.post(
  '/:id/paklijst/:paklijstId/verzend',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const pl = p.paklijsten.find(x => x.id === req.params.paklijstId)
      if (!pl) throw new AppError(404, 'NOT_FOUND', 'Deze paklijst bestaat niet (meer). Ververs de pagina.')
      const nee = waaromNietPakbonVersturen(p, pl.id)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const paklijsten = p.paklijsten.map(x =>
        x.id === pl.id ? { ...x, verzondenOp: now() } : x,
      )
      // Het project heet pas "Geleverd" als alles op een verstuurde pakbon staat.
      // Bij een deellevering ligt er nog werk, en dan zou die status liegen.
      const next = { ...p, paklijsten, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    res.json({ data: updated })
  }),
)

// ── Facturen (Facturen-tab, 2026-10-03) ─────────────────────────────────────────

// Factureren staat los van de pakbonnen: een nieuwe factuur neemt alles wat
// verstuurd en nog niet gefactureerd is, als concept. Aantal en prijs zijn aan
// te passen zolang hij concept is; een verstuurde factuur corrigeer je met een
// credit. Alle voorwaarden staan in packages/shared/calc/factuur.ts.
const FactuurRegelInvoer = z.object({
  offerteRegelId: z.string(),
  qty: z.number(),
  verkoopprijs: z.number(),
})

/** Naar wie de factuur gaat: factuuradres van de klant, contactpersoon, algemeen adres. */
async function standaardMailadres(tx: Prisma.TransactionClient, p: Project) {
  if (!p.relatieId) return { naar: null as string | null, termijn: null as number | null }
  const r = await tx.relatie.findUnique({ where: { id: p.relatieId } })
  const contacten = (r?.contacten ?? []) as { id: string; email?: string | null }[]
  return {
    naar: factuurMailadres(r, contacten.find(c => c.id === p.contactId)),
    termijn: r?.betalingstermijn ?? null,
  }
}

function nieuweFactuur(
  p: Project, id: string, soort: Factuur['soort'], regels: Factuur['regels'], naar: string | null, crediteert: Factuur | null,
): Factuur {
  return {
    id,
    soort,
    crediteertFactuurId: crediteert?.id ?? null,
    projectId: p.id,
    offerteId: crediteert?.offerteId ?? p.opdrachtbevestiging?.offerteId ?? p.offertes.find(o => o.status === 'geaccepteerd')?.id ?? '',
    regels,
    btwPct: BTW_PCT,
    ...factuurBedragen(regels, BTW_PCT),
    notities: '',
    vervaldatum: null,
    verzondenOp: null,
    naarEmail: naar,
    betaaldOp: null,
    createdAt: now(),
  }
}

const metStatus = (p: Project): Project => ({ ...p, status: statusNaLevering(p), updatedAt: now() })

router.post(
  '/:id/factuur',
  asyncHandler(async (req, res) => {
    const body = z.object({ regels: z.array(FactuurRegelInvoer).optional() }).parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const keuze = body.regels ?? voorstelFactuur(p)
      const nee = waaromNietFactuur(p, keuze)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const { naar } = await standaardMailadres(tx, p)
      const f = nieuweFactuur(p, await nextDocId(tx, 'FACT'), 'factuur', factuurRegels(p, keuze), naar, null)
      return metStatus({ ...p, facturen: [...p.facturen, f] })
    })
    res.status(201).json({ data: updated })
  }),
)

router.post(
  '/:id/credit',
  asyncHandler(async (req, res) => {
    const body = z.object({ factuurId: z.string(), regels: z.array(FactuurRegelInvoer).optional() }).parse(req.body)
    const updated = await withProject(req.params.id, async (p, tx) => {
      const keuze = body.regels ?? voorstelCredit(p, body.factuurId)
      const nee = waaromNietCredit(p, body.factuurId, keuze)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const bron = p.facturen.find(f => f.id === body.factuurId)!
      const regels = keuze.map(g => {
        const r = bron.regels.find(x => x.offerteRegelId === g.offerteRegelId)!
        return { ...r, qty: g.qty, verkoopprijs: g.verkoopprijs, totaal: Math.round(g.qty * g.verkoopprijs * 100) / 100 }
      })
      // Naar hetzelfde adres als de factuur die hij crediteert.
      const c = nieuweFactuur(p, await nextDocId(tx, 'CRED'), 'credit', regels, bron.naarEmail, bron)
      return metStatus({ ...p, facturen: [...p.facturen, c] })
    })
    res.status(201).json({ data: updated })
  }),
)

/** Een concept aanpassen: regels (aantal en prijs), mailadres, opmerking. */
router.patch(
  '/:id/factuur/:factuurId',
  asyncHandler(async (req, res) => {
    const body = z.object({
      regels: z.array(FactuurRegelInvoer).optional(),
      naarEmail: z.string().max(200).nullable().optional(),
      notities: z.string().max(2000).optional(),
    }).parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const id = req.params.factuurId
      const f = p.facturen.find(x => x.id === id)
      const nee = waaromNietFactuurWijzigen(p, id) ?? (body.regels
        ? f!.soort === 'credit'
          ? waaromNietCredit(p, f!.crediteertFactuurId ?? '', body.regels, { creditId: id, leegMag: true })
          : waaromNietFactuur(p, body.regels, { factuurId: id, leegMag: true })
        : null)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const facturen = p.facturen.map(x => {
        if (x.id !== id) return x
        const regels = body.regels
          ? x.soort === 'credit'
            ? body.regels.map(g => {
                const r = x.regels.find(y => y.offerteRegelId === g.offerteRegelId)
                  ?? p.facturen.find(b => b.id === x.crediteertFactuurId)!.regels.find(y => y.offerteRegelId === g.offerteRegelId)!
                return { ...r, qty: g.qty, verkoopprijs: g.verkoopprijs, totaal: Math.round(g.qty * g.verkoopprijs * 100) / 100 }
              })
            : factuurRegels(p, body.regels)
          : x.regels
        return {
          ...x,
          regels,
          ...factuurBedragen(regels, x.btwPct),
          naarEmail: body.naarEmail !== undefined ? (body.naarEmail?.trim() || null) : x.naarEmail,
          notities: body.notities ?? x.notities,
        }
      })
      return metStatus({ ...p, facturen })
    })
    res.json({ data: updated })
  }),
)

/** Een concept weggooien. Het nummer is dan weg; een concept is nog nergens heen gegaan. */
router.delete(
  '/:id/factuur/:factuurId',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      const nee = waaromNietFactuurWijzigen(p, req.params.factuurId)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      return metStatus({ ...p, facturen: p.facturen.filter(f => f.id !== req.params.factuurId) })
    })
    res.json({ data: updated })
  }),
)

/**
 * Vastleggen dat hij verstuurd is (de mail gaat via Outlook). Het adres komt
 * mee en blijft op de factuur staan; de vervaldatum rekent vanaf vandaag met
 * de betalingstermijn van de klant.
 */
router.post(
  '/:id/factuur/:factuurId/verzend',
  asyncHandler(async (req, res) => {
    const body = z.object({ naarEmail: z.string().max(200).nullable().optional() }).parse(req.body ?? {})
    const updated = await withProject(req.params.id, async (p, tx) => {
      const f = p.facturen.find(x => x.id === req.params.factuurId)
      const naar = body.naarEmail !== undefined ? body.naarEmail : (f?.naarEmail ?? null)
      const nee = waaromNietFactuurVersturen(p, req.params.factuurId, naar)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const { termijn } = await standaardMailadres(tx, p)
      const nu = new Date()
      const facturen = p.facturen.map(x => x.id === f!.id
        ? {
            ...x,
            verzondenOp: nu.toISOString(),
            naarEmail: naar,
            vervaldatum: x.soort === 'factuur' ? vervaldatumVanaf(nu, termijn) : null,
          }
        : x)
      return metStatus({ ...p, facturen })
    })
    res.json({ data: updated })
  }),
)

/** Betaald (of toch niet): alleen een verstuurde factuur. */
router.post(
  '/:id/factuur/:factuurId/betaald',
  asyncHandler(async (req, res) => {
    const { betaald } = z.object({ betaald: z.boolean() }).parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const nee = waaromNietBetaald(p, req.params.factuurId)
      if (nee) throw new AppError(409, 'VOORWAARDE', nee)
      const facturen = p.facturen.map(x =>
        x.id === req.params.factuurId ? { ...x, betaaldOp: betaald ? now() : null } : x)
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
    const updated = await withProject(req.params.id, async (p, tx) => {
      if (!['bevestigd', 'productie'].includes(p.status)) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug naar de offertefase: het project is niet bevestigd en niet in productie.')
      }
      // Blijft een weigering, ook na het principe van 2026-09-28: terugdraaien
      // gooit de productieorders weg, en daarmee de afgevinkte stappen en de
      // uren die erop geklokt zijn. Wat de klant wil veranderen kan in de
      // opdracht zelf — daar blijft het gemaakte werk staan.
      // Ook gereedgemelde stuks tellen: die kunnen er zijn zonder afgevinkte
      // stap (gereedmelden vanaf kantoor). Vóór 2026-09-28 keek dit alleen naar
      // stappen, en ging een order met 12 gemaakte stuks gewoon weg.
      const hasWork = p.productieOrders.some(o => o.aantalGereed > 0 || o.stappen.some(s => s.gereedOp))
      if (hasWork) {
        throw new AppError(409, 'VOORWAARDE', 'Kan niet terug naar de offertefase: er is al productie gereedgemeld '
          + '(stappen of stuks), en terugdraaien zou dat werk en de geklokte uren weggooien. Pas de opdracht zelf aan '
          + 'op de Opdracht-tab (aantal, prijs, regels erbij of eraf) — het gemaakte werk blijft dan staan.')
      }
      const acc = p.offertes.find(o => o.status === 'geaccepteerd')

      // Opruimen wat het accepteren maakte, buiten de opdracht zelf: de todo's
      // voor het materiaal en de prijshistorie. Anders wijzen die naar een
      // opdracht die er niet meer is, en telt de grafiek een verkoop die niet
      // doorging. Reserveringen blijven: vrijgeven gaat via Reserveringen.
      await tx.todo.deleteMany({ where: { projectId: p.id, soort: 'materiaal_selecteren', done: false } })
      if (acc) await tx.artikelPrijsSnapshot.deleteMany({ where: { offerteId: acc.id, bron: 'order' } })

      const offertes = p.offertes.map(o => {
        if (o.status === 'geaccepteerd') {
          return { ...o, status: (o.verzondenOp ? 'verzonden' : 'concept') as OfferteStatus, geaccepteerdOp: null, updatedAt: now() }
        }
        // Alleen wat door het accepteren verviel komt terug — niet wat iemand
        // bewust introk. Vóór 2026-09-28 zette dit élke vervallen versie terug
        // op concept, ook ingetrokken versies die al bij de klant lagen.
        if (o.status === 'vervallen' && o.vervallenDoor === 'acceptatie') {
          return {
            ...o,
            status: (o.verzondenOp ? 'verzonden' : 'concept') as OfferteStatus,
            vervallenDoor: null,
            updatedAt: now(),
          }
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

const OrderIdsSchema = z.object({
  orderIds: z.array(z.string()).min(1, 'Kies minstens één order'),
})

/** Orders in de hal zetten (calc/vrijgeven.ts). Waarschuwen doet het scherm. */
router.post(
  '/:id/orders/vrijgeven',
  asyncHandler(async (req, res) => {
    const { orderIds } = OrderIdsSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const reden = waaromNietVrijgeven(p, orderIds)
      if (reden) throw new AppError(409, 'VOORWAARDE', reden)
      return vrijgeven(p, orderIds, now())
    })
    res.json({ data: updated })
  }),
)

/** Vrijgegeven orders uit de hal halen, zolang er niet aan gewerkt is. */
router.post(
  '/:id/orders/terug-naar-voorbereiding',
  asyncHandler(async (req, res) => {
    const { orderIds } = OrderIdsSchema.parse(req.body ?? {})
    const updated = await withProject(req.params.id, (p) => {
      const reden = waaromNietTerugNaarVoorbereiding(p, orderIds)
      if (reden) throw new AppError(409, 'VOORWAARDE', reden)
      return terugNaarVoorbereiding(p, orderIds, now())
    })
    res.json({ data: updated })
  }),
)

// Productie → Bevestigd: alles wat vrij is terug naar voorbereiding.
// Eerder zette dit de orders op gepland en wiste het stilletjes de afgevinkte
// stappen; nu weigert het zodra er aan een order gewerkt is (2026-09-30).
router.post(
  '/:id/revert/productie',
  asyncHandler(async (req, res) => {
    const updated = await withProject(req.params.id, (p) => {
      if (p.status !== 'productie') throw new AppError(409, 'VOORWAARDE', 'Kan niet terug: het project is niet in productie.')
      const ids = p.productieOrders.filter(isVrijgegeven).map(o => o.id)
      const reden = waaromNietTerugNaarVoorbereiding(p, ids)
      if (reden) throw new AppError(409, 'VOORWAARDE', reden)
      return { ...terugNaarVoorbereiding(p, ids, now()), status: 'bevestigd' }
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
      const next = { ...p, paklijsten, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
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
      // Vanuit "Geleverd" terug in de leverfase; de regel bepaalt waar precies.
      const next = { ...p, paklijsten, status: 'paklijst' as const, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
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
      return metStatus({ ...p, facturen: p.facturen.filter(f => f.id !== laatste.id) })
    })
    res.json({ data: updated })
  }),
)

export default router
