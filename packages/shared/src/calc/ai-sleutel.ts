/**
 * De AI-sleutel (2026-10-28): werkt hij, en zo niet, wat moet er gebeuren.
 *
 * De app gebruikt één sleutel, `ANTHROPIC_API_KEY`, voor de mail-import en de
 * assistent. Ging die stuk, dan zag je dat alleen doordat het bericht van 08:00
 * stilletjes zonder AI kwam of een mail niets opleverde. Sinds juli 2026 vraagt
 * de Claude Console bij elke nieuwe sleutel een verloopdatum, en twee keer op
 * rij verliep de sleutel na 30 dagen. De server onthoudt wat de API het laatst
 * zei (`services/ai-sleutel.ts`); hier staan de regels en de woorden.
 */
import type { Melding } from './meldingen'

const AI_SLEUTEL_STANDEN = [
  'werkt', 'ontbreekt', 'ongeldig', 'geen_tegoed', 'geen_toegang', 'model', 'storing', 'onbekend',
] as const
export type AiSleutelStand = (typeof AI_SLEUTEL_STANDEN)[number]

/**
 * Waar de API iets over zei. `controle` is de gratis controle: de lijst met
 * modellen en elk model dat de app gebruikt. Die zegt of de sleutel geldig is
 * en of het account de modellen mag gebruiken, maar niets over tegoed.
 * `aanroep` is een echt verzoek aan het model (mail, assistent, de testknop).
 */
export type AiSleutelBron = 'controle' | 'aanroep'

export interface AiSleutelStatus {
  stand: AiSleutelStand
  /** Wanneer de API dit zei (ISO); null = nog niet gevraagd. */
  op: string | null
  bron: AiSleutelBron | null
  /** Wat de API zelf zei, voor wie het precies wil weten. */
  reden: string | null
  /** Begin en eind van de sleutel die de server gebruikt (`sk-ant-api03-…AbCd`); null = geen sleutel. */
  sleutel: string | null
  /** Begint de sleutel zoals een gewone API-sleutel (`sk-ant-api`)? */
  vormKlopt: boolean
  /** De modellen die de app aanroept: mail-import en assistent. */
  modellen: string[]
}

/**
 * Wat een antwoord van de API zegt over de sleutel. `status` null = geen
 * antwoord (geen verbinding, time-out). Geeft null bij een fout die over het
 * verzoek gaat en niet over de sleutel, zoals een mail die te groot is: dan
 * blijft staan wat er al stond.
 *
 * Een leeg tegoed komt als 400 met een reden (2026-09-28 gezien) of als 402.
 */
export function standUitAntwoord(status: number | null, reden: string): AiSleutelStand | null {
  if (status === null) return 'storing'
  if (status >= 200 && status < 300) return 'werkt'
  if (status === 401) return 'ongeldig'
  if (status === 402 || /credit balance/i.test(reden)) return 'geen_tegoed'
  if (status === 403) return 'geen_toegang'
  if (status === 404) return 'model'
  if (status === 429 || status >= 500) return 'storing'
  return null
}

/**
 * Vervangt een nieuwe waarneming wat er stond? Ja, behalve één geval: de gratis
 * controle werkt ook zonder tegoed. Een "werkt" van de controle wist een leeg
 * tegoed dus niet; dat doet pas een aanroep die lukt.
 */
export function vervangtStand(
  huidig: { stand: AiSleutelStand; bron: AiSleutelBron | null } | null,
  nieuw: { stand: AiSleutelStand; bron: AiSleutelBron },
): boolean {
  if (!huidig) return true
  return !(nieuw.bron === 'controle' && nieuw.stand === 'werkt' && huidig.stand === 'geen_tegoed')
}

/** Begin en eind van de sleutel, zoals de Console hem toont. Nooit de hele sleutel. */
export function sleutelWeergave(sleutel: string | null): { sleutel: string | null; vormKlopt: boolean } {
  if (!sleutel) return { sleutel: null, vormKlopt: false }
  const begin = /^sk-ant-[a-z]+\d*-/.exec(sleutel)?.[0] ?? ''
  return { sleutel: `${begin}…${sleutel.slice(-4)}`, vormKlopt: begin.startsWith('sk-ant-api') }
}

const CONSOLE = 'platform.claude.com/settings/keys'

/** Titel en wat er moet gebeuren, per stand. Zelfde woorden in Instellingen en in het belletje. */
export const AI_SLEUTEL_UITLEG: Record<AiSleutelStand, { titel: string; wat: string }> = {
  werkt: { titel: 'Sleutel werkt', wat: 'Mail-import en assistent kunnen het taalmodel gebruiken.' },
  ontbreekt: {
    titel: 'Geen AI-sleutel',
    wat: 'De server heeft geen ANTHROPIC_API_KEY. Een gesleepte mail levert geen regels op en de assistent werkt zonder AI. '
      + 'Zet de sleutel in .env.development (pc) of docker/.env (NAS) en herstart de server.',
  },
  ongeldig: {
    titel: 'AI-sleutel werkt niet',
    wat: `De API kent deze sleutel niet (meer): verlopen, ingetrokken of verkeerd overgenomen. Maak een nieuwe op ${CONSOLE} `
      + 'met verloopdatum "Never", zet hem in de omgeving van de server en herstart de server.',
  },
  geen_tegoed: {
    titel: 'Geen tegoed op het API-account',
    wat: 'De sleutel klopt, maar er is geen tegoed. Laad bij in de Claude Console onder Billing en zet automatisch bijladen aan: '
      + 'gekocht tegoed vervalt na een jaar.',
  },
  geen_toegang: {
    titel: 'AI-sleutel heeft geen toegang',
    wat: `De API weigert deze sleutel (workspace of organisatie uitgeschakeld, of een beperking). Kijk op ${CONSOLE} of hij aan staat.`,
  },
  model: {
    titel: 'AI-model niet beschikbaar',
    wat: 'De sleutel werkt, maar dit account kan het model niet gebruiken. Pas MAIL_AI_MODEL of ASSISTENT_MODEL aan in de omgeving '
      + 'van de server en herstart.',
  },
  storing: {
    titel: 'API tijdelijk niet bereikbaar',
    wat: 'De API antwoordde niet of was overbelast. Dat gaat meestal vanzelf over; probeer het straks opnieuw.',
  },
  onbekend: { titel: 'Nog niet gecontroleerd', wat: 'Klik op "Nu testen" om de sleutel te controleren.' },
}

/** Standen waarbij iemand iets moet doen; een storing gaat vanzelf over. */
const ROOD: AiSleutelStand[] = ['ongeldig', 'geen_tegoed', 'geen_toegang', 'model']

/**
 * De melding in het belletje. Een ontbrekende sleutel telt alleen als de AI
 * nodig is: staan mail-AI (`MAIL_AI=uit`) én assistent uit, dan is dat een keuze.
 */
export function aiSleutelMelding(s: AiSleutelStatus, nodig: boolean): Melding | null {
  const rood = ROOD.includes(s.stand)
  if (!rood && !(s.stand === 'ontbreekt' && nodig)) return null
  const u = AI_SLEUTEL_UITLEG[s.stand]
  return {
    id: `ai-sleutel:${s.stand}`, groep: 'systeem', ernst: rood ? 'rood' : 'oranje',
    titel: u.titel, tekst: u.wat, link: '/instellingen#ai-sleutel',
  }
}
