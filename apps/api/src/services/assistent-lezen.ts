// De leestools van de AI-assistent (2026-10-28): `lees_tabel` en `tel_tabel`.
//
// Geen vrije SQL: de database-gebruiker van de app mag alles, en een "alleen
// lezen"-transactie is met een functieaanroep te omzeilen. Hier gaat elke
// vraag via Prisma, alleen over tabellen en velden uit de catalogus, met
// `findMany`/`count`/`groupBy` — er bestaat in dit bestand geen pad dat schrijft.
import { Prisma } from '@prisma/client'
import { vandaagIso } from '@stockmanager/shared'
import { TABELLEN, type Tabel, type Veld } from './assistent-catalogus'

type Db = Prisma.TransactionClient
type Where = Record<string, unknown>

export const OPERATOREN = ['=', '!=', '>', '>=', '<', '<=', 'bevat', 'begint_met', 'in', 'leeg', 'niet_leeg'] as const
type Op = (typeof OPERATOREN)[number]

interface Filter { veld: string; is: Op; waarde?: unknown }

/** Een vraag die niet kan; de tekst gaat terug naar het model zodat het hem kan verbeteren. */
export class LeesFout extends Error {}

const MAX_RIJEN = 50
const MAX_GROEPEN = 50
const MAX_TEKST = 200
const MAX_JSON = 300

// ── Tabel en velden ──────────────────────────────────────────────────────────

function tabel(naam: unknown): Tabel {
  const t = typeof naam === 'string' ? TABELLEN.get(naam) : undefined
  if (!t) throw new LeesFout(`Onbekende tabel "${String(naam)}". Kies uit: ${[...TABELLEN.keys()].join(', ')}.`)
  return t
}

function veld(t: Tabel, naam: unknown): Veld {
  const v = typeof naam === 'string' ? t.velden.get(naam) : undefined
  if (!v) throw new LeesFout(`Tabel ${t.naam} heeft geen veld "${String(naam)}". Velden: ${[...t.velden.keys()].join(', ')}.`)
  return v
}

function delegate(db: Db, t: Tabel) {
  const naam = t.model[0].toLowerCase() + t.model.slice(1)
  return (db as unknown as Record<string, {
    findMany: (a: object) => Promise<Record<string, unknown>[]>
    count: (a: object) => Promise<number>
    aggregate: (a: object) => Promise<Record<string, Record<string, unknown>>>
    groupBy: (a: object) => Promise<Record<string, unknown>[]>
  }>)[naam]
}

// ── Datums ───────────────────────────────────────────────────────────────────

const plusDagen = (dag: string, n: number) => {
  const d = new Date(`${dag}T12:00:00`)
  d.setDate(d.getDate() + n)
  return vandaagIso(d)
}

/** "vandaag", "gisteren", "vandaag-7", "begin_week", "2026-10-28" → yyyy-mm-dd in de eigen tijdzone. */
export function dagUit(waarde: unknown, nu: Date): string {
  const s = String(waarde ?? '').trim().toLowerCase()
  const vandaag = vandaagIso(nu)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^vandaag\s*([+-])\s*(\d{1,4})$/.exec(s)
  if (m) return plusDagen(vandaag, (m[1] === '-' ? -1 : 1) * Number(m[2]))
  switch (s) {
    case 'vandaag': return vandaag
    case 'gisteren': return plusDagen(vandaag, -1)
    case 'morgen': return plusDagen(vandaag, 1)
    case 'begin_week': return plusDagen(vandaag, -((nu.getDay() + 6) % 7))
    case 'begin_maand': return `${vandaag.slice(0, 8)}01`
    case 'begin_jaar': return `${vandaag.slice(0, 4)}-01-01`
  }
  throw new LeesFout(`Ongeldige datum "${String(waarde)}". Gebruik vandaag, gisteren, morgen, vandaag-7, vandaag+3, begin_week, begin_maand, begin_jaar of jjjj-mm-dd.`)
}

/** Begin van een dag als waarde om mee te vergelijken, in de vorm van het veld. */
function grensVan(v: Veld, dag: string): Date | string {
  if (v.soort === 'tijdstip') return new Date(`${dag}T00:00:00`)
  if (v.soort === 'tijdstip-tekst') return new Date(`${dag}T00:00:00`).toISOString()
  return dag
}

