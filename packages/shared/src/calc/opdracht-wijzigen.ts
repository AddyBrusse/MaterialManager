import type { OfferteRegel, ProductieOrder, Project } from '../schemas/project'
import { berekenVoortgang } from './projectvoortgang'

/**
 * De opdracht aanpassen nadat hij geaccepteerd is.
 *
 * Principe (besloten 2026-09-28): de app blokkeert geen wijziging, maar laat
 * zien wat er al gebeurd is en legt vast wat er veranderde. Dit bestand doet
 * beide: `waarschuwingBijWijziging` geeft de zin die de gebruiker vóór het
 * bevestigen ziet, `wijzigOpdracht` voert het uit en geeft de logregel.
 *
 * De offerte verandert niet mee — die blijft staan als wat er aangeboden werd.
 */

export type OpdrachtWijziging =
  | { soort: 'aantal'; regelId: string; qty: number }
  | { soort: 'prijs'; regelId: string; verkoopprijs: number }
  | { soort: 'weg'; regelId: string }
  | { soort: 'erbij'; regels: NieuweRegel[] }

export type NieuweRegel = Omit<OfferteRegel, 'id' | 'sortOrder' | 'totaal'>

export interface WijzigContext {
  nu: string
  /** Maakt een nieuwe productieorder; de server geeft ids uit. */
  nieuweOrder: (regel: OfferteRegel, qty: number) => ProductieOrder
  /** Maakt een id voor een nieuwe opdrachtregel. */
  nieuwRegelId: () => string
}

