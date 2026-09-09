import { describe, it, expect } from 'vitest'
import type { Project, ProjectStatus } from '@stockmanager/shared'
import { buildStapItems, teltMeeInPlanning } from '../planningSharedUtils'

// Een project dat stilligt of afgeblazen is hoort uit de machinewachtrij en de
// prognose te verdwijnen — anders is "on hold" alleen een label en blijft het
// werk capaciteit bezetten die er niet is. De orders zelf blijven wél bestaan,
// zodat hervatten alles terugbrengt.

function project(status: ProjectStatus): Project {
  return {
    id: 'PRJ-1', naam: 'Test', relatieId: null, contactId: null, klantRef: null,
    status, statusReden: null, statusVorige: null, levertijdDatum: '2026-10-01',
    notities: '', offertes: [], opdrachtbevestiging: null, paklijst: null, factuur: null,
    productieOrders: [{
      id: 'PROD-1', projectId: 'PRJ-1', offerteRegelId: 'r1', artikelId: null,
      artikelNaam: 'Plaat', qty: 2, eenheid: 'stuks', status: 'gepland',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      stappen: [{
        id: 's1', volgorde: 1, naam: 'zagen', machine: 'Zaag',
        gereedOp: null, gereedDoor: null, geplandDatum: null, geplandMachine: null,
        queuePosition: null, notBefore: null,
      }],
    }],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('planning slaat stilgelegde projecten over', () => {
  it('neemt een lopend project wel mee', () => {
    expect(teltMeeInPlanning(project('productie'))).toBe(true)
    expect(buildStapItems([project('productie')], [])).toHaveLength(1)
  })

  it('slaat on hold over', () => {
    expect(teltMeeInPlanning(project('on_hold'))).toBe(false)
    expect(buildStapItems([project('on_hold')], [])).toHaveLength(0)
  })

  it('slaat geannuleerd over', () => {
    expect(teltMeeInPlanning(project('geannuleerd'))).toBe(false)
    expect(buildStapItems([project('geannuleerd')], [])).toHaveLength(0)
  })

  it('laat de order en zijn stappen intact, zodat hervatten alles terugbrengt', () => {
    const p = project('on_hold')
    buildStapItems([p], [])
    expect(p.productieOrders[0].stappen).toHaveLength(1)
    expect(buildStapItems([{ ...p, status: 'productie' }], [])).toHaveLength(1)
  })
})
