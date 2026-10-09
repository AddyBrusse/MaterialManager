/**
 * Planning per opdracht (2026-10-08): wat de Gantt en het werkbord tonen.
 * Alleen afleiden, niets opslaan. Het schema komt van `deriveShopSchedule`,
 * hetzelfde als Tijdlijn en Tabel, zodat alle weergaven hetzelfde zeggen.
 */
import type { DerivedSlot, QueueJob } from '../../utils/planningQueueUtils'
import type { PlanningStapItem } from '../../utils/planningUtils'
import { eindDag } from '../../utils/auto-planning'
import { werkdagenTeLaat } from '../planning-tabel/tabel-logica'
import type { Loop, Signaal } from './signalen'
import type { Machine } from '../../api/machines'
import { waaromNietNaar } from '../planning-tabel/tabel-logica'

export interface GanttStap { job: QueueJob; start: number; eind: number; tot: number | null; signalen: Signaal[] }
export interface GanttArtikel { orderId: string; artikel: string; qty: number; stappen: GanttStap[]; open: QueueJob[] }
export interface GanttOpdracht {
  projectId: string; naam: string; klant: string; levering: string | null
  begin: number | null; eind: number | null; pct: number; teLaat: number
  artikelen: GanttArtikel[]
}

/**
 * Per project: zijn orders (artikelen) met de stappen op de tijdlijn. `alles`
 * bevat ook gereed werk, voor het percentage; `open` de stappen die nog moeten.
 */
export function bouwGantt(
  alles: PlanningStapItem[], open: QueueJob[], schema: Map<string, DerivedSlot>, ws: Date,
  klantVan: (j: QueueJob) => string = (j) => j.klant,
  signalen: Map<string, Signaal[]> = new Map(), lopen: Map<string, Loop> = new Map(),
): GanttOpdracht[] {
  const perProject = new Map<string, GanttOpdracht>()
  const minuten = new Map<string, { klaar: number; totaal: number }>()
  for (const it of alles) {
    const m = minuten.get(it.project.id) ?? { klaar: 0, totaal: 0 }
    m.totaal += it.duurMin
    if (it.stap.gereedOp || it.order.status === 'gereed') m.klaar += it.duurMin
    minuten.set(it.project.id, m)
  }
  for (const j of open) {
    const p = j.item.project
    let g = perProject.get(p.id)
    if (!g) {
      g = { projectId: p.id, naam: p.naam, klant: klantVan(j), levering: p.levertijdDatum, begin: null, eind: null, pct: 0, teLaat: 0, artikelen: [] }
      perProject.set(p.id, g)
    }
    let a = g.artikelen.find((x) => x.orderId === j.orderId)
    if (!a) {
      a = { orderId: j.orderId, artikel: j.artikel, qty: j.item.order.qty, stappen: [], open: [] }
      g.artikelen.push(a)
    }
    a.open.push(j)
    // Bezig: op de tijdlijn waar de klok begon, niet waar hij gepland stond.
    const loop = lopen.get(j.id)
    const slot = j.item.stap.geplandDatum ? schema.get(j.id) : undefined
    const plek = loop ? { start: loop.start, eind: loop.gepland, tot: loop.tot } : slot ? { start: slot.startOffsetDays, eind: slot.finishOffsetDays, tot: null } : null
    if (plek) {
      a.stappen.push({ job: j, ...plek, signalen: signalen.get(j.id) ?? [] })
      g.begin = Math.min(g.begin ?? Infinity, plek.start)
      g.eind = Math.max(g.eind ?? -Infinity, plek.tot ?? plek.eind)
    }
  }
  for (const g of perProject.values()) {
    const m = minuten.get(g.projectId)
    g.pct = m && m.totaal > 0 ? Math.round((m.klaar / m.totaal) * 100) : 0
    g.teLaat = g.eind != null && g.levering ? werkdagenTeLaat(eindDag(g.eind, ws), g.levering) : 0
    for (const a of g.artikelen) a.stappen.sort((x, y) => x.start - y.start)
  }
  return [...perProject.values()].sort((a, b) => (a.begin ?? 1e9) - (b.begin ?? 1e9) || a.projectId.localeCompare(b.projectId))
}

// ── Werkbord ─────────────────────────────────────────────────────────────────

export const KOLOMMEN = [
  ['materiaal', 'Wacht op materiaal'],
  ['vorige', 'Wacht op vorige stap'],
  ['klaar', 'Klaar om te starten'],
  ['bezig', 'Bezig'],
  ['gereed', 'Gereed vandaag'],
] as const
export type Kolom = typeof KOLOMMEN[number][0]

/** Alleen in deze kolommen mag je slepen; bezig en gereed komen van de terminal. */
export const SLEEPBAAR: Kolom[] = ['materiaal', 'vorige', 'klaar']

export interface Kaart { job: QueueJob; kolom: Kolom; rang: number; stapNr: number; stappen: number; signalen: Signaal[] }

export function werkbord(
  open: QueueJob[], gereedVandaag: QueueJob[], lopend: Set<string>, rang: Map<string, number>, signalen: Map<string, Signaal[]> = new Map(),
): Record<Kolom, Kaart[]> {
  const uit = Object.fromEntries(KOLOMMEN.map(([k]) => [k, [] as Kaart[]])) as Record<Kolom, Kaart[]>
  const perOrder = new Map<string, QueueJob[]>()
  for (const j of open) perOrder.set(j.orderId, [...(perOrder.get(j.orderId) ?? []), j])
  for (const j of open) {
    const voor = (perOrder.get(j.orderId) ?? []).some((x) => x.volgorde < j.volgorde)
    const kolom: Kolom = lopend.has(j.id) ? 'bezig' : j.wachtOpMateriaal ? 'materiaal' : voor ? 'vorige' : 'klaar'
    uit[kolom].push({ job: j, kolom, rang: rang.get(j.id) ?? Infinity, ...stapVan(j), signalen: signalen.get(j.id) ?? [] })
  }
  for (const j of gereedVandaag) uit.gereed.push({ job: j, kolom: 'gereed', rang: 0, ...stapVan(j), signalen: [] })
  for (const k of Object.values(uit)) k.sort((a, b) => a.rang - b.rang)
  uit.gereed.sort((a, b) => (b.job.item.stap.gereedOp ?? '').localeCompare(a.job.item.stap.gereedOp ?? ''))
  return uit
}

