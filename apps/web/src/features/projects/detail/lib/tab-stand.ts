/**
 * De toestand van elke tab, als één vocabulaire van vijf.
 *
 * Eén functie voor alle tabs, om dezelfde reden als `bouwAandacht`: zodra elke
 * tab zelf gaat oordelen of iets "erg" is, spreken de signalen elkaar tegen op
 * dezelfde balk. De kleuren zijn die van de bestaande drempels, zodat amber op
 * de tab hetzelfde betekent als een amber getal in de tabel.
 *
 * Sinds de tabbalk geen iconen meer draagt is deze stand de énige bron van de
 * kleur op de indicatie rechts van de tabnaam.
 */

import type { Project } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import type { TabId } from '../types'
import { dagenTot } from './format'
import { geaccepteerdeOfferte, geldendeOfferte, stapTelling } from './status'

export type TabStand =
  /** Bestaat nog niet. */
  | 'leeg'
  /** Loopt. */
  | 'bezig'
  /** Af. */
  | 'gereed'
  /** Vraagt iets van een mens. */
  | 'aandacht'
  /** Wacht op iets buiten dit scherm — niemand hoeft nu iets te doen. */
  | 'wacht'

export interface TabStandBron {
  project: Project
  nacalc: ProjectNacalculatie | null
  /** Open todo's van dít project. */
  openTodos: number
  /** Reserveringen van dit project: hoeveel er zijn, en hoeveel er wachten. */
  reserveringen: { totaal: number; wacht: number }
  /** Aandachtspunten: hoeveel er zijn, en hoeveel daarvan rood. */
  aandacht: { totaal: number; rood: number }
}

/**
 * Wacht een order op materiaal? Dat is geen aandacht maar geduld: er is niets
 * te doen tot de datum verstrijkt, dus het icoon moet niet om actie schreeuwen.
 */
function wachtOpMateriaal(p: Project): boolean {
  return p.productieOrders.some((o) =>
    o.stappen.some((s) => {
      if (s.gereedOp || !s.notBefore) return false
      const n = dagenTot(s.notBefore)
      return n !== null && n > 0
    }),
  )
}

export function bouwTabStanden(bron: TabStandBron): Record<TabId, TabStand> {
  const { project: p, nacalc, openTodos, reserveringen, aandacht } = bron
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const acc = geaccepteerdeOfferte(p)
  const geldend = geldendeOfferte(p)
  const ob = p.opdrachtbevestiging

  // Een offerte die binnen een week vervalt vraagt om nabellen; dat is de enige
  // reden dat deze tab uit zichzelf aandacht trekt.
  const vervaltBinnenkort = (() => {
    if (!geldend || geldend.status !== 'verzonden' || !geldend.geldigTot) return false
    const n = dagenTot(geldend.geldigTot)
    return n !== null && n <= 7
  })()

  const afw = nacalc?.verschilPct ?? null

  return {
    algemeen: p.notities.trim() ? 'bezig' : 'leeg',

    offertes: p.offertes.length === 0 ? 'leeg' : vervaltBinnenkort ? 'aandacht' : acc ? 'gereed' : 'bezig',

    // Een opdracht met een openstaande materiaaltodo is niet "klaar", ook al is
    // de OB verstuurd: er moet nog iemand een staaf kiezen.
    opdracht: !ob ? 'leeg' : openTodos > 0 ? 'aandacht' : ob.verzondenOp ? 'gereed' : 'bezig',

    productie:
      totaal === 0
        ? 'leeg'
        : gereed === totaal
          ? 'gereed'
          : wachtOpMateriaal(p)
            ? 'wacht'
            : 'bezig',

    nacalculatie: !nacalc
      ? 'leeg'
      : afw !== null && Math.abs(afw) >= 15
        ? 'aandacht'
        : nacalc.gemeten
          ? 'gereed'
          : 'bezig',

    documenten:
      p.facturen.length > 0
        ? 'gereed'
        : p.paklijsten.length > 0 || ob
          ? 'bezig'
          : geldend
            ? 'bezig'
            : 'leeg',

    // Financieel deelt de drempel met Nacalculatie: hetzelfde verschil hoort
    // niet op de ene tab amber te zijn en op de andere niet.
    financieel: !geldend
      ? 'leeg'
      : afw !== null && Math.abs(afw) >= 15
        ? 'aandacht'
        : p.facturen.length > 0
          ? 'gereed'
          : 'bezig',

    // Een reservering die op materiaal wacht is geduld, geen actie — zie
    // `wachtOpMateriaal` hierboven, dezelfde redenering.
    reserveringen:
      reserveringen.totaal === 0 ? 'leeg' : reserveringen.wacht > 0 ? 'wacht' : 'gereed',

    // Deze tab ís het aandachtssignaal; hij kent dus maar twee standen plus
    // leeg. Rood of amber bepaalt `bouwAandacht`, niet deze functie.
    aandacht:
      aandacht.totaal === 0 && openTodos === 0
        ? 'leeg'
        : aandacht.rood > 0
          ? 'aandacht'
          : 'bezig',
  }
}
