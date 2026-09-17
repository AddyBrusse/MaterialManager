import { describe, it, expect } from 'vitest'
import type { Project } from '@stockmanager/shared'
import { statusActies } from '../project-status-acties'

/** Minimaal project; per test alleen wat de regel raakt. */
function project(over: Partial<Project> = {}): Project {
  return {
    id: 'PRJ-2026-001', naam: 'Test', status: 'concept',
    offertes: [], productieOrders: [], paklijst: null, factuur: null,
    opdrachtbevestiging: null, statusReden: null, statusVorige: null,
    ...over,
  } as unknown as Project
}

const actieVoor = (p: Project, status: Project['status']) =>
  statusActies(p).find(i => i.status === status)!.actie

describe('statusActies', () => {
  it('markeert de huidige status', () => {
    expect(actieVoor(project({ status: 'productie' }), 'productie')).toEqual({ soort: 'huidig' })
  })

  it('stuurt vooruit naar de tab waar het document gemaakt wordt', () => {
    const p = project({ status: 'concept' })
    expect(actieVoor(p, 'offerte')).toEqual({ soort: 'vooruit', tab: 'offertes' })
    expect(actieVoor(p, 'bevestigd')).toEqual({ soort: 'vooruit', tab: 'offertes' })
    expect(actieVoor(p, 'gefactureerd')).toEqual({ soort: 'vooruit', tab: 'factuur' })
  })

  it('laat één stap terug toe en verwijst verder terug naar die ene stap', () => {
    const p = project({ status: 'gefactureerd' })
    expect(actieVoor(p, 'verzonden')).toMatchObject({ soort: 'terug', revert: 'gefactureerd' })
    expect(actieVoor(p, 'productie')).toEqual({ soort: 'geblokkeerd', reden: 'Eerst terug naar Verzonden' })
  })

  // De server weigert dit ook; het menu moet dat niet pas ná de klik laten zien.
  it('blokkeert terug naar bevestigd zodra een order gereed is', () => {
    const p = project({
      status: 'productie',
      productieOrders: [{ id: 'PROD-1', status: 'gereed', stappen: [] }],
    } as unknown as Partial<Project>)
    expect(actieVoor(p, 'bevestigd')).toEqual({ soort: 'geblokkeerd', reden: 'Orders zijn al gereedgemeld' })
  })

  it('blokkeert terug naar productie zodra de paklijst verzonden is', () => {
    const p = project({ status: 'paklijst', paklijst: { id: 'PL-1', verzondenOp: '2026-09-17T10:00:00Z' } } as unknown as Partial<Project>)
    expect(actieVoor(p, 'productie')).toEqual({ soort: 'geblokkeerd', reden: 'Paklijst is al verzonden' })
  })

  // revertBevestigd landt op `offerte` als er ooit één verzonden is, anders op
  // `concept` — het menu moet die stap op dezelfde regel aanbieden.
  it('volgt waar revertBevestigd uitkomt', () => {
    const metVerzonden = project({
      status: 'bevestigd',
      offertes: [{ id: 'OFF-1', status: 'geaccepteerd', verzondenOp: '2026-09-01T09:00:00Z' }],
    } as unknown as Partial<Project>)
    expect(actieVoor(metVerzonden, 'offerte')).toMatchObject({ soort: 'terug', revert: 'bevestigd' })
    expect(actieVoor(metVerzonden, 'concept')).toEqual({ soort: 'geblokkeerd', reden: 'Eerst terug naar Offerte' })

    const zonder = project({
      status: 'bevestigd',
      offertes: [{ id: 'OFF-1', status: 'geaccepteerd', verzondenOp: null }],
    } as unknown as Partial<Project>)
    expect(actieVoor(zonder, 'concept')).toMatchObject({ soort: 'terug', revert: 'bevestigd' })
  })

  it('kent geen weg terug van offerte naar concept', () => {
    expect(actieVoor(project({ status: 'offerte' }), 'concept'))
      .toEqual({ soort: 'geblokkeerd', reden: 'Een verzonden offerte kan niet terug naar concept' })
  })

  it('laat een stilgezet project eerst hervatten', () => {
    const p = project({ status: 'on_hold' })
    expect(statusActies(p).every(i => i.actie.soort === 'geblokkeerd')).toBe(true)
    expect(actieVoor(p, 'productie')).toEqual({ soort: 'geblokkeerd', reden: 'Project staat stil — eerst hervatten' })
  })

  it('overleeft een project zonder arrays uit oude localStorage', () => {
    const p = { id: 'PRJ-0', naam: 'Oud', status: 'bevestigd' } as unknown as Project
    expect(() => statusActies(p)).not.toThrow()
  })
})
