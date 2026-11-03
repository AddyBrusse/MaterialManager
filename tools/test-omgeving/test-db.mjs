// De testdatabase voor de managers (2026-11-03), in Docker op de werk-pc.
//
//   npm run test-omgeving:db -- start             container maken of starten, .env.test invullen
//   npm run test-omgeving:db -- kopie             de echte gegevens kopiëren (de echte database wordt alleen gelezen)
//   npm run test-omgeving:db -- uploads <map>     tekeningen en foto's van de echte app kopiëren
//   npm run test-omgeving:db -- status            draait hij, wanneer gekopieerd, wat staat erin
//   npm run test-omgeving:db -- weggooien         container én gegevens weg
//
// Een eigen container naast de echte (`docker-db-1`): eigen naam, eigen opslag,
// poort 5433 en alleen bereikbaar op deze pc (127.0.0.1). De database heet
// `shopcommand_test`; de test-app start alleen tegen een naam op `_test`
// (packages/shared/src/calc/omgeving.ts).
//
// Wat dit script met de echte container doet: `docker inspect` en `pg_dump`.
// Allebei alleen lezen. Wissen gebeurt uitsluitend bij de container met het
// label hieronder. Zie tools/test-omgeving/LEESMIJ.md.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Dezelfde regels als packages/shared/src/calc/omgeving.ts (isTestDatabase,
// kopieTijdUit), hier overgeschreven zodat dit script ook werkt als de gedeelde
// code nog niet gebouwd is. Wie de regel daar verandert, verandert hem hier ook.
const isTestDatabase = (naam) => /_test$/i.test(String(naam).trim())
const kopieTijdUit = (c) => {
  const m = /^kopie:(\S+)$/.exec(String(c ?? '').trim())
  return m && !Number.isNaN(Date.parse(m[1])) ? m[1] : null
}

const NAAM = 'shopcommand-testdb'
const VOLUME = 'shopcommand-testdb-data'
const LABEL = 'nl.shopcommand.rol=testdatabase'
const DB = 'shopcommand_test'
const GEBRUIKER = 'shopcommand_test'
const POORT = Number(process.env.TEST_DB_POORT) || 5433
const BEELD = 'postgres:16'
const STANDAARD_BRON = 'docker-db-1'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_TEST = path.join(ROOT, '.env.test')
const ENV_VOORBEELD = path.join(ROOT, '.env.test.example')

class Stop extends Error {}
const stop = (tekst) => { throw new Stop(tekst) }

// ── Docker ──────────────────────────────────────────────────────────────────

function docker(args, { invoer, env } = {}) {
  const r = spawnSync('docker', args, {
    encoding: 'utf8', input: invoer, env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) {
    stop(`Docker is niet te starten (${r.error.message}). Draait Docker Desktop? Er is niets gewijzigd.`)
  }
  return { ok: r.status === 0, uit: (r.stdout ?? '').trim(), fout: (r.stderr ?? '').trim() }
}

function container(naam) {
  const r = docker(['inspect', naam])
  if (!r.ok) return null
  const c = JSON.parse(r.uit)[0]
  const env = Object.fromEntries((c.Config.Env ?? []).map((e) => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]))
  return { draait: c.State.Running === true, env, labels: c.Config.Labels ?? {} }
}

function isOnzeTestContainer(c) {
  const [k, v] = LABEL.split('=')
  return c?.labels?.[k] === v
}

/** Eén waarde uit de testdatabase; null als de vraag niet lukt (bv. tabel bestaat nog niet). */
function vraag(sql) {
  const r = docker(['exec', NAAM, 'psql', '-U', GEBRUIKER, '-d', DB, '-tAc', sql])
  return r.ok ? r.uit : null
}

