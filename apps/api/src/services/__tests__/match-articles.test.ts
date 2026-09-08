import { describe, it, expect } from 'vitest'
import type { CandidateLine } from '@stockmanager/shared'
import { matchLine, matchLines, normalizeRef, type ArticleCandidate } from '../match-articles'

function line(partial: Partial<CandidateLine>): CandidateLine {
  return {
    id: 'k1', ruweTekst: '', tekening: null, rev: null, positie: null, qty: null,
    bron: 'bijlagenaam', attachmentFilename: null, matches: [], status: 'nieuw', artikelId: null, handmatig: false,
    ...partial,
  }
}

const articles: ArticleCandidate[] = [
  { id: 'ART-0001', naam: 'Flens 80mm', tekening: '123456', rev: 'B' },
  { id: 'ART-0002', naam: 'Askoppeling', tekening: '2026077-001', rev: null },
  { id: 'ART-0003', naam: 'Bus RVS', tekening: 'P-4471', rev: 'A' },
  { id: 'ART-0004', naam: 'Plaat', tekening: null, rev: null },
]

describe('normalizeRef', () => {
  it('maakt schrijfwijzen gelijk', () => {
    expect(normalizeRef('123.456-01')).toBe('12345601')
    expect(normalizeRef('123456_01')).toBe('12345601')
    expect(normalizeRef(null)).toBe('')
  })
})

describe('matchLine', () => {
  it('koppelt op tekening + revisie en vult voor', () => {
    const r = matchLine(line({ tekening: '123456', rev: 'B' }), articles)
    expect(r.status).toBe('match')
    expect(r.artikelId).toBe('ART-0001')
    expect(r.matches[0].score).toBeGreaterThan(0.9)
  })

  it('meldt het als de revisie afwijkt, maar koppelt wel', () => {
    const r = matchLine(line({ tekening: '123456', rev: 'C' }), articles)
    expect(r.artikelId).toBe('ART-0001')
    expect(r.matches[0].reden).toContain('rev B')
    expect(r.matches[0].reden).toContain('C')
  })

  it('koppelt het gemeten patroon uit een bijlagenaam', () => {
    const r = matchLine(line({ tekening: '2026077-001' }), articles)
    expect(r.artikelId).toBe('ART-0002')
  })

  it('koppelt ook als de schrijfwijze verschilt', () => {
    expect(matchLine(line({ tekening: '123.456' }), articles).artikelId).toBe('ART-0001')
  })

  it('vult niets voor op alleen een naamgelijkenis', () => {
    const r = matchLine(line({ tekening: null, ruweTekst: 'Plaat' }), articles)
    expect(r.status).toBe('twijfel')
    expect(r.artikelId).toBeNull()
    expect(r.matches).not.toHaveLength(0)
  })

  it('geeft "nieuw" als er niets in de buurt komt', () => {
    const r = matchLine(line({ tekening: 'ZZ-99999' }), articles)
    expect(r.status).toBe('nieuw')
    expect(r.matches).toEqual([])
    expect(r.artikelId).toBeNull()
  })

  it('kiest niemand bij een gelijkspel', () => {
    const tweeling: ArticleCandidate[] = [
      { id: 'A', naam: 'Flens oud', tekening: '123456', rev: null },
      { id: 'B', naam: 'Flens nieuw', tekening: '123456', rev: null },
    ]
    const r = matchLine(line({ tekening: '123456' }), tweeling)
    expect(r.status).toBe('twijfel')
    expect(r.artikelId).toBeNull()
    expect(r.matches).toHaveLength(2)
  })

  it('laat een geleerde koppeling winnen van alles', () => {
    const r = matchLine(
      line({ tekening: 'P-4471' }),
      articles,
      [{ externalRef: 'P4471', articleId: 'ART-0001' }]  // klant noemt onze flens zo
    )
    expect(r.artikelId).toBe('ART-0001')
    expect(r.matches[0].reden).toContain('Eerder al')
  })

  it('past een alias van een ander nummer niet toe', () => {
    const r = matchLine(line({ tekening: 'P-4471' }), articles, [{ externalRef: 'IETS-ANDERS', articleId: 'ART-0001' }])
    expect(r.artikelId).toBe('ART-0003')
  })

  it('houdt hooguit drie kandidaten over', () => {
    const veel: ArticleCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      id: `ART-${i}`, naam: `Flens ${i}`, tekening: '123456', rev: null,
    }))
    expect(matchLine(line({ tekening: '123456' }), veel).matches).toHaveLength(3)
  })
})

describe('matchLines', () => {
  it('verwerkt een hele mail en laat de regels intact', () => {
    const rows = matchLines(
      [line({ id: 'a', tekening: '123456', rev: 'B', qty: 3 }), line({ id: 'b', tekening: 'ONBEKEND' })],
      articles
    )
    expect(rows.map(r => r.status)).toEqual(['match', 'nieuw'])
    expect(rows[0].qty).toBe(3)
    expect(rows[0].id).toBe('a')
  })
})


describe('ons tekeningnummer verstopt in de aanduiding van de klant', () => {
  // Uit de praktijk: de klant zet zijn ordernummer en positie vóór ons
  // tekeningnummer, en twee van onze artikelen schelen één cijfer.
  const platen: ArticleCandidate[] = [
    { id: 'ART-0006', naam: 'Signal plate twistlock', tekening: '2615-0090-0530', rev: '0' },
    { id: 'ART-0011', naam: 'Signaleringsplaat twistlock', tekening: '2615-0091-0530', rev: null },
  ]

  it('vindt het juiste artikel binnen de langere klantaanduiding', () => {
    const r = matchLine(line({ tekening: '2604307-1-2615-0091-0530-1' }), platen)
    expect(r.artikelId).toBe('ART-0011')
    expect(r.status).toBe('match')
    expect(r.matches[0].reden).toContain('zit in de aanduiding')
  })

  it('kiest de buurman met één cijfer verschil NIET', () => {
    // 0090 naast 0091: precies het geval waar afronden een verkeerde plaat
    // op de offerte zou zetten.
    const r = matchLine(line({ tekening: '2604307-1-2615-0090-0530-1' }), platen)
    expect(r.artikelId).toBe('ART-0006')
    expect(r.matches).toHaveLength(1)
  })

  it('herkent het nummer ook zonder streepjes', () => {
    expect(matchLine(line({ tekening: 'PO99/261500910530/A' }), platen).artikelId).toBe('ART-0011')
  })

  it('pikt geen kort nummer op binnen een lange string', () => {
    const kort: ArticleCandidate[] = [{ id: 'ART-X', naam: 'Bout', tekening: '0530', rev: null }]
    expect(matchLine(line({ tekening: '2604307-1-2615-0091-0530-1' }), kort).artikelId).toBeNull()
  })
})
