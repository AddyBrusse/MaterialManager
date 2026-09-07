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
  tekeningLoose: 0.75,
  naamExact: 0.6,
  naamDeel: 0.45,
} as const

/** Onder deze score is een treffer geen suggestie waard. */
const MIN_SCORE = 0.45
/** Zoveel moet de beste van de tweede winnen, anders is het twijfel. */
const CLEAR_WIN_MARGIN = 0.1

function scoreArticle(
  line: CandidateLine,
  article: ArticleCandidate,
  aliasArticleIds: Set<string>
): ArticleMatch | null {
  const base = { artikelId: article.id, naam: article.naam, tekening: article.tekening ?? null, rev: article.rev ?? null }

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

export function matchLine(
  line: CandidateLine,
  articles: ArticleCandidate[],
  aliases: AliasCandidate[] = []
): CandidateLine {
  const ref = normalizeRef(line.tekening)
  const aliasArticleIds = new Set(
    aliases.filter((a) => normalizeRef(a.externalRef) === ref && ref !== '').map((a) => a.articleId)
  )

  const matches = articles
    .map((a) => scoreArticle(line, a, aliasArticleIds))
    .filter((m): m is ArticleMatch => m !== null && m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam))
    .slice(0, 3)

  const status = classify(matches)
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
  aliases: AliasCandidate[] = []
): CandidateLine[] {
  return lines.map((l) => matchLine(l, articles, aliases))
}
