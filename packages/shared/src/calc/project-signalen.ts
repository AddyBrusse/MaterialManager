/**
 * Wat er per project te doen of te weten is (2026-10-05, naar shared
 * 2026-10-28). Eén functie voor de tegels en filters op het projectenoverzicht
 * én voor de opvolgingsmeldingen (`opvolging.ts`), zodat een tegel, het
 * belletje en de assistent nooit iets anders tellen. Uit de voortgang
 * (`berekenVoortgang`) en de facturen, niet uit de projectstatus: die zegt
 * "Productie" ook als er al de helft geleverd is.
 */
import type { Offerte, Project } from '../schemas/project'
import { berekenVoortgang } from './projectvoortgang'
import { isVervallen, openstaandBedrag } from './factuur'
import { vandaagIso } from './inkoop-planning'

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

function plusDagen(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const DAG_MS = 86_400_000

/**
 * Een offerte "staat uit" als hij verstuurd is en nog geen antwoord heeft:
 * niet geaccepteerd, niet vervallen, en er is nog geen opdracht.
 */
export function uitstaandeOffertes(p: Project): Offerte[] {
  return p.opdrachtbevestiging ? [] : p.offertes.filter((o) => o.status === 'verzonden' && o.verzondenOp)
}

/** Een uitstaande offerte die binnen een week verloopt (of al verlopen is). */
export function verlooptBinnenWeek(o: Offerte, nu: Date): boolean {
  return o.geldigTot != null && o.geldigTot.slice(0, 10) <= vandaagIso(plusDagen(nu, 7))
}

/** Niet alles verstuurd en de afgesproken leverdatum is voorbij. */
export function isOverLevertijd(p: Project, nu: Date): boolean {
  const v = berekenVoortgang(p)
  const lever = p.levertijdDatum?.slice(0, 10) ?? null
  return p.status !== 'geannuleerd' && v.besteld > 0 && v.verstuurd < v.besteld && lever !== null && lever < vandaagIso(nu)
}

export function signalenVan(p: Project, nu: Date, nabelDagen: number): Signalen {
  const vandaag = vandaagIso(nu)
  const overWeek = vandaagIso(plusDagen(nu, 7))
  const actief = p.status !== 'geannuleerd'
  const v = berekenVoortgang(p)

  const uit = uitstaandeOffertes(p)
  const oudste = uit.reduce<string | null>((m, o) => (!m || o.verzondenOp! < m ? o.verzondenOp! : m), null)
  const offerteDagenUit = oudste ? Math.floor((nu.getTime() - new Date(oudste).getTime()) / DAG_MS) : null

  const nogTeLeveren = v.besteld > 0 && v.verstuurd < v.besteld
  const lever = p.levertijdDatum?.slice(0, 10) ?? null

  return {
    offerteDagenUit,
    geenReactie: actief && offerteDagenUit !== null && offerteDagenUit >= nabelDagen,
    offerteVerloopt: actief && uit.some((o) => verlooptBinnenWeek(o, nu)),
    overLevertijd: isOverLevertijd(p, nu),
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
