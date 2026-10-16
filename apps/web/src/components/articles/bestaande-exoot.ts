import type { RawMaterialRow } from '../../api/raw-materials'

/**
 * Dezelfde exoot die er al is (2026-10-16): zelfde klant, kwaliteit, vorm, maat
 * en lengte. Die van dit artikel eerst, dan de oudste — dat is de regel waar
 * het recept en de leveranciersprijzen aan hangen, niet een binnengeboekt stuk.
 */
export function bestaandeExoot(
  rows: RawMaterialRow[],
  zoek: { klantId: string | null; gradeId: string | null; profileId: string | null; maten: Record<string, number>; lengte: number; artikelId: string },
): RawMaterialRow | undefined {
  if (!zoek.klantId || !zoek.gradeId || !zoek.profileId) return undefined
  const zelfdeMaat = (d: Record<string, number>) =>
    Object.keys(zoek.maten).length === Object.keys(d).length && Object.entries(zoek.maten).every(([k, v]) => Number(d[k]) === v)
  return rows
    .filter((r) => r.exoot && r.klantId === zoek.klantId && r.gradeId === zoek.gradeId && r.profileId === zoek.profileId
      && Number(r.lengthMm) === zoek.lengte && zelfdeMaat(r.dimensions))
    .sort((a, b) => Number(b.artikelId === zoek.artikelId) - Number(a.artikelId === zoek.artikelId) || a.createdAt.localeCompare(b.createdAt))[0]
}
