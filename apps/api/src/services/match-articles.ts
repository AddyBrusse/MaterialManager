import type { ArticleMatch, CandidateLine, MatchStatus } from '@stockmanager/shared'

/**
 * Kandidaatregels aan bestaande artikelen koppelen — §3.5.
 *
 * De drempels staan bewust hoog. Een verkeerd gekoppeld artikel betekent een
 * verkeerde prijs in een offerte naar een klant; een lege suggestie kost één
 * klik in het reviewscherm. Bij gelijke spelers wint dus niemand.
 */

export interface ArticleCandidate {
  id: string
  naam: string
  tekening?: string | null
  rev?: string | null
  /** Van welke klant dit artikel is. Null = van niemand in het bijzonder. */
  relatieId?: string | null
}

/** Klantnummer → ons artikel, geleerd uit eerdere correcties (§4). */
export interface AliasCandidate {
  externalRef: string
  articleId: string
}

/**
 * Scheidingstekens weg, hoofdletters aan: `123.456-01` en `123456_01` zijn
 * hetzelfde tekeningnummer, alleen anders opgeschreven.
 */
export function normalizeRef(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Zelfde nummer, maar zonder voorloopnullen per cijfergroep: `007-01` ≈ `7-1`. */
function normalizeLoose(value: string | null | undefined): string {
  return normalizeRef(value).replace(/(^|[A-Z])0+(\d)/g, '$1$2')
}

const SCORE = {
  alias: 1,
  tekeningExactRev: 0.95,
  tekeningExact: 0.85,
  /** Ons tekeningnummer zit ín de aanduiding van de klant. */
  tekeningBevat: 0.8,
  tekeningLoose: 0.75,
  naamExact: 0.6,
  naamDeel: 0.45,
} as const

/**
 * Kortste nummer dat we in een langere klantaanduiding durven te herkennen.
 *
 * Klanten plakken hun eigen order- en positienummers om ons tekeningnummer
 * heen. Zoeken naar een kort nummer binnen een lange string levert toevals-
 * treffers op; vanaf tien tekens is dat vrijwel uitgesloten.
 */
const MIN_CONTAINED_LENGTH = 10

/** Onder deze score is een treffer geen suggestie waard. */
const MIN_SCORE = 0.45
/** Zoveel moet de beste van de tweede winnen, anders is het twijfel. */
const CLEAR_WIN_MARGIN = 0.1

function scoreArticle(
  line: CandidateLine,
  article: ArticleCandidate,
  aliasArticleIds: Set<string>
): ArticleMatch | null {
  const base = {
    artikelId: article.id, naam: article.naam,
    tekening: article.tekening ?? null, rev: article.rev ?? null,
    vanAndereKlant: false,
  }

  if (aliasArticleIds.has(article.id)) {
    return { ...base, score: SCORE.alias, reden: 'Eerder al aan dit klantnummer gekoppeld.' }
  }

  const lineRef = normalizeRef(line.tekening)
  const artRef = normalizeRef(article.tekening)
  if (lineRef && artRef) {
    if (lineRef === artRef) {
      const lineRev = (line.rev ?? '').toUpperCase()
      const artRev = (article.rev ?? '').toUpperCase()
      if (lineRev && artRev && lineRev === artRev) {
        return { ...base, score: SCORE.tekeningExactRev, reden: `Tekening ${article.tekening} rev ${article.rev}.` }
      }
      if (lineRev && artRev && lineRev !== artRev) {
        // Zelfde tekening, andere revisie: bijna zeker het goede artikel, maar
        // de revisie moet iemand zien — daar zitten de maatverschillen in.
        return {
          ...base,
          score: SCORE.tekeningExact,
          reden: `Tekening ${article.tekening}, maar rev ${artRev} tegenover ${lineRev} in de mail.`,
        }
      }
      return { ...base, score: SCORE.tekeningExact, reden: `Tekening ${article.tekening}.` }
    }
    if (normalizeLoose(line.tekening) === normalizeLoose(article.tekening)) {
      return { ...base, score: SCORE.tekeningLoose, reden: `Tekening lijkt op ${article.tekening}.` }
    }
    // Ons nummer verstopt in dat van de klant: "2604307-1-2615-0091-0530-1"
    // bevat "2615-0091-0530". Bewust letterlijk vergelijken, niet los: twee
    // artikelen kunnen één cijfer schelen (…-0090-… naast …-0091-…) en dan
    // mag er niets worden afgerond.
    if (artRef.length >= MIN_CONTAINED_LENGTH && lineRef.includes(artRef)) {
      return {
        ...base,
        score: SCORE.tekeningBevat,
        reden: `Tekening ${article.tekening} zit in de aanduiding van de klant.`,
      }
    }
  }

  // Naam als laatste redmiddel — genoeg om te tonen, te weinig om voor te vullen.
  const lineText = (line.tekening ?? line.ruweTekst).toUpperCase().trim()
  const artNaam = article.naam.toUpperCase().trim()
  if (artNaam.length >= 4 && lineText) {
    if (artNaam === lineText) return { ...base, score: SCORE.naamExact, reden: `Naam komt overeen met ${article.naam}.` }
    if (lineText.includes(artNaam) || artNaam.includes(lineText)) {
      return { ...base, score: SCORE.naamDeel, reden: `Naam lijkt op ${article.naam}.` }
    }
  }

  return null
}

function classify(matches: ArticleMatch[]): MatchStatus {
  if (matches.length === 0) return 'nieuw'
  const [best, second] = matches
  if (best.score < MIN_SCORE) return 'nieuw'
  // Een zwakke beste treffer is nooit een match, ook niet zonder concurrent:
  // op een naamgelijkenis alleen wordt niets voorgevuld.
  if (best.score < SCORE.tekeningLoose) return 'twijfel'
  if (second && best.score - second.score < CLEAR_WIN_MARGIN) return 'twijfel'
  return 'match'
}

/**
 * Een treffer bij een artikel van een ándere klant.
 *
 * Tekeningnummers zijn van de klant, niet van ons: dat "4471" van een nieuwe
 * klant gelijk is aan "4471" van Stinis zegt niets. Zonder deze rem werd zo'n
 * regel automatisch voorgevuld met het artikel van de verkeerde klant —
 * aangetoond met een test, en precies het soort fout dat pas opvalt als er
 * verkeerd geoffreerd is.
 *
 * Wegfilteren doen we niet: soms maak je hetzelfde onderdeel voor twee klanten,
 * en oude artikelen dragen helemaal geen relatie. De treffer blijft dus staan,
 * maar hij wordt nooit meer automatisch gekozen en zegt van wie hij is.
 */
const ANDERE_KLANT_FACTOR = 0.8

function vanAndereKlant(artikel: ArticleCandidate, relatieId: string | null): boolean {
  return Boolean(relatieId && artikel.relatieId && artikel.relatieId !== relatieId)
}

export function matchLine(
  line: CandidateLine,
  articles: ArticleCandidate[],
  aliases: AliasCandidate[] = [],
  relatieId: string | null = null,
  relatieNamen: Map<string, string> = new Map()
): CandidateLine {
  const ref = normalizeRef(line.tekening)
  const aliasArticleIds = new Set(
    aliases.filter((a) => normalizeRef(a.externalRef) === ref && ref !== '').map((a) => a.articleId)
  )

  const matches = articles
    .map((a) => {
      const m = scoreArticle(line, a, aliasArticleIds)
      if (!m || !vanAndereKlant(a, relatieId)) return m
      const naam = relatieNamen.get(a.relatieId!) ?? 'een andere klant'
      return {
        ...m,
        score: m.score * ANDERE_KLANT_FACTOR,
        reden: `${m.reden} Let op: dit artikel hoort bij ${naam}.`,
        vanAndereKlant: true,
      }
    })
    .filter((m): m is ArticleMatch => m !== null && m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam))
    .slice(0, 3)

  // Een artikel van een andere klant vult nooit voor, hoe hoog de score ook is.
  const status = matches[0]?.vanAndereKlant && classify(matches) === 'match'
    ? 'twijfel'
    : classify(matches)
  return {
    ...line,
    matches,
    status,
    // Alleen bij een duidelijke winnaar voorvullen. Bij twijfel blijft het leeg
    // zodat het reviewscherm om een keuze vraagt in plaats van er een te doen.
    artikelId: status === 'match' ? matches[0].artikelId : null,
  }
}

export function matchLines(
  lines: CandidateLine[],
  articles: ArticleCandidate[],
  aliases: AliasCandidate[] = [],
  relatieId: string | null = null,
  relatieNamen: Map<string, string> = new Map()
): CandidateLine[] {
  return lines.map((l) => matchLine(l, articles, aliases, relatieId, relatieNamen))
}
