import type { Blokkade, HerberekeningWijziging, StapPlanWaarden } from '../schemas/planning-herberekening'

/** Twee keer dezelfde planning? Getallen met een kleine marge (float uit JSON). */
export function zelfdePlanning(a: StapPlanWaarden, b: StapPlanWaarden): boolean {
  const getal = (x: number | null, y: number | null) => (x == null || y == null ? x === y : Math.abs(x - y) < 1e-6)
  return a.geplandDatum === b.geplandDatum && a.geplandMachine === b.geplandMachine
    && getal(a.queuePosition, b.queuePosition) && getal(a.prioriteit, b.prioriteit)
    && (a.machineWacht === undefined || b.machineWacht === undefined || !!a.machineWacht === !!b.machineWacht)
}

export interface StapNu extends StapPlanWaarden {
  id: string
  naam: string
  volgorde: number
  gereedOp: string | null
  gereedDoor: string | null
}

export interface KlokNa {
  id: string
  stapId: string
  gestartOp: string
  machineNaam: string | null
  door: string | null
  seconden: number
}

const tijd = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
const duur = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`

/**
 * Wat er sinds de herberekening (`op`) is gebeurd aan de stappen die hij
 * raakte. Is de lijst leeg, dan kan hij zonder meer terug. Een stap die al
 * gestart of gereed was vóór de herberekening blokkeert niet: die stond toen
 * ook al zo.
 */
export function blokkadesVoorOngedaan(
  wijzigingen: HerberekeningWijziging[],
  stappen: Map<string, StapNu>,
  klokken: KlokNa[],
  op: string,
): Blokkade[] {
  const uit: Blokkade[] = []
  for (const w of wijzigingen) {
    const s = stappen.get(w.stapId)
    const basis = { stapId: w.stapId, projectId: w.projectId, orderId: w.orderId }
    const wie = s ? `${w.orderId} stap ${s.volgorde} (${s.naam})` : `${w.orderId}`
    if (!s) continue // stap bestaat niet meer: niets terug te zetten
    if (s.gereedOp && s.gereedOp >= op) {
      uit.push({ ...basis, soort: 'gereed', tekst: `${wie} is om ${tijd(s.gereedOp)} gereedgemeld${s.gereedDoor ? ` door ${s.gereedDoor}` : ''}.` })
    }
    const k = klokken.filter((x) => x.stapId === w.stapId && x.gestartOp >= op)
    if (k.length) {
      const sec = k.reduce((t, x) => t + x.seconden, 0)
      const eerste = k.map((x) => x.gestartOp).sort()[0]
      const m = k.find((x) => x.machineNaam)?.machineNaam
      const d = k.find((x) => x.door)?.door
      uit.push({ ...basis, soort: 'gestart', seconden: sec,
        tekst: `${wie} is om ${tijd(eerste)} gestart${m ? ` op ${m}` : ''}${d ? ` door ${d}` : ''} (${duur(sec)} gemeten).` })
    }
    if (!zelfdePlanning(s, w.nieuw)) {
      uit.push({ ...basis, soort: 'gewijzigd', tekst: `${wie} is daarna nog met de hand verplaatst.` })
    }
  }
  return uit
}
