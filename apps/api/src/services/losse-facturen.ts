import type { Prisma } from '@prisma/client'
import {
  BTW_PCT, conceptFactuurId, factuurBedragen, factuurMailadres, factuurPrefix, heeftFactuurnummer, losseRegels,
  vervaldatumVanaf, voorstelLosseCredit, waaromNietBetaaldVan, waaromNietFactuurAanpassen,
  waaromNietFactuurWeg, waaromNietLos, waaromNietLosseCredit, waaromNietLosseRegels, waaromNietNummerIntrekken,
  waaromNietVersturenVan,
  type ArtikelVerkoopInfo, type LosseCreditInvoer, type LosseFactuurInvoer, type LosseFactuurWijzig,
  type LosseRegelInvoer, type VerkoopFactuur,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { geefNummerTerug, nextDocId } from './doc-nummer'
import { klaarVoorOrders, muteer } from './artikel-voorraad'

/**
 * Losse facturen en credits (2026-11-18): bij de klant, zonder project. De
 * regels staan in `packages/shared/calc/losse-factuur.ts`; nummeren, versturen
 * en betaald werken zoals bij een projectfactuur (`calc/factuur.ts`).
 *
 * De pagina Facturen toont ook de projectfacturen (`alleFacturen`), maar die
 * worden alleen op hun project gemaakt en aangepast.
 */

type Tx = Prisma.TransactionClient
type Db = typeof prisma | Tx

const include = {
  regels: { orderBy: { sortOrder: 'asc' } },
  project: { select: { naam: true, relatieId: true, contactId: true, klantRef: true } },
} as const satisfies Prisma.FactuurInclude
type Rij = Prisma.FactuurGetPayload<{ include: typeof include }>

const eis = (reden: string | null) => { if (reden) throw new AppError(409, 'VOORWAARDE', reden) }

function naarVerkoopFactuur(r: Rij, klanten: Map<string, string>): VerkoopFactuur {
  const relatieId = r.project?.relatieId ?? r.relatieId
  return {
    id: r.id,
    soort: r.soort as VerkoopFactuur['soort'],
    crediteertFactuurId: r.crediteertFactuurId,
    projectId: r.projectId,
    projectNaam: r.project?.naam ?? null,
    relatieId,
    klantNaam: relatieId ? klanten.get(relatieId) ?? null : null,
    contactId: r.project?.contactId ?? r.contactId,
    klantRef: r.project?.klantRef ?? r.klantRef,
    leverdatum: r.leverdatum,
    reden: r.reden,
    retour: r.retour,
    regels: r.regels.map((g) => ({
      offerteRegelId: g.offerteRegelId, artikelId: g.artikelId, naam: g.naam, qty: g.qty, eenheid: g.eenheid,
      verkoopprijs: g.verkoopprijs, totaal: g.totaal,
    })),
    btwPct: r.btwPct,
    subtotaal: r.subtotaal,
    btwBedrag: r.btwBedrag,
    totaalInclBtw: r.totaalInclBtw,
    notities: r.notities,
    vervaldatum: r.vervaldatum,
    verzondenOp: r.verzondenOp,
    naarEmail: r.naarEmail,
    betaaldOp: r.betaaldOp,
    createdAt: r.createdAt.toISOString(),
  }
}

async function klantNamen(db: Db, rijen: Rij[]): Promise<Map<string, string>> {
  const ids = [...new Set(rijen.map((r) => r.project?.relatieId ?? r.relatieId).filter((x): x is string => !!x))]
  if (ids.length === 0) return new Map()
  const rel = await db.relatie.findMany({ where: { id: { in: ids } }, select: { id: true, naam: true } })
  return new Map(rel.map((r) => [r.id, r.naam]))
}

async function lees(db: Db, where: Prisma.FactuurWhereInput): Promise<VerkoopFactuur[]> {
  const rijen = await db.factuur.findMany({ where, include, orderBy: { createdAt: 'desc' } })
  const klanten = await klantNamen(db, rijen)
  return rijen.map((r) => naarVerkoopFactuur(r, klanten))
}

/** Alle facturen en credits, nieuwste eerst: met en zonder project. */
export function alleFacturen(db: Db = prisma): Promise<VerkoopFactuur[]> {
  return lees(db, {})
}

/** Losse facturen waar nog iets mee moet: niet verstuurd, of verstuurd en niet betaald (opvolging). */
export function losseOpenFacturen(db: Db): Promise<VerkoopFactuur[]> {
  return lees(db, { projectId: null, OR: [{ verzondenOp: null }, { soort: 'factuur', betaaldOp: null }] })
}

/** De losse facturen van een klant: nodig om te weten wat er van een factuur nog te crediteren valt. */
function losseVanKlant(db: Db, relatieId: string): Promise<VerkoopFactuur[]> {
  return lees(db, { projectId: null, relatieId })
}

async function leesEen(db: Db, id: string): Promise<VerkoopFactuur> {
  const [f] = await lees(db, { id })
  if (!f) throw new AppError(404, 'NOT_FOUND', 'Deze factuur bestaat niet (meer). Ververs de pagina.')
  return f
}

/** Alleen een losse factuur, en vergrendeld tot het einde van de transactie. */
async function leesLos(tx: Tx, id: string): Promise<VerkoopFactuur> {
  await tx.$queryRaw`SELECT id FROM facturen WHERE id = ${id} FOR UPDATE`
  const f = await leesEen(tx, id)
  eis(waaromNietLos(f))
  return f
}

async function klant(db: Db, relatieId: string) {
  const r = await db.relatie.findUnique({ where: { id: relatieId } })
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Deze klant bestaat niet (meer). Ververs de pagina.')
  return r
}

const contactenVan = (r: { contacten: unknown }) => (r.contacten ?? []) as { id: string; email?: string | null }[]

async function schrijfRegels(tx: Tx, id: string, regels: ReturnType<typeof losseRegels>) {
  await tx.factuurRegel.deleteMany({ where: { factuurId: id } })
  if (regels.length === 0) return
  await tx.factuurRegel.createMany({
    data: regels.map((r, i) => ({
      id: `${id}:${i + 1}`, factuurId: id, sortOrder: i + 1, offerteRegelId: null, artikelId: r.artikelId,
      naam: r.naam, qty: r.qty, eenheid: r.eenheid, verkoopprijs: r.verkoopprijs, totaal: r.totaal,
    })),
  })
}

/** Zonder regels mag een concept bestaan: je vult hem daarna in de tabel. */
export async function maakLosseFactuur(invoer: LosseFactuurInvoer): Promise<VerkoopFactuur> {
  eis(waaromNietLosseRegels(invoer.regels, { leegMag: true }))
  return prisma.$transaction(async (tx) => {
    const r = await klant(tx, invoer.relatieId)
    const regels = losseRegels(invoer.regels)
    const id = conceptFactuurId('factuur')
    await tx.factuur.create({
      data: {
        id, soort: 'factuur', relatieId: r.id, contactId: invoer.contactId, klantRef: invoer.klantRef || null,
        leverdatum: invoer.leverdatum, notities: invoer.notities, btwPct: BTW_PCT, ...factuurBedragen(regels, BTW_PCT),
        naarEmail: invoer.naarEmail !== undefined
          ? invoer.naarEmail || null
          : factuurMailadres(r, contactenVan(r).find((c) => c.id === invoer.contactId)),
        createdAt: new Date(),
      },
    })
    await schrijfRegels(tx, id, regels)
    return leesEen(tx, id)
  })
}

export async function maakLosseCredit(invoer: LosseCreditInvoer): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const bron = invoer.factuurId ? await leesEen(tx, invoer.factuurId) : null
    const relatieId = bron?.relatieId ?? invoer.relatieId
    const facturen = relatieId ? await losseVanKlant(tx, relatieId) : []
    const keuze: LosseRegelInvoer[] = invoer.regels ?? (bron ? voorstelLosseCredit(facturen, bron.id) : [])
    // Een projectfactuur staat niet bij de losse; erbij zetten zodat de regel zegt waar hij wél kan.
    const lijst = bron && !facturen.some((f) => f.id === bron.id) ? [...facturen, bron] : facturen
    eis(waaromNietLosseCredit(lijst, {
      factuurId: invoer.factuurId, relatieId, reden: invoer.reden, regels: keuze,
    }, { leegMag: !bron }))
    const r = await klant(tx, relatieId!)
    const regels = losseRegels(keuze)
    const id = conceptFactuurId('credit')
    await tx.factuur.create({
      data: {
        id, soort: 'credit', crediteertFactuurId: bron?.id ?? null, relatieId: r.id,
        contactId: bron?.contactId ?? null, klantRef: bron?.klantRef ?? null, reden: invoer.reden || null,
        retour: invoer.retour, notities: '', btwPct: bron?.btwPct ?? BTW_PCT, ...factuurBedragen(regels, bron?.btwPct ?? BTW_PCT),
        naarEmail: bron?.naarEmail ?? factuurMailadres(r, null), createdAt: new Date(),
      },
    })
    await schrijfRegels(tx, id, regels)
    return leesEen(tx, id)
  })
}

