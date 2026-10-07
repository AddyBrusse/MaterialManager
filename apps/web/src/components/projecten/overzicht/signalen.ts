import { berekenVoortgang, isVervallen, openstaandBedrag, type Project } from '@stockmanager/shared'

/**
 * Wat er per project te doen of te weten is, voor de tegels en filters op het
 * projectenoverzicht (2026-10-05). Eén functie, zodat een tegel en zijn filter
 * nooit iets anders tellen. Uit de voortgang (`berekenVoortgang`) en de
 * facturen, niet uit de projectstatus: die zegt "Productie" ook als er al
 * de helft geleverd is.
 */

export type SignaalId =
  | 'geenReactie'
  | 'offerteVerloopt'
  | 'overLevertijd'
  | 'levertijdWeek'
  | 'vrijTeGeven'
  | 'wachtMateriaal'
  | 'teLeveren'
  | 'teFactureren'
  | 'openstaand'
  | 'vervallen'
  | 'onHold'

export const SIGNAAL_LABEL: Record<SignaalId, string> = {
  geenReactie: 'Geen reactie op offerte',
  offerteVerloopt: 'Offerte verloopt',
  overLevertijd: 'Over levertijd',
  levertijdWeek: 'Levertijd deze week',
  vrijTeGeven: 'Vrij te geven',
  wachtMateriaal: 'Wacht op materiaal',
  teLeveren: 'Te leveren',
  teFactureren: 'Te factureren',
  openstaand: 'Openstaand',
  vervallen: 'Vervallen factuur',
  onHold: 'On hold',
}

export interface Signalen {
  /** Dagen sinds de oudste verstuurde offerte zonder antwoord; null als er geen openstaat. */
  offerteDagenUit: number | null
  geenReactie: boolean
  offerteVerloopt: boolean
  overLevertijd: boolean
  levertijdWeek: boolean
  vrijTeGeven: number
  wachtMateriaal: boolean
  /** Stuks die gemaakt zijn en nog niet op een pakbon staan. */
  teLeveren: number
  /** In euro excl. btw: verstuurd en nog niet gefactureerd. */
  teFactureren: number
  /** In euro incl. btw: verstuurde facturen die nog niet betaald zijn. */
  openstaand: number
  vervallen: number
  onHold: boolean
}

