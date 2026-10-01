import { describe, it, expect } from 'vitest'
import type { Project, Relatie } from '@stockmanager/shared'
import { enigContact, klantOpties, verstuurdeDocumenten, waarschuwingKlantWissel } from '../klant-keuze'

const NU = '2026-10-01T10:00:00Z'

function rel(id: string, naam: string, over: Partial<Relatie> = {}): Relatie {
  return {
    id, naam, type: 'klant', actief: true, land: 'Nederland', factuurAdresZelfde: true,
    afleverAdresZelfde: true, contacten: [], createdAt: NU, ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'PRJ', naam: 'Test', relatieId: 'K1', contactId: null, klantRef: null, status: 'offerte',
    statusReden: null, statusVorige: null, levertijdDatum: null, notities: '', offertes: [],
    opdrachtbevestiging: null, productieOrders: [], paklijsten: [], facturen: [],
    createdAt: NU, updatedAt: NU, ...over,
  }
}

describe('klantOpties', () => {
  // Besloten 2026-10-01: alleen klanten in de lijst.
  it('toont klanten en "beide", geen leveranciers, op naam gesorteerd', () => {
    const uit = klantOpties([
      rel('L', 'Staalhandel', { type: 'leverancier' }),
      rel('B', 'Bakker', { type: 'beide' }),
      rel('A', 'Aalbers'),
    ], null)
    expect(uit.map((o) => o.label)).toEqual(['Aalbers', 'Bakker'])
  })

  it('verbergt inactieve klanten, behalve de klant die nu gekozen is', () => {
    const lijst = [rel('A', 'Aalbers', { actief: false }), rel('B', 'Bakker')]
    expect(klantOpties(lijst, null).map((o) => o.value)).toEqual(['B'])
    expect(klantOpties(lijst, 'A').map((o) => o.value)).toEqual(['A', 'B'])
  })
})

describe('enigContact', () => {
  it('vult de contactpersoon alleen in als er precies één is', () => {
    expect(enigContact(rel('A', 'A', { contacten: [{ id: 'c1', naam: 'Piet' }] }))).toBe('c1')
    expect(enigContact(rel('A', 'A', { contacten: [{ id: 'c1', naam: 'Piet' }, { id: 'c2', naam: 'Jan' }] }))).toBeNull()
    expect(enigContact(null)).toBeNull()
  })
})

describe('waarschuwingKlantWissel', () => {
  it('zegt niets zolang er niets verstuurd is', () => {
    expect(waarschuwingKlantWissel(project(), 'Deno')).toBeNull()
  })

  it('noemt wat er al verstuurd is, en aan wie', () => {
    const p = project({
      offertes: [
        { id: 'O1', projectId: 'PRJ', documentNr: 'O1', versie: 1, status: 'verzonden', regels: [], notities: '',
          externeRef: null, direct: false, vervallenDoor: null, geldigTot: null, verzondenOp: NU, geaccepteerdOp: null,
          createdAt: NU, updatedAt: NU },
      ],
    })
    expect(verstuurdeDocumenten(p)).toEqual(['offerte v1'])
    expect(waarschuwingKlantWissel(p, 'Deno Compressors')).toBe(
      'Offerte v1 is al verstuurd aan Deno Compressors. Dat verandert niet mee: de klant heeft het zoals het was.',
    )
  })
})