/** Aanpassen zolang hij niet verstuurd is. De klant wisselen kan alleen zonder nummer. */
export async function wijzigLos(id: string, patch: LosseFactuurWijzig): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    eis(waaromNietFactuurAanpassen(f))
    if (patch.relatieId && patch.relatieId !== f.relatieId) {
      if (heeftFactuurnummer(f.id)) eis(`${f.id} heeft al een nummer; de klant ligt vast. Crediteer hem en maak een nieuwe.`)
      if (f.crediteertFactuurId) eis('Een credit op een factuur hoort bij de klant van die factuur.')
      await klant(tx, patch.relatieId)
    }
    let regels = f.regels
    if (patch.regels) {
      if (f.soort === 'credit') {
        const facturen = await losseVanKlant(tx, f.relatieId!)
        eis(waaromNietLosseCredit(facturen, {
          factuurId: f.crediteertFactuurId, relatieId: f.relatieId, reden: patch.reden ?? f.reden, regels: patch.regels,
        }, { creditId: f.id, leegMag: true }))
      } else {
        eis(waaromNietLosseRegels(patch.regels, { leegMag: true }))
      }
      regels = losseRegels(patch.regels)
      await schrijfRegels(tx, f.id, regels)
    }
    if (f.soort === 'credit' && !f.crediteertFactuurId && patch.reden !== undefined && (!patch.reden || patch.reden.trim().length < 3)) {
      eis('Zeg waarom je crediteert. Zonder factuur is dat de enige uitleg.')
    }
    await tx.factuur.update({
      where: { id: f.id },
      data: {
        ...(patch.relatieId !== undefined ? { relatieId: patch.relatieId } : {}),
        ...(patch.contactId !== undefined ? { contactId: patch.contactId } : {}),
        ...(patch.klantRef !== undefined ? { klantRef: patch.klantRef || null } : {}),
        ...(patch.leverdatum !== undefined ? { leverdatum: patch.leverdatum } : {}),
        ...(patch.notities !== undefined ? { notities: patch.notities } : {}),
        ...(patch.naarEmail !== undefined ? { naarEmail: patch.naarEmail?.trim() || null } : {}),
        ...(patch.reden !== undefined ? { reden: patch.reden?.trim() || null } : {}),
        ...(patch.retour !== undefined ? { retour: patch.retour } : {}),
        ...factuurBedragen(regels, f.btwPct),
      },
    })
    return leesEen(tx, f.id)
  })
}

