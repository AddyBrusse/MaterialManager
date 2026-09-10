/**
 * De scoreset — features/62-mail-import-ai-ontwerp.md §5.
 *
 *   npm run score:mails -w apps/api                 (de mails met een verwacht.json)
 *   npm run score:mails -w apps/api -- lindhout     (alleen mappen die dit bevatten)
 *   npm run score:mails -w apps/api -- --voorstellen (ook de mails zonder antwoord)
 *
 * Zonder argumenten draaien alléén de mails die een `verwacht.json` hebben. De
 * voorraad eromheen — mails die er wel staan maar nog geen nagekeken antwoord
 * hebben — blijft buiten schot, want elke mail kost geld en ongeveer 40 seconden.
 * Wie er een fixture van wil maken vraagt daar expliciet om.
 *
 * Een nieuwe mail toevoegen: maak een map onder `__tests__/mails/` en zet de
 * mail erin. De naam van het .msg-bestand doet er niet toe — er moet er precies
 * één in de map staan. Draai daarna het script; zonder `verwacht.json` scoort
 * die mail niet maar schrijft hij een voorstel weg in `.score/` — nakijken, en
 * dan pas naast de mail zetten.
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

/**
 * Het .msg-bestand in een fixturemap.
 *
 * De naam doet er bewust niet toe: een mail komt uit Outlook met de naam van
 * zijn onderwerp, en die naam eerst moeten wijzigen is precies de wrijving die
 * het verbreden van de set tegenhoudt. Wél precies één per map — bij twee is
 * niet te zeggen welke het goede antwoord hoort te krijgen.
 */
function msgIn(map: string): string {
  const dir = path.join(MAILS_DIR, map)
  const msgs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.msg'))
  if (msgs.length === 1) return path.join(dir, msgs[0]!)
  throw new Error(
    msgs.length === 0
      ? `Geen .msg-bestand in ${dir}`
      : `${msgs.length} .msg-bestanden in ${dir} — zet er één per map.`
  )
}

/** Mapnaam als bestandsnaam: spaties en rare tekens zijn niet overal veilig. */
function bestandsnaam(map: string): string {
  return map.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'mail'
}
/** Buiten de repo-inhoud (gitignored): wat het model werkelijk terugstuurde. */
const UITVOER_DIR = path.join(__dirname, '..', '..', '.score')

async function scoreMail(map: string): Promise<Telling> {
  const t = new Telling()
  const verwacht = JSON.parse(
    fs.readFileSync(path.join(MAILS_DIR, map, 'verwacht.json'), 'utf8')
  ) as Verwacht

  const begin = Date.now()
  const voorbereid = await bereidVoor(fs.readFileSync(msgIn(map)))
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
    path.join(UITVOER_DIR, `${bestandsnaam(map)}.json`),
    JSON.stringify({ uitkomst, regels: lines }, null, 2),
    'utf8'
  )

  const pct = t.totaal ? Math.round((t.goed / t.totaal) * 100) : 0
  console.log(`  ${t.goed}/${t.totaal} (${pct}%)`)
  for (const m of t.missers) console.log(`    ✘ ${m}`)
  return t
}

/**
 * Een mail zonder `verwacht.json`: lees hem en schrijf een **voorstel**.
 *
 * Het antwoord met de hand uittikken is het enige echte werk aan een nieuwe
 * fixture, en dat mag niet de rem zijn op het verbreden van de set — daar hangt
 * alles aan.
 *
 * LET OP, en dit is geen formaliteit: dit voorstel is wat het model ervan
 * máákte, niet wat er staat. Klakkeloos overnemen bakt de fout van vandaag in
 * als het goede antwoord van morgen, en dan meet de set voor altijd niets meer.
 * Daarom komt het bestand in `.score/` terecht en niet naast de mail: het moet
 * langs mensenogen voor het meetelt.
 */
