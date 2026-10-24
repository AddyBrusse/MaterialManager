/**
 * De laatste foutmeldingen die iemand op dit scherm zag (2026-10-24).
 *
 * Gaat mee met een verbeterpunt: "dit klopt niet" volgt vaak direct op een rode
 * melding, en wie het oppakt wil dan precies die tekst — niet een navertelling.
 * Alleen in het geheugen van dit venster; na herladen begint de lijst leeg.
 */
export interface RecenteFout {
  /** ISO-tijdstip. */
  tijd: string
  titel: string
  tekst: string
}

const MAX = 10
/** Ouder dan dit heeft vrijwel zeker niets met het verbeterpunt te maken. */
export const BEWAAR_MS = 15 * 60_000

let lijst: RecenteFout[] = []

export function onthoudFout(f: { titel: string; tekst: string }, nu = new Date()): void {
  lijst = [...lijst, { tijd: nu.toISOString(), titel: f.titel.slice(0, 300), tekst: f.tekst.slice(0, 2000) }].slice(-MAX)
}

/** Oudste eerst, alleen van de afgelopen kwartier. */
export function recenteFouten(nu = new Date()): RecenteFout[] {
  return lijst.filter((f) => nu.getTime() - new Date(f.tijd).getTime() <= BEWAAR_MS)
}

export function wisRecenteFouten(): void {
  lijst = []
}

/**
 * Ook wat nergens als melding verscheen: een fout in onze eigen code. Die ziet de
 * gebruiker hooguit als "er gebeurt niets" — juist dan helpt het om hem te hebben.
 */
export function vangOnverwachteFouten(): void {
  window.addEventListener('error', (e) => {
    onthoudFout({ titel: 'Fout in het programma', tekst: `${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}` })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    onthoudFout({ titel: 'Fout in het programma', tekst: r instanceof Error ? r.message : String(r) })
  })
}
