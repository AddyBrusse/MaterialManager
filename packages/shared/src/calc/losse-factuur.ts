import type { LosseRegelInvoer, VerkoopFactuur, VerkoopFactuurRegel } from '../schemas/verkoopfactuur'
import { factuurNaam } from './factuur-nummer'

/**
 * Losse facturen en credits (2026-11-18): bij de klant, zonder project. Voor
 * artikelen die op voorraad liggen en tegen een afgesproken prijs gaan, en voor
 * een credit zonder factuur (prijscorrectie, bonus). De rest — versturen,
 * nummer, betaald — volgt dezelfde regels als een projectfactuur (`factuur.ts`).
 *
 * Een regel wordt herkend aan zijn artikel, of bij een vrije regel aan zijn
 * omschrijving. Zo kan een credit per regel bijhouden wat er nog openstaat,
 * zoals een projectcredit dat per orderregel doet.
 */

const rond = (n: number) => Math.round(n * 100) / 100

export function regelSleutel(r: { artikelId: string | null; naam: string }): string {
  return r.artikelId ?? `vrij:${r.naam.trim().toLowerCase()}`
}

/** Van invoer naar regels: totaal afgerond op centen. */
export function losseRegels(invoer: LosseRegelInvoer[]): VerkoopFactuurRegel[] {
  return invoer.map((r) => ({
    offerteRegelId: null,
    artikelId: r.artikelId,
    naam: r.naam.trim(),
    qty: r.qty,
    eenheid: r.eenheid || 'st',
    verkoopprijs: r.verkoopprijs,
    totaal: rond(r.qty * r.verkoopprijs),
  }))
}

/** Waarom deze regels niet kunnen, of null. Leeg mag alleen bij een tussenstand van een concept. */
export function waaromNietLosseRegels(regels: LosseRegelInvoer[], opties: { leegMag?: boolean } = {}): string | null {
  if (regels.length === 0) return opties.leegMag ? null : 'Zet minstens één regel op de factuur.'
  const gezien = new Set<string>()
  for (const r of regels) {
    const naam = r.naam?.trim()
    if (!naam) return 'Een regel heeft nog geen omschrijving.'
    if (!(r.qty > 0)) return `${naam}: vul een aantal groter dan 0 in, of haal de regel weg.`
    if (!(r.verkoopprijs >= 0)) return `${naam}: de prijs kan niet negatief zijn.`
    const s = regelSleutel(r)
    if (gezien.has(s)) return `${naam} staat twee keer op de factuur. Tel de aantallen samen op één regel.`
    gezien.add(s)
  }
  return null
}

/** Wat er van een losse factuur per regel nog te crediteren valt; `zonder` = deze credit niet meetellen. */
export function losseCreditOpen(facturen: VerkoopFactuur[], factuurId: string, zonder?: string): Map<string, number> {
  const bron = facturen.find((f) => f.id === factuurId)
  const open = new Map<string, number>()
  for (const r of bron?.regels ?? []) open.set(regelSleutel(r), (open.get(regelSleutel(r)) ?? 0) + r.qty)
  for (const c of facturen) {
    if (c.crediteertFactuurId !== factuurId || c.id === zonder) continue
    for (const r of c.regels) open.set(regelSleutel(r), (open.get(regelSleutel(r)) ?? 0) - r.qty)
  }
  return open
}

/** Een credit voor alles wat er van deze factuur nog openstaat, tegen de prijs van de factuur. */
export function voorstelLosseCredit(facturen: VerkoopFactuur[], factuurId: string): LosseRegelInvoer[] {
  const bron = facturen.find((f) => f.id === factuurId)
  const open = losseCreditOpen(facturen, factuurId)
  return (bron?.regels ?? [])
    .map((r) => ({ artikelId: r.artikelId, naam: r.naam, qty: open.get(regelSleutel(r)) ?? 0, eenheid: r.eenheid, verkoopprijs: r.verkoopprijs }))
    .filter((r) => r.qty > 0)
}

/**
 * Waarom deze credit niet kan, of null.
 * - Op een factuur: die moet een verstuurde losse factuur zijn, en per regel
 *   niet meer dan er nog openstaat.
 * - Los: een klant en een reden; zonder factuur is de reden de enige uitleg in
 *   de administratie.
 */
