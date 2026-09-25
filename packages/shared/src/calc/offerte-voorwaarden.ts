import type { Offerte } from '../schemas/project'

/**
 * Waarom een handeling op een offerteversie níet kan — in één zin die de
 * gebruiker kan lezen en waar hij iets mee kan. `null` betekent: het mag.
 *
 * Staat in `shared` omdat het scherm en de server dezelfde regel moeten
 * toepassen en dezelfde zin moeten tonen. Het scherm vraagt het vóór de
 * handeling, zodat er niets op het scherm verschijnt wat daarna weer
 * teruggedraaid moet worden; de server vraagt het nog eens, omdat een tweede
 * tabblad of een tweede gebruiker intussen iets veranderd kan hebben.
 *
 * Vóór 2026-09-25 controleerde de server hier niets: versturen van een versie
 * die niet bestond gaf gewoon "gelukt", en een concept kon rechtstreeks
 * geaccepteerd worden als je het verzoek zelf stuurde.
 */

const STATUS_WOORD: Record<Offerte['status'], string> = {
  concept: 'nog een concept',
  verzonden: 'al verstuurd',
  geaccepteerd: 'al geaccepteerd',
  vervallen: 'vervallen',
}

function regelProbleem(o: Offerte, handeling: string): string | null {
  if (o.regels.length === 0) {
    return `Kan offerte niet ${handeling}: er staan nog geen regels in. Voeg eerst artikelen toe.`
  }
  const zonderAantal = o.regels.find(r => !(r.qty > 0))
  if (zonderAantal) {
    return `Kan offerte niet ${handeling}: regel "${zonderAantal.naam}" heeft geen aantal. Vul een aantal groter dan 0 in.`
  }
  return null
}

export function waaromNietVersturen(o: Offerte | undefined): string | null {
  if (!o) return 'Kan offerte niet versturen: deze versie bestaat niet (meer). Ververs de pagina.'
  if (o.status !== 'concept') {
    return `Kan v${o.versie} niet versturen: deze versie is ${STATUS_WOORD[o.status]}. Maak een kopie om een nieuwe versie te versturen.`
  }
  return regelProbleem(o, 'versturen')
}

export function waaromNietAccepteren(o: Offerte | undefined, alle: Offerte[]): string | null {
  if (!o) return 'Kan offerte niet accepteren: deze versie bestaat niet (meer). Ververs de pagina.'
  const al = alle.find(x => x.status === 'geaccepteerd' && x.id !== o.id)
  if (al) {
    return `Kan v${o.versie} niet accepteren: v${al.versie} is al geaccepteerd. Er kan maar één versie de opdracht zijn.`
  }
  if (o.status !== 'verzonden') {
    return o.status === 'concept'
      ? `Kan v${o.versie} niet accepteren: deze versie is nog niet verstuurd. Verstuur hem eerst.`
      : `Kan v${o.versie} niet accepteren: deze versie is ${STATUS_WOORD[o.status]}.`
  }
  return regelProbleem(o, 'accepteren')
}

/** Regels toevoegen, wijzigen of verwijderen kan alleen op een concept. */
export function waaromNietWijzigen(o: Offerte | undefined): string | null {
  if (!o) return 'Kan de regels niet wijzigen: deze versie bestaat niet (meer). Ververs de pagina.'
  if (o.status !== 'concept') {
    return `Kan de regels van v${o.versie} niet wijzigen: deze versie is ${STATUS_WOORD[o.status]}. Maak een kopie en pas die aan.`
  }
  return null
}
