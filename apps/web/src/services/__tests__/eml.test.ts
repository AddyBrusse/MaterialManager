import { describe, it, expect } from 'vitest'
import { maakEml, mailtoZonderBijlage } from '../eml'

const mail = {
  naar: 'j.prins@vl-machinebouw.nl',
  onderwerp: 'Opdrachtbevestiging OB-2026-011 — Aandrijfset',
  html: '<p>Beste J. Prins,</p><p>Bijgaand … € 1.629,00</p>',
  bijlage: { naam: 'Opdrachtbevestiging-OB-2026-011.pdf', type: 'application/pdf', base64: btoa('%PDF-1.3 test') },
}

function decodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\r\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

describe('maakEml', () => {
  const eml = maakEml(mail)

  // Zonder deze kop opent Outlook het bestand als ontvangen bericht in plaats
  // van als nieuwe mail die klaarstaat om te versturen.
  it('is gemarkeerd als nog niet verzonden', () => {
    expect(eml).toContain('\r\nX-Unsent: 1\r\n')
  })

  it('zet de ontvanger en een gecodeerd onderwerp in de kop', () => {
    expect(eml.startsWith('To: j.prins@vl-machinebouw.nl\r\n')).toBe(true)
    const onderwerp = eml.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)![1]
    expect(decodeUtf8(onderwerp)).toBe(mail.onderwerp)
  })

  it('bevat de tekst en de pdf als bijlage', () => {
    const delen = eml.split(/--(----=_ShopCommand_\w+)/)
    const html = eml.match(/text\/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]+?)\r\n\r\n--/)![1]
    expect(decodeUtf8(html)).toBe(mail.html)
    expect(eml).toContain('Content-Disposition: attachment; filename="Opdrachtbevestiging-OB-2026-011.pdf"')
    expect(delen.length).toBeGreaterThan(3)
  })

  it('laat Aan weg als er geen adres is', () => {
    expect(maakEml({ ...mail, naar: null })).not.toContain('To:')
  })

  it('gebruikt overal CRLF-regeleinden', () => {
    expect(eml.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

// Testomgeving (2026-11-03): een kopie van de echte klanten, dus nooit een adres.
describe('maakEml in de testomgeving', () => {
  const eml = maakEml(mail, true)

  it('zet geen ontvanger klaar', () => {
    expect(eml).not.toContain('To:')
    expect(eml).not.toContain('j.prins@vl-machinebouw.nl')
  })

  it('begint het onderwerp met [TEST]', () => {
    const onderwerp = eml.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)![1]
    expect(decodeUtf8(onderwerp)).toBe(`[TEST] ${mail.onderwerp}`)
  })

  it('laat de echte omgeving ongemoeid', () => {
    expect(maakEml(mail, false).startsWith('To: j.prins@vl-machinebouw.nl\r\n')).toBe(true)
  })
})

describe('mailtoZonderBijlage', () => {
  it('heeft in de test geen adres en [TEST] in het onderwerp', () => {
    const url = mailtoZonderBijlage('a@b.nl', 'Factuur F-2026-001', 'tekst', true)
    expect(url.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('[TEST] Factuur F-2026-001')
  })

  it('houdt in de echte omgeving het adres', () => {
    expect(mailtoZonderBijlage('a@b.nl', 'Factuur', 'tekst', false).startsWith('mailto:a%40b.nl?subject=Factuur')).toBe(true)
  })
})