export function waaromNietLosseCredit(
  facturen: VerkoopFactuur[],
  credit: { factuurId: string | null; relatieId: string | null; reden: string | null; regels: LosseRegelInvoer[] },
  opties: { creditId?: string; leegMag?: boolean } = {},
): string | null {
  if (!credit.factuurId) {
    if (!credit.relatieId) return 'Kies de klant voor wie de creditfactuur is.'
    if (!credit.reden || credit.reden.trim().length < 3) {
      return 'Zeg waarom je crediteert (bijvoorbeeld "prijscorrectie oktober" of "retour 2 stuks"). Zonder factuur is dat de enige uitleg.'
    }
    if (credit.regels.length === 0 && !opties.leegMag) return 'Zet minstens één regel op de creditfactuur.'
    return waaromNietLosseRegels(credit.regels, opties)
  }
  const bron = facturen.find((f) => f.id === credit.factuurId)
  if (!bron) return 'De factuur die je wilt crediteren bestaat niet (meer). Ververs de pagina.'
  if (bron.projectId) return `${bron.id} hoort bij project ${bron.projectNaam ?? bron.projectId}. Crediteer hem op de Facturen-tab van dat project.`
  if (bron.soort === 'credit') return 'Een creditfactuur kun je niet crediteren. Maak zo nodig een nieuwe factuur.'
  if (!bron.verzondenOp) return `${factuurNaam(bron)} is nog niet verstuurd. Pas hem gewoon aan in plaats van te crediteren.`
  const open = losseCreditOpen(facturen, bron.id, opties.creditId)
  if (credit.regels.length === 0 && !opties.leegMag) {
    return [...open.values()].some((n) => n > 0) ? 'Zet minstens één regel op de creditfactuur.' : `${bron.id} is al volledig gecrediteerd.`
  }
  const fout = waaromNietLosseRegels(credit.regels, opties)
  if (fout) return fout
  for (const r of credit.regels) {
    const s = regelSleutel(r)
    if (!bron.regels.some((b) => regelSleutel(b) === s)) return `${r.naam} staat niet op ${bron.id}.`
    const o = open.get(s) ?? 0
    if (r.qty > o) return `${r.naam}: er valt er maar ${o} te crediteren op ${bron.id}.`
  }
  return null
}

/** Een projectfactuur pas je aan op zijn project, niet op de pagina Facturen. */
export function waaromNietLos(f: Pick<VerkoopFactuur, 'id' | 'projectId' | 'projectNaam'> | undefined): string | null {
  if (!f) return 'Deze factuur bestaat niet (meer). Ververs de pagina.'
  if (f.projectId) return `${f.id} hoort bij project ${f.projectNaam ?? f.projectId}. Dit doe je op de Facturen-tab van dat project.`
  return null
}

export interface VoorraadTekort {
  artikelId: string
  naam: string
  qty: number
  vrij: number
}

/**
 * Wat er bij versturen van de voorraad af gaat en er niet (genoeg) ligt. Geen
 * weigering: de artikelvoorraad werd tot 2026-11-18 nergens bijgehouden, dus
 * het getal kan gewoon niet kloppen. Wel een waarschuwing vóór het versturen.
 */
export function voorraadTekorten(
  regels: Pick<VerkoopFactuurRegel, 'artikelId' | 'naam' | 'qty'>[],
  vrij: (artikelId: string) => number,
): VoorraadTekort[] {
  const perArtikel = new Map<string, { naam: string; qty: number }>()
  for (const r of regels) {
    if (!r.artikelId) continue
    const al = perArtikel.get(r.artikelId)
    perArtikel.set(r.artikelId, { naam: r.naam, qty: (al?.qty ?? 0) + r.qty })
  }
  return [...perArtikel.entries()]
    .map(([artikelId, { naam, qty }]) => ({ artikelId, naam, qty, vrij: vrij(artikelId) }))
    .filter((t) => t.qty > t.vrij)
}

export function voorraadWaarschuwing(tekorten: VoorraadTekort[]): string | null {
  if (tekorten.length === 0) return null
  const delen = tekorten.map((t) => `${t.naam}: ${t.qty} op de factuur, ${t.vrij} vrij op voorraad`)
  return `Volgens de voorraad ligt er te weinig: ${delen.join('; ')}. Bij versturen gaat de voorraad onder nul. `
    + 'Klopt de voorraad niet, tel hem dan op de artikelpagina.'
}
