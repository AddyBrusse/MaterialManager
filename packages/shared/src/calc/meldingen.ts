/**
 * Eén meldingenlijst voor iedereen (2026-10-09).
 *
 * Meldingen worden afgeleid, nooit opgeslagen: een melding is weg zodra het
 * opgelost is, niet omdat iemand hem wegklikte. Een tekort moet altijd
 * zichtbaar zijn tot het geregeld is. De gegevens haalt de server erbij
 * (`services/meldingen.ts`); hier staan alleen de regels.
 */
import { kortDatum, plusWerkdagen } from './inkoop-planning'

export const MELDING_GROEPEN = ['productie', 'inkoop', 'prijsaanvraag', 'ontvangst'] as const
export type MeldingGroep = (typeof MELDING_GROEPEN)[number]
export type MeldingErnst = 'rood' | 'oranje' | 'groen'

export interface Melding {
  /** Stabiel per oorzaak, zodat het scherm "nieuw sinds" kan zien. */
  id: string
  groep: MeldingGroep
  ernst: MeldingErnst
  titel: string
  tekst: string
  /** Waar je het oplost, als route in de app. */
  link: string
}

/** Na zoveel werkdagen zonder antwoord vraagt een prijsaanvraag om nabellen (afgesproken 2026-10-09). */
export const PRIJSAANVRAAG_WERKDAGEN = 4

const OPEN = ['te_bestellen', 'aangevraagd', 'buffer']

export interface OrderVoorMelding {
  projectId: string
  orderId: string
  artikelNaam: string
  /** Vrijgegeven en nog niet klaar: in de hal. */
  inDeHal: boolean
  /** Heeft materiaal uit voorraad nodig, en dat ligt niet vast (`services/materiaal-stand.ts`). */
  materiaalOntbreekt: boolean
  bestelRegels: { id: string; status: string; materiaal: string; stuks: number; lengteMm: number }[]
  materiaalVerwacht: string | null
  materiaalOnbekend: boolean
  /** Eerste geplande dag van een stap. */
  start: string | null
  /** Startklaar door een ontvangst van de laatste twee werkdagen. */
  netBinnen: boolean
}

export function productieMeldingen(o: OrderVoorMelding): Melding[] {
  if (!o.inDeHal) return []
  const uit: Melding[] = []
  const wie = `${o.orderId} · ${o.artikelNaam} (${o.projectId})`
  const naarProject = `/projecten/${o.projectId}`
  if (o.materiaalOntbreekt) {
    uit.push({
      id: `ontbreekt:${o.orderId}`, groep: 'productie', ernst: 'rood', titel: 'Materiaal ligt niet vast', link: naarProject,
      tekst: `${wie} staat in de hal zonder gereserveerd of besteld materiaal. Kies het op de Opdracht-tab.`,
    })
  }
  for (const r of o.bestelRegels.filter((x) => OPEN.includes(x.status))) {
    uit.push({
      id: `tekort:${r.id}`, groep: 'productie', ernst: 'rood', titel: 'Tekort, nog niet besteld', link: `/bestellingen?regel=${r.id}`,
      tekst: `${wie}: ${r.stuks} × ${Math.round(r.lengteMm)} mm ${r.materiaal}${o.start ? ` · start ${kortDatum(o.start)}` : ''}.`,
    })
  }
  const besteld = o.bestelRegels.some((x) => x.status === 'besteld')
  if (besteld && o.materiaalVerwacht && o.start && o.materiaalVerwacht > o.start) {
    uit.push({
      id: `laat:${o.orderId}`, groep: 'productie', ernst: 'rood', titel: 'Materiaal komt na de start', link: naarProject,
      tekst: `${wie}: verwacht ${kortDatum(o.materiaalVerwacht)}, start ${kortDatum(o.start)}. Vraag de leverancier om eerder, of schuif de planning.`,
    })
  } else if (besteld && o.materiaalOnbekend) {
    uit.push({
      id: `onbekend:${o.orderId}`, groep: 'productie', ernst: 'oranje', titel: 'Besteld, maar geen leverdatum', link: naarProject,
      tekst: `${wie}: niemand weet wanneer het materiaal komt. Vraag de leverdatum na en vul hem in bij Bestellingen → Besteld.`,
    })
  }
  if (o.netBinnen && !o.materiaalOntbreekt && !o.bestelRegels.some((x) => OPEN.includes(x.status) || x.status === 'besteld')) {
    uit.push({
      id: `binnen:${o.orderId}`, groep: 'ontvangst', ernst: 'groen', titel: 'Materiaal binnen — order kan starten', link: naarProject,
      tekst: `${wie} wacht niet meer op materiaal.`,
    })
  }
  return uit
}

export interface AanvraagVoorMelding {
  aanvraagId: string
  leverancierNaam: string
  /** ISO-datum van versturen; null = nog niet gemaild. */
  verzondenOp: string | null
  heeftAntwoord: boolean
  /** Er staat nog een regel van deze aanvraag open (status aangevraagd). */
  nogOpen: boolean
}

/** Een prijsaanvraag zonder antwoord na `PRIJSAANVRAAG_WERKDAGEN` werkdagen. */
export function prijsaanvraagMelding(a: AanvraagVoorMelding, vandaag: string): Melding | null {
  if (!a.verzondenOp || a.heeftAntwoord || !a.nogOpen) return null
  const grens = plusWerkdagen(a.verzondenOp, PRIJSAANVRAAG_WERKDAGEN)
  if (vandaag < grens) return null
  return {
    id: `pa:${a.aanvraagId}:${a.leverancierNaam}`, groep: 'prijsaanvraag', ernst: 'oranje',
    titel: `Geen antwoord op ${a.aanvraagId}`, link: '/bestellingen?tab=aanvragen',
    tekst: `${a.leverancierNaam} heeft sinds ${kortDatum(a.verzondenOp)} niet gereageerd. Bel of mail na, of vraag een ander.`,
  }
}

const VOLGORDE: Record<MeldingErnst, number> = { rood: 0, oranje: 1, groen: 2 }

/** Rood eerst, dan per groep. */
export function sorteerMeldingen(m: Melding[]): Melding[] {
  return [...m].sort((a, b) => VOLGORDE[a.ernst] - VOLGORDE[b.ernst]
    || MELDING_GROEPEN.indexOf(a.groep) - MELDING_GROEPEN.indexOf(b.groep))
}
