/**
 * Wat beweren onze fixtures eigenlijk? — zonder API-aanroep.
 *
 *   npm run mails:antwoorden -w apps/api
 *   npm run mails:antwoorden -w apps/api -- lindhout
 *   npm run mails:antwoorden -w apps/api -- lindhout --bron
 *
 * Een `verwacht.json` is het goede antwoord waar alles aan afgemeten wordt. Staat
 * daar iets fout in, dan meet de scoreset de verkeerde kant op en merkt niemand
 * het — een groene set is dan juist het probleem.
 *
 * Nakijken moet dus makkelijk zijn, en zes JSON-bestanden in zes mappen opengaan
 * is dat niet. Dit drukt ze af als leesbare regels, zodat iemand die de klanten
 * kent er in een minuut doorheen loopt en zegt wat er niet klopt.
 *
 * Met `--bron` komt de mail er zelf bij te staan: onderwerp, afzender, de tekst
 * van het bericht, de bijlagen en de tekst van het handelsdocument. Zonder dat
 * is het antwoord niet te beoordelen — "qty=2" zegt niets als je niet ziet waar
 * die 2 vandaan zou moeten komen. Bedoeld om per mail te gebruiken.
 */
import fs from 'fs'
import path from 'path'
import { classifyAttachment, leidendDocument } from '../services/attachment-kind'
import { bereidVoor } from '../services/mail-lezen'
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

/** De mail zelf, zodat het antwoord ernaast te leggen is. */
async function toonBron(map: string): Promise<void> {
  const dir = path.join(MAILS_DIR, map)
  const msg = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.msg'))
  if (!msg) return

  const { mail } = await bereidVoor(fs.readFileSync(path.join(dir, msg)))
  const doc = leidendDocument(mail.attachments)

  console.log(`\n   ${'-'.repeat(94)}\n   WAT ER IN DE MAIL STAAT`)
  console.log(`   onderwerp: ${mail.subject}`)
  console.log(`   van      : ${mail.from?.naam ?? ''} <${mail.from?.email ?? ''}>`)
  console.log(`   ontvangen: ${mail.receivedAt ?? 'onbekend'}`)

  console.log('\n   --- bericht ---')
  for (const regel of (mail.bodyText ?? '').split('\n').slice(0, 40)) console.log(`   ${regel}`)

  console.log('\n   --- bijlagen ---')
  for (const a of mail.attachments) {
    if (a.isEmbeddedMessage) continue
    console.log(`   ${a.filename}  [${classifyAttachment(a.filename)}${a.tekst ? '' : ', geen tekstlaag'}]`)
  }

  if (doc?.tekst) {
    console.log(`\n   --- tekst uit ${doc.filename} ---`)
    console.log('   (let op: dit is de UITGEKLOPTE tekst, waar kolommen aan elkaar plakken.')
    console.log('    het model krijgt de pdf zelf te zien, niet dit)')
    for (const regel of doc.tekst.split('\n').slice(0, 60)) console.log(`   ${regel}`)
  }
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

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const metBron = args.includes('--bron')
  const filter = (args.find((a) => !a.startsWith('--')) ?? '').toLowerCase()

  const mappen = fs
    .readdirSync(MAILS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.toLowerCase().includes(filter))
    .map((d) => d.name)
    .sort()

  const metAntwoord = mappen.filter((m) => fs.existsSync(path.join(MAILS_DIR, m, 'verwacht.json')))
  for (const map of metAntwoord) {
    toon(map)
    if (metBron) await toonBron(map)
  }

  console.log(`\n${'='.repeat(100)}\n${metAntwoord.length} van de ${mappen.length} mail(s) heeft een antwoord.`)
  if (!metBron) console.log('Zet --bron erachter om de mail zelf erbij te zien; dat leest per mail het prettigst.')
  console.log('Klopt er iets niet? Zeg welke mail en welke regel — dan is dat een correctie op de meetlat zelf.\n')
}

void main()
