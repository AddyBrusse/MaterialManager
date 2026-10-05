/** Getallen en datums zoals ze op een document staan: € 3.547,50 · 19-06-2026. */

export function bedrag(n: number): string {
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function getal(n: number): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: 3 })
}

export function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const tw = (x: number) => String(x).padStart(2, '0')
  return `${tw(d.getDate())}-${tw(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** Positie zoals in het template: 001, 002, … */
export function positie(i: number): string {
  return String(i + 1).padStart(3, '0')
}
