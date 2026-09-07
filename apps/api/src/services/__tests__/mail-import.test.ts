import { describe, it, expect } from 'vitest'
import { suggestRelatie, type RelatieMatchCandidate } from '../mail-import'
import { sanitizeFilename } from '../../lib/filenames'

const relaties: RelatieMatchCandidate[] = [
  {
    id: 'rel-1',
    naam: 'Klant BV',
    email: 'info@klant.nl',
    emailOfferte: 'offertes@klant.nl',
    contacten: [{ id: 'c1', naam: 'Remco de Laat', email: 'remco@klant.nl' }],
  },
  { id: 'rel-2', naam: 'Ander Bedrijf', email: 'post@ander.nl', contacten: [] },
  { id: 'rel-3', naam: 'Gmail Klant Een', email: 'een@gmail.com', contacten: [] },
  { id: 'rel-4', naam: 'Gmail Klant Twee', email: 'twee@gmail.com', contacten: [] },
]

describe('suggestRelatie', () => {
  it('matcht op het bedrijfsadres', () => {
    expect(suggestRelatie({ naam: null, email: 'info@klant.nl' }, relaties)?.relatieId).toBe('rel-1')
  })

  it('matcht op een contactadres en op het offerte-adres', () => {
    expect(suggestRelatie({ naam: null, email: 'remco@klant.nl' }, relaties)?.relatieId).toBe('rel-1')
    expect(suggestRelatie({ naam: null, email: 'offertes@klant.nl' }, relaties)?.relatieId).toBe('rel-1')
  })

  it('negeert hoofdletters en spaties', () => {
    expect(suggestRelatie({ naam: null, email: '  INFO@Klant.NL ' }, relaties)?.relatieId).toBe('rel-1')
  })

  it('matcht op domein als het adres onbekend is', () => {
    const s = suggestRelatie({ naam: null, email: 'inkoop.nieuw@klant.nl' }, relaties)
    expect(s?.relatieId).toBe('rel-1')
  })

  it('matcht NIET op een domein dat meerdere relaties delen', () => {
    // Twee klanten op gmail.com — dan is het domein geen bewijs van iets.
    expect(suggestRelatie({ naam: null, email: 'onbekend@gmail.com' }, relaties)).toBeNull()
  })

  it('valt terug op de naam als er geen adres is, maar alleen bij één treffer', () => {
    expect(suggestRelatie({ naam: 'Klant BV', email: null }, relaties)?.relatieId).toBe('rel-1')
    // "Gmail Klant" zit in twee namen → geen suggestie.
    expect(suggestRelatie({ naam: 'Gmail Klant', email: null }, relaties)).toBeNull()
    // Te kort om iets te betekenen.
    expect(suggestRelatie({ naam: 'BV', email: null }, relaties)).toBeNull()
  })

  it('matcht op maildomein tegen de bedrijfsnaam als er geen adres is opgeslagen', () => {
    // Waargenomen: een relatie die wel bestaat maar zonder e-mailadres in de
    // kaart. Zonder deze stap is er niets om op te matchen.
    const zonderMail = [{ id: 'rel-stinis', naam: 'Stinis', email: null, contacten: [] }]
    const s = suggestRelatie({ naam: 'Dick Boer', email: 'DickBoer@stinis.com' }, zonderMail)
    expect(s?.relatieId).toBe('rel-stinis')
    expect(s?.reden).toContain('Controleer')
  })

  it('matcht niet op het domein van een gratis mailadres', () => {
    const relaties = [{ id: 'r', naam: 'Gmail Klant', email: null, contacten: [] }]
    expect(suggestRelatie({ naam: 'Iemand', email: 'iemand@gmail.com' }, relaties)).toBeNull()
  })

  it('matcht niet op domein als twee relaties erop lijken', () => {
    const twee = [
      { id: 'a', naam: 'Stinis', email: null, contacten: [] },
      { id: 'b', naam: 'Stinis Spreaders', email: null, contacten: [] },
    ]
    expect(suggestRelatie({ naam: 'Dick', email: 'd@stinis.com' }, twee)).toBeNull()
  })

  it('leest contacten ook als ze als JSON-string zijn opgeslagen', () => {
    const raar = [{
      id: 'rel-x', naam: 'Stinis', email: null,
      contacten: '[{"id":"c","naam":"Dick Boer","email":"DickBoer@stinis.com"}]',
    }]
    expect(suggestRelatie({ naam: 'Dick Boer', email: 'DickBoer@stinis.com' }, raar)?.relatieId).toBe('rel-x')
  })

  it('geeft niets terug zonder klant', () => {
    expect(suggestRelatie(null, relaties)).toBeNull()
  })
})

describe('sanitizeFilename', () => {
  it('houdt een gewone bijlagenaam leesbaar', () => {
    expect(sanitizeFilename('2026077-001.STEP')).toBe('2026077-001.STEP')
  })

  it('vervangt tekens die op Windows/SMB niet mogen', () => {
    expect(sanitizeFilename('RE: order <2026077>.msg')).toBe('RE_ order _2026077_.msg')
  })

  it('laat een bijlagenaam niet uit zijn eigen map breken', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..')
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/')
    expect(sanitizeFilename('...')).toBe('bestand')
  })

  it('geeft altijd een bruikbare naam terug', () => {
    expect(sanitizeFilename('')).toBe('bestand')
    expect(sanitizeFilename('   ')).toBe('bestand')
    expect(sanitizeFilename('a'.repeat(500)).length).toBe(200)
  })
})