async function stelVoor(map: string): Promise<void> {
  const voorbereid = await bereidVoor(fs.readFileSync(msgIn(map)))
  const { uitkomst, lines } = await leesMail(voorbereid)

  const voorstel = {
    _toelichting: 'VOORSTEL — nagekeken? Zet dit bestand dan in de mailmap als verwacht.json.',
    intent: uitkomst.intent,
    document: uitkomst.document,
    klantRef: uitkomst.klantRef,
    leverdatum: uitkomst.leverdatum,
    regels: lines.map((l) => ({
      tekening: l.tekening,
      qty: l.qty,
      prijs: l.klantPrijs,
      materiaal: l.materiaal,
      materiaalDoorKlant: l.materiaalDoorKlant,
      certificaat: l.certificaat,
      bestanden: l.bestanden,
    })),
  }

  fs.mkdirSync(UITVOER_DIR, { recursive: true })
  const uit = path.join(UITVOER_DIR, `${bestandsnaam(map)}.verwacht-voorstel.json`)
  fs.writeFileSync(uit, JSON.stringify(voorstel, null, 2), 'utf8')

  console.log(`\n${map}  — nog geen verwacht.json`)
  console.log(`  ${lines.length} regel(s) gelezen; voorstel weggeschreven naar`)
  console.log(`  ${uit}`)
  console.log('  Kijk het na, haal weg waar je niets van vindt, en zet het dan')
  console.log('  in de mailmap als verwacht.json. Niet ongezien overnemen: dan')
  console.log('  wordt de fout van vandaag het goede antwoord van morgen.')
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
  const args = process.argv.slice(2)
  const metVoorstellen = args.includes('--voorstellen')
  const filter = args.find((a) => !a.startsWith('--')) ?? ''

  const alle = fs
    .readdirSync(MAILS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.toLowerCase().includes(filter.toLowerCase()))
    .map((d) => d.name)
    .sort()

  const heeftAntwoord = (map: string) => fs.existsSync(path.join(MAILS_DIR, map, 'verwacht.json'))

  // Zonder filter en zonder --voorstellen: alleen wat een nagekeken antwoord
  // heeft. Een gewone draai hoort de goedkope te zijn; noemt iemand een mail bij
  // naam, dan wil hij die mail, met of zonder antwoord.
  const mappen = filter || metVoorstellen ? alle : alle.filter(heeftAntwoord)
  const overgeslagen = alle.length - mappen.length

  if (!mappen.length) {
    console.error(
      filter
        ? `Geen mails in ${MAILS_DIR} die "${filter}" bevatten.`
        : `Geen enkele mail in ${MAILS_DIR} heeft een verwacht.json.\n` +
            'Draai met --voorstellen om er voorstellen voor te laten maken.'
    )
    process.exit(1)
  }

  console.log(
    `model ${config.ai.model}, effort ${config.ai.effort}, ` +
      `controlelezing ${config.ai.controle ? 'aan' : 'uit'}, ` +
      `handelsdocument ${config.ai.documentNative ? 'als volledige pdf' : 'alleen als tekst'}`
  )

  let goed = 0
  let totaal = 0
  let gescoord = 0
  for (const map of mappen) {
    if (!fs.existsSync(path.join(MAILS_DIR, map, 'verwacht.json'))) {
      await stelVoor(map)
      continue
    }
    const t = await scoreMail(map)
    goed += t.goed
    totaal += t.totaal
    gescoord++
  }

  if (!gescoord) return
  const pct = totaal ? Math.round((goed / totaal) * 100) : 0
  console.log(`\n──────────\nTotaal ${goed}/${totaal} (${pct}%) over ${gescoord} mail(s)`)
  if (overgeslagen > 0) {
    console.log(`${overgeslagen} mail(s) overgeslagen: nog geen verwacht.json. Draai met --voorstellen.`)
  }
  console.log(`Wat het model teruggaf staat in ${UITVOER_DIR}\n`)
}

void main()
