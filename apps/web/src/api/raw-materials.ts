import type { CreateRawMaterial, UpdateRawMaterial, MovementReason } from '@stockmanager/shared'
import { apiFetch } from './client'

export type GradeInfo = {
  id: string
  name: string
  densityKgM3: string
  createdAt: string
}

export type ProfileInfo = {
  id: string
  name: string
  dimensionSchema: Array<{ key: string; label: string; unit: string }>
  volumeFormula: 'round' | 'square' | 'flat' | 'tube'
  createdAt: string
}

export type LocationSlotWithLocation = {
  id: string
  level1: string
  level2: string | null
  location: { id: string; kind: string; label: string }
}

export type SurfaceFinishInfo = {
  id: string
  name: string
  createdAt: string
}

export type RawMaterialRow = {
  id: string
  code: string
  gradeId: string
  profileId: string
  surfaceFinishId: string | null
  dimensions: Record<string, number>
  lengthMm: string
  currentStock: string
  minStock: string | null
  photoPath: string | null
  weightKg: number
  /** Wat er op deze staaf vastligt voor werk dat nog moet gebeuren, en wat er
   *  dus nog te vergeven is. Komt van de server (`services/voorraad.ts`) zodat
   *  elk scherm hetzelfde getal ziet — toen elk scherm het zelf uitrekende
   *  waren ze het oneens. */
  gereserveerdMm: number
  vrijMm: number
  createdAt: string
  updatedAt: string
  grade: GradeInfo
  profile: ProfileInfo
  surfaceFinish: SurfaceFinishInfo | null
  locationSlot: LocationSlotWithLocation | null
}

export function formatDimensions(profile: Pick<ProfileInfo, 'volumeFormula'>, dims: Record<string, number>): string {
  switch (profile.volumeFormula) {
    case 'round':  return `Ø${dims.diameter}`
    case 'square': return `${dims.side}×${dims.side}`
    case 'flat':   return `${dims.width}×${dims.height}`
    case 'tube':   return `Ø${dims.outerDiameter}/Ø${dims.innerDiameter}`
    default:       return Object.values(dims).join('×')
  }
}

// De gewichtsformule staat in `@stockmanager/shared` — de API rekent er ook mee.
export { computeWeightKg } from '@stockmanager/shared'

export function formatLocation(slot: LocationSlotWithLocation | null): string {
  if (!slot) return '—'
  const base = `${slot.location.label} · ${slot.level1}`
  return slot.level2 ? `${base} · ${slot.level2}` : base
}

export const rawMaterialsApi = {
  list: () => apiFetch<RawMaterialRow[]>('/raw-materials'),
  get:  (id: string) => apiFetch<RawMaterialRow>(`/raw-materials/${id}`),

  create: (body: CreateRawMaterial) =>
    apiFetch<RawMaterialRow>('/raw-materials', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: UpdateRawMaterial) =>
    apiFetch<RawMaterialRow>(`/raw-materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (id: string) =>
    apiFetch<void>(`/raw-materials/${id}`, { method: 'DELETE' }),

  /**
   * Adjust remaining stock length in mm (used by MutatieModal) via the
   * generic /movements endpoint — there never was a `/raw-materials/:id/adjust`
   * route, so this used to silently fall back to a local-only mock that
   * couldn't find DB-backed items ("Mutatie mislukt").
   */
  adjustStock: (id: string, newCurrentStockMm: number, reason: MovementReason, note?: string) =>
    apiFetch<{ id: string }>('/movements', {
      method: 'POST',
      body: JSON.stringify({
        itemType: 'raw', itemId: id, kind: 'overwrite',
        amount: Math.round(newCurrentStockMm), reason, note: note || undefined,
      }),
    }),
}
