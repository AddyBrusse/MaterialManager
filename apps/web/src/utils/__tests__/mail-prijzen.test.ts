import { describe, it, expect } from 'vitest'
import { telAfwijkingen, vergelijkPrijs } from '../../components/projecten/mail-prijzen'
import type { CandidateLine } from '@stockmanager/shared'
import type { Article } from '../../api/articles'

function line(klantPrijs: number | null, qty = 1): CandidateLine {
  return {
    id: 'l1', ruweTekst: '', tekening: '123', rev: null, positie: 1, qty,
    bron: 'pdf', attachmentFilename: null, bestanden: [], matches: [], status: 'match',
    artikelId: 'ART-1', handmatig: false, extractor: 'ai', bronTekst: '', gegrond: true,
    tekeningGegrond: true, bevestigd: true, bronBestand: null,
    klantArtikel: null, klantPrijs, omschrijving: null, zekerheid: 0.9, zekerheidRedenen: [],
  }
}

/** Een artikel met een vaste verkoopprijs, zodat de test niet over de
 *  calculatie gaat maar over de vergelijking. */
function artikelMetPrijs(prijs: number): Article {
  return {
    id: 'ART-1', naam: 'Test', klant: null, relatieId: null, contactId: null,
    tekening: '123', rev: null, drawingPath: null, photoPath: null,
    recipe: null, operations: [], notes: { workholding: '', general: '' },
    attachments: [],
    // Eén uitbesteed-knoop met een vaste kostprijs en 0% marge: dan is de
    // verkoopprijs exact dat bedrag, en gaat de test over de vergelijking en
    // niet over de calculatie.
    estimate: { nodes: [{ id: 'n1', type: 'external', naam: 'vast', externalCost: prijs }], marginPct: 0 },
    locatie: null, currentStock: 0, minStock: null, maxStock: null,
    createdAt: '', updatedAt: '',
  } as unknown as Article
}

const bronnen = { grades: [], profiles: [], machines: [] }

describe('vergelijkPrijs', () => {
  it('zwijgt als de klant geen prijs noemt — een aanvraag heeft er geen', () => {
    expect(vergelijkPrijs(line(null), artikelMetPrijs(100), bronnen)).toBeNull()
  })

  it('zwijgt zonder gekoppeld artikel', () => {
    expect(vergelijkPrijs(line(100), null, bronnen)).toBeNull()
  })

  it('zwijgt als onze prijs nul is — er valt dan niets te vergelijken', () => {
    expect(vergelijkPrijs(line(100), artikelMetPrijs(0), bronnen)).toBeNull()
  })

  it('meldt een klant die met een oude, lagere prijs bestelt', () => {
    const v = vergelijkPrijs(line(85), artikelMetPrijs(100), bronnen)!
    expect(v.klantLager).toBe(true)
    expect(v.verschil).toBeCloseTo(-15)
    expect(v.procent).toBe(-15)
  })

  it('meldt het ook als de klant méér rekent dan wij vragen', () => {
    const v = vergelijkPrijs(line(120), artikelMetPrijs(100), bronnen)!
    expect(v.klantLager).toBe(false)
    expect(v.procent).toBe(20)
  })

  it('zeurt niet over een cent afrondingsverschil', () => {
    expect(vergelijkPrijs(line(100.005), artikelMetPrijs(100), bronnen)).toBeNull()
  })
})

describe('telAfwijkingen', () => {
  it('telt de afwijkingen en die in ons nadeel apart', () => {
    const v = [
      vergelijkPrijs(line(85), artikelMetPrijs(100), bronnen),
      vergelijkPrijs(line(120), artikelMetPrijs(100), bronnen),
      null,
    ]
    expect(telAfwijkingen(v)).toEqual({ totaal: 2, inOnsNadeel: 1 })
  })
})
