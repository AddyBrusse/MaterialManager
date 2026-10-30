import type { MailImport } from '../schemas/mail-import'
import type { Project, UpdateProject } from '../schemas/project'

/**
 * Wat een mail meegeeft aan het project en de offerte waaraan hij gekoppeld
 * wordt (2026-10-28). Gedeeld: de server schrijft het weg bij het koppelen, het
 * scherm toont vooraf wat er komt te staan.
 *
 * Sinds de nieuwe projectpagina (2026-09-23) schreef een mailimport niets meer
 * naar het project — geen klant, referentie of levertijd — en de offerte kreeg
 * nooit een referentie, terwijl versturen er een eist.
 */

/** De naam die een nieuw project krijgt tot iemand hem verandert. */
export const NIEUW_PROJECT_NAAM = 'Nieuw project'

/**
 * De winkel staat in Nederland. Vast, niet de tijdzone van de server: in een
 * Docker-container is die UTC, en dan stond 14:25 als 13:25 op de offerte.
 */
const TIJDZONE = 'Europe/Amsterdam'

/** "28-10-2026 14:25", Nederlandse tijd. */
export function mailMoment(iso: string): string {
  const delen = Object.fromEntries(
    new Intl.DateTimeFormat('nl-NL', {
      timeZone: TIJDZONE, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  )
  return `${delen.day}-${delen.month}-${delen.year} ${delen.hour}:${delen.minute}`
}

type MailKop = Pick<MailImport, 'afzenderNaam' | 'afzenderEmail' | 'ontvangenOp' | 'createdAt'>

/** Wie de mail stuurde: de naam zonder adres en aanhalingstekens, anders het adres. */
export function mailAfzender(m: Pick<MailImport, 'afzenderNaam' | 'afzenderEmail'>): string | null {
  const naam = m.afzenderNaam?.split('<')[0].replace(/["']/g, '').trim()
  return naam || m.afzenderEmail?.trim() || null
}

/**
 * "Mail J. Prins 28-10-2026 14:25" — de mail als referentie, voor een aanvraag
 * zonder nummer. De ontvangstdatum, of het moment van inlezen als die ontbreekt
 * (een nooit verzonden bericht heeft er geen).
 */
export function mailReferentie(m: MailKop): string {
  const wie = mailAfzender(m)
  return ['Mail', wie, mailMoment(m.ontvangenOp ?? m.createdAt)].filter(Boolean).join(' ').slice(0, 200)
}

/**
 * De referentie op de offerte (keuze van Addy, 2026-10-28): het aanvraag- of
 * ordernummer van de klant als dat in de mail staat — dat herkent de klant op
 * de pdf — en anders de mail zelf.
 */
export function offerteReferentieUitMail(m: MailKop & Pick<MailImport, 'klantRef'>): string {
  return m.klantRef?.trim().slice(0, 200) || mailReferentie(m)
}

/** Het onderwerp als projectnaam, zonder "RE:" en "FW:" ervoor. */
export function projectNaamUitOnderwerp(onderwerp: string): string | null {
  // Een los streepje aan het eind ("Inkoopofferte RFQ2600233 -") is het restant
  // van een onderwerp dat de klant niet afmaakte; als projectnaam staat het slordig.
  const kaal = onderwerp
    .replace(/^(\s*(re|fw|fwd|aw|wg|antw|tr)\s*:\s*)+/i, '')
    .replace(/[\s\-–—:|·,;]+$/, '')
    .trim()
  return kaal ? kaal.slice(0, 80) : null
}

/**
 * Wat de mail op het project zet. Alleen wat nog leeg is: wie zelf een
 * referentie of datum invulde had daar een reden voor. De naam telt als leeg
 * zolang hij nog "Nieuw project" is.
 *
 * In "Uw referentie" komt alleen een nummer van de klant, nooit de mailregel:
 * dat veld staat ook op pakbon en factuur, en daar hoort het ordernummer van de
 * klant.
 */
export function projectVeldenUitMail(
  p: Pick<Project, 'naam' | 'relatieId' | 'contactId' | 'klantRef' | 'levertijdDatum'>,
  m: Pick<MailImport, 'onderwerp' | 'klantRef' | 'leverdatum'>,
  keuze: { relatieId: string | null; contactId: string | null },
): UpdateProject {
  const patch: UpdateProject = {}
  const naam = projectNaamUitOnderwerp(m.onderwerp)
  if (naam && (!p.naam.trim() || p.naam.trim() === NIEUW_PROJECT_NAAM)) patch.naam = naam
  if (!p.relatieId && keuze.relatieId) {
    patch.relatieId = keuze.relatieId
    patch.contactId = keuze.contactId
  } else if (p.relatieId && p.relatieId === keuze.relatieId && !p.contactId && keuze.contactId) {
    patch.contactId = keuze.contactId
  }
  if (!p.klantRef?.trim() && m.klantRef?.trim()) patch.klantRef = m.klantRef.trim().slice(0, 200)
  if (!p.levertijdDatum && m.leverdatum) patch.levertijdDatum = m.leverdatum.slice(0, 10)
  return patch
}

/** "Recept maken: ART-0123 · tekening 4711 rev B (PRJ-2026-014, mail J. Prins)". */
export function receptTaakTitel(
  a: { id: string; naam: string; tekening: string | null; rev: string | null },
  projectId: string,
  afzender: string | null,
): string {
  const wat = a.tekening ? `tekening ${a.tekening}${a.rev ? ` rev ${a.rev}` : ''}` : a.naam
  return `Recept maken: ${a.id} · ${wat} (${[projectId, afzender && `mail ${afzender}`].filter(Boolean).join(', ')})`
}

/** Wat het koppelen deed — de server geeft het terug, het scherm meldt het. */
export interface MailOvername {
  offerteId: string
  aantalRegels: number
  /** Regels die op € 0 staan: zonder calculatie geen prijs. */
  zonderPrijs: number
  /** Artikelen die hier zijn ontstaan omdat de klant iets nieuws vroeg. */
  nieuweArtikelen: string[]
  /** Hoeveel tekeningen er aan die nieuwe artikelen zijn gehangen. */
  gekoppeldeBestanden: number
  /** Tekeningen die niet mee konden, met de reden erbij. Hoort leeg te zijn. */
  misluktebestanden: string[]
  /** De referentie die de offerte kreeg, of null als er al een stond. */
  referentie: string | null
  /** Taken "Recept maken" die erbij kwamen: één per nieuw artikel. */
  receptTaken: number
}

export interface MailKoppeling {
  mailImport: MailImport
  project: Project
  /** Null als er geen regels overgenomen zijn (geen regels, of de offerte had ze al). */
  overname: MailOvername | null
}
