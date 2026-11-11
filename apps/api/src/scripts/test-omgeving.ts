// Controleren dat `.env.test` naar een testdatabase wijst (2026-11-03).
//
// Draait vóór `prisma migrate deploy` op de test (`npm run test-omgeving:bijwerken`):
// zonder deze stap zou een verkeerd geplakte DATABASE_URL de migraties van een
// nieuwere testversie op de echte database zetten. Leest de database zelf, niet
// de tekst van de URL: de naam die Postgres teruggeeft is de enige die telt.
import { prisma } from '../db/client'
import { bepaalOmgeving, OmgevingFout } from '../services/omgeving'

async function main() {
  try {
    const o = await bepaalOmgeving('test')
    const kopie = o.kopieVan ? ` Kopie van de echte gegevens: ${o.kopieVan}.` : ''
    console.log(`In orde: dit is een testdatabase (naam eindigt op _test).${kopie}`)
  } catch (e) {
    if (e instanceof OmgevingFout) console.error(e.message)
    else console.error(`De testdatabase is niet te bereiken: ${e instanceof Error ? e.message.trim().split('\n').pop() : String(e)}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

void main()
