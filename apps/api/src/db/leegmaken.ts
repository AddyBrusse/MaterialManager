// De database leegmaken, de stamgegevens houden (afgesproken 2026-10-09).
//
// Er stonden te veel foute gegevens in om ze één voor één recht te zetten.
// De tabellen blijven bestaan (geen migratie opnieuw), alleen de inhoud gaat
// eruit. Wat blijft is wat je nodig hebt om opnieuw te beginnen:
//
//   gebruikers (+ voorkeuren), machines, kwaliteiten, profielen, afwerkingen,
//   locaties (+ vakken), bedrijfsinstellingen, relaties, en leveranciersprijzen
//   per kwaliteit (die per materiaal hangen aan een voorraadstuk en gaan mee).
//
// Alles daarbuiten gaat leeg, ook de nummerreeksen: het volgende project is
// weer PRJ-2026-001. Bestanden in UPLOADS_DIR blijven staan; die raakt dit niet.
//
//   npm run db:leeg -- --ja
//
// Zonder `--ja` toont hij alleen wat er zou gebeuren.
import { PrismaClient } from '@prisma/client'

export const BEHOUDEN = [
  'company', 'users', 'user_preferences', 'machines', 'grades', 'profiles', 'surface_finishes',
  'locations', 'location_slots', 'relaties',
] as const

/** Tabellen die leeg moeten: alles in het schema behalve `BEHOUDEN` en Prisma's eigen boekhouding. */
export function teLegen(alle: string[]): string[] {
  const houd = new Set<string>([...BEHOUDEN, '_prisma_migrations'])
  return alle.filter((t) => !houd.has(t)).sort()
}

async function main() {
  const doen = process.argv.includes('--ja')
  const prisma = new PrismaClient()
  try {
    const rijen = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`
    const leeg = teLegen(rijen.map((r) => r.tablename))
    console.log(`Blijft staan: ${BEHOUDEN.join(', ')} (+ leveranciersprijzen per kwaliteit)`)
    console.log(`Wordt leeg (${leeg.length}): ${leeg.join(', ')}`)
    if (!doen) {
      console.log('\nNiets gedaan. Draai opnieuw met --ja om het echt te doen.')
      return
    }
    await prisma.$transaction(async (tx) => {
      // Prijzen per kwaliteit bewaren: TRUNCATE ... CASCADE neemt de hele tabel
      // mee omdat hij ook naar voorraadstukken verwijst.
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE bewaar_prijzen ON COMMIT DROP AS
        SELECT * FROM leverancier_prijzen WHERE raw_material_id IS NULL`)
      await tx.$executeRawUnsafe(`TRUNCATE ${leeg.map((t) => `"${t}"`).join(', ')} CASCADE`)
      await tx.$executeRawUnsafe(`INSERT INTO leverancier_prijzen SELECT * FROM bewaar_prijzen`)
    })
    console.log('\nKlaar: de database is leeg, de stamgegevens staan er nog.')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Leegmaken mislukt — er is niets gewijzigd (alles gebeurt in één transactie).')
    console.error(e)
    process.exit(1)
  })
}
