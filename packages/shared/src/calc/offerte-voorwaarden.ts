import type { Offerte, Project } from '../schemas/project'

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
  if (o.direct) {
    return `v${o.versie} is een directe opdracht: die wordt niet als offerte verstuurd. Gebruik "Opdracht maken" op de Opdracht-tab.`
  }
  const regels = regelProbleem(o, 'versturen')
  if (regels) return regels
  // Afgesproken 2026-09-25: een verstuurde versie zegt altijd waar ze antwoord
  // op geeft. Zonder dat valt achteraf niet terug te vinden welke aanvraag deze
  // prijs kreeg — en bij een telefonische aanvraag is "tel. J. Prins 12-09" ook
  // een referentie.
  if (!o.externeRef?.trim()) {
    return 'Kan offerte niet versturen zonder een externe referentie. Vul in de kolom Referentie in '
      + 'waar deze versie antwoord op geeft (RFQ-nummer, "mail J. Prins 12-09" of "tel. 12-09").'
  }
  return null
}

export function waaromNietAccepteren(o: Offerte | undefined, alle: Offerte[]): string | null {
  if (!o) return 'Kan offerte niet accepteren: deze versie bestaat niet (meer). Ververs de pagina.'
  const al = alle.find(x => x.status === 'geaccepteerd' && x.id !== o.id)
  if (al) {
    return `Kan v${o.versie} niet accepteren: v${al.versie} is al geaccepteerd. Er kan maar één versie de opdracht zijn.`
  }
  // Een directe opdracht gaat nooit als offerte de deur uit: de klant gaf al
  // opdracht. Die mag dus rechtstreeks van concept naar geaccepteerd.
  const magVanConcept = o.direct && o.status === 'concept'
  if (o.status !== 'verzonden' && !magVanConcept) {
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

/**
 * Verwijderen kan alleen bij een concept: dat heeft de klant nooit gezien en er
 * hangt niets aan. Een verstuurde versie wordt ingetrokken, niet verwijderd —
 * de klant heeft hem, en wat hij heeft moet hier terug te vinden zijn. Aan een
 * geaccepteerde versie hangen opdrachtbevestiging, productieorders,
 * prijshistorie en facturen.
 */
export function waaromNietVerwijderen(o: Offerte | undefined): string | null {
  if (!o) return 'Kan offerte niet verwijderen: deze versie bestaat niet (meer). Ververs de pagina.'
  if (o.status === 'geaccepteerd') {
    return `Kan v${o.versie} niet verwijderen: hierop draait de opdracht. Draai het project eerst terug naar de offertefase.`
  }
  if (o.status !== 'concept') {
    return `Kan v${o.versie} niet verwijderen: de klant heeft deze versie al gekregen. Trek hem in; dan blijft hij zichtbaar als vervallen.`
  }
  return null
}

/** Intrekken: een verstuurde versie die niet meer geldt, blijft als vervallen staan. */
export function waaromNietIntrekken(o: Offerte | undefined): string | null {
  if (!o) return 'Kan offerte niet intrekken: deze versie bestaat niet (meer). Ververs de pagina.'
  if (o.status === 'geaccepteerd') {
    return `Kan v${o.versie} niet intrekken: hierop draait de opdracht. Draai het project eerst terug naar de offertefase.`
  }
  if (o.status === 'concept') {
    return `v${o.versie} is nog niet verstuurd, dus intrekken hoeft niet. Verwijder hem als hij weg moet.`
  }
  if (o.status === 'vervallen') return `v${o.versie} is al vervallen.`
  return null
}

/**
 * Staat het project nog op "offerte" terwijl er geen verstuurde versie meer is
 * (alles ingetrokken of verwijderd), dan ligt er niets meer bij de klant: terug
 * naar concept. Elke andere status blijft staan. Gedeeld, zodat het scherm na
 * intrekken dezelfde fase toont als de server opslaat.
 */
export function projectNaIntrekken(p: Project): Project {
  const nogUit = p.offertes.some(o => o.status === 'verzonden')
  return p.status === 'offerte' && !nogUit ? { ...p, status: 'concept' } : p
}


/**
 * Een heel project verwijderen (2026-10-05). Tot dan verwijderde de server elk
 * project zonder te kijken, met verstuurde facturen en pakbonnen en al — en
 * wat de klant gekregen heeft hoort in de administratie te blijven. Zodra er
 * iets de deur uit is, of er in de hal aan gewerkt is, annuleer je het project:
 * dan blijft alles staan en verdwijnt het alleen uit de planning.
 *
 * De zwaarste reden gaat voor: een factuur zegt meer dan een offerte.
 */
export function waaromNietProjectVerwijderen(p: Project | undefined): string | null {
  if (!p) return 'Kan project niet verwijderen: het bestaat niet (meer). Ververs de pagina.'
  const annuleer = 'Annuleer het project in plaats van het te verwijderen.'
  const factuur = p.facturen.find((f) => f.verzondenOp)
  if (factuur) {
    return `Kan ${p.id} niet verwijderen: ${factuur.id} is al verstuurd en hoort in de administratie. ${annuleer}`
  }
  const pakbon = p.paklijsten.find((x) => x.verzondenOp)
  if (pakbon) return `Kan ${p.id} niet verwijderen: pakbon ${pakbon.id} is al verstuurd. ${annuleer}`
  const gewerkt = p.productieOrders.find(
    (o) => o.status === 'in_productie' || o.status === 'gereed' || (o.aantalGereed ?? 0) > 0,
  )
  if (gewerkt) {
    return `Kan ${p.id} niet verwijderen: aan ${gewerkt.id} is al gewerkt, en de uren horen bij de nacalculatie. ${annuleer}`
  }
  if (p.opdrachtbevestiging?.verzondenOp) {
    return `Kan ${p.id} niet verwijderen: de opdrachtbevestiging is al naar de klant. ${annuleer}`
  }
  const offerte = p.offertes.find((o) => o.verzondenOp || o.status !== 'concept')
  if (offerte) {
    return `Kan ${p.id} niet verwijderen: de klant heeft offerte v${offerte.versie} al gekregen. ${annuleer}`
  }
  return null
}
