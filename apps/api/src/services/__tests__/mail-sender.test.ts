import { describe, it, expect } from 'vitest'
import type { NormalizedMail } from '@stockmanager/shared'
import { resolveSender, forwardedSenders, isOwnAddress, dedupeKey } from '../mail-sender'

const own = { domains: ['boers-metaalbewerking.nl'], emails: ['addy@boers-metaalbewerking.nl'] }

function mail(partial: Partial<NormalizedMail>): NormalizedMail {
  return {
    source: 'drop',
    messageId: null,
    subject: 'Offerteaanvraag',
    bodyText: '',
    bodyHtml: null,
    receivedAt: '2026-09-03T08:00:00.000Z',
    from: null,
    to: [],
    cc: [],
    attachments: [],
    rawHeaders: null,
    ...partial,
  }
}

describe('isOwnAddress', () => {
  it('herkent eigen domein en eigen adres, en laat externe adressen met rust', () => {
    expect(isOwnAddress({ naam: 'Bart', email: 'bart@boers-metaalbewerking.nl' }, own)).toBe(true)
    expect(isOwnAddress({ naam: 'Addy', email: 'ADDY@Boers-Metaalbewerking.NL' }, own)).toBe(true)
    expect(isOwnAddress({ naam: 'Klant', email: 'inkoop@klant.nl' }, own)).toBe(false)
    // Een domein dat op het onze eindigt is niet het onze.
    expect(isOwnAddress({ naam: null, email: 'x@nietboers-metaalbewerking.nl' }, own)).toBe(false)
    expect(isOwnAddress({ naam: 'Alleen naam', email: null }, own)).toBe(false)
  })
})

describe('resolveSender — rechtstreeks', () => {
  it('neemt de afzender als klant wanneer die extern is', () => {
    const r = resolveSender(mail({ from: { naam: 'Remco de Laat', email: 'remco@klant.nl' } }), [], own)
    expect(r.origin).toBe('direct')
    expect(r.klant?.email).toBe('remco@klant.nl')
    expect(r.confidence).toBe('hoog')
  })
})

describe('resolveSender — doorgestuurd als bijlage', () => {
  it('gebruikt de kop van het originele bericht, niet die van de collega', () => {
    const inner = mail({ from: { naam: 'Inkoop', email: 'inkoop@klant.nl' }, subject: 'Bestelling 2026077' })
    const outer = mail({ from: { naam: 'Bart Boers', email: 'bart@boers-metaalbewerking.nl' }, subject: 'FW: Bestelling 2026077' })
    const r = resolveSender(outer, [inner], own)
    expect(r.origin).toBe('doorgestuurd')
    expect(r.klant?.email).toBe('inkoop@klant.nl')
    expect(r.doorgestuurdDoor?.email).toBe('bart@boers-metaalbewerking.nl')
    expect(r.confidence).toBe('hoog')
  })

  it('slaat een intern bericht als bijlage over', () => {
    const inner = mail({ from: { naam: 'Piet', email: 'piet@boers-metaalbewerking.nl' } })
    const outer = mail({ from: { naam: 'Bart', email: 'bart@boers-metaalbewerking.nl' } })
    expect(resolveSender(outer, [inner], own).origin).toBe('onbekend')
  })
})

