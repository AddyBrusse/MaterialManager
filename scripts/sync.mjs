#!/usr/bin/env node
// Haalt de werk-pc gelijk met een branch op origin — het commando dat `git pull`
// hier vervángt.
//
// `git pull` kán op een agent-branch niet werken. PR's worden squash-gemerged,
// dus na elke merge dragen master en de branch dezelfde wijzigingen in
// verschillende commits. Een merge van die twee conflicteert gegarandeerd, en
// meestal precies in de bestanden die beide kanten aanraken (CLAUDE.md,
// schema.prisma, index.ts). Zie het kopje "nooit `git pull` op een agent-branch"
// in CLAUDE.md; dit script is dat stuk handleiding, uitgevoerd.
//
//   npm run sync                    → nieuwste claude/*-branch op origin
//   npm run sync -- <branch>        → die branch
//   npm run sync -- --force         → ook lokale wijzigingen weggooien
//
// Het stopt liever dan dat het iets weggooit wat nergens anders staat.

import { execFileSync, spawnSync } from 'node:child_process'

const args    = process.argv.slice(2)
const force   = args.includes('--force')
const doelArg = args.find(a => !a.startsWith('--'))

/** Gegenereerde bestanden: lokale wijziging is ruis, niet werk. */
const GEGENEREERD = ['package-lock.json']

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8' }).trim()
}

/**
 * Zonder trim. `git status --porcelain` zet de status in de eerste twee kolommen
 * en het pad vanaf kolom vier; een gewone trim() haalt de spatie van de eerste
 * regel weg en dan mist het pad zijn eerste letter.
 */
function gitRuw(...a) {
  return execFileSync('git', a, { encoding: 'utf8' }).replace(/\n+$/, '')
}

/** Voor commando's die mógen falen (bestaat deze ref?). */
function gitStil(...a) {
  const r = spawnSync('git', a, { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

function stop(bericht) {
  console.error(`\n✖ ${bericht}\n`)
  process.exit(1)
}

// ── 1. Ophalen ────────────────────────────────────────────────────────────────

let huidig
try {
  huidig = git('rev-parse', '--abbrev-ref', 'HEAD')
} catch {
  stop('Dit is geen git-repository. Draai dit vanuit de hoofdmap van het project.')
}

console.log('· origin ophalen…')
git('fetch', 'origin', '--prune')

// ── 2. Doelbranch bepalen ─────────────────────────────────────────────────────

function nieuwsteClaudeBranch() {
  const uit = git(
    'for-each-ref', '--sort=-committerdate',
    '--format=%(refname:short)', 'refs/remotes/origin/claude',
  )
  const eerste = uit.split('\n').filter(Boolean)[0]
  return eerste ? eerste.replace(/^origin\//, '') : null
}

const doel = doelArg
  ?? (gitStil('rev-parse', '--verify', '--quiet', `origin/${huidig}`) ? huidig : nieuwsteClaudeBranch())

if (!doel) stop('Geen branch meegegeven en geen enkele claude/*-branch op origin gevonden.')
if (!gitStil('rev-parse', '--verify', '--quiet', `origin/${doel}`)) {
  stop(`origin/${doel} bestaat niet. Controleer de naam, of laat hem weg voor de nieuwste claude/*-branch.`)
}

// ── 3. Niets weggooien wat nergens anders staat ───────────────────────────────

// Commits die op geen enkele remote-branch voorkomen. Staan ze er wel, dan is
// de lokale kopie per definitie te herstellen en mag hij overschreven worden.
const alleenLokaal = git('rev-list', 'HEAD', '--not', '--remotes').split('\n').filter(Boolean)
if (alleenLokaal.length && !force) {
  // Dezelfde toets als in CLAUDE.md: is de inhoud gelijk aan master, dan zijn
  // het de originele commits van een al gemergede (squash) PR — niets waard.
  const gelijkAanMaster = spawnSync('git', ['diff', '--quiet', 'HEAD', 'origin/master']).status === 0
  if (!gelijkAanMaster) {
    const log = git('log', '--oneline', '-10', 'HEAD', '--not', '--remotes')
    stop(
      `Er staan ${alleenLokaal.length} commit(s) op deze pc die nergens op origin staan:\n\n${log}\n\n` +
      'Push ze eerst, of gooi ze bewust weg met: npm run sync -- --force',
    )
  }
  console.log('· lokale commits hebben dezelfde inhoud als master (squash-merge) — veilig te vervangen')
}

// ── 4. Werkboom opruimen ──────────────────────────────────────────────────────

const gewijzigd = gitRuw('status', '--porcelain')
  .split('\n').filter(Boolean)
  .filter(r => !r.startsWith('??'))                 // untracked blijft gewoon staan
  // "XY pad", en bij een hernoeming "XY oud -> nieuw": het nieuwe pad telt.
  .map(r => r.slice(3).split(' -> ').pop().trim())

const ruis   = gewijzigd.filter(f => GEGENEREERD.includes(f))
const echt   = gewijzigd.filter(f => !GEGENEREERD.includes(f))

if (ruis.length) {
  console.log(`· gegenereerde wijziging weggegooid: ${ruis.join(', ')}`)
  git('checkout', '--', ...ruis)
}
if (echt.length) {
  if (!force) {
    stop(
      `Er staan eigen wijzigingen in:\n\n  ${echt.join('\n  ')}\n\n` +
      'Commit of stash ze eerst, of gooi ze weg met: npm run sync -- --force',
    )
  }
  console.log(`· wijzigingen weggegooid (--force): ${echt.join(', ')}`)
  git('checkout', '--', ...echt)
}

// ── 5. Overschakelen ──────────────────────────────────────────────────────────

const vorigeHead = git('rev-parse', 'HEAD')

// checkout -B werkt of de branch lokaal nu wel of niet bestaat, en zet hem in
// één keer op origin. Geen merge, dus geen conflict.
git('checkout', '-B', doel, `origin/${doel}`)
git('reset', '--hard', `origin/${doel}`)

const nieuweHead = git('rev-parse', 'HEAD')

// ── 6. Wat er nog moet gebeuren ───────────────────────────────────────────────

const veranderd = vorigeHead === nieuweHead
  ? []
  : git('diff', '--name-only', vorigeHead, nieuweHead).split('\n').filter(Boolean)

if (veranderd.some(f => f.endsWith('package.json') || f === 'package-lock.json')) {
  console.log('· afhankelijkheden zijn gewijzigd — npm install…')
  const r = spawnSync('npm', ['install'], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) stop('npm install is mislukt.')
}

const migraties = veranderd.some(f => f.startsWith('apps/api/prisma/'))

console.log(`\n✔ ${doel} · ${git('log', '--oneline', '-1')}`)
if (vorigeHead === nieuweHead) console.log('  (stond al gelijk)')
if (migraties) {
  console.log('\n! De database is gewijzigd. Draai eerst:\n    npm run db:deploy')
}
console.log('\nStarten:  npm run dev\n')
