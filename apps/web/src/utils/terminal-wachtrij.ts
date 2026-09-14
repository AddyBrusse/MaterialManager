/**
 * Welk werk hoort bij welke machine op de terminal.
 *
 * Op een productiestap staat de machine als tékst: `geplandMachine` als de
 * planning hem heeft toegewezen, anders `machine` — en dat laatste is bij een
 * order uit een offerte gewoon de naam van de bewerking, want zo wordt hij
 * aangemaakt (`machine: naam` in `api/projects.ts`). Die tekst hoeft dus
 * helemaal geen machine te benoemen.
 *
 * Vergeleken we dat rechttoe rechtaan met de naam van de gekoppelde machine,
 * dan verdween al het werk zodra de bewerking anders heette dan de machine.
 * Gemeten 2026-09-14: een terminal gekoppeld aan "DMG 450TC EcoLine" toonde
 * "(0)" en "Geen openstaand werk" terwijl er twee stappen open stonden, met
 * bewerkingen "DMG" en "Draaien".
 *
 * De regel hieronder: een tekst die géén bestaande machine benoemt kan ook
 * geen machine uitsluiten. Zo'n stap is niet aan een machine toegewezen en
 * hoort dus op elke terminal zichtbaar te zijn — met een badge, zodat niemand
 * denkt dat hij ingepland was. Benoemt de tekst wél een machine, dan geldt die
 * toewijzing strikt en blijft het werk van de buurman uit beeld.
 */

/** Namen vergelijken zoals een mens ze leest: spaties en hoofdletters tellen niet. */
export function normaliseerMachine(naam: string | null | undefined): string {
  return (naam ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export type MachineToewijzing =
  /** De stap staat op deze machine. */
  | { soort: 'eigen' }
  /** De stap staat op een andere, bestaande machine. */
  | { soort: 'andere'; machine: string }
  /** De tekst op de stap benoemt geen bekende machine. */
  | { soort: 'onbekend'; label: string | null }

export function bepaalToewijzing(
  stapMachine: string | null,
  eigenMachineNaam: string | null,
  alleMachineNamen: string[],
): MachineToewijzing {
  const bekend = new Set(alleMachineNamen.map(normaliseerMachine).filter(Boolean))
  const opStap = normaliseerMachine(stapMachine)
  if (!opStap || !bekend.has(opStap)) return { soort: 'onbekend', label: stapMachine || null }
  if (eigenMachineNaam && opStap === normaliseerMachine(eigenMachineNaam)) return { soort: 'eigen' }
  return { soort: 'andere', machine: stapMachine as string }
}

/** Hoort deze stap in de eigen wachtrij van de terminal? */
export function hoortBijMachine(
  stapMachine: string | null,
  eigenMachineNaam: string | null,
  alleMachineNamen: string[],
): boolean {
  // Hangt het scherm nergens aan, dan is geen enkele stap "van een ander" en
  // tonen we alles: een leeg scherm terwijl er werk ligt is erger dan een
  // lijst die te lang is.
  if (!eigenMachineNaam) return true
  const t = bepaalToewijzing(stapMachine, eigenMachineNaam, alleMachineNamen)
  return t.soort === 'eigen' || t.soort === 'onbekend'
}

/**
 * De machine waar dit scherm aan hangt.
 *
 * De opgeslagen gebruiker is een momentopname uit `localStorage` van het moment
 * dat er op dit scherm iemand gekozen is. De koppeling aan een machine wordt
 * daarná op kantoor gelegd, dus die momentopname zegt dan nog "geen machine" en
 * de terminal toont het werk van de hele werkvloer. Gemeld 2026-09-14: een
 * gekoppelde terminal bleef "Dit scherm hangt nog aan geen machine" tonen.
 *
 * De server wint dus. De opgeslagen waarde is alleen de terugval zolang de
 * namenlijst nog onderweg is — anders knippert het scherm bij elke verversing
 * van "eigen wachtrij" naar "alles".
 */
export function bepaalMachineId(
  live: { id: string; machineId?: string | null }[] | undefined,
  opgeslagen: { id: string; machineId?: string | null } | null,
): string | null {
  if (!opgeslagen) return null
  const vanServer = live?.find((u) => u.id === opgeslagen.id)
  if (vanServer) return vanServer.machineId ?? null
  return opgeslagen.machineId ?? null
}
