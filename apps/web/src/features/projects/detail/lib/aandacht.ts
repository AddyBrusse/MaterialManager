/**
 * De aandachtregels uit §7.1.
 *
 * Eén functie, bewust. De FactBox *Aandacht*, de kleur van de kopfacetten en de
 * tabbadges moeten hetzelfde zeggen; zodra elk van die drie zelf gaat oordelen
 * over "is dit erg", spreken ze elkaar tegen op het scherm.
 */

import type { Project, Todo } from '@stockmanager/shared'
import type { AandachtVM, Ernst } from '../types'
import { datum, dagenTot } from './format'
import { geldendeOfferte } from './status'

const VOLGORDE: Record<Ernst, number> = { rood: 0, amber: 1, blauw: 2 }

export interface AandachtBron {
  project: Project
  todos: Todo[]
  /** Grootste afwijking per post, uit de nacalculatie. */
  nacalculatieAfwijkingPct: number | null
  opslagMislukt: boolean
}

const VOOR_VERZONDEN = new Set(['concept', 'offerte', 'bevestigd', 'productie', 'paklijst'])

export function bouwAandacht(bron: AandachtBron): AandachtVM[] {
  const { project: p, todos, nacalculatieAfwijkingPct, opslagMislukt } = bron
  const uit: AandachtVM[] = []

  if (opslagMislukt) {
    uit.push({
      ernst: 'rood',
      titel: 'Laatste wijziging niet opgeslagen',
      toelichting: 'De server heeft de wijziging niet bevestigd — probeer opnieuw op te slaan.',
    })
  }

  const dagenLever = dagenTot(p.levertijdDatum)
  if (dagenLever !== null && dagenLever < 0 && VOOR_VERZONDEN.has(p.status)) {
    uit.push({
      ernst: 'rood',
      titel: 'Levertijd verstreken',
      toelichting: `${Math.abs(dagenLever)} dagen over de toezegging van ${datum(p.levertijdDatum)}`,
    })
  }

  const geldend = geldendeOfferte(p)
  if (geldend?.status === 'verzonden' && geldend.geldigTot) {
    const n = dagenTot(geldend.geldigTot)
    if (n !== null && n <= 7) {
      uit.push({
        ernst: 'amber',
        titel: n < 0 ? 'Offerte is vervallen' : `Offerte vervalt over ${n} dagen`,
        toelichting: `${geldend.id} — geldig tot ${datum(geldend.geldigTot)}`,
      })
    }
  }

  for (const t of todos) {
    if (t.done) continue
    if (t.soort !== 'materiaal_selecteren') continue
    uit.push({
      ernst: 'amber',
      titel: 'Todo open: materiaal kiezen',
      toelichting: t.title,
    })
  }

  for (const order of p.productieOrders) {
    for (const stap of order.stappen) {
      if (stap.gereedOp || !stap.notBefore) continue
      const n = dagenTot(stap.notBefore)
      if (n !== null && n > 0) {
        uit.push({
          ernst: 'amber',
          titel: `${order.id} wacht op materiaal`,
          toelichting: `${stap.naam} — niet eerder dan ${datum(stap.notBefore)}`,
        })
        break // één regel per order; anders vult één order de hele lijst
      }
    }
  }

  // Met deelleveringen staan er meerdere facturen open. Elk zijn eigen regel:
  // "twee facturen over datum" samenvatten tot één zin verbergt precies welke
  // het is, en dat is het enige wat je wilt weten om te bellen. Creditnota's
  // hebben geen vervaldatum die iemand moet bewaken.
  for (const f of p.facturen) {
    if (f.soort === 'credit' || !f.vervaldatum) continue
    const n = dagenTot(f.vervaldatum)
    if (n === null) continue
    if (n < 0) {
      uit.push({
        ernst: 'rood',
        titel: `Factuur ${f.id} over vervaldatum`,
        toelichting: `vervallen op ${datum(f.vervaldatum)} — ${Math.abs(n)} dagen geleden`,
      })
    } else if (n <= 14) {
      uit.push({
        ernst: 'amber',
        titel: `Factuur ${f.id} open tot ${datum(f.vervaldatum)}`,
        toelichting: 'of er betaald is, weet dit scherm niet',
      })
    }
  }

  if (nacalculatieAfwijkingPct !== null && nacalculatieAfwijkingPct >= 15) {
    uit.push({
      ernst: 'blauw',
      titel: 'Kostprijs loopt boven calculatie',
      toelichting: `${nacalculatieAfwijkingPct.toFixed(1).replace('.', ',')} % boven de calculatie`,
    })
  }

  if (p.status === 'on_hold') {
    uit.push({
      ernst: 'amber',
      titel: 'Project staat on hold',
      toelichting: 'Alle documentacties zijn geblokkeerd tot het hervat wordt.',
    })
  }

  return uit.sort((a, b) => VOLGORDE[a.ernst] - VOLGORDE[b.ernst])
}
