import { describe, it, expect } from 'vitest'
import type { CandidateLine, NormalizedMail } from '@stockmanager/shared'
import { config } from '../../config'
import {
  bevestigdDoor, buildLines, buildPrompt, grondingVan, haystack, isGrounded,
  documentenVoorModel, tekeningStaatErIn, type AiLine,
} from '../ai-extract'

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

describe('documentenVoorModel', () => {
  const namen = (m: Parameters<typeof documentenVoorModel>[0], b: Parameters<typeof documentenVoorModel>[1]) =>
    documentenVoorModel(m, b).map((d) => d.bijlage.filename)

  it('stuurt een pdf zonder tekstlaag mee', () => {
    const m = mail({ attachments: [attachment('scan.pdf', null)] })
    expect(namen(m, buffers(['scan.pdf']))).toEqual(['scan.pdf'])
  })

  it('stuurt het handelsdocument óók mee als het wél een tekstlaag heeft', () => {
    // De aanleiding: uit de inkooporder van Veratio (2690655) komt de tekst als
    // "€34,4925-06-2026 15" — prijs, datum en aantal aan elkaar. De tabel is
    // alleen op de pagina zelf nog te lezen.
    const m = mail({ attachments: [attachment('Bestelling Boers 2690655.pdf', 'Inkooporder ...')] })
    expect(namen(m, buffers(['Bestelling Boers 2690655.pdf']))).toEqual(['Bestelling Boers 2690655.pdf'])
  })

  it('meldt of er een tekstlaag in zat — dat bepaalt of de gronding iets kan nazoeken', () => {
    const m = mail({ attachments: [attachment('Bestelling Boers 2690655.pdf', 'Inkooporder ...')] })
    expect(documentenVoorModel(m, buffers(['Bestelling Boers 2690655.pdf']))[0].zonderTekst).toBe(false)

    const scan = mail({ attachments: [attachment('scan.pdf', null)] })
    expect(documentenVoorModel(scan, buffers(['scan.pdf']))[0].zonderTekst).toBe(true)
  })

  it('laat een tekening mét tekstlaag met rust — die tekst gaat al mee', () => {
    // Alleen het leidende document is het waard; anders zou elke tekening met
    // een leesbaar titelblok de aanvraag opblazen.
    const m = mail({
      attachments: [
        attachment('Purchase order_2604307.pdf', 'Pos 1'),
        attachment('2615-0091-0530-1.pdf', 'A3 titelblok'),
      ],
    })
    expect(namen(m, buffers(['Purchase order_2604307.pdf', '2615-0091-0530-1.pdf']))).toEqual([
      'Purchase order_2604307.pdf',
    ])
  })

  it('stuurt geen tekeningen mee zolang er een handelsdocument is', () => {
    // Twee van de acht tekeningen meesturen is erger dan geen: die twee lijken
    // dan bijzonder. Het document bepaalt de regels; koppelen gaat op naam.
    const m = mail({
      attachments: [
        attachment('Bestelling Boers 2690655.pdf', 'Inkooporder ...'),
        attachment('Foam axle_upper roll.pdf', null),
        attachment('Guide base 5_8.pdf', null),
      ],
    })
    expect(namen(m, buffers(['Bestelling Boers 2690655.pdf', 'Foam axle_upper roll.pdf', 'Guide base 5_8.pdf']))).toEqual([
      'Bestelling Boers 2690655.pdf',
    ])
  })

  it('valt zonder handelsdocument terug op elke pdf zonder tekstlaag', () => {
    const m = mail({ attachments: [attachment('Foam axle_upper roll.pdf', null)] })
    expect(namen(m, buffers(['Foam axle_upper roll.pdf']))).toEqual(['Foam axle_upper roll.pdf'])
  })

  it('valt met MAIL_AI_DOCUMENT=tekst terug op de oude regel', () => {
    // De noodrem, en tegelijk de enige manier om na te meten wat het native
    // meesturen oplevert: draai de scoreset met en zonder.
    const m = mail({ attachments: [attachment('Bestelling Boers 2690655.pdf', 'Inkooporder ...')] })
    const b = buffers(['Bestelling Boers 2690655.pdf'])
    const oud = config.ai.documentNative
    try {
      ;(config.ai as { documentNative: boolean }).documentNative = false
      expect(namen(m, b)).toEqual([])
    } finally {
      ;(config.ai as { documentNative: boolean }).documentNative = oud
    }
  })

  it('slaat een 3D-model over: dat is geen pdf', () => {
    const m = mail({ attachments: [attachment('2026077-001.STEP', null)] })
    expect(documentenVoorModel(m, { get: () => Buffer.from('ISO-10303-21;') })).toEqual([])
  })

  it('zet het handelsdocument voorop als er meer meegaan', () => {
    const m = mail({
      attachments: [
        attachment('2615-0091-0530-1.pdf', null),
        attachment('Purchase order_2604307.pdf', null),
      ],
    })
    expect(namen(m, buffers(['2615-0091-0530-1.pdf', 'Purchase order_2604307.pdf']))[0]).toBe(
      'Purchase order_2604307.pdf'
    )
  })
})

