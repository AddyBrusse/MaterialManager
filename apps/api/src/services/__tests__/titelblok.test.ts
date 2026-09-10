import { describe, expect, it } from 'vitest'
import type { CandidateLine, MailAttachment } from '@stockmanager/shared'
import { hangBestandenAan, nummerGelijk } from '../attachment-kind'
import { loontEscalatie, tekeningenZonderRegel } from '../titelblok'

/**
 * Het titelblok lezen mag de zaak nooit verslechteren. Deze tests gaan daar over:
 * koppelen als het nummer klopt, en juist NIET koppelen als het net anders is.
 */

const PDF = Buffer.from('%PDF-1.7 nep')
const STEP = Buffer.from('ISO-10303-21;')
// Geeft terug wat het bestand werkelijk zou bevatten. Een dubbel dat overal pdf
// van maakt, verbergt precies de filter die getest wordt.
const buffers = { get: (naam: string) => (naam.toLowerCase().endsWith('.pdf') ? PDF : STEP) }

function att(filename: string): MailAttachment {
  return { filename, sizeBytes: 1000, path: null, isEmbeddedMessage: false, tekst: null, tekstPath: null }
}

function regel(over: Partial<CandidateLine> = {}): CandidateLine {
  return {
    id: 'ai-1', ruweTekst: '', tekening: null, rev: null, positie: null, qty: null,
    bron: 'pdf', klantArtikel: null, klantPrijs: null, omschrijving: null, materiaal: null,
    materiaalDoorKlant: null, certificaat: null, attachmentFilename: null, bestanden: [],
    matches: [], status: 'nieuw', artikelId: null, handmatig: false, extractor: 'ai',
    bronTekst: '', gegrond: true, tekeningGegrond: true, bevestigd: null, bronBestand: null,
    zekerheid: 0, zekerheidRedenen: [],
    ...over,
  }
}

describe('nummerGelijk', () => {
  it('negeert opmaakverschillen tussen systemen', () => {
    expect(nummerGelijk('MD13504758', 'md-13504758')).toBe(true)
    expect(nummerGelijk('2611-1456-0234', '2611 1456 0234')).toBe(true)
  })

  it('laat GEEN enkel cijfer schelen — dit is het hele punt', () => {
    // De aanleiding: order zegt MD13504758, bestand heet md10504758.
    expect(nummerGelijk('MD13504758', 'MD10504758')).toBe(false)
    expect(nummerGelijk('2615-0090-0530', '2615-0091-0530')).toBe(false)
  })

  it('accepteert geen te kort nummer, dat matcht overal op', () => {
    expect(nummerGelijk('A1', 'A1')).toBe(false)
  })

  it('geeft false bij een ontbrekende kant', () => {
    expect(nummerGelijk(null, 'MD13504758')).toBe(false)
    expect(nummerGelijk('MD13504758', null)).toBe(false)
  })
})

describe('hangBestandenAan met titelblokken', () => {
  it('koppelt een tekening waarvan de bestandsnaam afwijkt maar het titelblok klopt', () => {
    const lines = [regel({ tekening: 'MD13504758' }), regel({ id: 'ai-2', tekening: 'MD13504763' })]
    const bijlagen = [att('uitbesteding-A.pdf'), att('uitbesteding-B.pdf')]
    hangBestandenAan(lines, bijlagen, null, new Map([
      ['uitbesteding-A.pdf', 'MD13504758'],
      ['uitbesteding-B.pdf', 'MD13504763'],
    ]))
    expect(lines[0].bestanden).toEqual(['uitbesteding-A.pdf'])
    expect(lines[1].bestanden).toEqual(['uitbesteding-B.pdf'])
  })

  it('koppelt NIET als het titelblok één cijfer afwijkt', () => {
    const lines = [regel({ tekening: 'MD13504758' }), regel({ id: 'ai-2', tekening: 'MD13504763' })]
    const bijlagen = [att('md10504758 B uitbesteding.pdf')]
    hangBestandenAan(lines, bijlagen, null, new Map([['md10504758 B uitbesteding.pdf', 'MD10504758']]))
    expect(lines[0].bestanden).toEqual([])
    expect(lines[1].bestanden).toEqual([])
  })

  it('houdt het vangnet tegen als het titelblok zegt dat de tekening er niet bij hoort', () => {
    // Zonder deze uitzondering zou het lezen van het titelblok de zaak juist
    // verslechteren: één regel plus één losse tekening is normaal genoeg om te
    // koppelen, maar hier weten we dat het een ander onderdeel is.
    const lines = [regel({ tekening: 'MD13504758' })]
    const bijlagen = [att('md10504758 B uitbesteding.pdf')]
    hangBestandenAan(lines, bijlagen, null, new Map([['md10504758 B uitbesteding.pdf', 'MD10504758']]))
    expect(lines[0].bestanden).toEqual([])
  })

  it('laat het vangnet met rust als het titelblok niet gelezen is', () => {
    const lines = [regel({ tekening: 'MD13504758' })]
    const bijlagen = [att('md10504758 B uitbesteding.pdf')]
    hangBestandenAan(lines, bijlagen, null)
    expect(lines[0].bestanden).toEqual(['md10504758 B uitbesteding.pdf'])
  })
})

describe('escaleren', () => {
  it('kiest alleen tekeningen die nergens aan hangen', () => {
    const lines = [regel({ tekening: 'A', bestanden: ['al-gekoppeld.pdf'] })]
    const bijlagen = [att('al-gekoppeld.pdf'), att('los.pdf')]
    expect(tekeningenZonderRegel(lines, bijlagen, buffers).map((a) => a.filename)).toEqual(['los.pdf'])
  })

  it('slaat het leidende document over', () => {
    const bijlagen = [att('order.pdf'), att('los.pdf')]
    expect(tekeningenZonderRegel([], bijlagen, buffers, 'order.pdf').map((a) => a.filename)).toEqual(['los.pdf'])
  })

  it('slaat een 3D-model over: daar valt geen titelblok uit te lezen', () => {
    const bijlagen = [att('onderdeel.stp')]
    expect(tekeningenZonderRegel([], bijlagen, buffers)).toEqual([])
  })

  it('escaleert niet als elke regel al een bestand heeft', () => {
    const lines = [regel({ bestanden: ['a.pdf'] })]
    expect(loontEscalatie(lines, [att('los.pdf')])).toBe(false)
  })

  it('escaleert niet als er geen losse tekening is', () => {
    expect(loontEscalatie([regel()], [])).toBe(false)
  })

  it('escaleert wel bij een regel zonder bestand naast een losse tekening', () => {
    expect(loontEscalatie([regel()], [att('los.pdf')])).toBe(true)
  })
})
