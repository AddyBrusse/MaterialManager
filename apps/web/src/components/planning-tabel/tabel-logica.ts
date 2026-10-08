/**
 * De planning als tabel (2026-10-08): kolom = machine, rij = plek in de
 * wachtrij, cel = één productiestap. Dit bestand rekent; de schermen tekenen.
 *
 * Er komt hier geen eigen planning bij. De tabel leest en schrijft dezelfde
 * velden als de Wachtrij-pagina (`geplandMachine`, `queuePosition`,
 * `geplandDatum`) en rekent met dezelfde functies uit `planningQueueUtils`
 * (`deriveShopSchedule`, `computeRelockedDates`, `computeLatestStart`), zodat
 * Tijdlijn en Tabel altijd hetzelfde zeggen. Een verplaatsing schrijft alleen
 * de stap zelf; de data van wat erna komt rekent de planner opnieuw uit.
 */
import { MACHINE_SOORTEN, MACHINE_SOORT_LABEL, type MachineSoort } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import {
  computeInsertPosition, computeLatestStart, computeRelockedDates, dateForOffset,
  type DerivedSlot, type QueueJob,
} from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'

export type Wachtrijen = Map<string, QueueJob[]>

/**
 * De soort van een stap: die van de machine in het recept (`stap.machine`).
 * Is dat geen bestaande machine maar de naam van een bewerking die precies een
 * soort is ("zagen", "Draaien" — zo staan oudere stappen erin), dan die soort.
 * Anders die van de machine waar hij nu op staat. Onbekend = null.
 */
export function soortVanStap(job: QueueJob, machines: Machine[]): MachineSoort | null {
  const recept = machines.find((m) => m.name === job.item.stap.machine)
  if (recept?.soort) return recept.soort
  const naam = (job.item.stap.machine ?? '').trim().toLowerCase()
  const alsSoort = MACHINE_SOORTEN.find((s) => s === naam)
  if (!recept && alsSoort) return alsSoort
  const nu = machines.find((m) => m.name === job.item.stap.geplandMachine)
  return nu?.soort ?? null
}

/** De machine uit het recept, als die bestaat. */
export function receptMachine(job: QueueJob, machines: Machine[]): Machine | null {
  return machines.find((m) => m.name === job.item.stap.machine) ?? null
}

/**
 * Waarom deze stap niet naar deze machine mag, of null. Alleen naar dezelfde
 * soort (afgesproken 2026-10-08). Is de soort van de stap onbekend, dan mag
 * het overal — anders kan er niets zolang de soorten niet zijn ingevuld; de
 * preview zegt het er dan bij.
 */
export function waaromNietNaar(job: QueueJob, doel: Machine, machines: Machine[]): string | null {
  const soort = soortVanStap(job, machines)
  if (!soort) return null
  if (doel.name === job.item.stap.machine) return null
  if (doel.soort === soort) return null
  return doel.soort
    ? `${doel.name} is een ${MACHINE_SOORT_LABEL[doel.soort].toLowerCase()}machine; deze stap is ${MACHINE_SOORT_LABEL[soort].toLowerCase()}.`
    : `Van ${doel.name} is de soort niet ingevuld (Instellingen → Machines); deze stap is ${MACHINE_SOORT_LABEL[soort].toLowerCase()}.`
}

/** Melding bij een stap waarvan de soort niet bekend is. */
export function soortOnbekend(job: QueueJob, machines: Machine[]): string | null {
  return soortVanStap(job, machines)
    ? null
    : `Van "${job.item.stap.machine ?? job.naam}" is geen soort bekend: de stap mag naar elke machine. Vul de soort in bij Instellingen → Machines.`
}

/** Berekende startdag (yyyy-mm-dd) uit het schema, of null als hij niet ingepland is. */
export function startDag(slot: DerivedSlot | undefined, windowStart: Date): string | null {
  return slot ? toDateStr(dateForOffset(windowStart, Math.floor(slot.startOffsetDays))) : null
}

/** Laat = de berekende start valt na de uiterste start (terug gerekend van de levering). */
export function isTeLaat(start: string | null, uiterlijk: string | null): boolean {
  return start != null && uiterlijk != null && start > uiterlijk
}

export function uiterlijkeStart(job: QueueJob, verplichtKlaar: Map<string, string>, windowStart: Date): string | null {
  return computeLatestStart(job, verplichtKlaar, windowStart)
}

