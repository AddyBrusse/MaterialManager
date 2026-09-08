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
 *  herkenning   — is hij echt gevonden, en staat hij letterlijk in de bron
 *  koppeling    — is hij aan een artikel uit onze database te hangen
 *  volledigheid — weten we ook een aantal en een tekeningnummer
 */

const WEIGHT = { herkenning: 0.35, koppeling: 0.45, volledigheid: 0.2 } as const

/** Een regel die alleen de vaste patronen vonden: degelijk, maar niet gelezen. */
const REGELMOTOR_HERKENNING = 0.7
/** Twee motoren die onafhankelijk hetzelfde vonden zegt meer dan één. */
const EENSGEZIND_BONUS = 0.15
/** Het model noemt een regel maar kan hem niet letterlijk aanwijzen: verzonnen. */
const ONGEGROND_FACTOR = 0.4
/** Uit een scan valt niets letterlijk terug te zoeken; niet fout, wel onzeker. */
const ONCONTROLEERBAAR_FACTOR = 0.7
/** Bij twijfel telt de treffer maar deels mee — er is immers een concurrent. */
const TWIJFEL_FACTOR = 0.6

export interface CertaintyInput {
  /** Wat het model zelf zei over deze regel, 0-1. Null bij de regelmotor. */
  modelZekerheid?: number | null
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function scoreLine(line: CandidateLine, input: CertaintyInput = {}): CandidateLine {
  const redenen: string[] = []

  // ── herkenning ──
  let herkenning =
    line.extractor === 'regels'
      ? REGELMOTOR_HERKENNING
      : clamp(input.modelZekerheid ?? 0.7)

  if (line.extractor === 'regels') {
    redenen.push('Gevonden met vaste patronen')
  } else if (line.gegrond === false) {
    herkenning *= ONGEGROND_FACTOR
    redenen.push('Let op: de aangehaalde tekst staat niet letterlijk in de mail of bijlage')
  } else if (line.gegrond === null) {
    herkenning *= ONCONTROLEERBAAR_FACTOR
    redenen.push('Niet te controleren: de bijlage heeft geen tekstlaag (een scan)')
  } else {
    redenen.push('Gelezen door de AI en terug te vinden in de brontekst')
  }

  if (line.extractor === 'beide') {
    herkenning = clamp(herkenning + EENSGEZIND_BONUS)
    redenen.push('Zowel de vaste patronen als de AI vonden deze regel')
  }

  // ── koppeling ──
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
    documentGebruikt: opts.documentGebruikt ?? null,
    gescandeBijlagen: opts.gescandeBijlagen ?? [],
    foutmelding: opts.foutmelding,
  }
}