const rond = (n: number) => Math.round(n * 100) / 100
const bedrag = (n: number) =>
  `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function heeftVoortgang(o: ProductieOrder): boolean {
  return o.aantalGereed > 0 || o.stappen.some(s => s.gereedOp)
}

/** Nog lopend werk voor een regel: niet gereed, niet gestopt. */
function lopend(o: ProductieOrder): boolean {
  return o.status !== 'gereed' && o.status !== 'gestopt'
}

/**
 * Wat de gebruiker moet weten vóór hij bevestigt. `null` = niets bijzonders,
 * gewoon doen. Een zin = eerst vragen, met die zin erbij.
 */
export function waarschuwingBijWijziging(p: Project, w: OpdrachtWijziging): string | null {
  const ob = p.opdrachtbevestiging
  if (!ob || w.soort === 'erbij') return null
  const regel = ob.regels.find(r => r.id === w.regelId)
  if (!regel) return null
  const orders = p.productieOrders.filter(o => o.offerteRegelId === regel.id)
  const v = berekenVoortgang(p).regels.find(r => r.offerteRegelId === regel.id)
  const gemaakt = orders.reduce((s, o) => s + (o.aantalGereed > 0 ? o.aantalGereed : o.status === 'gereed' ? o.qty : 0), 0)
  const delen: string[] = []

  if (w.soort === 'aantal') {
    if (w.qty < gemaakt) {
      delen.push(`Er zijn al ${gemaakt} van de ${regel.qty} stuks "${regel.naam}" gemaakt. `
        + `Bij ${w.qty} blijven er ${gemaakt - w.qty} over als overschot.`)
    }
    if (v && w.qty < v.geleverd) delen.push(`Er zijn er al ${v.geleverd} geleverd — meer dan ${w.qty}.`)
    if (v && w.qty < v.gefactureerd) {
      delen.push(`Er zijn er al ${v.gefactureerd} gefactureerd; corrigeer de factuur met een creditfactuur.`)
    }
  }
  if (w.soort === 'prijs' && v && v.gefactureerd > 0) {
    delen.push(`Er is al gefactureerd voor "${regel.naam}" tegen ${bedrag(regel.verkoopprijs)}. `
      + 'Die factuur verandert niet mee; corrigeer hem met een creditfactuur of een nieuwe factuur.')
  }
  if (w.soort === 'weg') {
    const bezig = orders.filter(heeftVoortgang)
    delen.push(bezig.length
      ? `Aan "${regel.naam}" is al gewerkt (${gemaakt} stuks gereed). De productieorder wordt gestopt en `
        + 'blijft zichtbaar op de Productie-tab; de regel gaat van de opdracht.'
      : `"${regel.naam}" gaat van de opdracht, samen met zijn productieorder.`)
    if (v && v.geleverd > 0) delen.push(`Let op: er zijn al ${v.geleverd} stuks van geleverd.`)
    if (v && v.gefactureerd > 0) delen.push(`Er is al ${v.gefactureerd} stuks gefactureerd; corrigeer met een creditfactuur.`)
  }
  return delen.length ? delen.join(' ') : null
}

/** Voert de wijziging uit. Geeft het nieuwe project en de zin voor het logboek. */
export function wijzigOpdracht(
  p: Project,
  w: OpdrachtWijziging,
  ctx: WijzigContext,
): { project: Project; tekst: string } {
  const ob = p.opdrachtbevestiging
  if (!ob) throw new Error('Er is nog geen opdracht om aan te passen.')

  if (w.soort === 'erbij') {
    const start = ob.regels.length
    const nieuw: OfferteRegel[] = w.regels.map((r, i) => ({
      ...r,
      id: ctx.nieuwRegelId(),
      sortOrder: start + i + 1,
      totaal: rond(r.qty * r.verkoopprijs),
    }))
    return {
      project: {
        ...p,
        updatedAt: ctx.nu,
        opdrachtbevestiging: { ...ob, regels: [...ob.regels, ...nieuw], updatedAt: ctx.nu },
        productieOrders: [...p.productieOrders, ...nieuw.map(r => ctx.nieuweOrder(r, r.qty))],
      },
      tekst: nieuw.map(r => `Regel "${r.naam}" toegevoegd (${r.qty} ${r.eenheid})`).join('; '),
    }
  }

  const regel = ob.regels.find(r => r.id === w.regelId)
  if (!regel) throw new Error('Deze regel staat niet (meer) in de opdracht. Ververs de pagina.')
  const eigen = (o: ProductieOrder) => o.offerteRegelId === regel.id

  if (w.soort === 'prijs') {
    return {
      project: {
        ...p,
        updatedAt: ctx.nu,
        opdrachtbevestiging: {
          ...ob,
          updatedAt: ctx.nu,
          regels: ob.regels.map(r => r.id === regel.id
            ? { ...r, verkoopprijs: w.verkoopprijs, totaal: rond(r.qty * w.verkoopprijs) }
            : r),
        },
      },
      tekst: `"${regel.naam}": prijs ${bedrag(regel.verkoopprijs)} → ${bedrag(w.verkoopprijs)}`,
    }
  }

  if (w.soort === 'weg') {
    const orders = p.productieOrders
      .filter(o => !(eigen(o) && !heeftVoortgang(o)))
      .map(o => (eigen(o) && lopend(o) ? { ...o, status: 'gestopt' as const, updatedAt: ctx.nu } : o))
    const gestopt = orders.some(o => eigen(o))
    return {
      project: {
        ...p,
        updatedAt: ctx.nu,
        opdrachtbevestiging: { ...ob, regels: ob.regels.filter(r => r.id !== regel.id), updatedAt: ctx.nu },
        productieOrders: orders,
      },
      tekst: `Regel "${regel.naam}" van de opdracht gehaald${gestopt ? ' (productieorder gestopt)' : ''}`,
    }
  }

  // Aantal. Meer: bij het lopende werk erbij, of een nieuwe order als alles al
  // klaar is — een gereedgemelde order openbreken zou zijn stappen weggooien.
  // Minder: van het lopende werk af, nooit onder wat er al gemaakt is.
  const verschil = w.qty - regel.qty
  let orders = p.productieOrders
  if (verschil > 0) {
    const open = orders.find(o => eigen(o) && lopend(o))
    orders = open
      ? orders.map(o => (o === open ? { ...o, qty: o.qty + verschil, updatedAt: ctx.nu } : o))
      : [...orders, ctx.nieuweOrder({ ...regel, qty: w.qty }, verschil)]
  } else if (verschil < 0) {
    let teVeel = -verschil
    orders = orders.flatMap(o => {
      if (!eigen(o) || !lopend(o) || teVeel === 0) return [o]
      const kan = Math.min(teVeel, o.qty - o.aantalGereed)
      teVeel -= kan
      const qty = o.qty - kan
      if (qty > o.aantalGereed) return [{ ...o, qty, updatedAt: ctx.nu }]
      // Niets meer te doen op deze order: zonder voortgang weg, anders gestopt
      // bij wat er gemaakt is.
      return heeftVoortgang(o) ? [{ ...o, qty, status: 'gestopt' as const, updatedAt: ctx.nu }] : []
    })
  }
  return {
    project: {
      ...p,
      updatedAt: ctx.nu,
      opdrachtbevestiging: {
        ...ob,
        updatedAt: ctx.nu,
        regels: ob.regels.map(r => r.id === regel.id ? { ...r, qty: w.qty, totaal: rond(w.qty * r.verkoopprijs) } : r),
      },
      productieOrders: orders,
    },
    tekst: `"${regel.naam}": aantal ${regel.qty} → ${w.qty}`,
  }
}
