import { describe, it, expect } from 'vitest'
import type { MailAttachment, NormalizedMail } from '@stockmanager/shared'
import { extractLines, orderNumbersInSubject } from '../extract-lines'

function att(filename: string, isEmbeddedMessage = false, tekst: string | null = null): MailAttachment {
  return { filename, sizeBytes: 1024, path: null, isEmbeddedMessage, tekst, tekstPath: null }
}

/** Zoals een inkooporder-pdf er uitgelezen uitkomt (zie services/pdf-text). */
const PO_TEKST = [
  'PURCHASE ORDER',
  'Order no. PUR2604307',
  'Pos Article Description Qty Unit Price',
  '10 2604307-1-2615-0091-0530-1 Bracket welded 4 pcs 125,00',
  '20 2604307-1-2615-0091-0531-2 Pin hardened 12 pcs 18,50',
  '30 123456 Flange 80mm 2 pcs 75,00',
  'Delivery: week 42 Total: 1.234,00 EUR',
].join('\n')

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

  it('negeert een bijlagenaam zonder nummer', () => {
    // Onderdelen worden met een nummer aangeduid; "order.pdf" en "scan.pdf"
    // zijn documenten en werden anders zelf een regel.
    expect(extractLines(mail({ attachments: [att('order.pdf'), att('scan.pdf'), att('tekeningen.pdf')] }))).toEqual([])
  })

  it('negeert het handelsdocument zelf', () => {
    // Waargenomen op echte klantmail: de inkooporder rijdt als pdf mee naast
    // de tekeningen, en werd anders zelf een offerteregel.
    const lines = extractLines(mail({
      subject: 'Inkooporder PUR2604307',
      attachments: [
        att('Purchase order_2604307_20260904_09-42.pdf'),
        att('2604307-1-2615-0091-0530-1_20260904-0942.pdf'),
        att('2604307-1-2615-0091-0530-1_20260904-0942.dwg'),
        att('2604307-1-2615-0091-0530-1_20260904-0942.stp'),
      ],
    }))
    // Eén regel: het onderdeel. De drie bestandsvormen ervan tellen als één,
    // en de inkooporder telt niet mee.
    expect(lines).toHaveLength(1)
    // Zonder exportstempel: die hoort niet bij het tekeningnummer (zie
    // stripExportStamp) en verandert bij elke export.
    expect(lines[0].tekening).toBe('2604307-1-2615-0091-0530-1')
  })

  it('negeert offerte-, factuur- en pakbondocumenten', () => {
    const lines = extractLines(mail({
      attachments: [att('Offerte 2026-123.pdf'), att('Factuur_998.pdf'), att('Packing list.pdf'), att('RFQ 5512.pdf')],
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

describe('exportstempel uit bestandsnamen', () => {
  it('haalt datum+tijd weg die het klantsysteem erachter plakt', () => {
    // Gemeten op mail van Stinis: het systeem exporteert met de exporttijd in
    // de naam. Zonder strippen matcht niets, en leert de alias niets — de
    // stempel is elke mail anders.
    const lines = extractLines(mail({
      subject: 'Inkooporder PUR2604307',
      attachments: [att('2604307-1-2615-0091-0530-1_20260904-0942.pdf')],
    }))
    expect(lines[0].tekening).toBe('2604307-1-2615-0091-0530-1')
  })

  it('herkent ook andere schrijfwijzen van de stempel', () => {
    expect(extractLines(mail({ attachments: [att('123456_20260904_09-42.pdf')] }))[0].tekening).toBe('123456')
    expect(extractLines(mail({ attachments: [att('123456-2026-09-04.pdf')] }))[0].tekening).toBe('123456')
  })

  it('kapt een tekeningnummer NIET af dat toevallig op cijfers eindigt', () => {
    // 99999999 is geen geldige datum (maand 99), dus dit hoort te blijven staan.
    expect(extractLines(mail({ attachments: [att('DEEL-99999999.pdf')] }))[0].tekening).toBe('DEEL-99999999')
    expect(extractLines(mail({ attachments: [att('2026077-001.STEP')] }))[0].tekening).toBe('2026077-001')
  })
})


describe('aantallen uit de tekst van een meegestuurde PDF', () => {
  it('haalt het aantal uit de orderregeltabel', () => {
    const lines = extractLines(mail({
      subject: 'Inkooporder PUR2604307',
      attachments: [att('Purchase order_2604307.pdf', false, PO_TEKST)],
    }))
    const rows = lines.map(l => [l.tekening, l.qty])
    expect(rows).toEqual([
      ['2604307-1-2615-0091-0530-1', 4],
      ['2604307-1-2615-0091-0531-2', 12],
      ['123456', 2],
    ])
  })

  it('vult het aantal aan op de regel die uit de bestandsnaam kwam', () => {
    // De tekening levert de regel, de order levert het aantal — precies het
    // geval uit de praktijk: bestandsnamen dragen zelden een aantal.
    const lines = extractLines(mail({
      subject: 'Inkooporder PUR2604307',
      attachments: [
        att('2604307-1-2615-0091-0530-1_20260904-0942.stp'),
        att('Purchase order_2604307.pdf', false, PO_TEKST),
      ],
    }))
    const regel = lines.find(l => l.tekening === '2604307-1-2615-0091-0530-1')
    expect(regel?.qty).toBe(4)
    // Eén regel voor dat onderdeel, niet twee.
    expect(lines.filter(l => l.tekening === '2604307-1-2615-0091-0530-1')).toHaveLength(1)
  })

  it('leest een lang tekeningnummer in één stuk, niet afgekapt', () => {
    const lines = extractLines(mail({ attachments: [att('order.pdf', false, '10 2604307-1-2615-0091-0530-1 Bracket 4 pcs')] }))
    expect(lines[0].tekening).toBe('2604307-1-2615-0091-0530-1')
  })

  it('ziet kopregels en totalen niet aan voor orderregels', () => {
    const ruis = ['PURCHASE ORDER', 'Pos Article Description Qty Unit Price', 'Delivery: week 42 Total: 1.234,00 EUR', 'Order no. PUR2604307'].join('\n')
    expect(extractLines(mail({ attachments: [att('order.pdf', false, ruis)] }))).toEqual([])
  })

  it('doet niets als er geen tekst uit de PDF kwam (scan)', () => {
    expect(extractLines(mail({ attachments: [att('gescande order.pdf', false, null)] }))).toEqual([])
  })
})
