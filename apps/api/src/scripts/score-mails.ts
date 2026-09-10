/**
 * De scoreset — features/62-mail-import-ai-ontwerp.md §5.
 *
 *   npm run score:mails -w apps/api            (alle mails)
 *   npm run score:mails -w apps/api -- veratio (alleen mappen die dit bevatten)
 *
 * Waarom dit bestaat: zolang leeskennis in code zit vangt een unittest een
 * regressie. Zodra die kennis in prompts en klantprofielen zit is dat weg — een
 * promptwijziging die klant A beter maakt kan klant B stilletjes slopen, en dat
 * merk je pas als er verkeerd geoffreerd is. Vanaf hier is "helpt deze
 * wijziging?" een meting.
 *
 * Dit is bewust géén vitest-test. Elke draai kost geld en een halve minuut per
 * mail; dat hoort niet aan `npm test` te hangen. Je draait hem als je iets aan
 * het leespad verandert, en je plakt de uitkomst in de PR.
 *
 * De vergelijking kijkt alleen naar velden die in `verwacht.json` staan. Dat is
 * de belangrijkste eigenschap van de set: komt er later een veld bij, dan
 * blijven alle bestaande fixtures geldig.
 */
import fs from 'fs'
import path from 'path'
import { config } from '../config'
import { bereidVoor, leesMail } from '../services/mail-lezen'
import { Telling, scoreRegels, type Verwacht } from '../services/mail-score'

const MAILS_DIR = path.join(__dirname, '..', 'services', '__tests__', 'mails')
/** Buiten de repo-inhoud (gitignored): wat het model werkelijk terugstuurde. */
const UITVOER_DIR = path.join(__dirname, '..', '..', '.score')

async function scoreMail(map: string): Promise<Telling> {
  const t = new Telling()
  const verwacht = JSON.parse(
    fs.readFileSync(path.join(MAILS_DIR, map, 'verwacht.json'), 'utf8')
  ) as Verwacht

  const begin = Date.now()
  const voorbereid = await bereidVoor(fs.readFileSync(path.join(MAILS_DIR, map, 'mail.msg')))
  const { uitkomst, lines } = await leesMail(voorbereid)
  const duur = ((Date.now() - begin) / 1000).toFixed(0)

  console.log(`\n${map}  (${duur}s, volledig meegestuurd: ${uitkomst.nativeBlokken.join(', ') || 'niets'})`)

  if ('intent' in verwacht) t.check('intent', verwacht.intent, uitkomst.intent)
  if ('document' in verwacht) t.check('document', verwacht.document, uitkomst.document)
  if ('klantRef' in verwacht) t.check('klantRef', verwacht.klantRef, uitkomst.klantRef)
  if ('leverdatum' in verwacht) t.check('leverdatum', verwacht.leverdatum, uitkomst.leverdatum)
  if (verwacht.regels) scoreRegels(t, verwacht.regels, lines)

  // Wegschrijven wat er werkelijk uit kwam. Een draai kost geld en een minuut;
  // een misser napluizen hoort daarna geen tweede draai te vragen.
  fs.mkdirSync(UITVOER_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(UITVOER_DIR, `${map}.json`),
    JSON.stringify({ uitkomst, regels: lines }, null, 2),
    'utf8'
  )

  const pct = t.totaal ? Math.round((t.goed / t.totaal) * 100) : 0
  console.log(`  ${t.goed}/${t.totaal} (${pct}%)`)
  for (const m of t.missers) console.log(`    ✘ ${m}`)
  return t
}

async function main(): Promise<void> {
  if (!config.ai.apiKey) {
    console.error(
      'Geen ANTHROPIC_API_KEY gevonden — de scoreset roept het echte model aan.\n' +
        'Zet hem in .env.development in de hoofdmap van het project.'
    )
    process.exit(1)
  }
  if (!config.ai.mailEnabled) {
    console.error('MAIL_AI staat op "uit"; dan levert elke mail nul regels op en zegt de score niets.')
    process.exit(1)
  }
  const filter = process.argv[2] ?? ''
  const mappen = fs
    .readdirSync(MAILS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.includes(filter))
    .map((d) => d.name)
    .sort()

  if (!mappen.length) {
    console.error(`Geen mails gevonden in ${MAILS_DIR}${filter ? ` die "${filter}" bevatten` : ''}.`)
    process.exit(1)
  }

  console.log(`model ${config.ai.model}, effort ${config.ai.effort}, controlelezing ${config.ai.controle ? 'aan' : 'uit'}`)

  let goed = 0
  let totaal = 0
  for (const map of mappen) {
    const t = await scoreMail(map)
    goed += t.goed
    totaal += t.totaal
  }

  const pct = totaal ? Math.round((goed / totaal) * 100) : 0
  console.log(`\n──────────\nTotaal ${goed}/${totaal} (${pct}%) over ${mappen.length} mail(s)`)
  console.log(`Wat het model teruggaf staat in ${UITVOER_DIR}\n`)
}

void main()
