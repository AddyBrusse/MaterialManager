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

export type StapToestand = 'klaar' | 'deels' | 'open' | 'uit'

export interface Stap {
  naam: 'Offerte' | 'Productie' | 'Levering' | 'Factuur'
  toestand: StapToestand
  uitleg: string
}

/**
 * Dezelfde vier stappen als op de projectpagina, maar met "deels": een
 * deellevering of een deelfactuur is gezien worden waard op het overzicht.
 * De factuurstap is pas klaar als alles gefactureerd én betaald is.
 */
export function stappenVan(p: Project): Stap[] {
  const v = berekenVoortgang(p)
  const opdracht = Boolean(p.opdrachtbevestiging) || p.offertes.some((o) => o.status === 'geaccepteerd')
  const verstuurd = p.offertes.some((o) => o.status === 'verzonden')

  const offerte: Stap = opdracht
    ? { naam: 'Offerte', toestand: 'klaar', uitleg: 'geaccepteerd' }
    : verstuurd
      ? { naam: 'Offerte', toestand: 'deels', uitleg: 'verstuurd, wacht op klant' }
      : { naam: 'Offerte', toestand: p.offertes.length ? 'open' : 'uit', uitleg: p.offertes.length ? 'concept' : 'nog geen offerte' }

  if (!opdracht || v.besteld === 0) {
    return [
      offerte,
      { naam: 'Productie', toestand: 'uit', uitleg: 'nog geen opdracht' },
      { naam: 'Levering', toestand: 'uit', uitleg: 'nog geen opdracht' },
      { naam: 'Factuur', toestand: 'uit', uitleg: 'nog geen opdracht' },
    ]
  }

  const deel = (gedaan: number, totaal: number) => (gedaan >= totaal ? 'klaar' : gedaan > 0 ? 'deels' : 'open')
  const nogOpen = openstaandBedrag(p)
  const factuur = deel(v.gefactureerd, v.besteld)
  return [
    offerte,
    { naam: 'Productie', toestand: deel(v.gemaakt, v.besteld), uitleg: `${v.gemaakt} van ${v.besteld} gemaakt` },
    { naam: 'Levering', toestand: deel(v.verstuurd, v.besteld), uitleg: `${v.verstuurd} van ${v.besteld} geleverd` },
    {
      naam: 'Factuur',
      // Alles gefactureerd maar nog niet betaald is nog niet af.
      toestand: factuur === 'klaar' && nogOpen > 0 ? 'deels' : factuur,
      uitleg: `${v.gefactureerd} van ${v.besteld} gefactureerd${nogOpen > 0 ? ', nog niet alles betaald' : ''}`,
    },
  ]
}
