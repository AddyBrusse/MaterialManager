/**
 * Parser-proef op een echt bericht — fase 0 uit features/60-mail-import.md.
 *
 *   npm run probe:msg -w apps/api -- "/pad/naar/mail.msg"
 *
 * Drukt af wat er uit een .msg te halen valt, zodat vóór het bouwen duidelijk is
 * of de velden die het ontwerp nodig heeft er daadwerkelijk in zitten. Vooral:
 * het afzenderadres (§3.2) en het message-id (§4) — als die ontbreken verandert
 * dat het ontwerp, en dat wil je nú weten.
 *
 * Leest alleen; schrijft niets naar de database of naar schijf.
 */
import fs from 'fs'
import { parseMsg } from '../services/msg-parse'
import { resolveSender, dedupeKey } from '../services/mail-sender'

const file = process.argv[2]
if (!file) {
  console.error('Gebruik: npm run probe:msg -w apps/api -- "/pad/naar/mail.msg"')
  process.exit(1)
}

// Eigen identiteit alleen voor deze proef; in de app komt dit uit
// Instellingen → Bedrijf en User.email.
const own = {
  domains: (process.env.PROBE_OWN_DOMAINS ?? '').split(',').map((d) => d.trim()).filter(Boolean),
  emails: (process.env.PROBE_OWN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean),
}

function show(label: string, value: unknown, hint?: string) {
  const ok = value !== null && value !== undefined && value !== ''
  const shown = typeof value === 'string' && value.length > 100 ? `${value.slice(0, 100)}…` : value
  console.log(`  ${ok ? '✔' : '✘'} ${label.padEnd(22)} ${ok ? String(shown) : `(ontbreekt)${hint ? ` — ${hint}` : ''}`}`)
}

const { mail, embedded } = parseMsg(fs.readFileSync(file))

console.log(`\n=== ${file} ===\n`)
console.log('Kopgegevens')
show('onderwerp', mail.subject)
show('afzender naam', mail.from?.naam)
show('afzender e-mail', mail.from?.email, 'relatie-resolutie valt terug op de naam (§3.2)')
show('ontvangen op', mail.receivedAt)
show('message-id', mail.messageId, 'idempotentie valt terug op een hash (§4)')
show('transport headers', mail.rawHeaders ? `${mail.rawHeaders.length} tekens` : null)
show('body (tekst)', mail.bodyText ? `${mail.bodyText.length} tekens` : null)
show('body (html)', mail.bodyHtml ? `${mail.bodyHtml.length} tekens` : null)

console.log('\nOntvangers')
for (const r of [...mail.to, ...mail.cc]) console.log(`  - ${r.naam ?? '?'} <${r.email ?? 'geen adres'}>`)
if (mail.to.length + mail.cc.length === 0) console.log('  (geen)')

console.log(`\nBijlagen (${mail.attachments.length})`)
for (const a of mail.attachments) {
  console.log(`  - ${a.filename}  ${a.sizeBytes} bytes${a.isEmbeddedMessage ? '  [bericht als bijlage]' : ''}`)
}
if (!mail.attachments.length) console.log('  (geen)')

console.log(`\nBerichten als bijlage (${embedded.length})`)
for (const e of embedded) {
  console.log(`  - "${e.subject}" van ${e.from?.naam ?? '?'} <${e.from?.email ?? 'geen adres'}>, ${e.attachments.length} bijlage(n)`)
}
if (!embedded.length) console.log('  (geen)')

console.log('\nAfzender-resolutie (§3.2)')
if (!own.domains.length && !own.emails.length) {
  console.log('  Geen eigen domeinen opgegeven — zet PROBE_OWN_DOMAINS=jouwdomein.nl om')
  console.log('  het doorstuur-pad te testen. Zonder dat telt elke afzender als extern.')
}
const res = resolveSender(mail, embedded, own)
console.log(`  origin      : ${res.origin}`)
console.log(`  klant       : ${res.klant?.naam ?? '?'} <${res.klant?.email ?? 'geen adres'}>`)
console.log(`  doorgestuurd: ${res.doorgestuurdDoor?.email ?? '(niet)'}`)
console.log(`  zekerheid   : ${res.confidence}`)
console.log(`  reden       : ${res.reden}`)

console.log(`\nIdempotentie-sleutel\n  ${dedupeKey(mail)}\n`)