export async function verwijderLos(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    eis(waaromNietFactuurWeg(f))
    await tx.factuur.delete({ where: { id: f.id } })
  })
}

/** Het volgende nummer, als hij er nog geen heeft. Een credit die ernaar wijst, wijst mee (ON UPDATE CASCADE). */
async function geefNummer(tx: Tx, f: VerkoopFactuur): Promise<string> {
  if (heeftFactuurnummer(f.id)) return f.id
  const id = await nextDocId(tx, factuurPrefix(f.soort))
  await tx.factuur.update({ where: { id: f.id }, data: { id } })
  return id
}

export async function nummerLos(id: string, naarEmail?: string | null): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    eis(waaromNietVersturenVan(f, naarEmail !== undefined ? naarEmail : f.naarEmail))
    return leesEen(tx, await geefNummer(tx, f))
  })
}

export async function nummerTerugLos(id: string): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    eis(waaromNietNummerIntrekken(f))
    if (await tx.factuur.count({ where: { crediteertFactuurId: f.id } })) {
      eis(`Er hangt een creditfactuur aan ${f.id}; het nummer blijft staan.`)
    }
    const nietLaatste = await geefNummerTerug(tx, f.id)
    if (nietLaatste) {
      eis(`${f.id} is niet het laatst uitgegeven nummer${nietLaatste.laatste ? ` (dat is ${nietLaatste.laatste})` : ''}. `
        + 'Intrekken zou een gat in de reeks geven. Verstuur hem, en crediteer hem zo nodig.')
    }
    const concept = conceptFactuurId(f.soort)
    await tx.factuur.update({ where: { id: f.id }, data: { id: concept } })
    return leesEen(tx, concept)
  })
}

