import type { Factuur, FactuurRegel, Project } from '../schemas/project'
import type { Relatie, RelatieContact } from '../schemas/relatie'
import { basisRegels, berekenVoortgang } from './projectvoortgang'

/**
 * Facturen en credits op de Facturen-tab (besloten 2026-10-03).
 *
 * Factureren staat los van de pakbonnen: één factuur kan over meerdere
 * pakbonnen gaan, en vaak gaat hij pas de deur uit als alles geleverd is. Een
 * nieuwe factuur neemt standaard alles wat verstuurd en nog niet gefactureerd
 * is; aantal en prijs staan vooraf ingevuld en zijn aan te passen zolang hij
 * concept is. Een verstuurde factuur staat vast — corrigeren gaat met een credit.
 *
 * Web en server gebruiken dezelfde functies: het scherm vraagt `waaromNiet…`
 * vóór de handeling, de server nog eens en antwoordt `409 VOORWAARDE`.
 */

export const BTW_PCT = 21
/** Zonder betalingstermijn bij de klant. */
export const STANDAARD_TERMIJN_DAGEN = 30

export interface FactuurRegelKeuze {
  offerteRegelId: string
  qty: number
  verkoopprijs: number
}

const rond = (n: number) => Math.round(n * 100) / 100

/** Voortgang alsof deze factuur er niet was: bij het aanpassen tellen zijn eigen stuks weer als open. */
export function factuurVoortgang(p: Project, zonder?: string) {
  return berekenVoortgang(zonder ? { ...p, facturen: p.facturen.filter(f => f.id !== zonder) } : p)
}

/** Alles wat verstuurd en nog niet gefactureerd is, tegen de prijs uit de opdracht. */
export function voorstelFactuur(p: Project): FactuurRegelKeuze[] {
  const bron = basisRegels(p)
  return berekenVoortgang(p).regels
    .filter(r => r.teFactureren > 0)
    .map(r => ({
      offerteRegelId: r.offerteRegelId,
      qty: r.teFactureren,
      verkoopprijs: bron.find(b => b.id === r.offerteRegelId)?.verkoopprijs ?? r.verkoopprijs,
    }))
}

/** Van keuze naar factuurregels: naam en eenheid uit de opdracht, totaal afgerond op centen. */
export function factuurRegels(p: Project, keuze: FactuurRegelKeuze[]): FactuurRegel[] {
  const bron = basisRegels(p)
  return keuze.map(g => {
    const r = bron.find(x => x.id === g.offerteRegelId)
    return {
      offerteRegelId: g.offerteRegelId,
      naam: r?.naam ?? g.offerteRegelId,
      qty: g.qty,
      eenheid: r?.eenheid ?? 'st',
      verkoopprijs: g.verkoopprijs,
      totaal: rond(g.qty * g.verkoopprijs),
    }
  })
}

export function factuurBedragen(regels: { totaal: number }[], btwPct = BTW_PCT) {
  const subtotaal = rond(regels.reduce((s, r) => s + r.totaal, 0))
  const btwBedrag = rond(subtotaal * (btwPct / 100))
  return { subtotaal, btwBedrag, totaalInclBtw: rond(subtotaal + btwBedrag) }
}

function controleerKeuze(
  keuze: FactuurRegelKeuze[],
  naamVan: (id: string) => string | null,
  open: (id: string) => number,
  teVeel: (naam: string, open: number) => string,
): string | null {
  const gezien = new Set<string>()
  for (const g of keuze) {
    const naam = naamVan(g.offerteRegelId)
    if (naam === null) return 'Een van de regels bestaat niet (meer) in de opdracht. Ververs de pagina.'
    if (gezien.has(g.offerteRegelId)) return `${naam} staat twee keer op de factuur.`
    gezien.add(g.offerteRegelId)
    if (!(g.qty > 0)) return `${naam}: vul een aantal groter dan 0 in, of haal de regel weg.`
    if (!(g.verkoopprijs >= 0)) return `${naam}: de prijs kan niet negatief zijn.`
    const o = open(g.offerteRegelId)
    if (g.qty > o) return teVeel(naam, o)
  }
  return null
}

/**
 * Waarom deze factuur niet kan, of `null`. Meer factureren dan er verstuurd is
 * kan niet: dan betaalt de klant voor iets wat hij nog niet heeft.
 */
export function waaromNietFactuur(
  p: Project, keuze: FactuurRegelKeuze[], opties: { factuurId?: string; leegMag?: boolean } = {},
): string | null {
  const v = factuurVoortgang(p, opties.factuurId)
  if (keuze.length === 0) {
    if (opties.leegMag) return null
    return v.teFactureren === 0
      ? 'Er is niets verstuurd dat nog niet gefactureerd is. Verstuur eerst een pakbon op de Pakbonnen-tab.'
      : 'Zet minstens één regel op de factuur.'
  }
  return controleerKeuze(
    keuze,
    id => v.regels.find(r => r.offerteRegelId === id)?.naam ?? null,
    id => v.regels.find(r => r.offerteRegelId === id)?.teFactureren ?? 0,
    (naam, open) => open === 0
      ? `${naam}: er is niets verstuurd dat nog niet gefactureerd is.`
      : `${naam}: er zijn er maar ${open} verstuurd en nog niet gefactureerd.`,
  )
}

