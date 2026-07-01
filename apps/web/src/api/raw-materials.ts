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

// Weight (kg) from profile formula + dimensions + length + grade density.
// Volume in mm³ → m³ (÷ 1e9) × density. Mirrors features/34-grades-profiles.md.
export function computeWeightKg(
  volumeFormula: ProfileInfo['volumeFormula'],
  dims: Record<string, number>,
  lengthMm: number,
  densityKgM3: number,
): number {
  let area = 0 // mm²
  switch (volumeFormula) {
    case 'round':  area = Math.PI * Math.pow((dims.diameter ?? 0) / 2, 2); break
    case 'square': area = Math.pow(dims.side ?? 0, 2); break
    case 'flat':   area = (dims.width ?? 0) * (dims.height ?? 0); break
    case 'tube':   area = Math.PI * (Math.pow((dims.outerDiameter ?? 0) / 2, 2) - Math.pow((dims.innerDiameter ?? 0) / 2, 2)); break
  }
  const volumeMm3 = area * (lengthMm || 0)
  return (volumeMm3 / 1e9) * densityKgM3
}

export function formatLocation(slot: LocationSlotWithLocation | null): string {
  if (!slot) return '—'
  const base = `${slot.location.label} · ${slot.level1}`
  return slot.level2 ? `${base} · ${slot.level2}` : base
}