describe('resolveSender — inline doorgestuurd', () => {
  const body = [
    'Hoi, kun jij hier een offerte voor maken?',
    '',
    'Van: Inkoop Klant BV <inkoop@klant.nl>',
    'Verzonden: donderdag 3 september 2026 10:12',
    'Aan: Bart Boers <bart@boers-metaalbewerking.nl>',
    'Onderwerp: Aanvraag 2026077',
    '',
    'Graag prijs voor 3x tekening 123456.',
  ].join('\n')

  it('haalt de klant uit het Van-blok', () => {
    const r = resolveSender(
      mail({ from: { naam: 'Bart Boers', email: 'bart@boers-metaalbewerking.nl' }, bodyText: body }),
      [],
      own
    )
    expect(r.origin).toBe('doorgestuurd')
    expect(r.klant?.email).toBe('inkoop@klant.nl')
    expect(r.klant?.naam).toBe('Inkoop Klant BV')
    expect(r.confidence).toBe('midden')
  })

  it('werkt ook met Engelse kopregels', () => {
    const en = 'From: Purchasing <buy@customer.com>\nSent: Thursday\nTo: Bart\nSubject: RFQ'
    const r = resolveSender(mail({ from: { naam: 'Bart', email: 'bart@boers-metaalbewerking.nl' }, bodyText: en }), [], own)
    expect(r.klant?.email).toBe('buy@customer.com')
  })

  it('kiest bij meerdere hops het diepste externe blok — de klant, niet de collega', () => {
    const chain = [
      'Van: Piet <piet@boers-metaalbewerking.nl>',
      'Onderwerp: FW: Aanvraag',
      '',
      'Van: Bart Boers <bart@boers-metaalbewerking.nl>',
      'Onderwerp: FW: Aanvraag',
      '',
      'Van: Inkoop Klant BV <inkoop@klant.nl>',
      'Onderwerp: Aanvraag',
    ].join('\n')
    const r = resolveSender(mail({ from: { naam: 'Piet', email: 'piet@boers-metaalbewerking.nl' }, bodyText: chain }), [], own)
    expect(r.klant?.email).toBe('inkoop@klant.nl')
  })

  it('valt terug op alleen een naam, met lage zekerheid', () => {
    const noAddress = 'Van: Inkoop Klant BV\nVerzonden: donderdag\nAan: Bart\nOnderwerp: Aanvraag'
    const r = resolveSender(
      mail({ from: { naam: 'Bart', email: 'bart@boers-metaalbewerking.nl' }, bodyText: noAddress }),
      [],
      own
    )
    expect(r.origin).toBe('doorgestuurd')
    expect(r.klant).toEqual({ naam: 'Inkoop Klant BV', email: null })
    expect(r.confidence).toBe('laag')
  })
})

describe('resolveSender — niets bruikbaars', () => {
  it('geeft geen suggestie bij een interne mail zonder origineel', () => {
    const r = resolveSender(mail({ from: { naam: 'Bart', email: 'bart@boers-metaalbewerking.nl' } }), [], own)
    expect(r.origin).toBe('onbekend')
    expect(r.klant).toBeNull()
    expect(r.doorgestuurdDoor?.email).toBe('bart@boers-metaalbewerking.nl')
  })

  it('geeft geen suggestie als er helemaal geen afzender is', () => {
    const r = resolveSender(mail({ from: null }), [], own)
    expect(r.origin).toBe('onbekend')
    expect(r.klant).toBeNull()
  })
})

describe('forwardedSenders', () => {
  it('negeert regels die geen Van-kop zijn', () => {
    expect(forwardedSenders('Vandaag gesproken met inkoop@klant.nl over de order')).toEqual([])
  })
})

describe('dedupeKey', () => {
  it('gebruikt het message-id wanneer dat er is', () => {
    expect(dedupeKey(mail({ messageId: '<abc@klant.nl>' }))).toBe('mid:<abc@klant.nl>')
  })

  it('valt terug op een hash, en die is stabiel', () => {
    const m = mail({ from: { naam: 'Klant', email: 'inkoop@klant.nl' } })
    expect(dedupeKey(m)).toMatch(/^hash:[0-9a-f]{64}$/)
    expect(dedupeKey(m)).toBe(dedupeKey(m))
  })

  it('onderscheidt mails die alleen in onderwerp verschillen', () => {
    const a = mail({ from: { naam: 'K', email: 'k@klant.nl' }, subject: 'Aanvraag 1' })
    const b = mail({ from: { naam: 'K', email: 'k@klant.nl' }, subject: 'Aanvraag 2' })
    expect(dedupeKey(a)).not.toBe(dedupeKey(b))
  })
})
