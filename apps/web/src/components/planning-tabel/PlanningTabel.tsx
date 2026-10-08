import { useMemo, useState } from 'react'
import { MACHINE_SOORTEN, MACHINE_SOORT_LABEL } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { dateForOffset, isBacklogJob, type DerivedSlot, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { isTeLaat, maakVoorstel, startDag, uiterlijkeStart, werkdagenTeLaat, type Voorstel, type Wachtrijen } from './tabel-logica'
import { TabelRaster, type Kolom } from './TabelRaster'
import { ProjectLijst, type ProjectRij, type ProjectZoek } from './ProjectLijst'
import { DetailBalk } from './DetailBalk'
import { VoorstelVenster } from './VoorstelVenster'
import { SleepTip } from './SleepTip'
import { useSleepPreview } from './useSleepPreview'
import { useTabelActies } from './useTabelActies'
import './planning-tabel.css'

interface Props {
  allJobs: QueueJob[]
  backlog: QueueJob[]
  wachtrijen: Wachtrijen
  machines: Machine[]
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  windowStart: Date
  onGewijzigd: () => void
}

const soortVolgorde = (m: Machine) => (m.soort ? MACHINE_SOORTEN.indexOf(m.soort) : MACHINE_SOORTEN.length)

/**
 * De planning als tabel (2026-10-08), naast de Tijdlijn. Kolom = machine,
 * rij = plek in de wachtrij, cel = productiestap. Zie `tabel-logica.ts`.
 */
export function PlanningTabel({ allJobs, backlog, wachtrijen, machines, schedule, verplichtKlaar, windowStart, onGewijzigd }: Props) {
  const [gekozen, setGekozen] = useState<QueueJob | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [zoek, setZoek] = useState('')
  const [pz, setPz] = useState<ProjectZoek>({ klant: '', project: '', stap: '' })
  const [alleenLaat, setAlleenLaat] = useState(false)
  const [alleenMateriaal, setAlleenMateriaal] = useState(false)
  const [voorstel, setVoorstel] = useState<{ project: string; vast: Map<string, string>; lijst: Voorstel[] } | null>(null)

  const relaties = relatiesApi.listSync()
  const klantVan = (j: QueueJob) => relaties.find((r) => r.id === j.item.project.relatieId)?.naam ?? j.klant
  const startVan = (j: QueueJob) => (isBacklogJob(j) ? null : startDag(schedule.get(j.id), windowStart))
  const laatVan = (j: QueueJob) => isTeLaat(startVan(j), uiterlijkeStart(j, verplichtKlaar, windowStart))

  const acties = useTabelActies(wachtrijen, machines, windowStart, onGewijzigd)
  const sleep = useSleepPreview({
    wachtrijen, machines, schedule, verplichtKlaar, windowStart,
    onLos: (j, doel, voorId) => { if (doel != null || !isBacklogJob(j)) acties.verplaatsNaar(j, doel, voorId) },
  })

  const kolommen: Kolom[] = useMemo(() => [
    { naam: null, titel: 'Niet ingepland', sub: 'sleep naar een machine', jobs: backlog },
    ...[...machines].sort((a, b) => soortVolgorde(a) - soortVolgorde(b) || a.name.localeCompare(b.name, 'nl')).map((m) => ({
      naam: m.name, titel: m.name, sub: m.soort ? MACHINE_SOORT_LABEL[m.soort] : 'soort niet ingevuld', jobs: wachtrijen.get(m.name) ?? [],
    })),
  ], [backlog, machines, wachtrijen])

  const tekst = (j: QueueJob) => `${j.orderId} ${klantVan(j)} ${j.artikel} ${j.tekening ?? ''} ${j.naam} ${j.item.project.id}`.toLowerCase()
  const pastPz = (j: QueueJob) =>
    (!pz.klant || klantVan(j).toLowerCase().includes(pz.klant.toLowerCase()))
    && (!pz.project || `${j.item.project.id} ${j.item.project.naam}`.toLowerCase().includes(pz.project.toLowerCase()))
    && (!pz.stap || j.naam.toLowerCase().includes(pz.stap.toLowerCase()))
  const zichtbaar = (j: QueueJob) =>
    (!project || j.item.project.id === project) && pastPz(j)
    && (!zoek || tekst(j).includes(zoek.toLowerCase()))
    && (!alleenLaat || laatVan(j)) && (!alleenMateriaal || j.wachtOpMateriaal)

  const projecten: ProjectRij[] = useMemo(() => {
    const per = new Map<string, ProjectRij>()
    for (const j of allJobs) {
      if (!pastPz(j)) continue
      const p = j.item.project
      const r = per.get(p.id) ?? { id: p.id, naam: p.naam, klant: klantVan(j), levering: p.levertijdDatum ?? null, open: 0, nietIngepland: 0 }
      r.open++
      if (isBacklogJob(j)) r.nietIngepland++
      per.set(p.id, r)
    }
    return [...per.values()].sort((a, b) => a.id.localeCompare(b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allJobs, pz, relaties])

  const orderJobs = gekozen ? allJobs.filter((j) => j.orderId === gekozen.orderId).sort((a, b) => a.volgorde - b.volgorde) : []
  const laatTotaal = allJobs.filter(laatVan).length

  const bereken = (pid: string, vast: Map<string, string>) =>
    maakVoorstel(wachtrijen, backlog.filter((j) => j.item.project.id === pid), machines, verplichtKlaar, windowStart, vast)

  return (
    <div className="pt">
      <div className="pt-balk">
        <input className="pt-zoek" placeholder="Zoek productienr, klant, tekening…" aria-label="Zoeken in de planning" value={zoek} onChange={(e) => setZoek(e.currentTarget.value)} />
        <button type="button" className="pt-tgl" data-on={alleenLaat} onClick={() => setAlleenLaat((v) => !v)}>Te laat{laatTotaal ? ` (${laatTotaal})` : ''}</button>
        <button type="button" className="pt-tgl" data-on={alleenMateriaal} onClick={() => setAlleenMateriaal((v) => !v)}>Wacht op materiaal</button>
        <span className="pt-stand">{allJobs.length} open stappen · {backlog.length} niet ingepland</span>
      </div>
      <div className="pt-midden">
        <ProjectLijst projecten={projecten} zoek={pz} onZoek={setPz} gekozen={project} onKies={(pid) => { setProject(pid); if (pid && gekozen && gekozen.item.project.id !== pid) setGekozen(null) }}
          onInplannen={(pid) => setVoorstel({ project: pid, vast: new Map(), lijst: bereken(pid, new Map()) })} />
        <TabelRaster kolommen={kolommen} info={(j) => {
          const start = startVan(j), uiterlijk = uiterlijkeStart(j, verplichtKlaar, windowStart), slot = schedule.get(j.id)
          return { klant: klantVan(j), start, uiterlijk, laat: isTeLaat(start, uiterlijk), achter: werkdagenTeLaat(start, uiterlijk),
            eind: start && slot ? toDateStr(dateForOffset(windowStart, Math.max(Math.floor(slot.startOffsetDays), Math.ceil(slot.finishOffsetDays) - 1))) : null }
        }} zichtbaar={zichtbaar}
          gekozenId={gekozen?.id ?? null} gerelateerdOrder={gekozen?.orderId ?? null} sleep={sleep.sleep} doel={sleep.doel} dicht={sleep.dicht}
          onKies={(j) => setGekozen(gekozen?.id === j.id ? null : j)} onSleepStart={sleep.start} onSleepOver={sleep.over} onLos={sleep.los} onSleepEind={sleep.eind} />
      </div>
      <DetailBalk jobs={orderJobs} gekozenId={gekozen?.id ?? null} klant={gekozen ? klantVan(gekozen) : ''} schedule={schedule}
        verplichtKlaar={verplichtKlaar} windowStart={windowStart} onKies={setGekozen} />
      {sleep.sleep && sleep.muis && <SleepTip doel={sleep.doel} reden={sleep.reden} onbekend={sleep.onbekend} gevolg={sleep.gevolg} muis={sleep.muis} />}
      <VoorstelVenster
        titel={voorstel ? `Inplannen · ${voorstel.project}` : ''}
        voorstellen={voorstel?.lijst ?? null}
        onKiesMachine={(stapId, machine) => {
          if (!voorstel) return
          const vast = new Map(voorstel.vast).set(stapId, machine)
          setVoorstel({ ...voorstel, vast, lijst: bereken(voorstel.project, vast) })
        }}
        onToepassen={() => { if (voorstel) acties.pasVoorstelToe(voorstel.lijst); setVoorstel(null) }}
        onSluit={() => setVoorstel(null)}
      />
    </div>
  )
}
