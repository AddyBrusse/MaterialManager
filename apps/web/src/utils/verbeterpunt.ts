/**
 * Rekenwerk achter de knop "Dit klopt niet" (2026-10-24), los van React zodat
 * het te testen is.
 */

/** Een rood kader op de schermafbeelding, als fractie van breedte en hoogte (0–1). */
export interface Kader {
  x: number
  y: number
  b: number
  h: number
}

/** Kleiner dan dit is een klik, geen kader. */
const MIN = 0.008

const klem = (v: number) => Math.min(1, Math.max(0, v))

/** Het kader tussen twee punten, in welke richting er ook gesleept is. */
export function kaderUitPunten(a: { x: number; y: number }, c: { x: number; y: number }): Kader | null {
  const x1 = klem(Math.min(a.x, c.x)), x2 = klem(Math.max(a.x, c.x))
  const y1 = klem(Math.min(a.y, c.y)), y2 = klem(Math.max(a.y, c.y))
  if (x2 - x1 < MIN && y2 - y1 < MIN) return null
  return { x: x1, y: y1, b: x2 - x1, h: y2 - y1 }
}

/** Lijndikte in beeldpunten: zichtbaar op een groot scherm, niet lomp op een klein. */
export function lijnDikte(breedtePx: number): number {
  return Math.max(3, Math.round(breedtePx / 400))
}

/**
 * Het adres binnen de app, zodat "Open pagina" er later naartoe kan. Een los
 * venster (/pop/…) wordt de gewone pagina: dat venster is er later niet meer.
 */
export function paginaAdres(loc: { pathname: string; search: string }): string {
  const pad = loc.pathname.replace(/^\/pop(?=\/)/, '') || '/'
  return `${pad}${loc.search}`
}

const MERKEN: [RegExp, string][] = [
  // Volgorde telt: Edge noemt zich ook Chrome, en Chrome noemt zich ook Safari.
  [/Edg\/(\d+)/, 'Edge'], [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'], [/Version\/(\d+).*Safari/, 'Safari'],
]
const SYSTEMEN: [RegExp, string][] = [
  [/Windows/, 'Windows'], [/Android/, 'Android'], [/iPhone|iPad/, 'iOS'], [/Mac OS X/, 'macOS'], [/Linux/, 'Linux'],
]

/** "Edge 130 · Windows" in plaats van een user-agent van 140 tekens. */
export function browserNaam(ua: string): string {
  const merk = MERKEN.map(([re, naam]) => ({ m: re.exec(ua), naam })).find((x) => x.m)
  const systeem = SYSTEMEN.find(([re]) => re.test(ua))?.[1]
  const tekst = merk ? `${merk.naam} ${merk.m![1]}` : 'Onbekende browser'
  return systeem ? `${tekst} · ${systeem}` : tekst
}

/** "24 okt 2026 21:40" */
export function datumTijd(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
}