export interface Verplaatsing {
  wachtrijen: Wachtrijen
  /** Machines waarvan de volgorde veranderde. */
  geraakt: Set<string>
  /** Nieuwe queuePosition voor de stap; null = uit de planning. */
  positie: number | null
}

/**
 * De wachtrijen na het verplaatsen van één stap: naar `doel` vóór `voorId`
 * (null = achteraan), of met `doel` null terug naar "Niet ingepland".
 */
export function verplaats(wachtrijen: Wachtrijen, job: QueueJob, doel: string | null, voorId: string | null): Verplaatsing {
  const nieuw: Wachtrijen = new Map()
  const geraakt = new Set<string>()
  for (const [naam, jobs] of wachtrijen) {
    const zonder = jobs.filter((j) => j.id !== job.id)
    if (zonder.length !== jobs.length) geraakt.add(naam)
    nieuw.set(naam, zonder)
  }
  if (doel == null) return { wachtrijen: nieuw, geraakt, positie: null }

  const rij = nieuw.get(doel) ?? []
  const positie = computeInsertPosition(rij, voorId)
  const i = voorId == null ? -1 : rij.findIndex((j) => j.id === voorId)
  const plaats = i === -1 ? rij.length : i
  const verplaatst: QueueJob = { ...job, machineNaam: doel, queuePosition: positie }
  nieuw.set(doel, [...rij.slice(0, plaats), verplaatst, ...rij.slice(plaats)])
  geraakt.add(doel)
  return { wachtrijen: nieuw, geraakt, positie }
}

export interface Wijziging {
  job: QueueJob
  van: string | null
  naar: string | null
  uiterlijk: string | null
}

export interface Preview {
  /** Nieuwe startdag per stap op de geraakte machines en hun opvolgers. */
  datums: Map<string, string>
  /** Wat er verschuift, de verplaatste stap eerst. */
  wijzigingen: Wijziging[]
}

/**
 * Wat er gebeurt als je loslaat: dezelfde rekensom als bij het opslaan
 * (`computeRelockedDates`), dus de preview liegt niet over het resultaat.
 */
export function preview(
  huidig: Map<string, string | null>,
  v: Verplaatsing,
  job: QueueJob,
  machines: Machine[],
  verplichtKlaar: Map<string, string>,
  windowStart: Date,
): Preview {
  const datums = computeRelockedDates(v.wachtrijen, v.geraakt, machines, windowStart)
  const wijzigingen: Wijziging[] = []
  for (const jobs of v.wachtrijen.values()) {
    for (const j of jobs) {
      const naar = datums.get(j.id) ?? null
      const van = huidig.get(j.id) ?? null
      if (j.id === job.id || naar !== van) {
        wijzigingen.push({ job: j, van, naar, uiterlijk: uiterlijkeStart(j, verplichtKlaar, windowStart) })
      }
    }
  }
  if (v.positie == null) wijzigingen.unshift({ job, van: huidig.get(job.id) ?? null, naar: null, uiterlijk: uiterlijkeStart(job, verplichtKlaar, windowStart) })
  wijzigingen.sort((a, b) => (a.job.id === job.id ? -1 : b.job.id === job.id ? 1 : 0))
  return { datums, wijzigingen }
}

export interface Voorstel {
  job: QueueJob
  machine: string | null
  voorId: string | null
  start: string | null
  uiterlijk: string | null
  /** Andere machines van dezelfde soort, met hun start — om uit te kiezen. */
  alternatieven: { machine: string; start: string | null }[]
  /** Waarom er geen machine is, als die er niet is. */
  reden: string | null
}

/**
 * Een voorstel om stappen in te plannen (2026-10-08). Per stap, op volgorde:
 * - eerste keuze is de machine uit het recept; is die er niet, dan de machine
 *   van dezelfde soort waarop hij het vroegst kan beginnen;
 * - binnen die wachtrij vóór de eerste stap die later uiterlijk moet starten
 *   (wat eerder af moet, gaat voor);
 * - elke plaatsing rekent mee voor de volgende, zodat stap 2 na stap 1 komt.
 * Een vuistregel, geen optimale planning: andere stappen schuiven niet op.
 */
