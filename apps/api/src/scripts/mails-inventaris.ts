/**
 * Wat zit er in de mails van de scoreset? — zonder één API-aanroep.
 *
 *   npm run mails:inventaris -w apps/api
 *
 * Het lezen door het model kost geld en ongeveer 40 seconden per mail. De vraag
 * "welke van deze mails is structureel iets nieuws?" is daarvóór te
 * beantwoorden, gratis, uit de mail zelf: wie is de afzender, is er een leidend
 * document, heeft dat een tekstlaag, zitten er tekeningen bij, en zat het in een
 * zip. Dat bepaalt langs welk pad een mail loopt — en daarmee of hij iets meet
 * wat nog niemand meet.
 *
 * Kolom "doc": het leidende document en of `pdfText` er iets uit haalt.
 *   pdf+tekst  → gaat native mee én had een tekstlaag (de kolomsoep-vorm)
 *   pdf-scan   → gaat native mee, geen tekstlaag
 *   geen       → geen handelsdocument; regels moeten uit de mailtekst komen
 */
import fs from 'fs'
import path from 'path'
import { classifyAttachment, leidendDocument } from '../services/attachment-kind'
import { bereidVoor } from '../services/mail-lezen'

const MAILS_DIR = path.join(__dirname, '..', 'services', '__tests__', 'mails')

function msgIn(dir: string): string | null {
  const msgs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.msg'))
  return msgs.length === 1 ? path.join(dir, msgs[0]!) : null
}

function afkorten(s: string, n: number): string {
  return s.length <= n ? s.padEnd(n) : `${s.slice(0, n - 1)}…`
}

async function main(): Promise<void> {
  const mappen = fs
    .readdirSync(MAILS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const rijen: { map: string; afzender: string; doc: string; tek: number; zip: string; fixture: string }[] = []

  for (const map of mappen) {
    const dir = path.join(MAILS_DIR, map)
    const msg = msgIn(dir)
    if (!msg) {
      rijen.push({ map, afzender: '(geen of meerdere .msg)', doc: '?', tek: 0, zip: '', fixture: '' })
      continue
    }
    const { mail } = await bereidVoor(fs.readFileSync(msg))
    const doc = leidendDocument(mail.attachments)
    const tekeningen = mail.attachments.filter((a) => classifyAttachment(a.filename) === 'tekening')
    rijen.push({
      map,
      afzender: mail.from?.email ?? mail.from?.naam ?? '?',
      doc: doc ? (doc.tekst ? 'pdf+tekst' : 'pdf-scan') : 'geen',
      tek: tekeningen.length,
      zip: mail.attachments.some((a) => /\.zip$/i.test(a.filename)) ? 'zip' : '',
      fixture: fs.existsSync(path.join(dir, 'verwacht.json')) ? 'ja' : '',
    })
  }

  console.log(`${afkorten('map', 52)} ${afkorten('afzender', 32)} ${afkorten('doc', 10)} tek  zip  fixture`)
  console.log('-'.repeat(115))
  for (const r of rijen) {
    console.log(
      `${afkorten(r.map, 52)} ${afkorten(r.afzender, 32)} ${afkorten(r.doc, 10)} ${String(r.tek).padStart(3)}  ${r.zip.padEnd(4)} ${r.fixture}`
    )
  }

  // Waar de set nu blind is: één klant of één vorm oververtegenwoordigd.
  const perDomein = new Map<string, number>()
  for (const r of rijen) {
    const d = r.afzender.includes('@') ? r.afzender.split('@')[1]! : r.afzender
    perDomein.set(d, (perDomein.get(d) ?? 0) + 1)
  }
  console.log(`\n${rijen.length} mail(s), ${perDomein.size} afzenderdomein(en):`)
  for (const [d, n] of [...perDomein].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${d}`)

  const perDoc = new Map<string, number>()
  for (const r of rijen) perDoc.set(r.doc, (perDoc.get(r.doc) ?? 0) + 1)
  console.log('\nnaar documentvorm:')
  for (const [d, n] of [...perDoc].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${d}`)
}

void main()
