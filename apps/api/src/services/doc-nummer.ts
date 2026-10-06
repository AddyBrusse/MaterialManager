import type { Prisma } from '@prisma/client'
import {
  gatInFactuurnummers, waaromNietNummerZetten,
  type DocPrefix, type DocReeksStand, type DocReeksWijziging, type NummerWijzig,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

type Db = typeof prisma | Prisma.TransactionClient

export type { DocPrefix }

/** In de volgorde en met de namen van het overzicht in Instellingen → Nummering. */
export const DOC_SOORTEN: { prefix: DocPrefix; naam: string }[] = [
  { prefix: 'PRJ', naam: 'Project' },
  { prefix: 'OFF', naam: 'Offerte' },
  { prefix: 'OB', naam: 'Opdrachtbevestiging' },
  { prefix: 'PROD', naam: 'Productieorder' },
  { prefix: 'PL', naam: 'Pakbon' },
  { prefix: 'FACT', naam: 'Factuur' },
  { prefix: 'CRED', naam: 'Creditfactuur' },
  { prefix: 'PA', naam: 'Prijsaanvraag' },
]

/**
 * De sleutel in `doc_sequences`: één teller per soort per jaar (2026-10-05).
 * Daarvoor was het één teller per soort, en dan werd de eerste offerte van
 * 2027 `OFF-2027-042`. Met het jaar in de sleutel begint elke reeks op
 * 1 januari vanzelf bij 001 — er hoeft niemand iets te resetten.
 */
export const reeksSleutel = (prefix: DocPrefix, jaar: number) => `${prefix}-${jaar}`

export const docNummer = (prefix: DocPrefix, jaar: number, n: number) =>
  `${prefix}-${jaar}-${String(n).padStart(3, '0')}`

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
    case 'PA':   return !!(await db.prijsaanvraag.findUnique(waar))
  }
}

// De teller in doc_sequences is leidend, maar hij kan achterlopen op wat er in de
// tabellen staat — na een teruggezette backup, of als er ooit handmatig een rij
// bij is gezet. Dan zou het nummer botsen met een bestaand document. Daarom
// doortellen tot er een vrij nummer ligt, met een bovengrens zodat een kapotte
// teller niet in een oneindige lus eindigt.
export async function nextDocId(db: Db, prefix: DocPrefix, nu = new Date()): Promise<string> {
  const jaar = nu.getFullYear()
  const sleutel = reeksSleutel(prefix, jaar)
  for (let poging = 0; poging < 50; poging++) {
    const result = await db.$queryRaw<{ last_n: number }[]>`
      INSERT INTO doc_sequences (prefix, last_n) VALUES (${sleutel}, 1)
      ON CONFLICT (prefix) DO UPDATE SET last_n = doc_sequences.last_n + 1
      RETURNING last_n
    `
    const id = docNummer(prefix, jaar, result[0].last_n)
    if (!(await docIdBezet(db, prefix, id))) return id
  }
  throw new AppError(
    500, 'INTERNAL',
    `Geen vrij ${prefix}-nummer gevonden; controleer de teller ${sleutel} in doc_sequences`,
  )
}

/**
 * Het hoogste volgnummer dat er dit jaar echt is, in de tabel van die soort.
 * Kan hoger zijn dan de teller (na een teruggezette backup) — en dan is dít de
 * ondergrens voor het volgende nummer, niet de teller.
 */