export function maakVoorstel(
  wachtrijen: Wachtrijen,
  jobs: QueueJob[],
  machines: Machine[],
  verplichtKlaar: Map<string, string>,
  windowStart: Date,
  /** Door de gebruiker gekozen machine per stap (uit de alternatieven). */
  vast: Map<string, string> = new Map(),
): Voorstel[] {
  let huidig = wachtrijen
  const geraakt = new Set<string>()
  const uit: Voorstel[] = []
  const volgorde = [...jobs].sort((a, b) => a.orderId.localeCompare(b.orderId) || a.volgorde - b.volgorde)

  for (const job of volgorde) {
    const uiterlijk = uiterlijkeStart(job, verplichtKlaar, windowStart)
    const soort = soortVanStap(job, machines)
    const recept = receptMachine(job, machines)
    const kandidaten = machines.filter((m) => (soort ? m.soort === soort || m.name === recept?.name : m.name === recept?.name))
    if (kandidaten.length === 0) {
      uit.push({ job, machine: null, voorId: null, start: null, uiterlijk, alternatieven: [],
        reden: `Geen machine gevonden voor "${job.item.stap.machine ?? job.naam}". Vul de soort in bij Instellingen → Machines, of sleep de stap zelf.` })
      continue
    }

    const proef = kandidaten.map((m) => {
      const voorId = plekOpUiterlijk(huidig.get(m.name) ?? [], uiterlijk, verplichtKlaar, windowStart)
      const v = verplaats(huidig, job, m.name, voorId)
      const start = computeRelockedDates(v.wachtrijen, v.geraakt, machines, windowStart).get(job.id) ?? null
      return { machine: m.name, voorId, start, v }
    })
    const keuze = proef.find((p) => p.machine === vast.get(job.id))
      ?? (recept && proef.find((p) => p.machine === recept.name))
      ?? [...proef].sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'))[0]
    huidig = keuze.v.wachtrijen
    for (const g of keuze.v.geraakt) geraakt.add(g)
    uit.push({
      job, machine: keuze.machine, voorId: keuze.voorId, start: keuze.start, uiterlijk, reden: null,
      alternatieven: proef.filter((p) => p !== keuze).map((p) => ({ machine: p.machine, start: p.start })),
    })
  }
  // De start die er na opslaan echt komt: alles samen doorgerekend, zoals
  // `samenvoegen` + opslaan doen. Per stap apart zou een latere plaatsing een
  // eerdere niet meer zien.
  const eind = computeRelockedDates(huidig, geraakt, machines, windowStart)
  return uit.map((v) => (v.machine ? { ...v, start: eind.get(v.job.id) ?? v.start } : v))
}

/**
 * Alle plaatsingen van een voorstel na elkaar in de wachtrijen, en welke
 * machines daardoor geraakt zijn — om in één keer door te rekenen en op te
 * slaan.
 */
export function samenvoegen(wachtrijen: Wachtrijen, voorstellen: Voorstel[]): { wachtrijen: Wachtrijen; geraakt: Set<string>; posities: Map<string, number> } {
  let huidig = wachtrijen
  const geraakt = new Set<string>()
  const posities = new Map<string, number>()
  for (const vs of voorstellen) {
    if (!vs.machine) continue
    const v = verplaats(huidig, vs.job, vs.machine, vs.voorId)
    huidig = v.wachtrijen
    for (const g of v.geraakt) geraakt.add(g)
    if (v.positie != null) posities.set(vs.job.id, v.positie)
  }
  return { wachtrijen: huidig, geraakt, posities }
}

/** De eerste stap in de rij die later uiterlijk moet starten dan deze — daarvóór hoort hij. */
function plekOpUiterlijk(rij: QueueJob[], uiterlijk: string | null, verplichtKlaar: Map<string, string>, windowStart: Date): string | null {
  if (!uiterlijk) return null
  const later = rij.find((j) => {
    const u = uiterlijkeStart(j, verplichtKlaar, windowStart)
    return u == null || u > uiterlijk
  })
  return later?.id ?? null
}

/** dd-mm met de dag erbij: "di 14-10". */
export function dagKort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  const dag = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][d.getDay()]
  return `${dag} ${iso.slice(8, 10)}-${iso.slice(5, 7)}`
}

/** Minuten als uren met komma: "4,5 u". */
export function urenKort(min: number): string {
  return `${(Math.round((min / 60) * 10) / 10).toLocaleString('nl-NL')} u`
}
