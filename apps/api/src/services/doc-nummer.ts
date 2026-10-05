import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'

type Db = typeof prisma | Prisma.TransactionClient

export type DocPrefix = 'PRJ' | 'OFF' | 'PROD' | 'PL' | 'FACT' | 'CRED' | 'OB'

/** In de volgorde en met de namen van het overzicht in Instellingen → Nummering. */
export const DOC_SOORTEN: { prefix: DocPrefix; naam: string }[] = [
  { prefix: 'PRJ', naam: 'Project' },
  { prefix: 'OFF', naam: 'Offerte' },
  { prefix: 'OB', naam: 'Opdrachtbevestiging' },
  { prefix: 'PROD', naam: 'Productieorder' },
  { prefix: 'PL', naam: 'Pakbon' },
  { prefix: 'FACT', naam: 'Factuur' },
  { prefix: 'CRED', naam: 'Creditfactuur' },
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

/** De stand per soort voor dit jaar, om te lezen (Instellingen → Nummering). */
export async function standVanReeksen(nu = new Date()) {
  const jaar = nu.getFullYear()
  const rijen = await prisma.docSequence.findMany({
    where: { prefix: { in: DOC_SOORTEN.map((s) => reeksSleutel(s.prefix, jaar)) } },
  })
  return DOC_SOORTEN.map((s) => {
    const laatste = rijen.find((r) => r.prefix === reeksSleutel(s.prefix, jaar))?.lastN ?? 0
    return {
      prefix: s.prefix,
      naam: s.naam,
      jaar,
      laatste: laatste > 0 ? docNummer(s.prefix, jaar, laatste) : null,
      volgende: docNummer(s.prefix, jaar, laatste + 1),
    }
  })
}
