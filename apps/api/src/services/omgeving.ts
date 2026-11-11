import { prisma } from '../db/client'
import { kopieTijdUit, omgevingVan, waaromNietStarten, type OmgevingInfo } from '@stockmanager/shared'

/**
 * Test of echt, zoals de database het zegt (2026-11-03, zie calc/omgeving.ts).
 *
 * De test-app (`OMGEVING=test`) wacht hierop vóór hij gaat luisteren en stopt
 * als de database geen testdatabase is. De echte app luistert meteen; is de
 * database bij het starten nog niet bereikbaar, dan vraagt `omgevingVoorScherm`
 * het later opnieuw. Zo verandert er voor de echte app niets aan het opstarten.
 */

export class OmgevingFout extends Error {}

let bekend: OmgevingInfo | null = null

interface DatabaseRij { naam: string; commentaar: string | null }

async function leesDatabase(): Promise<DatabaseRij> {
  const rijen = await prisma.$queryRaw<DatabaseRij[]>`
    SELECT current_database() AS naam, shobj_description(d.oid, 'pg_database') AS commentaar
    FROM pg_database d WHERE d.datname = current_database()`
  return rijen[0] ?? { naam: '', commentaar: null }
}

/** Gooit `OmgevingFout` als de test-app op een echte database staat. */
export async function bepaalOmgeving(omgevingVar = process.env.OMGEVING): Promise<OmgevingInfo> {
  const db = await leesDatabase()
  const reden = waaromNietStarten(omgevingVar, db.naam)
  if (reden) throw new OmgevingFout(reden)
  bekend = { omgeving: omgevingVan(db.naam), kopieVan: kopieTijdUit(db.commentaar) }
  return bekend
}

/** Voor het scherm: wat bekend is, en anders nu nog eens vragen. */
export async function omgevingVoorScherm(): Promise<OmgevingInfo> {
  if (bekend) return bekend
  // De test-app kan hier niet komen zonder dat `bekend` gezet is: die luistert
  // pas na een geslaagde `bepaalOmgeving`. Dit is dus de echte app.
  return bepaalOmgeving(undefined)
}
