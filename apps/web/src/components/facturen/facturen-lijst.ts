import { factuurNummerTekst, heeftFactuurnummer, isVervallen, type VerkoopFactuur } from '@stockmanager/shared'
import { factuurStatus } from '../../features/projects/detail/tabs/facturen/FactuurRij'

/**
 * Filters en status van de pagina Facturen (2026-11-18). De status in woorden
 * is dezelfde als op de Facturen-tab van een project (`factuurStatus`).
 */
export type StatusFilter = '' | 'concept' | 'open' | 'vervallen' | 'betaald'
export type HerkomstFilter = '' | 'los' | 'project'

export const STATUS_FILTERS: { value: Exclude<StatusFilter, ''>; label: string }[] = [
  { value: 'concept', label: 'Nog niet verstuurd' },
  { value: 'open', label: 'Wacht op betaling' },
  { value: 'vervallen', label: 'Vervallen' },
  { value: 'betaald', label: 'Betaald of verrekend' },
]

function statusVan(f: VerkoopFactuur): Exclude<StatusFilter, ''> {
  if (!f.verzondenOp) return 'concept'
  if (f.soort === 'credit' || f.betaaldOp) return 'betaald'
  return isVervallen(f) ? 'vervallen' : 'open'
}

const KLEUR: Record<string, string> = { warn: 'warn', ok: 'ok', dgr: 'danger', accent: 'info' }

export function statusBadge(f: VerkoopFactuur): { label: string; cls: string; uitleg: string } {
  const s = factuurStatus(f)
  return { label: s.pill, cls: KLEUR[s.kleur] ?? '', uitleg: s.uitleg }
}

export interface Filters {
  q: string
  soort: '' | 'factuur' | 'credit'
  klant: string
  status: StatusFilter
  herkomst: HerkomstFilter
}

export const GEEN_FILTERS: Filters = { q: '', soort: '', klant: '', status: '', herkomst: '' }

export function filter(facturen: VerkoopFactuur[], f: Filters): VerkoopFactuur[] {
  const q = f.q.trim().toLowerCase()
  return facturen.filter((x) =>
    (!f.soort || x.soort === f.soort)
    && (!f.klant || x.relatieId === f.klant)
    && (!f.status || statusVan(x) === f.status)
    && (!f.herkomst || (f.herkomst === 'los') === !x.projectId)
    && (!q || [factuurNummerTekst(x.id), x.id, x.klantNaam, x.projectNaam, x.projectId, x.klantRef, x.crediteertFactuurId,
      ...x.regels.map((r) => `${r.artikelId ?? ''} ${r.naam}`)].join(' ').toLowerCase().includes(q)))
}

/** Wat bovenaan hoort: niet verstuurd, dan op datum, nieuwste eerst. */
export function sorteer(facturen: VerkoopFactuur[]): VerkoopFactuur[] {
  const datum = (f: VerkoopFactuur) => f.verzondenOp ?? f.createdAt
  return [...facturen].sort((a, b) =>
    Number(!!a.verzondenOp) - Number(!!b.verzondenOp)
    || Number(heeftFactuurnummer(b.id)) - Number(heeftFactuurnummer(a.id))
    || datum(b).localeCompare(datum(a)))
}