function datumVoorwaarde(v: Veld, op: Op, waarde: unknown, nu: Date): Where {
  const dag = dagUit(waarde, nu)
  const van = grensVan(v, dag)
  const tot = grensVan(v, plusDagen(dag, 1))
  switch (op) {
    case '=': return { [v.naam]: { gte: van, lt: tot } }
    case '>=': return { [v.naam]: { gte: van } }
    case '>': return { [v.naam]: { gte: tot } }
    case '<': return { [v.naam]: { lt: van } }
    case '<=': return { [v.naam]: { lt: tot } }
    case '!=': return { OR: [{ [v.naam]: { lt: van } }, { [v.naam]: { gte: tot } }, ...(v.nullable ? [{ [v.naam]: null }] : [])] }
    default: throw new LeesFout(`"${op}" kan niet bij een datum (${v.naam}). Gebruik =, !=, >, >=, <, <=, leeg of niet_leeg.`)
  }
}

// ── Voorwaarden ──────────────────────────────────────────────────────────────

function getal(v: Veld, w: unknown): number {
  const n = typeof w === 'number' ? w : Number(String(w).replace(',', '.'))
  if (!Number.isFinite(n)) throw new LeesFout(`${v.naam} is een getal; "${String(w)}" is dat niet.`)
  return n
}

function jaNee(v: Veld, w: unknown): boolean {
  if (w === true || w === 'ja' || w === 'true') return true
  if (w === false || w === 'nee' || w === 'false') return false
  throw new LeesFout(`${v.naam} is ja/nee; gebruik true of false.`)
}

function waardeVoor(v: Veld, w: unknown): unknown {
  if (v.soort === 'getal') return getal(v, w)
  if (v.soort === 'ja/nee') return jaNee(v, w)
  if (v.soort === 'keuze') {
    if (!v.waarden?.includes(String(w))) throw new LeesFout(`${v.naam} kan zijn: ${v.waarden?.join(', ')}.`)
    return String(w)
  }
  if (w === null || w === undefined || typeof w === 'object') throw new LeesFout(`Geef een waarde voor ${v.naam}.`)
  return String(w)
}

function leeg(v: Veld, ja: boolean): Where {
  const n = v.naam
  if (v.soort === 'lijst') return { [n]: { isEmpty: ja } }
  if (v.soort === 'json') {
    const isLeeg = v.nullable ? { [n]: { equals: Prisma.AnyNull } } : { [n]: { equals: [] } }
    return ja ? isLeeg : { NOT: isLeeg }
  }
  if (v.soort === 'tekst' || v.soort === 'dag' || v.soort === 'tijdstip-tekst') {
    if (ja) return v.nullable ? { OR: [{ [n]: null }, { [n]: '' }] } : { [n]: '' }
    return v.nullable ? { AND: [{ [n]: { not: null } }, { [n]: { not: '' } }] } : { [n]: { not: '' } }
  }
  // Een verplicht veld is nooit leeg. Een lege OR is in Prisma "nooit waar".
  if (!v.nullable) return ja ? { OR: [] } : {}
  return ja ? { [n]: null } : { [n]: { not: null } }
}

export function voorwaarde(t: Tabel, f: Filter, nu: Date): Where {
  const v = veld(t, f.veld)
  const op = f.is
  if (!OPERATOREN.includes(op)) throw new LeesFout(`Onbekende vergelijking "${String(op)}". Kies uit: ${OPERATOREN.join(' ')}.`)
  if (op === 'leeg' || op === 'niet_leeg') return leeg(v, op === 'leeg')
  if (v.soort === 'json') throw new LeesFout(`${v.naam} is een samengesteld veld; daarop kan alleen leeg of niet_leeg.`)
  if (v.soort === 'tijdstip' || v.soort === 'dag' || v.soort === 'tijdstip-tekst') {
    if (op === 'in' || op === 'bevat' || op === 'begint_met') {
      if (v.soort === 'tijdstip') throw new LeesFout(`"${op}" kan niet bij een datum (${v.naam}).`)
    } else return datumVoorwaarde(v, op, f.waarde, nu)
  }
  if (v.soort === 'lijst') {
    if (op !== 'bevat') throw new LeesFout(`${v.naam} is een lijst; gebruik bevat, leeg of niet_leeg.`)
    return { [v.naam]: { has: String(f.waarde) } }
  }
  const tekst = v.soort === 'tekst' || v.soort === 'dag' || v.soort === 'tijdstip-tekst'
  switch (op) {
    case 'in': {
      if (!Array.isArray(f.waarde) || !f.waarde.length || f.waarde.length > 200) throw new LeesFout('Bij "in" hoort een lijst van 1 tot 200 waarden.')
      return { [v.naam]: { in: f.waarde.map((w) => waardeVoor(v, w)) } }
    }
    case 'bevat': case 'begint_met':
      if (!tekst) throw new LeesFout(`"${op}" kan alleen bij tekst (${v.naam} is ${v.soort}).`)
      return { [v.naam]: { [op === 'bevat' ? 'contains' : 'startsWith']: String(f.waarde ?? ''), mode: 'insensitive' } }
    case '=':
      return { [v.naam]: tekst ? { equals: waardeVoor(v, f.waarde), mode: 'insensitive' } : waardeVoor(v, f.waarde) }
    case '!=': {
      const niet = { [v.naam]: { not: waardeVoor(v, f.waarde) } }
      return v.nullable ? { OR: [niet, { [v.naam]: null }] } : niet
    }
    default: {
      if (v.soort === 'ja/nee' || v.soort === 'keuze') throw new LeesFout(`"${op}" kan niet bij ${v.naam}.`)
      const k = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[op]
      return { [v.naam]: { [k]: waardeVoor(v, f.waarde) } }
    }
  }
}

