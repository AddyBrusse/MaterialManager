/**
 * Wat beweren onze fixtures eigenlijk? — zonder API-aanroep.
 *
 *   npm run mails:antwoorden -w apps/api
 *   npm run mails:antwoorden -w apps/api -- lindhout
 *
 * Een `verwacht.json` is het goede antwoord waar alles aan afgemeten wordt. Staat
 * daar iets fout in, dan meet de scoreset de verkeerde kant op en merkt niemand
 * het — een groene set is dan juist het probleem.
 *
 * Nakijken moet dus makkelijk zijn, en zes JSON-bestanden in zes mappen opengaan
 * is dat niet. Dit drukt ze af als leesbare regels, zodat iemand die de klanten
 * kent er in een minuut doorheen loopt en zegt wat er niet klopt.
 */
import fs from 'fs'
import path from 'path'
import type { Verwacht, VerwachteRegel } from '../services/mail-score'

const MAILS_DIR = path.join(__dirname, '..', 'services', '__tests__', 'mails')

/** Alleen de velden die er echt staan; de scorer kijkt ook alleen daarnaar. */
function regelTekst(r: VerwachteRegel): string {
  const delen: string[] = []
  for (const [veld, waarde] of Object.entries(r)) {
    if (veld === 'tekening' || veld === 'bestanden') continue
    delen.push(`${veld}=${waarde === null ? 'null' : String(waarde)}`)
  }
  if (r.bestanden) {
    delen.push(r.bestanden.length ? `bestanden=${r.bestanden.join(' + ')}` : 'bestanden=GEEN (vastgelegd)')
  }
  return delen.join('   ')
}

function toon(map: string): void {
  const bestand = path.join(MAILS_DIR, map, 'verwacht.json')
  console.log(`\n${'='.repeat(100)}\n### ${map}`)
  if (!fs.existsSync(bestand)) {
    console.log('   (nog geen verwacht.json — deze mail doet niet mee aan de score)')
    return
  }
  const v = JSON.parse(fs.readFileSync(bestand, 'utf8')) as Verwacht & { _toelichting?: string }

  if (v._toelichting) {
    for (const zin of v._toelichting.split('\n')) console.log(`   ${zin}`)
  }
  const kop: string[] = []
  for (const veld of ['intent', 'document', 'klantRef', 'leverdatum'] as const) {
    if (veld in v) kop.push(`${veld}=${v[veld] === null ? 'null' : String(v[veld])}`)
  }
  if (kop.length) console.log(`\n   ${kop.join('   ')}`)

  const regels = v.regels ?? []
  console.log(`   ${regels.length} regel(s):`)
  regels.forEach((r, i) => {
    console.log(`   ${String(i + 1).padStart(2)}. ${r.tekening ?? '(geen tekeningnummer)'}`)
    const rest = regelTekst(r)
    if (rest) console.log(`       ${rest}`)
  })
}

const filter = (process.argv[2] ?? '').toLowerCase()
const mappen = fs
  .readdirSync(MAILS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.toLowerCase().includes(filter))
  .map((d) => d.name)
  .sort()

const metAntwoord = mappen.filter((m) => fs.existsSync(path.join(MAILS_DIR, m, 'verwacht.json')))
for (const map of metAntwoord) toon(map)

console.log(
  `\n${'='.repeat(100)}\n${metAntwoord.length} van de ${mappen.length} mail(s) heeft een antwoord.\n` +
    'Klopt er iets niet? Zeg welke mail en welke regel — dan is dat een correctie op de meetlat zelf.\n'
)
