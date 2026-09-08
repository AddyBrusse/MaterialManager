import { describe, it, expect } from 'vitest'
import type { CandidateLine, NormalizedMail } from '@stockmanager/shared'
import { buildPrompt, hasUnreadableAttachment, haystack, isGrounded, mergeLines, type AiLine } from '../ai-extract'

function mail(partial: Partial<NormalizedMail> = {}): NormalizedMail {
  return {
    source: 'drop', messageId: null, subject: 'Aanvraag 2604307', bodyText: 'Graag 10x de signaalplaat.',
    bodyHtml: null, receivedAt: null, from: { naam: 'Klant', email: 'inkoop@klant.nl' }, to: [], cc: [],
    attachments: [], rawHeaders: null,
    ...partial,
  }
}

function attachment(filename: string, tekst: string | null) {
  return { filename, sizeBytes: 100, path: null, isEmbeddedMessage: false, tekst, tekstPath: null }
}

function candidate(partial: Partial<CandidateLine> = {}): CandidateLine {
  return {
    id: 'kand-1', ruweTekst: '2615-0091-0530.step', tekening: '2615-0091-0530', rev: null, positie: null,
    qty: null, bron: 'bijlagenaam', attachmentFilename: '2615-0091-0530.step', matches: [], status: 'nieuw',
    artikelId: null, handmatig: false, extractor: 'regels', bronTekst: null, gegrond: null, zekerheid: 0,
    zekerheidRedenen: [],
    ...partial,
  }
}

function aiLine(partial: Partial<AiLine> = {}): AiLine {
  return {
    tekening: '2615-0091-0530', omschrijving: 'Signaalplaat', qty: 10, rev: null, positie: null,
    bronTekst: '10x de signaalplaat', zekerheid: 0.9,
    ...partial,
  }
}

describe('isGrounded', () => {
  const hay = haystack(mail({ attachments: [attachment('order.pdf', 'Pos 1  2615-0091-0530  aantal 10')] }))

  it('herkent een letterlijk citaat', () => {
    expect(isGrounded('2615-0091-0530  aantal 10', hay)).toBe(true)
  })

  it('kijkt door andere spaties en regelovergangen heen', () => {
    expect(isGrounded('Pos 1\n2615-0091-0530\naantal 10', hay)).toBe(true)
  })

  it('wijst een verzonnen tekeningnummer af', () => {
    expect(isGrounded('2615-0099-0530 aantal 10', hay)).toBe(false)
  })

  it('wijst lege tekst af', () => {
    expect(isGrounded('   ', hay)).toBe(false)
  })
})

describe('hasUnreadableAttachment', () => {
  it('ziet een bijlage zonder tekstlaag', () => {
    expect(hasUnreadableAttachment(mail({ attachments: [attachment('scan.pdf', null)] }))).toBe(true)
    expect(hasUnreadableAttachment(mail({ attachments: [attachment('order.pdf', 'tekst')] }))).toBe(false)
  })
})

describe('buildPrompt', () => {
  it('geeft het model onderwerp, bericht en bijlagetekst mee', () => {
    const p = buildPrompt(mail({ attachments: [attachment('order.pdf', 'Pos 1 2615-0091-0530')] }))
    expect(p).toContain('Aanvraag 2604307')
    expect(p).toContain('Graag 10x de signaalplaat.')
    expect(p).toContain('--- BIJLAGE: order.pdf')
    expect(p).toContain('Pos 1 2615-0091-0530')
  })

  it('zegt het als een bijlage geen tekstlaag heeft', () => {
    expect(buildPrompt(mail({ attachments: [attachment('scan.pdf', null)] }))).toContain('geen tekstlaag')
  })
})

describe('mergeLines', () => {
  const hay = haystack(mail({ attachments: [attachment('order.pdf', '2615-0091-0530 10x de signaalplaat')] }))

  it('vouwt dezelfde regel van beide motoren samen', () => {
    const { lines, modelZekerheid } = mergeLines([candidate()], [aiLine()], hay)
    expect(lines).toHaveLength(1)
    expect(lines[0].extractor).toBe('beide')
    expect(lines[0].id).toBe('kand-1')
    expect(modelZekerheid.get('kand-1')).toBe(0.9)
  })

  it('vult aan wat de regelmotor niet wist, zonder te overschrijven', () => {
    const { lines } = mergeLines([candidate({ qty: 4 })], [aiLine({ qty: 10, rev: 'B' })], hay)
    expect(lines[0].qty).toBe(4) // getest patroon wint van het model
    expect(lines[0].rev).toBe('B') // maar wat leeg was wordt wél gevuld
  })

  it('voegt een regel toe die alleen in de lopende tekst stond', () => {
    const { lines } = mergeLines([], [aiLine()], hay)
    expect(lines).toHaveLength(1)
    expect(lines[0].extractor).toBe('ai')
    expect(lines[0].gegrond).toBe(true)
    expect(lines[0].qty).toBe(10)
  })

  it('markeert een regel die niet in de bron terug te vinden is', () => {
    const { lines } = mergeLines([], [aiLine({ tekening: '9999-9999', bronTekst: '5x koppelstuk 9999-9999' })], hay)
    expect(lines[0].gegrond).toBe(false)
  })

  it('laat gronding open als er alleen een scan is', () => {
    const { lines } = mergeLines([], [aiLine({ tekening: '9999-9999', bronTekst: '5x koppelstuk 9999-9999' })], hay, {
      grondingOncontroleerbaar: true,
    })
    expect(lines[0].gegrond).toBe(null)
  })

  it('sorteert op positie als de klant die meegaf', () => {
    const { lines } = mergeLines(
      [],
      [aiLine({ tekening: 'A-1', positie: 2, bronTekst: 'A-1' }), aiLine({ tekening: 'B-2', positie: 1, bronTekst: 'B-2' })],
      hay,
      { grondingOncontroleerbaar: true }
    )
    expect(lines.map((l) => l.tekening)).toEqual(['B-2', 'A-1'])
  })
})
