import type { Offerte } from '../schemas/project'

/**
 * Een nieuwe offerteversie op basis van een bestaande.
 *
 * Eén functie, gedeeld door de browser (die de versie meteen in zijn cache
 * zet) en de API (die hem opslaat). Wat er meegaat mag op die twee plekken
 * niet uiteenlopen: anders toont het scherm regels die de server niet kent,
 * tot de volgende keer dat hij ververst.
 *
 * **Mee:** de regels — artikel, omschrijving, aantal, eenheid, prijs,
 * bewerkingen — en de notities. Dat is de inhoud van de offerte.
 *
 * **Niet mee:** status, verzend- en acceptatiedatum en geldig-tot. Die horen bij
 * het versturen van een versie, niet bij wat erin staat. Een kopie van een
 * geaccepteerde versie is een concept dat nog nergens heen is.
 *
 * **Prijzen gaan ongewijzigd mee.** Niet opnieuw uit de calculatie gehaald:
 * een regel weet niet of zijn prijs berekend is of met de hand afgesproken, en
 * stil herberekenen zou een afspraak overschrijven. Wie andere aantallen zet
 * voor een staffel, gebruikt daarna "Prijzen bijwerken" — dat rekent met het
 * nieuwe aantal en toont vooraf wat er verandert.
 *
 * **Nieuwe regel-id's**, in `regelIds` meegegeven in de volgorde van de bron.
 * De browser maakt ze, zodat cache en server dezelfde regel bedoelen. Een
 * geaccepteerde kopie maakt opdrachtregels met díe id's, dus ze mogen nooit
 * die van de bron zijn. Ontbreekt er een, dan wordt hij hier gemaakt.
 */
export function kopieerOfferte(
  bron: Offerte,
  nieuw: {
    id: string
    documentNr: string
    versie: number
    regelIds?: string[]
    nu: string
  },
): Offerte {
  const regels = [...bron.regels]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r, i) => ({
      ...r,
      id: nieuw.regelIds?.[i] ?? `regel_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      sortOrder: i + 1,
      bewerkingen: [...r.bewerkingen],
    }))

  return {
    id: nieuw.id,
    documentNr: nieuw.documentNr,
    projectId: bron.projectId,
    versie: nieuw.versie,
    status: 'concept',
    regels,
    notities: bron.notities,
    geldigTot: null,
    verzondenOp: null,
    geaccepteerdOp: null,
    createdAt: nieuw.nu,
    updatedAt: nieuw.nu,
  }
}

/**
 * Het nummer van de volgende versie: één hoger dan de hoogste.
 *
 * Dit stond op drie plekken als `offertes.length + 1`. Dat is hetzelfde zolang
 * er nooit een versie ontbreekt, maar een project met v1, v3 en v4 kreeg dan
 * een tweede v4 — en welke van de twee "de hoogste" was, hing af van de
 * sorteervolgorde.
 */
export function volgendeVersie(offertes: Pick<Offerte, 'versie'>[]): number {
  return offertes.reduce((max, o) => Math.max(max, o.versie), 0) + 1
}
