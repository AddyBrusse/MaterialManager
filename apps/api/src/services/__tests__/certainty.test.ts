import { describe, it, expect } from 'vitest'
import type { ArticleMatch, CandidateLine } from '@stockmanager/shared'
import { buildRapport, scoreLine, scoreLines } from '../certainty'

function line(partial: Partial<CandidateLine> = {}): CandidateLine {
  return {
    id: 'k1', ruweTekst: '123456.step', tekening: '123456', rev: null, positie: null, qty: null,
    bron: 'bijlagenaam', attachmentFilename: null, matches: [], status: 'nieuw', artikelId: null,
    handmatig: false, extractor: 'ai', bronTekst: 'bron', gegrond: true, bronBestand: null,
    tekeningGegrond: true, bevestigd: null, bestanden: [], zekerheid: 0, zekerheidRedenen: [],
    ...partial,
  }
}

function match(score: number, naam = 'Flens'): ArticleMatch {
  return { artikelId: 'ART-1', naam, tekening: '123456', rev: null, score, reden: 'tekening exact' }
}

describe('scoreLine', () => {
  it('geeft een volledig onderbouwde regel een hoge zekerheid', () => {
    const out = scoreLine(
      line({ bevestigd: true, qty: 10, status: 'match', matches: [match(0.95)] }),
      { modelZekerheid: 0.95 }
    )
    expect(out.zekerheid).toBeGreaterThan(0.9)
  })

  it('straft een tekeningnummer af dat nergens in de mail staat', () => {
    // De duurste fout: 2615-0090-0530 en 2615-0091-0530 zijn allebei echt.
    const goed = line({ qty: 4, status: 'match', matches: [match(0.9)] })
    const verschoven = { ...goed, tekeningGegrond: false }
    expect(scoreLine(verschoven).zekerheid).toBeLessThan(scoreLine(goed).zekerheid)
    expect(scoreLine(verschoven).zekerheidRedenen.join(' ')).toMatch(/staat nergens letterlijk/i)
  })

  it('straft een regel af waarover de twee lezingen het oneens zijn', () => {
    const eens = line({ bevestigd: true, qty: 4, status: 'match', matches: [match(0.9)] })
    const oneens = { ...eens, bevestigd: false }
    expect(scoreLine(oneens).zekerheid).toBeLessThan(scoreLine(eens).zekerheid)
    expect(scoreLine(oneens).zekerheidRedenen.join(' ')).toMatch(/controlelezing/i)
  })

  it('straft een regel af die het model niet kan aanwijzen', () => {
    const basis = line({ gegrond: true, qty: 4, status: 'match', matches: [match(0.9)] })
    const verzonnen = { ...basis, gegrond: false }
    const a = scoreLine(basis, { modelZekerheid: 0.9 })
    const b = scoreLine(verzonnen, { modelZekerheid: 0.9 })
    expect(b.zekerheid).toBeLessThan(a.zekerheid)
    expect(b.zekerheidRedenen.join(' ')).toMatch(/niet letterlijk/i)
  })

  it('zegt het als de bijlage geen tekstlaag heeft', () => {
    const out = scoreLine(line({ gegrond: null, tekeningGegrond: null }), { modelZekerheid: 0.8 })
    expect(out.zekerheidRedenen.join(' ')).toMatch(/scan/i)
  })

  it('blijft laag zolang er geen artikel aan hangt', () => {
    const out = scoreLine(line({ qty: 5 }))
    expect(out.zekerheid).toBeLessThan(0.6)
    expect(out.zekerheidRedenen).toContain('Geen artikel in de database gevonden')
  })

  it('rekent twijfel lager dan een duidelijke treffer', () => {
    const zeker = scoreLine(line({ qty: 1, status: 'match', matches: [match(0.9)] }))
    const twijfel = scoreLine(line({ qty: 1, status: 'twijfel', matches: [match(0.9), match(0.88, 'Bus')] }))
    expect(twijfel.zekerheid).toBeLessThan(zeker.zekerheid)
  })

  it('vertrouwt een handmatige keuze volledig', () => {
    const out = scoreLine(line({ qty: 2, handmatig: true, artikelId: 'ART-1', status: 'match' }))
    expect(out.zekerheidRedenen).toContain('Handmatig gekozen')
    expect(out.zekerheid).toBeGreaterThan(0.8)
  })

  it('noemt wat er ontbreekt', () => {
    const out = scoreLine(line({ tekening: null, qty: null }))
    expect(out.zekerheidRedenen).toContain('Geen tekeningnummer herkend')
    expect(out.zekerheidRedenen).toContain('Geen aantal gevonden')
  })
})

describe('buildRapport', () => {
  it('vat de regels samen', () => {
    const lines = scoreLines([
      line({ id: 'a', qty: 1, status: 'match', matches: [match(0.95)] }),
      line({ id: 'b', gegrond: false, tekeningGegrond: false, bevestigd: false }),
    ])
    const rapport = buildRapport(lines, { aiGebruikt: true, model: 'claude-opus-5', foutmelding: null })
    expect(rapport.ongegrondeRegels).toBe(1)
    expect(rapport.onbevestigdeRegels).toBe(1)
    expect(rapport.laagsteZekerheid).toBeLessThan(rapport.zekerheid)
    expect(rapport.model).toBe('claude-opus-5')
  })

  it('geeft nul terug zonder regels', () => {
    const rapport = buildRapport([], { aiGebruikt: false, model: null, foutmelding: null })
    expect(rapport.zekerheid).toBe(0)
    expect(rapport.laagsteZekerheid).toBe(0)
  })
})
