import { describe, it, expect } from 'vitest'
import type { CandidateLine, NormalizedMail } from '@stockmanager/shared'
import { buildPrompt, grondingVan, haystack, isGrounded, mergeLines, scansVoorModel, type AiLine } from '../ai-extract'

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
    qty: null, bron: 'bijlagenaam', attachmentFilename: '2615-0091-0530.step', bestanden: [], matches: [],
    status: 'nieuw', artikelId: null, handmatig: false, extractor: 'regels', bronTekst: null, gegrond: null,
    bronBestand: null, zekerheid: 0, zekerheidRedenen: [],
    ...partial,
  }
}

function aiLine(partial: Partial<AiLine> = {}): AiLine {
  return {
    tekening: '2615-0091-0530', omschrijving: 'Signaalplaat', qty: 10, rev: null, positie: null,
    bronBestand: null, bronTekst: '10x de signaalplaat', zekerheid: 0.9,
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

const PDF = Buffer.from('%PDF-1.7 nep')

function buffers(namen: string[]) {
  return { get: (n: string) => (namen.includes(n) ? PDF : undefined) }
}

describe('scansVoorModel', () => {
  it('stuurt een pdf zonder tekstlaag mee als afbeelding', () => {
    const m = mail({ attachments: [attachment('scan.pdf', null)] })
    expect(scansVoorModel(m, buffers(['scan.pdf'])).map((a) => a.filename)).toEqual(['scan.pdf'])
  })

  it('laat een pdf mét tekstlaag met rust — die tekst gaat al mee', () => {
    const m = mail({ attachments: [attachment('order.pdf', 'Pos 1')] })
    expect(scansVoorModel(m, buffers(['order.pdf']))).toEqual([])
  })

  it('slaat een 3D-model over: dat is geen pdf', () => {
    const m = mail({ attachments: [attachment('2026077-001.STEP', null)] })
    expect(scansVoorModel(m, { get: () => Buffer.from('ISO-10303-21;') })).toEqual([])
  })

  it('zet het handelsdocument voorop als er meer scans zijn', () => {
    const m = mail({
      attachments: [
        attachment('2615-0091-0530-1.pdf', null),
        attachment('Purchase order_2604307.pdf', null),
      ],
    })
    const namen = ['2615-0091-0530-1.pdf', 'Purchase order_2604307.pdf']
    expect(scansVoorModel(m, buffers(namen))[0].filename).toBe('Purchase order_2604307.pdf')
  })
})

describe('grondingVan', () => {
  const hay = haystack(mail({ attachments: [attachment('order.pdf', 'Pos 1 2615-0091-0530 aantal 10')] }))

  it('is waar als het citaat er letterlijk staat', () => {
    expect(grondingVan(aiLine({ bronTekst: 'Pos 1 2615-0091-0530' }), hay, new Set())).toBe(true)
  })

  it('is onwaar als het citaat nergens staat', () => {
    expect(grondingVan(aiLine({ bronTekst: '5x koppelstuk 9999-9999' }), hay, new Set())).toBe(false)
  })

  it('is onbekend als de regel uit een scan komt — daar valt niets in te zoeken', () => {
    const regel = aiLine({ bronTekst: '5x koppelstuk 9999-9999', bronBestand: 'scan.pdf' })
    expect(grondingVan(regel, hay, new Set(['scan.pdf']))).toBe(null)
  })

  it('blijft onwaar voor een regel uit de mailtekst, ook als er een scan bij zit', () => {
    // De vorige versie zette de controle voor de héle mail uit zodra er één
    // scan bij zat; een verzonnen regel liftte daarop mee.
    const regel = aiLine({ bronTekst: '5x koppelstuk 9999-9999', bronBestand: null })
    expect(grondingVan(regel, hay, new Set(['scan.pdf']))).toBe(false)
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
    expect(lines[0].qty).toBe(4) // buiten het document wint het geteste patroon
    expect(lines[0].rev).toBe('B') // maar wat leeg was wordt wél gevuld
  })

  it('laat het model winnen op de ordertabel — daar ziet het de kolommen', () => {
    // Gemeten: het patroon las "2026 stuks" uit `As ø50x178 4 4-9-2026pcs`,
    // omdat de leverdatum tegen de eenheid aan plakte.
    const uitPatroon = candidate({ tekening: '2611-1456-0234', qty: 2026, positie: null })
    const uitTabel = aiLine({
      tekening: '2611-1456-0234', qty: 4, positie: 10,
      bronBestand: 'aanvraag.pdf', bronTekst: '2611-1456-0234 As ø50x178 4',
    })
    const { lines } = mergeLines([uitPatroon], [uitTabel], hay, { document: 'aanvraag.pdf' })
    expect(lines[0].qty).toBe(4)
    expect(lines[0].positie).toBe(10)
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

  it('laat gronding open voor een regel die uit een scan komt', () => {
    const regel = aiLine({ tekening: '9999-9999', bronTekst: '5x koppelstuk', bronBestand: 'scan.pdf' })
    const { lines } = mergeLines([], [regel], hay, { scans: new Set(['scan.pdf']) })
    expect(lines[0].gegrond).toBe(null)
  })

  it('laat een tekening geen tweede regel maken als het document leidend is', () => {
    // Dit is het geval uit de praktijk: de order noemt 2615-0091-0530 en de
    // tekening heet 2604307-1-2615-0091-0530-1. Twee regels voor één onderdeel.
    const uitOrder = aiLine({
      tekening: '2615-0091-0530', qty: 60, positie: 10,
      bronBestand: 'Purchase order_2604307.pdf', bronTekst: '10 2615-0091-0530 60',
    })
    const uitTekening = aiLine({
      tekening: '2604307-1-2615-0091-0530-1', qty: null, positie: 1,
      bronBestand: '2604307-1-2615-0091-0530-1.pdf', bronTekst: '2604307-1-2615-0091-0530-1',
    })
    const { lines } = mergeLines([], [uitOrder, uitTekening], hay, {
      document: 'Purchase order_2604307.pdf',
      scans: new Set(['Purchase order_2604307.pdf']),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].qty).toBe(60)
  })

  it('hangt de tekeningbestanden aan de regel waar ze bij horen', () => {
    const uitOrder = aiLine({ tekening: '2615-0091-0530', qty: 60, bronBestand: 'PO.pdf', bronTekst: '2615-0091-0530' })
    const { lines } = mergeLines([], [uitOrder], hay, {
      document: 'PO.pdf',
      attachments: [
        attachment('2604307-1-2615-0091-0530-1.dwg', null),
        attachment('2604307-1-2615-0091-0530-1.stp', null),
        attachment('iets-anders-123456.stp', null),
      ],
    })
    expect(lines[0].bestanden).toEqual([
      '2604307-1-2615-0091-0530-1.dwg',
      '2604307-1-2615-0091-0530-1.stp',
    ])
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
