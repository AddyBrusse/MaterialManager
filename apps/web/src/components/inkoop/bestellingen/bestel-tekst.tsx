import type { BestelBron, BestelRegel, BestelStatus } from '@stockmanager/shared'

/** Teksten voor de inkoopschermen (2026-10-06): één plek, zodat elk scherm hetzelfde zegt. */

export const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const mm = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm`
export const kg = (n: number) => `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg`
export const datum = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const STATUS: Record<BestelStatus, { label: string; cls: string }> = {
  te_bestellen: { label: 'Te bestellen', cls: 'warn' },
  aangevraagd: { label: 'Aangevraagd', cls: 'info' },
  besteld: { label: 'Besteld', cls: 'info' },
  ontvangen: { label: 'Ontvangen', cls: 'ok' },
}

export function BestelStatusBadge({ status }: { status: BestelStatus }) {
  const s = STATUS[status]
  return <span className={`st-badge ${s.cls}`}><span className="dot" />{s.label}</span>
}

const BRON: Record<BestelBron, string> = {
  opdracht_exoot: 'exoot uit de opdracht',
  tekort: 'tekort uit de materiaalselectie',
  handmatig: 'met de hand toegevoegd',
  lage_voorraad: 'onder de minimumvoorraad',
}
export const bronTekst = (b: BestelBron) => BRON[b]

/** "4 × 300 mm" */
export const aantalTekst = (r: Pick<BestelRegel, 'stuks' | 'lengteMm'>) => `${r.stuks} × ${mm(r.lengteMm)}`