async function wachtTotKlaar() {
  for (let i = 0; i < 60; i++) {
    // Via TCP: tijdens de eerste opstart luistert een tijdelijke server alleen op de socket.
    if (docker(['exec', NAAM, 'pg_isready', '-h', '127.0.0.1', '-U', GEBRUIKER, '-d', DB]).ok) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  stop(`De testdatabase reageert na 60 seconden nog niet. Kijk in Docker Desktop bij ${NAAM} → Logs.`)
}

function urlVan(c) {
  return `postgresql://${GEBRUIKER}:${c.env.POSTGRES_PASSWORD}@localhost:${POORT}/${DB}`
}

// ── .env.test ───────────────────────────────────────────────────────────────

function zetDatabaseUrl(url) {
  const nieuw = !fs.existsSync(ENV_TEST)
  const tekst = fs.readFileSync(nieuw ? ENV_VOORBEELD : ENV_TEST, 'utf8')
  const regel = `DATABASE_URL=${url}`
  const bijgewerkt = /^DATABASE_URL=.*$/m.test(tekst) ? tekst.replace(/^DATABASE_URL=.*$/m, regel) : `${regel}\n${tekst}`
  fs.writeFileSync(ENV_TEST, bijgewerkt)
  return nieuw
}

function envWaarde(bestand, sleutel) {
  if (!fs.existsSync(bestand)) return null
  const m = new RegExp(`^${sleutel}=(.*)$`, 'm').exec(fs.readFileSync(bestand, 'utf8'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

// ── Verbeterpunten van de managers niet stil weggooien ──────────────────────

function verbeterpuntenSindsKopie() {
  const kopie = kopieTijdUit(vraag(`SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '${DB}'`))
  if (!kopie) return { kopie: null, aantal: 0 }
  const n = vraag(`SELECT count(*) FROM todos WHERE soort = 'verbeterpunt' AND created_at > '${kopie}'`)
  return { kopie, aantal: Number(n ?? 0) }
}

function eisGeenVerbeterpunten(ja, wat) {
  const { aantal } = verbeterpuntenSindsKopie()
  if (aantal > 0 && !ja) {
    stop(
      `Er staan ${aantal} verbeterpunten van na de kopie in de test ("Dit klopt niet"). Die gaan bij ${wat} verloren.\n` +
      'Exporteer ze eerst in de test-app: ToDo → Verbeterpunten → Exporteer voor Claude.\n' +
      `Al gedaan? Draai dan opnieuw met --ja erachter. Er is niets gewijzigd.`,
    )
  }
}

// ── Acties ──────────────────────────────────────────────────────────────────

async function start() {
  let c = container(NAAM)
  if (c && !isOnzeTestContainer(c)) stop(`Er bestaat al een container ${NAAM} die dit script niet gemaakt heeft. Er is niets gewijzigd.`)
  if (!c) {
    const r = docker([
      'run', '-d', '--name', NAAM, '--label', LABEL, '--restart', 'unless-stopped',
      '-p', `127.0.0.1:${POORT}:5432`,
      '-e', `POSTGRES_USER=${GEBRUIKER}`, '-e', `POSTGRES_DB=${DB}`,
      // Zonder waarde: Docker neemt hem uit de omgeving, dan staat hij niet in de opdrachtregel.
      '-e', 'POSTGRES_PASSWORD',
      '-v', `${VOLUME}:/var/lib/postgresql/data`, BEELD,
    ], { env: { POSTGRES_PASSWORD: randomBytes(18).toString('base64url') } })
    if (!r.ok) {
      docker(['rm', '-f', NAAM])
      stop(`De testcontainer is niet gemaakt: ${r.fout}\nIs poort ${POORT} al bezet? Kies een andere met TEST_DB_POORT. Er is niets gewijzigd.`)
    }
    console.log(`Testcontainer ${NAAM} gemaakt (${BEELD}, poort ${POORT}, alleen op deze pc).`)
  } else if (!c.draait) {
    const r = docker(['start', NAAM])
    if (!r.ok) stop(`De testcontainer start niet: ${r.fout}`)
    console.log(`Testcontainer ${NAAM} gestart.`)
  } else {
    console.log(`Testcontainer ${NAAM} draait al.`)
  }
  await wachtTotKlaar()
  c = container(NAAM)
  const nieuw = zetDatabaseUrl(urlVan(c))
  console.log(nieuw
    ? `.env.test gemaakt met het adres van de testdatabase. Zet daar zelf nog ANTHROPIC_API_KEY in.`
    : `.env.test: DATABASE_URL wijst naar de testdatabase.`)
  console.log('Volgende stap: npm run test-omgeving:db -- kopie')
}

async function kopie(opties) {
  const doel = container(NAAM)
  if (!doel || !isOnzeTestContainer(doel)) stop('Er is nog geen testdatabase. Eerst: npm run test-omgeving:db -- start')
  if (!doel.draait) stop('De testdatabase staat uit. Eerst: npm run test-omgeving:db -- start')
  if (!isTestDatabase(doel.env.POSTGRES_DB ?? '')) stop(`Doel ${doel.env.POSTGRES_DB} eindigt niet op _test. Er is niets gewijzigd.`)

  const bronNaam = opties.bron ?? STANDAARD_BRON
  if (bronNaam === NAAM) stop('De bron is de testdatabase zelf. Er is niets gewijzigd.')
  const bron = container(bronNaam)
  if (!bron) stop(`Container ${bronNaam} (de echte database) bestaat niet. Kies hem met --bron <naam> (docker ps). Er is niets gewijzigd.`)
  if (!bron.draait) stop(`De echte database (${bronNaam}) draait niet. Er is niets gewijzigd.`)
  const bronGebruiker = bron.env.POSTGRES_USER ?? 'postgres'
  const bronDb = bron.env.POSTGRES_DB ?? bronGebruiker

  eisGeenVerbeterpunten(opties.ja, 'een nieuwe kopie')

  console.log(`Echte gegevens lezen uit ${bronNaam} (database ${bronDb}); daar wordt niets gewijzigd…`)
  await new Promise((klaar, mis) => {
    const dump = spawn('docker', ['exec', bronNaam, 'pg_dump', '-U', bronGebruiker, '-d', bronDb, '--format=custom', '--no-owner', '--no-privileges'])
    const opslaan = spawn('docker', ['exec', '-i', NAAM, 'sh', '-c', 'cat > /tmp/echt.dump'])
    let fout = ''
    dump.stderr.on('data', (d) => { fout += d })
    opslaan.stderr.on('data', (d) => { fout += d })
    dump.stdout.pipe(opslaan.stdin)
    let codes = 0
    const einde = () => { if (++codes === 2) (dump.exitCode === 0 && opslaan.exitCode === 0 ? klaar() : mis(new Stop(`Lezen mislukt: ${fout.trim()}\nDe testdatabase is niet veranderd.`))) }
    dump.on('close', einde)
    opslaan.on('close', einde)
    dump.on('error', (e) => mis(new Stop(`Docker is niet te starten (${e.message}).`)))
  })

  // Pas nu, met de kopie veilig binnen, de oude testgegevens weg. Het doel wordt
  // binnen de container nog eens op _test gecontroleerd.
  const tijd = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const script = [
    'set -e',
    'case "$POSTGRES_DB" in *_test) ;; *) echo "Doel $POSTGRES_DB eindigt niet op _test" >&2; exit 3;; esac',
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB"',
    'createdb -U "$POSTGRES_USER" "$POSTGRES_DB"',
    'pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/echt.dump',
    `psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "COMMENT ON DATABASE \\"$POSTGRES_DB\\" IS 'kopie:${tijd}'"`,
    'rm -f /tmp/echt.dump',
  ].join('\n')
  // Via stdin en niet als argument: zo komen aanhalingstekens en regels heel aan,
  // ook door de opdrachtregel van Windows heen.
  const r = docker(['exec', '-i', NAAM, 'sh'], { invoer: script })
  if (!r.ok) stop(`Terugzetten in de testdatabase mislukt: ${r.fout}\nDe testdatabase is mogelijk leeg; draai kopie opnieuw. De echte database is niet geraakt.`)

  const projecten = vraag('SELECT count(*) FROM projects')
  const relaties = vraag('SELECT count(*) FROM relaties')
  console.log(`Kopie klaar (${tijd}): ${projecten} projecten, ${relaties} relaties.`)
  console.log('Volgende stap: npm run test-omgeving:bijwerken (bouwen + migraties op de test), dan de test-app starten.')
}

function uploads(echteMap) {
  if (!echteMap) stop('Geef de map van de echte app mee, bv.: npm run test-omgeving:db -- uploads C:\\ClaudeProjects\\ShopCommand')
  const api = (map) => path.join(map, 'apps', 'api')
  const bron = path.resolve(api(echteMap), envWaarde(path.join(echteMap, '.env.development'), 'UPLOADS_DIR') ?? './uploads')
  const doel = path.resolve(api(ROOT), envWaarde(ENV_TEST, 'UPLOADS_DIR') ?? './uploads-test')
  if (!fs.existsSync(bron)) stop(`Map ${bron} bestaat niet. Klopt de map van de echte app? Er is niets gekopieerd.`)
  const rel = path.relative(bron, doel)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    stop(`Doel ${doel} ligt in of op de map van de echte app. Controleer UPLOADS_DIR in .env.test. Er is niets gekopieerd.`)
  }
  fs.mkdirSync(doel, { recursive: true })
  fs.cpSync(bron, doel, { recursive: true, force: true })
  let n = 0
  const tel = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? tel(path.join(d, e.name)) : n++ }
  tel(doel)
  console.log(`${n} bestanden staan nu in ${doel} (gekopieerd uit ${bron}; daar is niets veranderd).`)
}

function status() {
  const c = container(NAAM)
  if (!c || !isOnzeTestContainer(c)) { console.log('Er is geen testdatabase. Maken: npm run test-omgeving:db -- start'); return }
  console.log(`Testcontainer ${NAAM}: ${c.draait ? 'draait' : 'staat uit'} (poort ${POORT}, alleen op deze pc)`)
  if (!c.draait) return
  const { kopie: van, aantal } = verbeterpuntenSindsKopie()
  console.log(`Kopie van de echte gegevens: ${van ?? 'nog niet gemaakt'}`)
  console.log(`Projecten: ${vraag('SELECT count(*) FROM projects') ?? '–'}, relaties: ${vraag('SELECT count(*) FROM relaties') ?? '–'}`)
  console.log(`Verbeterpunten sinds de kopie: ${aantal}`)
  console.log(`Grootte: ${vraag(`SELECT pg_size_pretty(pg_database_size('${DB}'))`) ?? '–'}`)
  const url = envWaarde(ENV_TEST, 'DATABASE_URL')
  console.log(`.env.test: ${url === urlVan(c) ? 'wijst naar deze testdatabase' : 'wijst NIET naar deze testdatabase — draai start opnieuw'}`)
}

async function weggooien(opties) {
  const c = container(NAAM)
  if (!c) { console.log('Er is geen testdatabase; niets te doen.'); return }
  if (!isOnzeTestContainer(c)) stop(`Container ${NAAM} is niet door dit script gemaakt; die gooi ik niet weg.`)
  if (c.draait) eisGeenVerbeterpunten(opties.ja, 'het weggooien')
  if (!opties.ja) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const antwoord = await rl.question(`Typ WEG om ${NAAM} en al zijn gegevens te wissen (de echte database blijft): `)
    rl.close()
    if (antwoord.trim().toUpperCase() !== 'WEG') stop('Niet weggegooid.')
  }
  const r1 = docker(['rm', '-f', NAAM])
  if (!r1.ok) stop(`Container niet weg: ${r1.fout}`)
  const r2 = docker(['volume', 'rm', VOLUME])
  if (!r2.ok && !/no such volume/i.test(r2.fout)) stop(`Container weg, maar de opslag niet: ${r2.fout}`)
  console.log(`Testdatabase weggegooid (${NAAM} en ${VOLUME}). De echte database is niet geraakt.`)
  console.log('Wil je alles kwijt: verwijder ook de map van de test en apps\\api\\uploads-test daarin.')
}

// ── Opdrachtregel ───────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const opties = { ja: args.includes('--ja'), bron: null }
const i = args.indexOf('--bron')
if (i >= 0) opties.bron = args[i + 1]
const losse = args.filter((a, j) => !a.startsWith('--') && args[j - 1] !== '--bron')

try {
  switch (losse[0]) {
    case 'start': await start(); break
    case 'kopie': await kopie(opties); break
    case 'uploads': uploads(losse[1]); break
    case 'status': status(); break
    case 'weggooien': await weggooien(opties); break
    default:
      console.log('Gebruik: npm run test-omgeving:db -- start | kopie [--bron <container>] | uploads <map-echte-app> | status | weggooien [--ja]')
      process.exitCode = losse[0] ? 1 : 0
  }
} catch (e) {
  if (!(e instanceof Stop)) throw e
  console.error(e.message)
  process.exitCode = 1
}
