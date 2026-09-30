import { describe, it, expect } from 'vitest'
import { waaromNietVersturenOB, obInhoud, obWijzigingen, type Project } from '@stockmanager/shared'

function project(ob: Partial<NonNullable<Project['opdrachtbevestiging']>> | null): Project {
  return {
    id: 'PRJ-1', naam: 'Aandrijfset', relatieId: null, contactId: null, klantRef: 'INK-88421',
    status: 'bevestigd', statusReden: null, statusVorige: null, levertijdDatum: '2026-10-06',
    notities: '', offertes: [], productieOrders: [], paklijsten: [], facturen: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    opdrachtbevestiging: ob && {
      id: 'OB-1', projectId: 'PRJ-1', offerteId: 'OFF-1', levertijdDatum: '2026-10-06', notities: '',
      opdrachtRef: 'INK-88421', status: 'concept', verzondenOp: null, verzendingen: [], wijzigingen: [],
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      regels: [{
        id: 'r1', sortOrder: 1, artikelId: 'ART-1', naam: 'Afstandsbus', omschrijving: '',
        qty: 20, eenheid: 'st', verkoopprijs: 46.2, totaal: 924, bewerkingen: [],
      }],
      ...ob,
    },
  }
}

describe('waaromNietVersturenOB', () => {
  it('mag met regels en een opdrachtreferentie', () => {
    expect(waaromNietVersturenOB(project({}))).toBeNull()
  })

  // Afgesproken 2026-09-28: een appje "maken!" is ook een opdracht, maar dan
  // moet er wel staan dát het een appje was, en van wanneer.
  it('eist een opdrachtreferentie', () => {
    expect(waaromNietVersturenOB(project({ opdrachtRef: null }))).toContain('zonder opdrachtreferentie')
    expect(waaromNietVersturenOB(project({ opdrachtRef: '  ' }))).toContain('zonder opdrachtreferentie')
  })

  it('zegt het als er nog geen opdracht is', () => {
    expect(waaromNietVersturenOB(project(null))).toContain('nog geen opdracht')
  })
})

describe('obWijzigingen', () => {
  const p = project({})
  const klant = obInhoud(p)!

  it('meldt niets als de klant de actuele stand heeft', () => {
    expect(obWijzigingen(klant, obInhoud(p)!)).toEqual([])
  })

  it('noemt een verschoven levertijd met beide datums', () => {
    const later = { ...p, levertijdDatum: '2026-10-10' }
    expect(obWijzigingen(klant, obInhoud(later)!)).toEqual([
      'Levertijd: klant heeft 06-10-2026, nu 10-10-2026',
    ])
  })

  it('noemt aantal, prijs, nieuwe en vervallen regels', () => {
    const ob = p.opdrachtbevestiging!
    const nu = obInhoud({
      ...p,
      opdrachtbevestiging: {
        ...ob,
        regels: [
          { ...ob.regels[0], id: 'r2', naam: 'Klembus' },
        ],
      },
    })!
    const anders = obInhoud({
      ...p,
      opdrachtbevestiging: { ...ob, regels: [{ ...ob.regels[0], qty: 25, verkoopprijs: 44 }] },
    })!
    expect(obWijzigingen(klant, nu)).toEqual(['Regel "Klembus" toegevoegd', 'Regel "Afstandsbus" verwijderd'])
    expect(obWijzigingen(klant, anders)).toEqual([
      '"Afstandsbus": aantal 20 → 25',
      '"Afstandsbus": prijs € 46,20 → € 44,00',
    ])
  })
})
