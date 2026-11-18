import type { Project } from '../schemas/project'

/**
 * De leverdatum op een projectfactuur (2026-11-18). Wettelijk hoort hij op de
 * factuur als hij afwijkt van de factuurdatum, en bij een project is dat bijna
 * altijd zo: de pakbon gaat eerder de deur uit dan de factuur.
 *
 * Welke pakbon bij welke factuur hoort, is nergens vastgelegd: een factuur
 * gaat over stuks, niet over pakbonnen (besluit 2026-10-03). Daarom op volgorde
 * (eerst geleverd, eerst gefactureerd): per orderregel krijgen de facturen de
 * stuks van de pakbonnen in de volgorde waarin die verstuurd zijn. Een credit
 * geeft stuks terug, die de volgende factuur weer neemt. Meer gefactureerd dan
 * er op pakbonnen staat, komt op de laatste pakbon terecht.
 */
export interface FactuurLevering {
  /** Verzenddagen (yyyy-mm-dd), oplopend en zonder dubbele. */
  data: string[]
  /** De pakbonnen waar de stuks mee gingen, in volgorde van versturen. */
  pakbonnen: string[]
}

const dag = (iso: string) => iso.slice(0, 10)

export function leveringVanFactuur(p: Project, factuurId: string): FactuurLevering {
  const doel = p.facturen.find((f) => f.id === factuurId)
  if (!doel || doel.soort !== 'factuur') return { data: [], pakbonnen: [] }

  // Verstuurde pakbonnen, oudste eerst; per orderregel de stuks per pakbon.
  const orders = p.productieOrders
  const regelVan = (r: { offerteRegelId?: string | null; productieOrderId: string }) =>
    r.offerteRegelId ?? orders.find((o) => o.id === r.productieOrderId)?.offerteRegelId ?? null
  const pakbonnen = p.paklijsten
    .filter((pl) => pl.verzondenOp)
    .sort((a, b) => a.verzondenOp!.localeCompare(b.verzondenOp!) || a.id.localeCompare(b.id))
  const leveringen = new Map<string, { pakbon: string; datum: string; qty: number }[]>()
  for (const pl of pakbonnen) {
    for (const r of pl.regels) {
      const id = regelVan(r)
      if (!id) continue
      const lijst = leveringen.get(id) ?? []
      lijst.push({ pakbon: pl.id, datum: dag(pl.verzondenOp!), qty: r.qty })
      leveringen.set(id, lijst)
    }
  }

  // Facturen en credits in de volgorde waarin ze ontstonden: verstuurd eerst
  // (op datum), dan de rest (op aanmaakmoment).
  const volgorde = [...p.facturen].sort((a, b) => {
    if (!!a.verzondenOp !== !!b.verzondenOp) return a.verzondenOp ? -1 : 1
    return (a.verzondenOp ?? a.createdAt).localeCompare(b.verzondenOp ?? b.createdAt) || a.id.localeCompare(b.id)
  })
  const al = new Map<string, number>()
  for (const f of volgorde) {
    if (f.id === doel.id) break
    for (const r of f.regels) {
      const delta = f.soort === 'credit' ? -r.qty : r.qty
      al.set(r.offerteRegelId, Math.max(0, (al.get(r.offerteRegelId) ?? 0) + delta))
    }
  }

  const data = new Set<string>()
  const gebruikt: string[] = []
  for (const r of doel.regels) {
    const lijst = leveringen.get(r.offerteRegelId) ?? []
    if (lijst.length === 0 || r.qty <= 0) continue
    const van = al.get(r.offerteRegelId) ?? 0
    const tot = van + r.qty
    let opgeteld = 0
    for (const [i, l] of lijst.entries()) {
      const begin = opgeteld
      opgeteld += l.qty
      const laatste = i === lijst.length - 1
      // Overlapt (van, tot] met (begin, opgeteld]? De laatste pakbon vangt de rest.
      if (tot > begin && (van < opgeteld || laatste)) {
        data.add(l.datum)
        if (!gebruikt.includes(l.pakbon)) gebruikt.push(l.pakbon)
      }
      if (opgeteld >= tot) break
    }
  }
  return {
    data: [...data].sort(),
    pakbonnen: pakbonnen.map((pl) => pl.id).filter((id) => gebruikt.includes(id)),
  }
}

/** Zoals hij op de factuur staat: één dag, of "van t/m". */
export function leverdatumTekst(data: string[]): string | null {
  if (data.length === 0) return null
  const nl = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`
  return data.length === 1 ? nl(data[0]) : `${nl(data[0])} t/m ${nl(data[data.length - 1])}`
}