/**
 * Vastleggen dat hij verstuurd is (de mail ging via Outlook). Een factuur haalt
 * zijn artikelen van de vrije voorraad; een credit met "retour" zet ze terug.
 * Alles in één transactie: verstuurd zonder afboeking kan niet bestaan.
 */
export async function verstuurLos(id: string, naarEmail: string | null | undefined, door: string): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    const naar = naarEmail !== undefined ? naarEmail : f.naarEmail
    eis(waaromNietVersturenVan(f, naar))
    const nummer = await geefNummer(tx, f)
    const r = f.relatieId ? await tx.relatie.findUnique({ where: { id: f.relatieId }, select: { betalingstermijn: true } }) : null
    const nu = new Date()
    await tx.factuur.update({
      where: { id: nummer },
      data: {
        verzondenOp: nu.toISOString(), naarEmail: naar?.trim() || null,
        vervaldatum: f.soort === 'factuur' ? vervaldatumVanaf(nu, r?.betalingstermijn) : null,
      },
    })
    const teken = f.soort === 'factuur' ? -1 : f.retour ? 1 : 0
    if (teken !== 0) {
      const artikelen = new Set((await tx.article.findMany({
        where: { id: { in: f.regels.map((g) => g.artikelId).filter((x): x is string => !!x) } }, select: { id: true },
      })).map((a) => a.id))
      for (const g of f.regels) {
        if (!g.artikelId || !artikelen.has(g.artikelId)) continue
        await muteer(tx, {
          artikelId: g.artikelId, aantal: teken * g.qty, soort: f.soort === 'factuur' ? 'factuur' : 'credit',
          factuurId: nummer, reden: f.soort === 'factuur' ? `Verstuurd met ${nummer}` : `Retour met ${nummer}`, door,
        })
      }
    }
    return leesEen(tx, nummer)
  })
}

export async function betaaldLos(id: string, betaald: boolean): Promise<VerkoopFactuur> {
  return prisma.$transaction(async (tx) => {
    const f = await leesLos(tx, id)
    eis(waaromNietBetaaldVan(f))
    await tx.factuur.update({ where: { id: f.id }, data: { betaaldOp: betaald ? new Date().toISOString() : null } })
    return leesEen(tx, f.id)
  })
}

/**
 * Per artikel van deze klant: vrije voorraad, wat er voor orders klaarligt en
 * wat de klant de laatste keer betaalde. De afspraken haalt het scherm apart
 * (`/prijsafspraken`), de calculatie rekent het zelf.
 */
export async function verkoopInfo(relatieId: string): Promise<ArtikelVerkoopInfo[]> {
  const artikelen = await prisma.article.findMany({ where: { relatieId }, select: { id: true, currentStock: true } })
  const ids = artikelen.map((a) => a.id)
  const [klaar, snapshots, losse] = await Promise.all([
    klaarVoorOrders(prisma, ids),
    prisma.artikelPrijsSnapshot.findMany({
      where: { artikelId: { in: ids }, bron: 'order', relatieId, verkoopprijsPerStuk: { not: null } },
      orderBy: { gemetenOp: 'desc' },
      select: { artikelId: true, verkoopprijsPerStuk: true, qty: true, gemetenOp: true },
    }),
    // Wat er op een verstuurde losse factuur stond: bij vaste klanten vaak de recentste prijs.
    prisma.factuurRegel.findMany({
      where: { artikelId: { in: ids }, factuur: { relatieId, projectId: null, soort: 'factuur', verzondenOp: { not: null } } },
      select: { artikelId: true, verkoopprijs: true, qty: true, factuur: { select: { verzondenOp: true } } },
    }),
  ])
  return artikelen.map((a) => {
    const s = snapshots.find((x) => x.artikelId === a.id)
    const l = losse.filter((x) => x.artikelId === a.id)
      .sort((x, y) => (y.factuur.verzondenOp ?? '').localeCompare(x.factuur.verzondenOp ?? ''))[0]
    const uitOrder = s ? { prijs: s.verkoopprijsPerStuk!, aantal: s.qty, datum: s.gemetenOp.toISOString() } : null
    const uitFactuur = l ? { prijs: l.verkoopprijs, aantal: l.qty, datum: l.factuur.verzondenOp! } : null
    return {
      artikelId: a.id,
      vrij: Number(a.currentStock),
      klaarVoorOrders: klaar.get(a.id) ?? 0,
      laatste: !uitOrder ? uitFactuur : !uitFactuur ? uitOrder : uitFactuur.datum > uitOrder.datum ? uitFactuur : uitOrder,
    }
  })
}
