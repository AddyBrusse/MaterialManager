import { describe, it, expect } from 'vitest'
import type { MailAttachment, NormalizedMail } from '@stockmanager/shared'
import { extractLines, orderNumbersInSubject } from '../extract-lines'

function att(filename: string, isEmbeddedMessage = false): MailAttachment {
  return { filename, sizeBytes: 1024, path: null, isEmbeddedMessage }
}

function mail(partial: Partial<NormalizedMail>): NormalizedMail {
  return {
    source: 'drop', messageId: null, subject: '', bodyText: '', bodyHtml: null,
    receivedAt: null, from: null, to: [], cc: [], attachments: [], rawHeaders: null,
    ...partial,
  }
}

describe('orderNumbersInSubject', () => {
  it('vindt het ordernummer uit een echt onderwerp', () => {
    expect(orderNumbersInSubject('koppel order: 2026077')).toEqual(['2026077'])
    expect(orderNumbersInSubject('RE: Orderbevestiging 0003772761 Klantref Addy')).toEqual(['0003772761'])
  })

  it('pikt geen korte getallen op', () => {
    expect(orderNumbersInSubject('3 stuks nodig')).toEqual([])
  })
})

describe('extractLines — bijlagenamen', () => {
  it('leest het gemeten patroon <ordernummer>-<positie>', () => {
    const lines = extractLines(mail({
      subject: 'koppel order: 2026077',
      attachments: [att('2026077-001.STEP'), att('2026077-002.STEP')],
    }))
    expect(lines.map(l => [l.tekening, l.positie])).toEqual([['2026077-001', 1], ['2026077-002', 2]])
  })

  it('leest een streepje NIET als positie zonder ordernummer in het onderwerp', () => {
    // Zonder die controle zou elk tekeningnummer met een streepje stilletjes
    // een positienummer krijgen.
    const lines = extractLines(mail({ subject: 'Offerteaanvraag', attachments: [att('123456-02.pdf')] }))
    expect(lines[0].positie).toBeNull()
    expect(lines[0].tekening).toBe('123456-02')
  })

  it('haalt revisie en aantal uit de naam', () => {
    const lines = extractLines(mail({ attachments: [att('123456_rev B.pdf'), att('P-4471 (3x).pdf')] }))
    expect(lines.find(l => l.tekening === '123456')?.rev).toBe('B')
    expect(lines.find(l => l.tekening === 'P-4471')?.qty).toBe(3)
  })

  it('ziet een tekening en zijn model als één regel', () => {
    const lines = extractLines(mail({
      subject: 'koppel order: 2026077',
      attachments: [att('2026077-001.STEP'), att('2026077-001.pdf')],
    }))
    expect(lines).toHaveLength(1)
  })

  it('negeert bijlagen die geen onderdeel zijn', () => {
    const lines = extractLines(mail({
      attachments: [att('handtekening.p7s'), att('image001.gif'), att('logo.pdf'), att('offerte.xlsx')],
    }))
    expect(lines).toEqual([])
  })

  it('negeert een meegestuurd bericht', () => {
    expect(extractLines(mail({ attachments: [att('Doorgestuurd.msg', true)] }))).toEqual([])
  })
})

describe('extractLines — vorm van het resultaat', () => {
  it('markeert niets als handmatig gekozen', () => {
    const lines = extractLines(mail({ subject: 'order 2026077', attachments: [att('2026077-001.STEP')] }))
    expect(lines[0].handmatig).toBe(false)
    expect(lines[0].artikelId).toBeNull()
    expect(lines[0].status).toBe('nieuw')
  })
})

describe('extractLines — bodytekst', () => {
  it('leest aantal + code uit een regel', () => {
    const lines = extractLines(mail({ bodyText: 'Graag prijs voor 3x 123456\nGroet' }))
    expect(lines).toHaveLength(1)
    expect(lines[0].tekening).toBe('123456')
    expect(lines[0].qty).toBe(3)
  })

  it('leest ook "- 5 stuks"', () => {
    const lines = extractLines(mail({ bodyText: 'P-4471 - 5 stuks' }))
    expect(lines[0].qty).toBe(5)
  })

  it('laat gewone zinnen met rust', () => {
    expect(extractLines(mail({ bodyText: 'Hoi Addy,\n\nKun je hier eens naar kijken?\n\nGroet, Remco' }))).toEqual([])
  })

  it('leest een doorstuur-kop niet als regel', () => {
    const body = 'Van: Inkoop <inkoop@klant.nl>\nVerzonden: donderdag 3 september 2026 10:12\nOnderwerp: 2026077'
    expect(extractLines(mail({ bodyText: body }))).toEqual([])
  })

  it('vult het aantal uit de body aan op een regel uit een bijlagenaam', () => {
    const lines = extractLines(mail({
      subject: 'order 2026077',
      attachments: [att('2026077-001.STEP')],
      bodyText: 'Van deze willen we er 4x',
    }))
    // De bodyregel heeft geen eigen code, dus levert geen tweede regel op.
    expect(lines).toHaveLength(1)
  })
})