/** Wat er van een factuur per regel nog te crediteren valt; `zonder` = deze credit niet meetellen. */
export function creditOpen(p: Project, factuurId: string, zonder?: string): Map<string, number> {
  const bron = p.facturen.find(f => f.id === factuurId)
  const open = new Map<string, number>()
  for (const r of bron?.regels ?? []) open.set(r.offerteRegelId, (open.get(r.offerteRegelId) ?? 0) + r.qty)
  for (const c of p.facturen) {
    if (c.crediteertFactuurId !== factuurId || c.id === zonder) continue
    for (const r of c.regels) open.set(r.offerteRegelId, (open.get(r.offerteRegelId) ?? 0) - r.qty)
  }
  return open
}

/** Een credit voor alles wat er van deze factuur nog openstaat, tegen de prijs van de factuur. */
export function voorstelCredit(p: Project, factuurId: string): FactuurRegelKeuze[] {
  const bron = p.facturen.find(f => f.id === factuurId)
  const open = creditOpen(p, factuurId)
  return (bron?.regels ?? [])
    .map(r => ({ offerteRegelId: r.offerteRegelId, qty: open.get(r.offerteRegelId) ?? 0, verkoopprijs: r.verkoopprijs }))
    .filter(r => r.qty > 0)
}

export function waaromNietCredit(
  p: Project, factuurId: string, keuze: FactuurRegelKeuze[], opties: { creditId?: string; leegMag?: boolean } = {},
): string | null {
  const bron = p.facturen.find(f => f.id === factuurId)
  if (!bron) return 'De factuur die je wilt crediteren bestaat niet (meer). Ververs de pagina.'
  if (bron.soort === 'credit') return 'Een creditfactuur kun je niet crediteren. Maak zo nodig een nieuwe factuur.'
  if (!bron.verzondenOp) return `${bron.id} is nog een concept. Pas die gewoon aan in plaats van te crediteren.`
  const open = creditOpen(p, factuurId, opties.creditId)
  if (keuze.length === 0) {
    if (opties.leegMag) return null
    return [...open.values()].some(n => n > 0)
      ? 'Zet minstens één regel op de creditfactuur.'
      : `${bron.id} is al volledig gecrediteerd.`
  }
  return controleerKeuze(
    keuze,
    id => bron.regels.find(r => r.offerteRegelId === id)?.naam ?? null,
    id => open.get(id) ?? 0,
    (naam, o) => `${naam}: er valt er maar ${o} te crediteren op ${bron.id}.`,
  )
}

export function waaromNietFactuurWijzigen(p: Project, factuurId: string): string | null {
  const f = p.facturen.find(x => x.id === factuurId)
  if (!f) return 'Deze factuur bestaat niet (meer). Ververs de pagina.'
  if (f.verzondenOp) {
    return f.soort === 'credit'
      ? `${f.id} is al verstuurd en staat vast.`
      : `${f.id} is al verstuurd en staat vast. Corrigeren gaat met een creditfactuur.`
  }
  return null
}

export function waaromNietFactuurVersturen(p: Project, factuurId: string, naar: string | null): string | null {
  const nee = waaromNietFactuurWijzigen(p, factuurId)
  if (nee) return nee
  const f = p.facturen.find(x => x.id === factuurId)!
  if (f.regels.length === 0) return `${f.id} heeft nog geen regels. Voeg eerst toe wat er gefactureerd wordt.`
  if (!naar?.trim()) {
    return `Er is geen mailadres voor ${f.id}. Vul het in op de factuur, of zet "E-mail factuur" bij de klant (Relaties).`
  }
  return null
}

export function waaromNietBetaald(p: Project, factuurId: string): string | null {
  const f = p.facturen.find(x => x.id === factuurId)
  if (!f) return 'Deze factuur bestaat niet (meer). Ververs de pagina.'
  if (f.soort === 'credit') return 'Een creditfactuur wordt verrekend, niet betaald.'
  if (!f.verzondenOp) return `${f.id} is nog niet verstuurd.`
  return null
}

/**
 * Naar wie een factuur gaat: het factuuradres van de klant (vaak
 * administratie@…), anders de contactpersoon van de order, anders het algemene
 * adres. Per factuur te overschrijven.
 */
export function factuurMailadres(
  relatie: Pick<Relatie, 'email' | 'emailFactuur'> | null | undefined,
  contact: Pick<RelatieContact, 'email'> | null | undefined,
): string | null {
  return relatie?.emailFactuur?.trim() || contact?.email?.trim() || relatie?.email?.trim() || null
}

/** De vervaldatum bij versturen: de betalingstermijn van de klant, anders 30 dagen. */
export function vervaldatumVanaf(verstuurdOp: Date, termijnDagen: number | null | undefined): string {
  const d = new Date(verstuurdOp)
  d.setDate(d.getDate() + (termijnDagen && termijnDagen > 0 ? termijnDagen : STANDAARD_TERMIJN_DAGEN))
  return d.toISOString().slice(0, 10)
}

/** Verstuurd, niet betaald, en de vervaldatum is voorbij. */
export function isVervallen(f: Factuur, nu: Date = new Date()): boolean {
  if (f.soort !== 'factuur' || !f.verzondenOp || f.betaaldOp || !f.vervaldatum) return false
  return f.vervaldatum < nu.toISOString().slice(0, 10)
}

/** Wat er nog betaald moet worden: verstuurde, onbetaalde facturen min hun verstuurde credits. */
export function openstaandBedrag(p: Project): number {
  let som = 0
  for (const f of p.facturen) {
    if (f.soort !== 'factuur' || !f.verzondenOp || f.betaaldOp) continue
    som += f.totaalInclBtw
    for (const c of p.facturen) {
      if (c.crediteertFactuurId === f.id && c.verzondenOp) som -= c.totaalInclBtw
    }
  }
  return rond(Math.max(0, som))
}
