/**
 * Opmaak volgens §1: nl-NL, datums dd-mm-jjjj, bedragen € 1.234,56 met altijd
 * twee decimalen, percentages met teken.
 */

const EUR = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function eur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return EUR.format(v)
}

/** Percentage met teken: +18,0% / −3,2%. Null → streepje. */
export function pct(v: number | null | undefined, decimalen = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toLocaleString('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  })
  const teken = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${teken}${s}%`
}

export function getal(v: number | null | undefined, decimalen = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  })
}

/** ISO-datum of -datumtijd → dd-mm-jjjj. Onleesbare invoer geeft een streepje. */
export function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/** dd-mm zonder jaar, voor bijschriften waar het jaar niets toevoegt. */
export function datumKort(iso: string | null | undefined): string {
  const v = datum(iso)
  return v === '—' ? v : v.slice(0, 5)
}

export function tijdstip(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Hele dagen tussen vandaag en een datum. Negatief = in het verleden. */
export function dagenTot(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const a = new Date()
  a.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - a.getTime()) / 86_400_000)
}

/**
 * "over 15 dagen" / "vandaag" / "3 dagen geleden". Bewust niet afgekort: dit
 * staat onder een datum en moet zonder rekenen te lezen zijn.
 */
export function relatieveDagen(iso: string | null | undefined): string {
  const n = dagenTot(iso)
  if (n === null) return ''
  if (n === 0) return 'vandaag'
  if (n === 1) return 'morgen'
  if (n === -1) return 'gisteren'
  return n > 0 ? `over ${n} dagen` : `${Math.abs(n)} dagen geleden`
}
