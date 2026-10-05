import { describe, it, expect } from 'vitest'
import { waaromNietProjectVerwijderen, type Project } from '@stockmanager/shared'

// Alleen de velden die de regel leest; de rest doet er hier niet toe.
function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'PRJ-2026-001', naam: 'Test', relatieId: null, contactId: null, klantRef: null,
    status: 'concept', statusReden: null, statusVorige: null, levertijdDatum: null, notities: '',
    offertes: [], opdrachtbevestiging: null, productieOrders: [], paklijsten: [], facturen: [],
    createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
    ...extra,
  } as Project
}

const offerte = (status: string, verzondenOp: string | null = null) =>
  ({ id: 'o1', versie: 1, status, verzondenOp }) as unknown as Project['offertes'][number]

describe('waaromNietProjectVerwijderen', () => {
  it('mag een leeg project of een project met alleen een concept', () => {
    expect(waaromNietProjectVerwijderen(project())).toBeNull()
    expect(waaromNietProjectVerwijderen(project({ offertes: [offerte('concept')] }))).toBeNull()
  })

  it('weigert zodra de klant een offerte heeft gekregen', () => {
    const r = waaromNietProjectVerwijderen(project({ offertes: [offerte('verzonden', '2026-10-02')] }))
    expect(r).toContain('offerte v1 al gekregen')
    expect(r).toContain('Annuleer het project')
  })

  it('noemt een verstuurde factuur vóór de rest', () => {
    const r = waaromNietProjectVerwijderen(project({
      offertes: [offerte('geaccepteerd', '2026-10-02')],
      paklijsten: [{ id: 'PL-2026-001', verzondenOp: '2026-10-03' }] as Project['paklijsten'],
      facturen: [{ id: 'F-2026-001', verzondenOp: '2026-10-04' }] as Project['facturen'],
    }))
    expect(r).toContain('F-2026-001 is al verstuurd')
  })

  it('weigert als er in de hal aan gewerkt is', () => {
    const r = waaromNietProjectVerwijderen(project({
      productieOrders: [{ id: 'PO-1', status: 'in_productie', aantalGereed: 0 }] as unknown as Project['productieOrders'],
    }))
    expect(r).toContain('aan PO-1 is al gewerkt')
  })

  it('weigert een project dat niet bestaat', () => {
    expect(waaromNietProjectVerwijderen(undefined)).toContain('bestaat niet')
  })
})