function filters(t: Tabel, waar: unknown, nu: Date): { where: Where; lijst: Filter[] } {
  if (waar === undefined || waar === null) return { where: {}, lijst: [] }
  if (!Array.isArray(waar)) throw new LeesFout('"waar" is een lijst van { veld, is, waarde }.')
  if (waar.length > 12) throw new LeesFout('Hooguit 12 voorwaarden per vraag.')
  const lijst = waar.map((x) => {
    if (!x || typeof x !== 'object') throw new LeesFout('Elke voorwaarde is { veld, is, waarde }.')
    return x as Filter
  })
  return { where: lijst.length ? { AND: lijst.map((f) => voorwaarde(t, f, nu)) } : {}, lijst }
}

// ── Uitvoer ──────────────────────────────────────────────────────────────────

function tijd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${vandaagIso(d)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function uitvoer(v: Veld, w: unknown): unknown {
  if (w === null || w === undefined) return null
  if (w instanceof Date) return tijd(w)
  if (w instanceof Prisma.Decimal) return Number(w)
  if (typeof w === 'bigint') return Number(w)
  if (v.soort === 'json') {
    const s = JSON.stringify(w)
    return s.length > MAX_JSON ? `${s.slice(0, MAX_JSON)}…` : s
  }
  if (typeof w === 'string' && w.length > MAX_TEKST) return `${w.slice(0, MAX_TEKST)}…`
  return w
}

/** Een filter in gewone woorden, voor de bronregel onder het antwoord. */
function beschrijf(f: Filter, nu: Date, t: Tabel): string {
  if (f.is === 'leeg' || f.is === 'niet_leeg') return `${f.veld} ${f.is === 'leeg' ? 'leeg' : 'gevuld'}`
  const v = t.velden.get(f.veld)
  const datum = v && (v.soort === 'tijdstip' || v.soort === 'dag' || v.soort === 'tijdstip-tekst')
  const w = Array.isArray(f.waarde) ? f.waarde.join('/') : String(f.waarde)
  const tekst = datum ? (() => { const d = dagUit(f.waarde, nu); return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` })() : w
  return `${f.veld} ${f.is} ${tekst}`
}

function bronVan(t: Tabel, lijst: Filter[], nu: Date, slot: string): string {
  return [t.naam, ...lijst.map((f) => beschrijf(f, nu, t)), slot].join(' · ')
}

// ── De twee tools ────────────────────────────────────────────────────────────

interface LeesVraag { tabel?: unknown; waar?: unknown; velden?: unknown; sorteer?: unknown; max?: unknown }

export async function leesTabel(db: Db, vraag: LeesVraag, nu = new Date()) {
  const t = tabel(vraag.tabel)
  const { where, lijst } = filters(t, vraag.waar, nu)
  const gevraagd = Array.isArray(vraag.velden) && vraag.velden.length ? vraag.velden.map((n) => veld(t, n)) : null
  const zichtbaar = (gevraagd ?? [...t.velden.values()]).filter((v) => !v.alleenFilter)
  // Velden die de link nodig heeft gaan altijd mee, maar alleen in de selectie.
  const select: Record<string, true> = {}
  for (const v of zichtbaar) select[v.naam] = true
  for (const n of ['id', 'projectId']) if (t.velden.has(n)) select[n] = true

  const s = vraag.sorteer as { veld?: unknown; richting?: unknown } | undefined
  let orderBy: Record<string, 'asc' | 'desc'> | undefined
  if (s?.veld) {
    const v = veld(t, s.veld)
    if (v.soort === 'json' || v.soort === 'lijst') throw new LeesFout(`Op ${v.naam} kan niet gesorteerd worden.`)
    orderBy = { [v.naam]: s.richting === 'op' ? 'asc' : 'desc' }
  } else if (t.velden.has('createdAt')) orderBy = { createdAt: 'desc' }
  else if (t.velden.has('id')) orderBy = { id: 'asc' }
  const max = Math.min(MAX_RIJEN, Math.max(1, Math.floor(Number(vraag.max) || 25)))

  const d = delegate(db, t)
  const [rijen, totaal] = await Promise.all([d.findMany({ where, select, orderBy, take: max }), d.count({ where })])
  return {
    resultaat: {
      tabel: t.naam, totaal, getoond: rijen.length,
      ...(totaal > rijen.length ? { let_op: `Er zijn ${totaal} rijen; je ziet de eerste ${rijen.length}. Tel met tel_tabel of filter scherper.` } : {}),
      rijen: rijen.map((r) => {
        const uit: Record<string, unknown> = {}
        for (const v of zichtbaar) uit[v.naam] = uitvoer(v, r[v.naam])
        const link = t.link?.(r)
        if (link) uit.link = link
        return uit
      }),
    },
    bron: bronVan(t, lijst, nu, `${totaal} ${totaal === 1 ? 'rij' : 'rijen'}`),
  }
}

interface TelVraag { tabel?: unknown; waar?: unknown; groepeer?: unknown; som?: unknown }

export async function telTabel(db: Db, vraag: TelVraag, nu = new Date()) {
  const t = tabel(vraag.tabel)
  const { where, lijst } = filters(t, vraag.waar, nu)
  const som = vraag.som ? veld(t, vraag.som) : null
  if (som && som.soort !== 'getal') throw new LeesFout(`Optellen kan alleen bij een getal (${som.naam} is ${som.soort}).`)
  const d = delegate(db, t)

  if (!vraag.groepeer) {
    const [aantal, agg] = await Promise.all([
      d.count({ where }),
      som ? d.aggregate({ where, _sum: { [som.naam]: true } }) : Promise.resolve(null),
    ])
    const totaal = agg ? Number(agg._sum[som!.naam] ?? 0) : undefined
    return {
      resultaat: { tabel: t.naam, aantal, ...(som ? { [`som_${som.naam}`]: totaal } : {}) },
      bron: bronVan(t, lijst, nu, `telling: ${aantal}`),
    }
  }

  const g = veld(t, vraag.groepeer)
  if (g.soort === 'json' || g.soort === 'lijst') throw new LeesFout(`Op ${g.naam} kan niet gegroepeerd worden.`)
  let groepen: { waarde: unknown; aantal: number; som?: number }[]
  if (g.soort === 'tijdstip' || g.soort === 'tijdstip-tekst') {
    // Per dag: Prisma groepeert alleen op de precieze waarde, dus hier zelf.
    const rijen = await d.findMany({ where, select: { [g.naam]: true, ...(som ? { [som.naam]: true } : {}) }, take: 20_000 })
    const per = new Map<string, { aantal: number; som: number }>()
    for (const r of rijen) {
      const w = r[g.naam]
      const dag = w ? vandaagIso(new Date(w as string | Date)) : 'leeg'
      const x = per.get(dag) ?? { aantal: 0, som: 0 }
      x.aantal++
      if (som) x.som += Number(r[som.naam] ?? 0)
      per.set(dag, x)
    }
    groepen = [...per.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, MAX_GROEPEN)
      .map(([waarde, x]) => ({ waarde, aantal: x.aantal, ...(som ? { som: x.som } : {}) }))
  } else {
    const rijen = await d.groupBy({
      by: [g.naam], where, _count: { _all: true }, ...(som ? { _sum: { [som.naam]: true } } : {}),
      orderBy: { _count: { [g.naam]: 'desc' } }, take: MAX_GROEPEN,
    })
    groepen = rijen.map((r) => ({
      waarde: uitvoer(g, r[g.naam]),
      aantal: (r._count as { _all: number })._all,
      ...(som ? { som: Number((r._sum as Record<string, unknown>)[som.naam] ?? 0) } : {}),
    }))
  }
  return {
    resultaat: { tabel: t.naam, groepeerOp: g.naam, ...(som ? { somVan: som.naam } : {}), groepen },
    bron: bronVan(t, lijst, nu, `geteld per ${g.naam}`),
  }
}
