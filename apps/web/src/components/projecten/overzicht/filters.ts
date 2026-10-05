import type { Project, ProjectStatus } from '@stockmanager/shared'
import { PROJECT_STATUS_CONFIG } from '../projectColumns'
import { dagVan, heeftSignaal, SIGNAAL_LABEL, type SignaalId, type Signalen } from './signalen'

/**
 * De filters van het projectenoverzicht als een rij chips (2026-10-05). Een
 * tegel zet er een, "+ Filter" voegt er een toe, × haalt hem weg. Alle chips
 * gelden samen. Een filter is gewone data, zodat hij als weergave te bewaren
 * is (`projects.views`).
 */
export type Filter =
  | { soort: 'signaal'; signaal: SignaalId }
  | { soort: 'status'; status: ProjectStatus }
  | { soort: 'klant'; relatieId: string }
  | { soort: 'contact'; contactId: string }
  | { soort: 'levertijd'; periode: 'voorbij' | 'week' | 'maand' | 'tussen'; van?: string; tot?: string }
  | { soort: 'offerteLeeftijd'; dagen: number }
  | { soort: 'bedrag'; min?: number; max?: number }
  | { soort: 'aangemaakt'; van?: string; tot?: string }
  | { soort: 'heeft'; wat: HeeftWat }

export type HeeftWat = 'deellevering' | 'conceptPakbon' | 'conceptFactuur' | 'credit'

export const HEEFT_LABEL: Record<HeeftWat, string> = {
  deellevering: 'deellevering',
  conceptPakbon: 'concept-pakbon',
  conceptFactuur: 'concept-factuur',
  credit: 'creditfactuur',
}

export const LEVERTIJD_LABEL = {
  voorbij: 'voorbij',
  week: 'binnen 7 dagen',
  maand: 'binnen 30 dagen',
  tussen: 'tussen',
} as const

export interface FilterCtx {
  nu: Date
  signalen: (p: Project) => Signalen
  /** Opdrachtwaarde excl. btw, zoals de kolom "Bedrag excl." */
  bedrag: (p: Project) => number
  klantNaam: (relatieId: string) => string
  contactNaam: (contactId: string) => string
}

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`
const datum = (iso?: string) => (iso ? iso.split('-').reverse().join('-') : '…')

function plusDagen(d: Date, n: number): string {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return dagVan(x)
}

export function past(p: Project, f: Filter, ctx: FilterCtx): boolean {
  switch (f.soort) {
    case 'signaal':
      return heeftSignaal(ctx.signalen(p), f.signaal)
    case 'status':
      return p.status === f.status
    case 'klant':
      return p.relatieId === f.relatieId
    case 'contact':
      return p.contactId === f.contactId
    case 'levertijd': {
      const lt = p.levertijdDatum?.slice(0, 10)
      if (!lt) return false
      const vandaag = dagVan(ctx.nu)
      if (f.periode === 'voorbij') return lt < vandaag
      if (f.periode === 'week') return lt >= vandaag && lt <= plusDagen(ctx.nu, 7)
      if (f.periode === 'maand') return lt >= vandaag && lt <= plusDagen(ctx.nu, 30)
      return (!f.van || lt >= f.van) && (!f.tot || lt <= f.tot)
    }
    case 'offerteLeeftijd': {
      const d = ctx.signalen(p).offerteDagenUit
      return d !== null && d >= f.dagen
    }
    case 'bedrag': {
      const b = ctx.bedrag(p)
      return (f.min == null || b >= f.min) && (f.max == null || b <= f.max)
    }
    case 'aangemaakt': {
      const a = p.createdAt.slice(0, 10)
      return (!f.van || a >= f.van) && (!f.tot || a <= f.tot)
    }
    case 'heeft':
      if (f.wat === 'deellevering') return p.paklijsten.filter((x) => x.verzondenOp).length > 1
      if (f.wat === 'conceptPakbon') return p.paklijsten.some((x) => !x.verzondenOp)
      if (f.wat === 'conceptFactuur') return p.facturen.some((x) => !x.verzondenOp)
      return p.facturen.some((x) => x.soort === 'credit')
  }
}

export function pastAlle(p: Project, filters: Filter[], ctx: FilterCtx): boolean {
  return filters.every((f) => past(p, f, ctx))
}

/** De tekst op de chip. */
export function filterLabel(f: Filter, ctx: Pick<FilterCtx, 'klantNaam' | 'contactNaam'>): string {
  switch (f.soort) {
    case 'signaal':
      return SIGNAAL_LABEL[f.signaal]
    case 'status':
      return `Status: ${PROJECT_STATUS_CONFIG[f.status]?.label ?? f.status}`
    case 'klant':
      return `Klant: ${ctx.klantNaam(f.relatieId) || 'onbekend'}`
    case 'contact':
      return `Contact: ${ctx.contactNaam(f.contactId) || 'onbekend'}`
    case 'levertijd':
      return f.periode === 'tussen'
        ? `Levertijd: ${datum(f.van)} t/m ${datum(f.tot)}`
        : `Levertijd: ${LEVERTIJD_LABEL[f.periode]}`
    case 'offerteLeeftijd':
      return `Offerte langer dan ${f.dagen} dagen uit`
    case 'bedrag':
      return f.min != null && f.max != null
        ? `Bedrag: ${eur(f.min)} – ${eur(f.max)}`
        : f.min != null
          ? `Bedrag vanaf ${eur(f.min)}`
          : `Bedrag tot ${eur(f.max ?? 0)}`
    case 'aangemaakt':
      return `Aangemaakt: ${datum(f.van)} t/m ${datum(f.tot)}`
    case 'heeft':
      return `Heeft ${HEEFT_LABEL[f.wat]}`
  }
}

/** Twee filters zijn hetzelfde als ze dezelfde inhoud hebben — dan zet je hem niet twee keer. */
export const zelfde = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b)

/** Tegel aan/uit: staat het signaal er, dan eruit; anders erbij. */
export function wisselSignaal(filters: Filter[], signaal: SignaalId): Filter[] {
  const f: Filter = { soort: 'signaal', signaal }
  return filters.some((x) => zelfde(x, f)) ? filters.filter((x) => !zelfde(x, f)) : [...filters, f]
}

/** Een bewaarde weergave: een naam en een rij filters (`projects.views`, per gebruiker). */
export interface Weergave {
  naam: string
  filters: Filter[]
}
export const PROJECT_VIEWS_KEY = 'projects.views'
