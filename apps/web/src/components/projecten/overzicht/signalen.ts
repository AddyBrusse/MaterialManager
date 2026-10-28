import { berekenVoortgang, openstaandBedrag, type Project } from '@stockmanager/shared'

/**
 * De voortgang van een project in woorden en bolletjes, voor het overzicht en
 * de projectpagina. De signalen voor tegels en filters (`signalenVan`) staan
 * sinds 2026-10-28 in `packages/shared/calc/project-signalen.ts`, zodat het
 * belletje en de assistent hetzelfde tellen.
 */

// ── De vier stappen van de voortgangskolom ─────────────────────────────────

export type StapToestand = 'klaar' | 'deels' | 'open' | 'uit' | 'overgeslagen'

const STAP_NAMEN = ['Concept', 'Offerte', 'Geaccepteerd', 'Opdracht', 'In productie', 'Paklijst', 'Factuur'] as const
type StapNaam = typeof STAP_NAMEN[number]

interface Stap {
  naam: StapNaam
  toestand: StapToestand
  uitleg: string
}

/**
 * De zeven stappen van een project (2026-10-07), op het overzicht én op de
 * projectpagina: Concept · Offerte · Geaccepteerd · Opdracht · In productie ·
 * Paklijst · Factuur. Uit de documenten en de voortgang, niet uit de status.
 *
 * - "deels" (half bolletje): productie loopt, een deellevering, deels
 *   gefactureerd, een opdrachtbevestiging in concept. Factuur is pas klaar als
 *   alles gefactureerd **én betaald** is.
 * - "overgeslagen": bij een directe opdracht (zonder offerte) zijn Concept,
 *   Offerte en Geaccepteerd nooit gebeurd.
 * - "uit": nog niet aan de beurt. Alleen de eerste stap die nog moet is "open".
 */
export function stappenVan(p: Project): Stap[] {
  const v = berekenVoortgang(p)
  const acc = p.offertes.find((o) => o.status === 'geaccepteerd')
  const direct = Boolean(acc?.direct) || (p.offertes.length === 0 && Boolean(p.opdrachtbevestiging))
  const verstuurd = Boolean(acc) || p.offertes.some((o) => o.status === 'verzonden' || o.verzondenOp)
  const ob = p.opdrachtbevestiging
  const deel = (gedaan: number, totaal: number): StapToestand =>
    totaal === 0 ? 'open' : gedaan >= totaal ? 'klaar' : gedaan > 0 ? 'deels' : 'open'
  const nogOpen = openstaandBedrag(p)
  const factuur = deel(v.gefactureerd, v.besteld)
  const over = (naam: StapNaam): Stap => ({ naam, toestand: 'overgeslagen', uitleg: 'overgeslagen: directe opdracht' })

  const stappen: Stap[] = [
    direct ? over('Concept') : { naam: 'Concept', toestand: 'klaar', uitleg: p.offertes.length ? 'offerte gemaakt' : 'project aangemaakt' },
    direct ? over('Offerte') : verstuurd
      ? { naam: 'Offerte', toestand: 'klaar', uitleg: 'verstuurd' }
      : { naam: 'Offerte', toestand: 'open', uitleg: p.offertes.length ? 'offerte in concept' : 'nog geen offerte' },
    direct ? over('Geaccepteerd') : acc
      ? { naam: 'Geaccepteerd', toestand: 'klaar', uitleg: 'door de klant geaccepteerd' }
      : { naam: 'Geaccepteerd', toestand: 'open', uitleg: verstuurd ? 'wacht op de klant' : 'nog niet' },
    ob?.verzondenOp
      ? { naam: 'Opdracht', toestand: 'klaar', uitleg: 'opdrachtbevestiging verstuurd' }
      : { naam: 'Opdracht', toestand: ob ? 'deels' : 'open', uitleg: ob ? 'opdrachtbevestiging in concept' : 'nog geen opdrachtbevestiging' },
    { naam: 'In productie', toestand: deel(v.gemaakt, v.besteld), uitleg: `${v.gemaakt} van ${v.besteld} gemaakt` },
    { naam: 'Paklijst', toestand: deel(v.verstuurd, v.besteld), uitleg: `${v.verstuurd} van ${v.besteld} geleverd` },
    {
      naam: 'Factuur',
      // Alles gefactureerd maar nog niet betaald is nog niet af.
      toestand: factuur === 'klaar' && nogOpen > 0 ? 'deels' : factuur,
      uitleg: `${v.gefactureerd} van ${v.besteld} gefactureerd${nogOpen > 0 ? ', nog niet alles betaald' : ''}`,
    },
  ]

  // Na de eerste stap die nog helemaal moet, is de rest nog niet aan de beurt.
  const eerste = stappen.findIndex((s) => s.toestand === 'open')
  return stappen.map((s, i) => (eerste >= 0 && i > eerste && s.toestand === 'open' ? { ...s, toestand: 'uit' } : s))
}

/**
 * De status in dezelfde zeven woorden als de bolletjes (2026-10-07). De
 * opgeslagen status blijft wat hij was (de server zet hem, filters gebruiken
 * hem); alleen het woord volgt de stappen. "Bevestigd" is Geaccepteerd tot de
 * opdrachtbevestiging verstuurd is, of meteen Opdracht bij een directe opdracht.
 * Gereed voor levering en geleverd zijn allebei Paklijst.
 */
export function statusWoord(p: Pick<Project, 'status' | 'offertes' | 'opdrachtbevestiging'>): string {
  switch (p.status) {
    case 'bevestigd': {
      const direct = p.offertes.some((o) => o.status === 'geaccepteerd' && o.direct) || p.offertes.length === 0
      return direct || p.opdrachtbevestiging?.verzondenOp ? 'Opdracht' : 'Geaccepteerd'
    }
    default:
      return STATUS_WOORD[p.status]
  }
}

export const STATUS_WOORD: Record<Project['status'], string> = {
  concept: 'Concept',
  offerte: 'Offerte',
  bevestigd: 'Geaccepteerd',
  productie: 'In productie',
  paklijst: 'Paklijst',
  verzonden: 'Paklijst',
  gefactureerd: 'Factuur',
  on_hold: 'On hold',
  geannuleerd: 'Geannuleerd',
}