async function hoogsteBestaand(db: Db, prefix: DocPrefix, jaar: number): Promise<number> {
  const waar = { where: { id: { startsWith: `${prefix}-${jaar}-` } }, select: { id: true } }
  let ids: { id: string }[]
  switch (prefix) {
    case 'PRJ':  ids = await db.project.findMany(waar); break
    case 'OFF':  ids = await db.offerte.findMany(waar); break
    case 'OB':   ids = await db.opdrachtbevestiging.findMany(waar); break
    case 'PROD': ids = await db.productieOrder.findMany(waar); break
    case 'PL':   ids = await db.paklijst.findMany(waar); break
    case 'FACT':
    case 'CRED': ids = await db.factuur.findMany(waar); break
    case 'PA':   ids = await db.prijsaanvraag.findMany(waar); break
  }
  return ids.reduce((max, { id }) => {
    const n = Number(id.slice(`${prefix}-${jaar}-`.length))
    return Number.isInteger(n) && n > max ? n : max
  }, 0)
}

/** De stand per soort voor dit jaar (Instellingen → Nummering). */
export async function standVanReeksen(nu = new Date()): Promise<DocReeksStand[]> {
  const jaar = nu.getFullYear()
  const rijen = await prisma.docSequence.findMany({
    where: { prefix: { in: DOC_SOORTEN.map((s) => reeksSleutel(s.prefix, jaar)) } },
  })
  return Promise.all(DOC_SOORTEN.map(async (s) => {
    const laatste = rijen.find((r) => r.prefix === reeksSleutel(s.prefix, jaar))?.lastN ?? 0
    const hoogste = await hoogsteBestaand(prisma, s.prefix, jaar)
    // De server slaat bezette nummers over, dus "volgende" is wat er na de
    // teller én na het hoogste bestaande nummer komt.
    const volgendeN = Math.max(laatste, hoogste) + 1
    return {
      prefix: s.prefix,
      naam: s.naam,
      jaar,
      laatste: laatste > 0 ? docNummer(s.prefix, jaar, laatste) : null,
      volgende: docNummer(s.prefix, jaar, volgendeN),
      volgendeN,
      hoogsteBestaand: hoogste,
    }
  }))
}

/**
 * Het volgende nummer met de hand zetten (2026-10-05) — voor als er intern iets
 * misging. Zelfde regels als het scherm (`waaromNietNummerZetten`); een gat in
 * de factuurnummers alleen met `gatAkkoord`. Altijd met een regel in het logboek.
 */
export async function zetVolgendNummer(
  prefix: DocPrefix, body: NummerWijzig, door: string, nu = new Date(),
): Promise<DocReeksStand> {
  const jaar = nu.getFullYear()
  const sleutel = reeksSleutel(prefix, jaar)
  await prisma.$transaction(async (tx) => {
    // Vastzetten, zodat er tijdens het wijzigen geen nummer tussendoor uitgaat.
    await tx.$executeRaw`INSERT INTO doc_sequences (prefix, last_n) VALUES (${sleutel}, 0) ON CONFLICT (prefix) DO NOTHING`
    const [rij] = await tx.$queryRaw<{ last_n: number }[]>`SELECT last_n FROM doc_sequences WHERE prefix = ${sleutel} FOR UPDATE`
    const hoogste = await hoogsteBestaand(tx, prefix, jaar)
    const van = Math.max(rij.last_n, hoogste) + 1
    const stand = { prefix, jaar, hoogsteBestaand: hoogste, volgendeN: van }
    const reden = waaromNietNummerZetten(stand, body.volgende)
    if (reden) throw new AppError(409, 'VOORWAARDE', reden)
    const gat = gatInFactuurnummers(stand, body.volgende)
    if (gat && !body.gatAkkoord) throw new AppError(409, 'VOORWAARDE', `${gat} Bevestig dit eerst.`)
    if (van === body.volgende) return
    await tx.docSequence.update({ where: { prefix: sleutel }, data: { lastN: body.volgende - 1 } })
    await tx.docReeksWijziging.create({ data: { sleutel, van, naar: body.volgende, reden: body.reden, door } })
  })
  const stand = (await standVanReeksen(nu)).find((s) => s.prefix === prefix)
  return stand!
}

export async function reeksWijzigingen(): Promise<DocReeksWijziging[]> {
  const rijen = await prisma.docReeksWijziging.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return rijen.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}
