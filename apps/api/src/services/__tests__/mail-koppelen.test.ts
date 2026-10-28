import { describe, it, expect } from 'vitest'
import {
  mailAfzender, mailMoment, mailReferentie, offerteReferentieUitMail, projectNaamUitOnderwerp,
  projectVeldenUitMail, receptTaakTitel, waarschuwingNulRegels, NIEUW_PROJECT_NAAM,
  type Offerte, type OfferteRegel,
} from '@stockmanager/shared'

const mail = {
  afzenderNaam: 'Jan Prins <j.prins@klant.nl>',
  afzenderEmail: 'j.prins@klant.nl',
  // 13:25 UTC = 14:25 in Nederland (wintertijd sinds 25-10-2026).
  ontvangenOp: '2026-10-28T13:25:00.000Z',
  createdAt: '2026-10-28T15:00:00.000Z',
  klantRef: null as string | null,
}

describe('mailReferentie — de mail als referentie (Addy, 2026-10-28)', () => {
  it('afzender plus ontvangstdatum en -tijd, in Nederlandse tijd', () => {
    expect(mailReferentie(mail)).toBe('Mail Jan Prins 28-10-2026 14:25')
  })

  // De server draait in Docker op UTC; zonder vaste tijdzone stond hier 13:25.
  it('zomertijd telt mee', () => {
    expect(mailMoment('2026-07-01T06:05:00.000Z')).toBe('01-07-2026 08:05')
  })

  it('zonder ontvangstdatum het moment van inlezen', () => {
    expect(mailReferentie({ ...mail, ontvangenOp: null })).toBe('Mail Jan Prins 28-10-2026 16:00')
  })

  it('zonder naam het adres, zonder allebei alleen het moment', () => {
    expect(mailReferentie({ ...mail, afzenderNaam: null })).toBe('Mail j.prins@klant.nl 28-10-2026 14:25')
    expect(mailReferentie({ ...mail, afzenderNaam: null, afzenderEmail: null })).toBe('Mail 28-10-2026 14:25')
  })

  it('haalt aanhalingstekens weg uit de weergavenaam', () => {
    expect(mailAfzender({ afzenderNaam: '"Prins, Jan" <j@k.nl>', afzenderEmail: 'j@k.nl' })).toBe('Prins, Jan')
  })
})

describe('offerteReferentieUitMail — RFQ als die er is, anders de mail', () => {
  it('het nummer van de klant wint', () => {
    expect(offerteReferentieUitMail({ ...mail, klantRef: ' RFQ2600241 ' })).toBe('RFQ2600241')
  })

  it('zonder nummer de mailregel', () => {
    expect(offerteReferentieUitMail(mail)).toBe('Mail Jan Prins 28-10-2026 14:25')
    expect(offerteReferentieUitMail({ ...mail, klantRef: '  ' })).toBe('Mail Jan Prins 28-10-2026 14:25')
  })

  it('nooit langer dan het veld (200 tekens)', () => {
    expect(offerteReferentieUitMail({ ...mail, klantRef: 'x'.repeat(300) })).toHaveLength(200)
  })
})

describe('projectNaamUitOnderwerp', () => {
  it('zonder RE: en FW:, ook gestapeld', () => {
    expect(projectNaamUitOnderwerp('RE: FW: Offerteaanvraag 2665013')).toBe('Offerteaanvraag 2665013')
    expect(projectNaamUitOnderwerp('Fwd:Bestelling')).toBe('Bestelling')
  })

  it('leeg onderwerp geeft geen naam', () => {
    expect(projectNaamUitOnderwerp('RE: ')).toBeNull()
  })
})