// ── mock data ─────────────────────────────────────────────────────────────────
// currentStock = remaining length of this piece in mm
// minStock     = minimum usable length threshold in mm
export const MOCK_MATERIALS: RawMaterialRow[] = [
  { id: 'm1', code: '#00001', gradeId: 'g3', profileId: 'p1', surfaceFinishId: 'sf1', dimensions: { diameter: 50 },                   lengthMm: '6000', currentStock: '5500', minStock: '500', photoPath: null, weightKg: 92.5,  createdAt: '2026-05-01T08:00:00Z', updatedAt: '2026-05-26T08:00:00Z', grade: { id: 'g3', name: 'S355',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond',     dimensionSchema: [{ key: 'diameter', label: 'Diameter', unit: 'mm' }],                                                                                         volumeFormula: 'round',  createdAt: '' }, surfaceFinish: { id: 'sf1', name: 'Blank', createdAt: '' }, locationSlot: { id: 's1a', level1: 'R1', level2: null,  location: { id: 'l1', kind: 'rack', label: 'Hal A · Stelling 01' } } },
  { id: 'm2', code: '#00002', gradeId: 'g3', profileId: 'p1', surfaceFinishId: null,  dimensions: { diameter: 30 },                   lengthMm: '3000', currentStock: '1200', minStock: '300', photoPath: null, weightKg: 16.6,  createdAt: '2026-05-02T08:00:00Z', updatedAt: '2026-05-24T08:00:00Z', grade: { id: 'g3', name: 'S355',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond',     dimensionSchema: [{ key: 'diameter', label: 'Diameter', unit: 'mm' }],                                                                                         volumeFormula: 'round',  createdAt: '' }, surfaceFinish: null,                                            locationSlot: { id: 's2a', level1: 'R1', level2: null,  location: { id: 'l2', kind: 'rack', label: 'Hal A · Stelling 02' } } },
  { id: 'm3', code: '#00003', gradeId: 'g1', profileId: 'p3', surfaceFinishId: 'sf3', dimensions: { width: 100, height: 10 },         lengthMm: '6000', currentStock: '0',    minStock: '500', photoPath: null, weightKg: 47.1,  createdAt: '2026-05-03T08:00:00Z', updatedAt: '2026-05-20T08:00:00Z', grade: { id: 'g1', name: 'S235',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p3', name: 'Plat',     dimensionSchema: [{ key: 'width', label: 'Breedte', unit: 'mm' }, { key: 'height', label: 'Hoogte', unit: 'mm' }],                                            volumeFormula: 'flat',   createdAt: '' }, surfaceFinish: { id: 'sf3', name: 'WGW',   createdAt: '' }, locationSlot: { id: 's5c', level1: 'R3', level2: null,  location: { id: 'l5', kind: 'rack', label: 'Hal B · Vak 14'      } } },
  { id: 'm4', code: '#00004', gradeId: 'g3', profileId: 'p4', surfaceFinishId: null,  dimensions: { outerDiameter: 60.3, innerDiameter: 51.3 }, lengthMm: '6000', currentStock: '4800', minStock: '500', photoPath: null, weightKg: 40.2, createdAt: '2026-05-04T08:00:00Z', updatedAt: '2026-05-25T08:00:00Z', grade: { id: 'g3', name: 'S355',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p4', name: 'Buis',     dimensionSchema: [{ key: 'outerDiameter', label: 'Buitendiameter', unit: 'mm' }, { key: 'innerDiameter', label: 'Binnendiameter', unit: 'mm' }], volumeFormula: 'tube',   createdAt: '' }, surfaceFinish: null,                                            locationSlot: { id: 's2c', level1: 'R1', level2: 'V2', location: { id: 'l2', kind: 'rack', label: 'Hal A · Stelling 02' } } },
  { id: 'm5', code: '#00005', gradeId: 'g3', profileId: 'p2', surfaceFinishId: 'sf2', dimensions: { side: 25 },                       lengthMm: '3000', currentStock: '3000', minStock: '300', photoPath: null, weightKg: 14.7,  createdAt: '2026-05-05T08:00:00Z', updatedAt: '2026-05-23T08:00:00Z', grade: { id: 'g3', name: 'S355',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p2', name: 'Vierkant', dimensionSchema: [{ key: 'side', label: 'Zijde', unit: 'mm' }],                                                                                         volumeFormula: 'square', createdAt: '' }, surfaceFinish: { id: 'sf2', name: 'Ruw',   createdAt: '' }, locationSlot: { id: 's4a', level1: 'R1', level2: null,  location: { id: 'l4', kind: 'rack', label: 'Hal B · Vak 12'      } } },
  { id: 'm6', code: '#00006', gradeId: 'g1', profileId: 'p1', surfaceFinishId: null,  dimensions: { diameter: 80 },                   lengthMm: '3000', currentStock: '350',  minStock: '500', photoPath: null, weightKg: 118.4, createdAt: '2026-05-06T08:00:00Z', updatedAt: '2026-05-18T08:00:00Z', grade: { id: 'g1', name: 'S235',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p1', name: 'Rond',     dimensionSchema: [{ key: 'diameter', label: 'Diameter', unit: 'mm' }],                                                                                         volumeFormula: 'round',  createdAt: '' }, surfaceFinish: null,                                            locationSlot: { id: 's3c', level1: 'R3', level2: null,  location: { id: 'l3', kind: 'rack', label: 'Hal A · Stelling 03' } } },
  { id: 'm7', code: '#00007', gradeId: 'g1', profileId: 'p3', surfaceFinishId: 'sf4', dimensions: { width: 200, height: 20 },         lengthMm: '6000', currentStock: '5200', minStock: '500', photoPath: null, weightKg: 188.4, createdAt: '2026-05-07T08:00:00Z', updatedAt: '2026-05-22T08:00:00Z', grade: { id: 'g1', name: 'S235',    densityKgM3: '7850', createdAt: '' }, profile: { id: 'p3', name: 'Plat',     dimensionSchema: [{ key: 'width', label: 'Breedte', unit: 'mm' }, { key: 'height', label: 'Hoogte', unit: 'mm' }],                                            volumeFormula: 'flat',   createdAt: '' }, surfaceFinish: { id: 'sf4', name: 'KGW',   createdAt: '' }, locationSlot: { id: 's6b', level1: 'R2', level2: null,  location: { id: 'l6', kind: 'cabinet', label: 'Hal C · Buitenopslag' } } },
]


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