describe('buildPrompt', () => {
  it('laat de uitgeklopte tekst weg van een pdf die volledig meegaat', () => {
    const m = mail({ attachments: [attachment('order.pdf', 'EUR 34,4925-06-2026 15')] })
    const prompt = buildPrompt(m, new Set(['order.pdf']))
    expect(prompt).not.toContain('34,4925-06-2026')
    expect(prompt).toContain('lees hem daar')
  })

  it('zet de tekst er wél in als de pdf niet volledig meegaat', () => {
    const m = mail({ attachments: [attachment('order.pdf', 'Pos 1 2615-0091-0530')] })
    expect(buildPrompt(m, new Set())).toContain('2615-0091-0530')
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

describe('tekeningStaatErIn', () => {
  const hay = 'Pos 1 2615-0091-0530 Signaleringsplaat aantal 10'

  it('vindt het nummer ook met andere leestekens', () => {
    expect(tekeningStaatErIn('2615.0091.0530', hay)).toBe(true)
    expect(tekeningStaatErIn('2615 0091 0530', hay)).toBe(true)
  })

  it('accepteert geen enkel cijfer verschil', () => {
    // 2615-0090-0530 en 2615-0091-0530 bestaan allebei in de database.
    expect(tekeningStaatErIn('2615-0090-0530', hay)).toBe(false)
  })

  it('is onwaar zonder nummer of bij een te kort nummer', () => {
    expect(tekeningStaatErIn(null, hay)).toBe(false)
    expect(tekeningStaatErIn('26', hay)).toBe(false)
  })
})

describe('bevestigdDoor', () => {
  const regel = aiLine({ tekening: '2615-0091-0530', qty: 10 })

  it('is null als er geen controlelezing was', () => {
    expect(bevestigdDoor(regel, null)).toBe(null)
  })

  it('is waar als de tweede lezing dezelfde regel met hetzelfde aantal vond', () => {
    expect(bevestigdDoor(regel, [aiLine({ tekening: '2615.0091.0530', qty: 10 })])).toBe(true)
  })

  it('is onwaar als de tweede lezing een ander aantal vond', () => {
    expect(bevestigdDoor(regel, [aiLine({ tekening: '2615-0091-0530', qty: 4 })])).toBe(false)
  })

  it('is onwaar als de tweede lezing de regel helemaal niet vond', () => {
    expect(bevestigdDoor(regel, [])).toBe(false)
  })
})

describe('buildLines', () => {
  const bron = mail({ attachments: [attachment('order.pdf', '2615-0091-0530 10x de signaalplaat')] })

  it('zet een modelregel om naar een kandidaat met de controles erop', () => {
    const { lines, modelZekerheid } = buildLines([aiLine()], bron)
    expect(lines).toHaveLength(1)
    expect(lines[0].extractor).toBe('ai')
    expect(lines[0].gegrond).toBe(true)
    expect(lines[0].tekeningGegrond).toBe(true)
    expect(lines[0].qty).toBe(10)
    expect(modelZekerheid.get(lines[0].id)).toBe(0.9)
  })

  it('markeert een regel die niet in de bron terug te vinden is', () => {
    const { lines } = buildLines([aiLine({ tekening: '9999-9999', bronTekst: '5x koppelstuk 9999-9999' })], bron)
    expect(lines[0].gegrond).toBe(false)
    expect(lines[0].tekeningGegrond).toBe(false)
  })

  it('laat gronding open voor een regel die uit een scan komt', () => {
    const regel = aiLine({ tekening: '9999-9999', bronTekst: '5x koppelstuk', bronBestand: 'scan.pdf' })
    const { lines } = buildLines([regel], bron, { scans: new Set(['scan.pdf']) })
    expect(lines[0].gegrond).toBe(null)
    expect(lines[0].tekeningGegrond).toBe(null)
  })

  it('neemt de uitkomst van de controlelezing over', () => {
    const { lines } = buildLines([aiLine()], bron, { bevestiging: [aiLine({ qty: 4 })] })
    expect(lines[0].bevestigd).toBe(false)
  })

  it('laat een tekening geen tweede regel maken als het document leidend is', () => {
    // Het geval uit de praktijk: de order noemt 2615-0091-0530 en de tekening
    // heet 2604307-1-2615-0091-0530-1. Twee regels voor één onderdeel.
    const uitOrder = aiLine({
      tekening: '2615-0091-0530', qty: 60, positie: 10,
      bronBestand: 'Purchase order_2604307.pdf', bronTekst: '10 2615-0091-0530 60',
    })
    const uitTekening = aiLine({
      tekening: '2604307-1-2615-0091-0530-1', qty: null, positie: 1,
      bronBestand: '2604307-1-2615-0091-0530-1.pdf', bronTekst: '2604307-1-2615-0091-0530-1',
    })
    const { lines } = buildLines([uitOrder, uitTekening], bron, {
      document: 'Purchase order_2604307.pdf',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].qty).toBe(60)
  })

  it('hangt de tekeningbestanden aan de regel waar ze bij horen', () => {
    const met = mail({
      attachments: [
        attachment('PO.pdf', '2615-0091-0530 aantal 60'),
        attachment('2604307-1-2615-0091-0530-1.dwg', null),
        attachment('2604307-1-2615-0091-0530-1.stp', null),
        attachment('iets-anders-123456.stp', null),
      ],
    })
    const regel = aiLine({ tekening: '2615-0091-0530', qty: 60, bronBestand: 'PO.pdf', bronTekst: '2615-0091-0530' })
    const { lines } = buildLines([regel], met, { document: 'PO.pdf' })
    expect(lines[0].bestanden).toEqual([
      '2604307-1-2615-0091-0530-1.dwg',
      '2604307-1-2615-0091-0530-1.stp',
    ])
  })

  it('sorteert op positie als de klant die meegaf', () => {
    const { lines } = buildLines(
      [aiLine({ tekening: 'A-1', positie: 2, bronTekst: 'A-1' }), aiLine({ tekening: 'B-2', positie: 1, bronTekst: 'B-2' })],
      bron
    )
    expect(lines.map((l) => l.tekening)).toEqual(['B-2', 'A-1'])
  })
})
