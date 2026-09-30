/**
 * De blauwe knop in de footer, per tab (besloten 2026-09-30).
 *
 * Elke tab met een eigen document loopt dezelfde route: maken → versturen →
 * door naar de volgende tab. De knop kijkt dus naar het document van de tab
 * waar je staat, niet naar de fase van het hele project. Eerder was de knop op
 * elke tab gelijk; op de Offertes-tab stond dan "Paklijst maken", en "Offerte
 * accepteren" bracht je naar de tab waar je al stond.
 *
 * Label en handeling komen hier samen uit één beslissing (`stap`). Toen ze op
 * twee plekken werden uitgerekend, zei de knop iets anders dan hij deed.
 *
 * Tabs zonder eigen document (Algemeen, Nacalculatie, Financieel,
 * Reserveringen, Aandacht) krijgen geen knop — alleen terugdraaien.
 */

import type { Project, ProjectVoortgang } from '@stockmanager/shared'
import { laatsteFactuur, laatstePaklijst, obInhoud, obWijzigingen } from '@stockmanager/shared'
import type { ActieVM, TabId } from '../types'
import { faseLabel, geaccepteerdeOfferte, stapTelling, teAccepteren } from './status'

export type Stap =
  | { soort: 'offerte-maken' }
  | { soort: 'offerte-versturen'; offerteId: string }
  | { soort: 'offerte-accepteren'; offerteId: string }
  | { soort: 'opdracht-versturen' }
  | { soort: 'paklijst-maken' }
  | { soort: 'paklijst-versturen'; paklijstId: string }
  | { soort: 'factuur-maken' }
  | { soort: 'factuur-versturen'; factuurId: string }
  | { soort: 'hervatten' }
  | { soort: 'naar'; tab: TabId }

/** `stap` is wat de knop doet; `null` als hij uit staat (dan zegt `reden` waarom). */
export type TabActie = ActieVM & { stap: Stap | null }

const kan = (label: string, stap: Stap): TabActie => ({ label, kan: true, stap })
const uit = (label: string, reden: string): TabActie => ({ label, kan: false, reden, stap: null })

export function tabActie(
  p: Project,
  v: ProjectVoortgang,
  tab: TabId,
  openVersie: string | null,
): TabActie | null {
  // Een stilgelegd project heeft maar één stap vooruit, op welke tab je ook staat.
  if (p.status === 'on_hold' || p.status === 'geannuleerd') {
    const woord = p.status === 'on_hold' ? 'hervatten' : 'heropenen'
    return kan(`Project ${woord} → ${faseLabel(p.statusVorige ?? 'concept')}`, { soort: 'hervatten' })
  }
  switch (tab) {
    case 'offertes':
      return offertesActie(p, openVersie)
    case 'opdracht':
      return opdrachtActie(p, openVersie)
    case 'productie':
      return productieActie(p, v)
    case 'documenten':
      return documentenActie(p, v)
    default:
      return null
  }
}

/**
 * Concept → versturen, verstuurd → accepteren, geaccepteerd → door.
 *
 * Staan er een concept én een verstuurde versie, dan telt de opengeklapte: die
 * heb je voor je, dus daar gaat de knop over.
 */
function offertesActie(p: Project, openVersie: string | null): TabActie {
  if (geaccepteerdeOfferte(p)) return kan('Naar opdracht', { soort: 'naar', tab: 'opdracht' })

  const open = p.offertes.find((o) => o.id === openVersie)
  const concept =
    open?.status === 'concept' ? open : p.offertes.find((o) => o.status === 'concept')
  const keuze = teAccepteren(p, openVersie)

  if (concept && (open === concept || !keuze.offerte)) {
    // Een directe opdracht wordt niet verstuurd; die maak je af op de Opdracht-tab.
    if (concept.direct) return kan('Opdracht maken', { soort: 'naar', tab: 'opdracht' })
    if (concept.regels.length === 0) {
      return uit('Offerte versturen', `v${concept.versie} heeft nog geen regels — voeg eerst artikelen toe.`)
    }
    return kan(`Offerte v${concept.versie} versturen`, { soort: 'offerte-versturen', offerteId: concept.id })
  }
  if (keuze.offerte) {
    return kan(`Offerte v${keuze.offerte.versie} accepteren`, {
      soort: 'offerte-accepteren',
      offerteId: keuze.offerte.id,
    })
  }
  if (p.offertes.some((o) => o.status === 'verzonden')) return uit('Offerte accepteren', keuze.reden)
  return kan(p.offertes.length === 0 ? 'Offerte maken' : 'Nieuwe versie maken', { soort: 'offerte-maken' })
}