function stapVan(j: QueueJob) {
  const alle = j.item.order.stappen
  return { stapNr: Math.max(1, alle.findIndex((s) => s.id === j.id) + 1), stappen: alle.length }
}

/**
 * De nieuwe rang van een gesleepte kaart: tussen de kaart erboven en de kaart
 * waar hij vóór gezet wordt. Bovenaan = vóór alles; onderaan = na de laatste.
 */
export function rangTussen(kolom: Kaart[], gesleept: string, voorId: string | null): number {
  const rij = kolom.filter((k) => k.job.id !== gesleept)
  const i = voorId == null ? rij.length : rij.findIndex((k) => k.job.id === voorId)
  const onder = i >= 0 && i < rij.length ? rij[i].rang : null
  const boven = i > 0 ? rij[i - 1].rang : null
  if (boven == null && onder == null) return 1000
  if (boven == null) return onder! - 500
  if (onder == null) return boven + 500
  return (boven + onder) / 2
}

// ── KanBan: één baan per machine (2026-10-09) ────────────────────────────────

export interface Baan { machine: Machine | null; kaarten: Kaart[] }

/**
 * De banen: per machine zijn stappen, in de volgorde waarin de machine ze doet
 * — wat bezig is bovenaan, dan op geplande start. Stappen zonder bestaande
 * machine in een eigen baan "Geen machine".
 */
export function kanbanBanen(
  open: QueueJob[], machines: Machine[], schema: Map<string, DerivedSlot>, lopend: Set<string>,
  rang: Map<string, number>, signalen: Map<string, Signaal[]> = new Map(), lopen: Map<string, Loop> = new Map(),
): Baan[] {
  const start = (j: QueueJob) => lopen.get(j.id)?.start ?? (j.item.stap.geplandDatum ? schema.get(j.id)?.startOffsetDays : undefined) ?? Infinity
  const kaart = (j: QueueJob): Kaart => ({ job: j, kolom: lopend.has(j.id) ? 'bezig' : 'klaar', rang: rang.get(j.id) ?? Infinity, ...stapVan(j), signalen: signalen.get(j.id) ?? [] })
  const sorteer = (k: Kaart[]) => k.sort((a, b) => Number(b.kolom === 'bezig') - Number(a.kolom === 'bezig') || start(a.job) - start(b.job) || a.rang - b.rang)
  const banen: Baan[] = machines.map((m) => ({ machine: m, kaarten: sorteer(open.filter((j) => j.machineNaam === m.name).map(kaart)) }))
  const namen = new Set(machines.map((m) => m.name))
  const los = open.filter((j) => !namen.has(j.machineNaam))
  if (los.length) banen.push({ machine: null, kaarten: sorteer(los.map(kaart)) })
  return banen
}

export type KanbanLos = { reden: string } | { prioriteit: number; machine?: string } | null

/**
 * Wat loslaten in een baan betekent: een nieuwe rang (hoger = eerder) en zo
 * nodig een andere machine. Weigert met een zin: een stap die bezig is, een
 * machine van een andere soort, of stap 2 vóór stap 1 van dezelfde order
 * (opspanning 2 kan niet vóór opspanning 1). `null` = er verandert niets.
 */
export function kanbanLos(baan: Baan, k: Kaart, voorId: string | null, machines: Machine[]): KanbanLos {
  if (k.kolom === 'bezig') return { reden: 'Deze stap is bezig; die blijft waar hij is.' }
  const doel = baan.machine
  if (!doel) return { reden: 'Sleep hem op de baan van een machine.' }
  const andere = doel.name !== k.job.machineNaam
  if (andere) {
    const r = waaromNietNaar(k.job, doel, machines)
    if (r) return { reden: r }
  }
  const rij = baan.kaarten.filter((x) => x.job.id !== k.job.id)
  const bezig = rij.filter((x) => x.kolom === 'bezig').length
  let i = voorId == null ? rij.length : rij.findIndex((x) => x.job.id === voorId)
  if (i < 0) i = rij.length
  i = Math.max(i, bezig)
  if (!andere) {
    const was = baan.kaarten.findIndex((x) => x.job.id === k.job.id)
    if (was === i) return null
  }
  const eerder = rij.find((x, n) => n >= i && x.job.orderId === k.job.orderId && x.job.volgorde < k.job.volgorde)
  if (eerder) return { reden: `Stap ${eerder.stapNr} (${eerder.job.naam}) van ${k.job.orderId} staat hier nog onder; die moet eerst.` }
  const later = rij.find((x, n) => n < i && x.job.orderId === k.job.orderId && x.job.volgorde > k.job.volgorde)
  if (later) return { reden: `Stap ${later.stapNr} (${later.job.naam}) van ${k.job.orderId} staat hierboven; die kan pas na deze.` }
  const boven = i > bezig ? rij[i - 1].rang : null
  const onder = i < rij.length ? rij[i].rang : null
  const prioriteit = boven != null && onder != null && boven < onder ? (boven + onder) / 2
    : onder != null ? onder - 1 : boven != null ? boven + 1 : k.rang
  return { prioriteit, machine: andere ? doel.name : undefined }
}
