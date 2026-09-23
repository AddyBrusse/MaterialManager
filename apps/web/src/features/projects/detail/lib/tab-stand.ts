/**
 * De toestand van elke tab, als één vocabulaire van vijf.
 *
 * Eén functie voor alle zes tabs, om dezelfde reden als `bouwAandacht`: zodra
 * elke tab zelf gaat oordelen of iets "erg" is, spreken de iconen elkaar tegen
 * op dezelfde balk. De kleuren zijn die van de bestaande drempels, zodat een
 * amber icoon op de tab hetzelfde betekent als een amber getal in de tabel.
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
  const { project: p, nacalc, openTodos } = bron
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
  }
}