/** Versturen → (gewijzigd? opnieuw versturen) → door naar productie. */
function opdrachtActie(p: Project, openVersie: string | null): TabActie {
  const ob = p.opdrachtbevestiging
  if (!ob) {
    // De lege tab toont de verstuurde versies; de knop accepteert net als op
    // de Offertes-tab, en anders is de offerte nog niet zover.
    const keuze = teAccepteren(p, openVersie)
    if (keuze.offerte) {
      return kan(`Offerte v${keuze.offerte.versie} accepteren`, {
        soort: 'offerte-accepteren',
        offerteId: keuze.offerte.id,
      })
    }
    return kan('Naar offertes', { soort: 'naar', tab: 'offertes' })
  }
  if (!ob.verzondenOp) return kan('Opdracht versturen', { soort: 'opdracht-versturen' })
  if (opdrachtGewijzigd(p)) return kan('Opdracht opnieuw versturen', { soort: 'opdracht-versturen' })
  return kan('Naar productie', { soort: 'naar', tab: 'productie' })
}

/** Wijkt de opdracht af van wat de klant laatst kreeg? Zelfde vergelijking als de kaart. */
export function opdrachtGewijzigd(p: Project): boolean {
  const log = p.opdrachtbevestiging?.verzendingen ?? []
  const laatste = log[log.length - 1]
  const nu = obInhoud(p)
  return Boolean(laatste && nu && obWijzigingen(laatste.inhoud, nu).length > 0)
}

/**
 * Welke stap je afmeldt kiest een mens per order, dus die kiest de knop niet.
 * Hij doet het document dat uit de productie komt: de paklijst. De poort is
 * "er ligt iets klaar", niet "alles is af" — bij deelleveringen gaat de eerste
 * pakbon de deur uit terwijl de rest nog op de machine staat.
 */
function productieActie(p: Project, v: ProjectVoortgang): TabActie {
  if (p.productieOrders.length === 0) {
    return uit('Paklijst maken', 'Er zijn nog geen productieorders — die ontstaan bij het accepteren.')
  }
  if (v.klaar > 0) return kan(`Paklijst maken (${v.klaar} klaar)`, { soort: 'paklijst-maken' })
  if (v.teMaken === 0 && v.geleverd > 0) return kan('Naar documenten', { soort: 'naar', tab: 'documenten' })
  const { gereed, totaal } = stapTelling(p.productieOrders)
  const openStappen = totaal - gereed
  return uit(
    'Paklijst maken',
    v.teMaken > 0
      ? `Er ligt nog niets klaar om te leveren — ${v.teMaken} nog te maken.`
      : openStappen > 0
        ? `${openStappen} van de ${totaal} productiestappen zijn nog niet gereed.`
        : 'Alles wat gemaakt is, is al geleverd.',
  )
}

/**
 * Paklijst en factuur, in de volgorde waarin ze de deur uit gaan. Wat al klaar
 * ligt om te versturen gaat voor wat nog gemaakt moet worden.
 */
function documentenActie(p: Project, v: ProjectVoortgang): TabActie {
  const pl = laatstePaklijst(p)
  if (pl && !pl.verzondenOp) return kan(`Paklijst ${pl.id} versturen`, { soort: 'paklijst-versturen', paklijstId: pl.id })
  const f = laatsteFactuur(p)
  if (f && !f.verzondenOp) return kan(`Factuur ${f.id} versturen`, { soort: 'factuur-versturen', factuurId: f.id })
  if (v.teFactureren > 0 && p.paklijsten.some((x) => x.verzondenOp)) {
    return kan(`Factuur maken (${v.teFactureren} stuks)`, { soort: 'factuur-maken' })
  }
  if (v.klaar > 0) return kan(`Paklijst maken (${v.klaar} klaar)`, { soort: 'paklijst-maken' })
  if (v.besteld > 0 && v.gefactureerd >= v.besteld) {
    return uit('Project afgerond', 'Alles is geleverd, gefactureerd en verstuurd — dit project is rond.')
  }
  return uit('Paklijst maken', 'Er ligt nog niets klaar om te leveren.')
}
