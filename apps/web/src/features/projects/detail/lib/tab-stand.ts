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
import { berekenVoortgang, isVervallen, openstaandBedrag } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import type { TabId } from '../types'
import { dagenTot } from './format'
import { geaccepteerdeOfferte, geldendeOfferte, productieAf } from './status'
import { opdrachtGewijzigd } from './tab-actie'
import { afwijkingKleur } from './nacalculatie'

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
  /** Aandachtspunten: hoeveel er zijn, en hoeveel daarvan rood. */
  aandacht: { totaal: number; rood: number }
}

/**
 * Wacht een order op materiaal? Dat is geen aandacht maar geduld: er is niets
 * te doen tot de datum verstrijkt, dus het icoon moet niet om actie schreeuwen.
 */
function wachtOpMateriaal(p: Project): boolean {
  return p.productieOrders.some((o) => !!o.wachtOpMateriaal && o.status !== 'gereed' && o.status !== 'gestopt')
}

export function bouwTabStanden(bron: TabStandBron): Record<TabId, TabStand> {
  const { project: p, nacalc, openTodos, aandacht } = bron
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
  // Duurder gemaakt dan berekend (2026-10-01): elke overschrijding, geen drempel.
  const teDuur = Boolean(nacalc?.gemeten) && afwijkingKleur(afw) === 'dgr'

  return {
    // Aandacht, todo's, geld en materiaal staan sinds 2026-10-05 op Algemeen
    // (de eigen tabs zijn weg). Rood maakt deze tab dus rood.
    algemeen:
      aandacht.rood > 0
        ? 'aandacht'
        : aandacht.totaal > 0 || openTodos > 0 || p.notities.trim()
          ? 'bezig'
          : 'leeg',

    offertes: p.offertes.length === 0 ? 'leeg' : vervaltBinnenkort ? 'aandacht' : acc ? 'gereed' : 'bezig',

    // Het tabje zegt of het document de deur uit is (2026-09-30). Een open
    // materiaal-todo kleurde hem eerder oranje terwijl de klant de opdracht al
    // had; die todo staat in de Materiaal-kolom en op de Aandacht-tab. Wél
    // oranje: gewijzigd na versturen — dan heeft de klant een oude stand.
    opdracht: !ob ? 'leeg' : opdrachtGewijzigd(p) ? 'aandacht' : ob.verzondenOp ? 'gereed' : 'bezig',

    productie:
      p.productieOrders.length === 0
        ? 'leeg'
        : // Nog vrij te geven: dat vraagt iets van een mens op kantoor.
          p.productieOrders.some((o) => o.status === 'voorbereiding')
          ? 'aandacht'
          : productieAf(p.productieOrders)
          ? 'gereed'
          : wachtOpMateriaal(p)
            ? 'wacht'
            : 'bezig',

    nacalculatie: !nacalc
      ? 'leeg'
      : teDuur
        ? 'aandacht'
        : nacalc.gemeten
          ? 'gereed'
          : 'bezig',

    // Af zodra er een factuur verstuurd is: dan is de route van het project rond.
    // Een concept dat nog weg moet vraagt iets; alles geleverd is af.
    pakbonnen: p.paklijsten.some((pl) => !pl.verzondenOp)
      ? 'aandacht'
      : p.status === 'verzonden' || p.status === 'gefactureerd'
        ? 'gereed'
        : p.paklijsten.length > 0 || berekenVoortgang(p).klaar > 0
          ? 'bezig'
          : 'leeg',

    // Vervallen of een concept vraagt iets; alles gefactureerd én betaald is af.
    facturen: p.facturen.some((f) => isVervallen(f) || !f.verzondenOp)
      ? 'aandacht'
      : p.facturen.some((f) => f.soort === 'factuur') && openstaandBedrag(p) === 0 && berekenVoortgang(p).teFactureren === 0
        ? 'gereed'
        : p.facturen.length > 0 || berekenVoortgang(p).teFactureren > 0
          ? 'bezig'
          : 'leeg',

    documenten:
      p.facturen.some((f) => f.soort !== 'credit' && f.verzondenOp)
        ? 'gereed'
        : p.paklijsten.length > 0 || ob
          ? 'bezig'
          : geldend
            ? 'bezig'
            : 'leeg',
  }
}