describe('projectVeldenUitMail — alleen wat nog leeg is', () => {
  const leeg = { naam: NIEUW_PROJECT_NAAM, relatieId: null, contactId: null, klantRef: null, levertijdDatum: null }
  const m = { onderwerp: 'RE: Offerteaanvraag 2665013', klantRef: 'RFQ1', leverdatum: '2026-11-20' }

  it('vult een nieuw project helemaal', () => {
    expect(projectVeldenUitMail(leeg, m, { relatieId: 'R1', contactId: 'C1' })).toEqual({
      naam: 'Offerteaanvraag 2665013', relatieId: 'R1', contactId: 'C1', klantRef: 'RFQ1', levertijdDatum: '2026-11-20',
    })
  })

  it('laat staan wat iemand al invulde', () => {
    const ingevuld = { naam: 'Assen Boers', relatieId: 'R1', contactId: 'C9', klantRef: 'PO-7', levertijdDatum: '2026-12-01' }
    expect(projectVeldenUitMail(ingevuld, m, { relatieId: 'R1', contactId: 'C1' })).toEqual({})
  })

  it('verandert nooit de klant van een project dat er al een heeft', () => {
    const metKlant = { ...leeg, relatieId: 'R1' }
    expect(projectVeldenUitMail(metKlant, m, { relatieId: 'R2', contactId: 'C2' })).not.toHaveProperty('relatieId')
    expect(projectVeldenUitMail(metKlant, m, { relatieId: 'R2', contactId: 'C2' })).not.toHaveProperty('contactId')
    // Zelfde klant, nog geen contactpersoon: die mag erbij.
    expect(projectVeldenUitMail(metKlant, m, { relatieId: 'R1', contactId: 'C1' }).contactId).toBe('C1')
  })

  // "Uw referentie" staat ook op pakbon en factuur: daar hoort een nummer van de klant.
  it('zet de mailregel niet in Uw referentie', () => {
    expect(projectVeldenUitMail(leeg, { ...m, klantRef: null }, { relatieId: 'R1', contactId: null })).not.toHaveProperty('klantRef')
  })
})

describe('receptTaakTitel', () => {
  it('artikel, tekening, project en afzender', () => {
    expect(receptTaakTitel({ id: 'ART-0123', naam: '4711', tekening: '4711', rev: 'B' }, 'PRJ-2026-014', 'Jan Prins'))
      .toBe('Recept maken: ART-0123 · tekening 4711 rev B (PRJ-2026-014, mail Jan Prins)')
  })

  it('zonder tekening de naam', () => {
    expect(receptTaakTitel({ id: 'ART-0124', naam: 'Flens 80', tekening: null, rev: null }, 'PRJ-2026-014', null))
      .toBe('Recept maken: ART-0124 · Flens 80 (PRJ-2026-014)')
  })
})

function regel(naam: string, verkoopprijs: number): OfferteRegel {
  return {
    id: naam, sortOrder: 1, artikelId: null, naam, omschrijving: '',
    qty: 1, eenheid: 'st', verkoopprijs, totaal: verkoopprijs, bewerkingen: [],
  }
}

function offerte(regels: OfferteRegel[]): Offerte {
  return {
    id: 'off1', documentNr: 'OFF-2026-014', projectId: 'PRJ', versie: 1, status: 'concept', regels,
    notities: '', externeRef: 'RFQ', direct: false, vervallenDoor: null, geldigTot: null, verzondenOp: null,
    geaccepteerdOp: null, createdAt: '2026-10-28T09:00:00.000Z', updatedAt: '2026-10-28T09:00:00.000Z',
  }
}

describe('waarschuwingNulRegels — vangnet bij Versturen (Addy, 2026-10-28)', () => {
  it('niets als alles een prijs heeft', () => {
    expect(waarschuwingNulRegels(offerte([regel('As', 12.5)]))).toBeNull()
  })

  it('één regel bij naam', () => {
    expect(waarschuwingNulRegels(offerte([regel('As', 12.5), regel('Flens', 0)]))).toBe('Regel "Flens" staat op € 0.')
  })

  it('een restje onder de cent telt als € 0', () => {
    expect(waarschuwingNulRegels(offerte([regel('Bus', 0.004)]))).toBe('Regel "Bus" staat op € 0.')
  })

  it('meerdere, en bij veel regels "en nog …"', () => {
    expect(waarschuwingNulRegels(offerte([regel('A', 0), regel('B', 0), regel('C', 0)])))
      .toBe('3 regels staan op € 0: "A", "B" en "C".')
    expect(waarschuwingNulRegels(offerte(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => regel(n, 0)))))
      .toBe('6 regels staan op € 0: "A", "B", "C", "D" en nog 2.')
  })
})
