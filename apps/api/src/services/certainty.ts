import type { CandidateLine, ExtractieRapport } from '@stockmanager/shared'

/**
 * Zekerheid van een kandidaatregel — features/60-mail-import.md §6.
 *
 * Belangrijk om eerlijk over te zijn: dit is een *vertrouwensindicatie*, geen
 * gemeten nauwkeurigheid. Het zegt hoe goed onderbouwd een regel is, niet hoe
 * vaak dit soort regels achteraf klopte. Echte nauwkeurigheid kan pas uit de
 * correcties die mensen in het reviewscherm maken; die meten we (nog) niet.
 *
 * Drie dingen bepalen of je een regel kunt vertrouwen:
 *  herkenning   — is hij echt gelezen: staat het citaat er letterlijk, staat het
 *                 tekeningnummer er teken voor teken, en zei de controlelezing
 *                 hetzelfde
 *  koppeling    — is hij aan een artikel uit onze database te hangen
 *  volledigheid — weten we ook een aantal en een tekeningnummer
 *
 * Geen enkele controle gooit een regel wég. Ze duwen de score omlaag, en een
 * mens beslist. Stil verwijderen zou het ergste van twee werelden zijn: je ziet
 * niet dát er iets stond en je kunt het niet nakijken.
 */

const WEIGHT = { herkenning: 0.35, koppeling: 0.45, volledigheid: 0.2 } as const

/** Het model noemt een regel maar kan hem niet letterlijk aanwijzen: verzonnen. */
const ONGEGROND_FACTOR = 0.4
/** Erger nog: het tekeningnummer zelf staat er niet. Eén cijfer verschil is een ander onderdeel. */
const TEKENING_ONGEGROND_FACTOR = 0.3
/** Uit een scan valt niets letterlijk terug te zoeken; niet fout, wel onzeker. */
const ONCONTROLEERBAAR_FACTOR = 0.7
/** Twee onafhankelijke lezingen die hetzelfde zeggen is het sterkste signaal dat we hebben. */
const BEVESTIGD_BONUS = 0.15
/** Twee lezingen die elkaar tegenspreken: dit is de regel om na te kijken. */
const ONBEVESTIGD_FACTOR = 0.45
/** Bij twijfel telt de treffer maar deels mee — er is immers een concurrent. */
const TWIJFEL_FACTOR = 0.6

export interface CertaintyInput {
  /** Wat het model zelf zei over deze regel, 0-1. */
  modelZekerheid?: number | null
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function scoreLine(line: CandidateLine, input: CertaintyInput = {}): CandidateLine {
  const redenen: string[] = []

  // ── herkenning: is deze regel echt gelezen, of aannemelijk gemaakt? ──
  let herkenning = clamp(input.modelZekerheid ?? 0.7)

  if (line.extractor === 'regels') {
    // Regels uit een oudere import, van de inmiddels verwijderde patroonmotor.
    redenen.push('Gevonden met de oude vaste patronen (vóór 2026-09-08)')
  } else if (line.gegrond === false) {
    herkenning *= ONGEGROND_FACTOR
    redenen.push('Let op: de aangehaalde tekst staat niet letterlijk in de mail of bijlage')
  } else if (line.gegrond === null) {
    herkenning *= ONCONTROLEERBAAR_FACTOR
    redenen.push('Niet te controleren: de bijlage heeft geen tekstlaag (een scan)')
  } else {
    redenen.push('Aangehaalde tekst letterlijk teruggevonden in de bron')
  }

  // Het tekeningnummer apart: daar zit de duurste fout.
  if (line.tekeningGegrond === false) {
    herkenning *= TEKENING_ONGEGROND_FACTOR
    redenen.push(`Let op: tekeningnummer ${line.tekening ?? ''} staat nergens letterlijk in de mail`)
  } else if (line.tekeningGegrond === true) {
    redenen.push('Tekeningnummer teken voor teken teruggevonden')
  }

  // De tweede lezing.
  if (line.bevestigd === true) {
    herkenning = clamp(herkenning + BEVESTIGD_BONUS)
    redenen.push('Twee onafhankelijke lezingen kwamen op dezelfde regel uit')
  } else if (line.bevestigd === false) {
    herkenning *= ONBEVESTIGD_FACTOR
    redenen.push('De controlelezing kwam op iets anders uit — nakijken')
  }

  // ── koppeling: hangt er een artikel uit onze database aan? ──
  const best = line.matches[0]
  let koppeling = 0
  if (line.handmatig) {
    koppeling = 1
    redenen.push('Handmatig gekozen')
  } else if (!best) {
    redenen.push('Geen artikel in de database gevonden')
  } else if (line.status === 'match') {
    koppeling = clamp(best.score)
    redenen.push(`Gekoppeld aan ${best.naam} — ${best.reden}`)
  } else {
    koppeling = clamp(best.score) * TWIJFEL_FACTOR
    redenen.push(`Meerdere of zwakke treffers — ${best.reden}`)
  }

  // ── volledigheid ──
  let volledigheid = 0
  if (line.tekening) volledigheid += 0.5
  else redenen.push('Geen tekeningnummer herkend')
  if (line.qty !== null) volledigheid += 0.5
  else redenen.push('Geen aantal gevonden')

  const zekerheid =
    WEIGHT.herkenning * herkenning +
    WEIGHT.koppeling * koppeling +
    WEIGHT.volledigheid * volledigheid

  return { ...line, zekerheid: Math.round(clamp(zekerheid) * 100) / 100, zekerheidRedenen: redenen }
}

export function scoreLines(
  lines: CandidateLine[],
  modelZekerheid: Map<string, number> = new Map()
): CandidateLine[] {
  return lines.map((l) => scoreLine(l, { modelZekerheid: modelZekerheid.get(l.id) ?? null }))
}

export function buildRapport(
  lines: CandidateLine[],
  opts: {
    aiGebruikt: boolean
    model: string | null
    foutmelding: string | null
    documentGebruikt?: string | null
    gescandeBijlagen?: string[]
    volledigMeegestuurd?: string[]
    controleGedaan?: boolean
  }
): ExtractieRapport {
  const scores = lines.map((l) => l.zekerheid)
  return {
    aiGebruikt: opts.aiGebruikt,
    model: opts.model,
    zekerheid: scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0,
    laagsteZekerheid: scores.length ? Math.min(...scores) : 0,
    ongegrondeRegels: lines.filter((l) => l.gegrond === false && l.extractor !== 'regels').length,
    controleGedaan: opts.controleGedaan ?? false,
    onbevestigdeRegels: lines.filter((l) => l.bevestigd === false).length,
    documentGebruikt: opts.documentGebruikt ?? null,
    gescandeBijlagen: opts.gescandeBijlagen ?? [],
    volledigMeegestuurd: opts.volledigMeegestuurd ?? [],
    foutmelding: opts.foutmelding,
  }
}