/** "2026-10-05" in de eigen tijdzone — vergelijkt als tekst met de datums in het model. */
export function dagVan(d: Date): string {
  const tw = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${tw(d.getMonth() + 1)}-${tw(d.getDate())}`
}

function plusDagen(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const DAG_MS = 86_400_000

export function signalenVan(p: Project, nu: Date, nabelDagen: number): Signalen {
  const vandaag = dagVan(nu)
  const overWeek = dagVan(plusDagen(nu, 7))
  const actief = p.status !== 'geannuleerd'
  const v = berekenVoortgang(p)

  // Een offerte "staat uit" als hij verstuurd is en nog geen antwoord heeft:
  // niet geaccepteerd, niet vervallen, en er is nog geen opdracht.
  const uit = p.opdrachtbevestiging ? [] : p.offertes.filter((o) => o.status === 'verzonden' && o.verzondenOp)
  const oudste = uit.reduce<string | null>((m, o) => (!m || o.verzondenOp! < m ? o.verzondenOp! : m), null)
  const offerteDagenUit = oudste ? Math.floor((nu.getTime() - new Date(oudste).getTime()) / DAG_MS) : null

  const nogTeLeveren = v.besteld > 0 && v.verstuurd < v.besteld
  const lever = p.levertijdDatum?.slice(0, 10) ?? null

  return {
    offerteDagenUit,
    geenReactie: actief && offerteDagenUit !== null && offerteDagenUit >= nabelDagen,
    offerteVerloopt: actief && uit.some((o) => o.geldigTot != null && o.geldigTot.slice(0, 10) <= overWeek),
    overLevertijd: actief && nogTeLeveren && lever !== null && lever < vandaag,
    levertijdWeek: actief && nogTeLeveren && lever !== null && lever >= vandaag && lever <= overWeek,
    vrijTeGeven: p.productieOrders.filter((o) => o.status === 'voorbereiding').length,
    // Afgeleid door de server (2026-10-07): er staat materiaal in bestelling.
    wachtMateriaal: p.productieOrders.some((o) => !!o.wachtOpMateriaal && o.status !== 'gereed' && o.status !== 'gestopt'),
    teLeveren: v.klaar,
    teFactureren: v.teFacturerenBedrag,
    openstaand: openstaandBedrag(p),
    vervallen: p.facturen.filter((f) => isVervallen(f, nu)).length,
    onHold: p.status === 'on_hold',
  }
}

/** Heeft dit project het signaal — de vraag die een tegel en een filter stellen. */
export function heeftSignaal(s: Signalen, id: SignaalId): boolean {
  switch (id) {
    case 'vrijTeGeven':
      return s.vrijTeGeven > 0
    case 'teLeveren':
      return s.teLeveren > 0
    case 'teFactureren':
      return s.teFactureren > 0
    case 'openstaand':
      return s.openstaand > 0
    case 'vervallen':
      return s.vervallen > 0
    default:
      return s[id]
  }
}

// ── De vier stappen van de voortgangskolom ─────────────────────────────────

export type StapToestand = 'klaar' | 'deels' | 'open' | 'uit' | 'overgeslagen'

export const STAP_NAMEN = ['Concept', 'Offerte', 'Geaccepteerd', 'Opdracht', 'In productie', 'Paklijst', 'Factuur'] as const
export type StapNaam = typeof STAP_NAMEN[number]

export interface Stap {
  naam: StapNaam
  toestand: StapToestand
  uitleg: string
}

/**
 * De zeven stappen van een project (2026-10-07), op het overzicht én op de
 * projectpagina: Concept · Offerte · Geaccepteerd · Opdracht · In productie ·
 * Paklijst · Factuur. Uit de documenten en de voortgang, niet uit de status.
 *
 * - "deels" (half bolletje): productie loopt, een deellevering, deels
 *   gefactureerd, een opdrachtbevestiging in concept. Factuur is pas klaar als
 *   alles gefactureerd **én betaald** is.
 * - "overgeslagen": bij een directe opdracht (zonder offerte) zijn Concept,
 *   Offerte en Geaccepteerd nooit gebeurd.
 * - "uit": nog niet aan de beurt. Alleen de eerste stap die nog moet is "open".
 */
export function stappenVan(p: Project): Stap[] {
  const v = berekenVoortgang(p)
  const acc = p.offertes.find((o) => o.status === 'geaccepteerd')
  const direct = Boolean(acc?.direct) || (p.offertes.length === 0 && Boolean(p.opdrachtbevestiging))
  const verstuurd = Boolean(acc) || p.offertes.some((o) => o.status === 'verzonden' || o.verzondenOp)
  const ob = p.opdrachtbevestiging
  const deel = (gedaan: number, totaal: number): StapToestand =>
    totaal === 0 ? 'open' : gedaan >= totaal ? 'klaar' : gedaan > 0 ? 'deels' : 'open'
  const nogOpen = openstaandBedrag(p)
  const factuur = deel(v.gefactureerd, v.besteld)
  const over = (naam: StapNaam): Stap => ({ naam, toestand: 'overgeslagen', uitleg: 'overgeslagen: directe opdracht' })

  const stappen: Stap[] = [
    direct ? over('Concept') : { naam: 'Concept', toestand: 'klaar', uitleg: p.offertes.length ? 'offerte gemaakt' : 'project aangemaakt' },
    direct ? over('Offerte') : verstuurd
      ? { naam: 'Offerte', toestand: 'klaar', uitleg: 'verstuurd' }
      : { naam: 'Offerte', toestand: 'open', uitleg: p.offertes.length ? 'offerte in concept' : 'nog geen offerte' },
    direct ? over('Geaccepteerd') : acc
      ? { naam: 'Geaccepteerd', toestand: 'klaar', uitleg: 'door de klant geaccepteerd' }
      : { naam: 'Geaccepteerd', toestand: 'open', uitleg: verstuurd ? 'wacht op de klant' : 'nog niet' },
    ob?.verzondenOp
      ? { naam: 'Opdracht', toestand: 'klaar', uitleg: 'opdrachtbevestiging verstuurd' }
      : { naam: 'Opdracht', toestand: ob ? 'deels' : 'open', uitleg: ob ? 'opdrachtbevestiging in concept' : 'nog geen opdrachtbevestiging' },
    { naam: 'In productie', toestand: deel(v.gemaakt, v.besteld), uitleg: `${v.gemaakt} van ${v.besteld} gemaakt` },
    { naam: 'Paklijst', toestand: deel(v.verstuurd, v.besteld), uitleg: `${v.verstuurd} van ${v.besteld} geleverd` },
    {
      naam: 'Factuur',
      // Alles gefactureerd maar nog niet betaald is nog niet af.
      toestand: factuur === 'klaar' && nogOpen > 0 ? 'deels' : factuur,
      uitleg: `${v.gefactureerd} van ${v.besteld} gefactureerd${nogOpen > 0 ? ', nog niet alles betaald' : ''}`,
    },
  ]

  // Na de eerste stap die nog helemaal moet, is de rest nog niet aan de beurt.
  const eerste = stappen.findIndex((s) => s.toestand === 'open')
  return stappen.map((s, i) => (eerste >= 0 && i > eerste && s.toestand === 'open' ? { ...s, toestand: 'uit' } : s))
}

/**
 * De status in dezelfde zeven woorden als de bolletjes (2026-10-07). De
 * opgeslagen status blijft wat hij was (de server zet hem, filters gebruiken
 * hem); alleen het woord volgt de stappen. "Bevestigd" is Geaccepteerd tot de
 * opdrachtbevestiging verstuurd is, of meteen Opdracht bij een directe opdracht.
 * Gereed voor levering en geleverd zijn allebei Paklijst.
 */
export function statusWoord(p: Pick<Project, 'status' | 'offertes' | 'opdrachtbevestiging'>): string {
  switch (p.status) {
    case 'bevestigd': {
      const direct = p.offertes.some((o) => o.status === 'geaccepteerd' && o.direct) || p.offertes.length === 0
      return direct || p.opdrachtbevestiging?.verzondenOp ? 'Opdracht' : 'Geaccepteerd'
    }
    default:
      return STATUS_WOORD[p.status]
  }
}

export const STATUS_WOORD: Record<Project['status'], string> = {
  concept: 'Concept',
  offerte: 'Offerte',
  bevestigd: 'Geaccepteerd',
  productie: 'In productie',
  paklijst: 'Paklijst',
  verzonden: 'Paklijst',
  gefactureerd: 'Factuur',
  on_hold: 'On hold',
  geannuleerd: 'Geannuleerd',
}
