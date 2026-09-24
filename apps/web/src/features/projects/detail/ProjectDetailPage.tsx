import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'

import { projectsApi } from '../../../api/projects'
import { relatiesApi } from '../../../api/relaties'
import { todosApi } from '../../../api/todos'
import { reservationsApi } from '../../../api/reservations'
import { nacalculatieApi } from '../../../api/nacalculatie'
import { useProjectLock } from '../../../hooks/useProjectLock'
import { useProjectSaveState } from '../../../hooks/useProjectSaveState'
import { usePopoutRoutes } from '../../../hooks/usePopout'

import { ObjectHeader } from './components/ObjectHeader'
import { StatusStrip } from './components/StatusStrip'
import { TabBar } from './components/TabBar'
import { FooterBar } from './components/FooterBar'
import { AlgemeenTab } from './tabs/AlgemeenTab'
import { OffertesTab } from './tabs/OffertesTab'
import { OpdrachtTab } from './tabs/OpdrachtTab'
import { ProductieTab } from './tabs/ProductieTab'
import { NacalculatieTab } from './tabs/NacalculatieTab'
import { DocumentenTab } from './tabs/DocumentenTab'
import { FinancieelTab } from './tabs/FinancieelTab'
import { ReserveringenTab } from './tabs/ReserveringenTab'
import { AandachtTab } from './tabs/AandachtTab'

import { berekenVoortgang } from '@stockmanager/shared'
import { useProjectActies } from './useProjectActies'
import { actiesGeblokkeerd, primaireActie, terugActie } from './lib/status'
import { bouwAandacht } from './lib/aandacht'
import { bouwTabStanden } from './lib/tab-stand'
import {
  bouwActiviteit,
  bouwFacetten,
  bouwGeld,
  bouwReserveringen,
  bouwSamenvatting,
  bouwTabBadges,
  bouwTodos,
} from './lib/build-vm'
import { tijdstip } from './lib/format'
import type { SlotVM, TabId } from './types'
import './project-detail.css'

const TAB_IDS: TabId[] = [
  'algemeen',
  'offertes',
  'opdracht',
  'productie',
  'nacalculatie',
  'documenten',
  'financieel',
  'reserveringen',
  'aandacht',
]

function leesTab(waarde: string | null, status: string | undefined): TabId {
  if (waarde && (TAB_IDS as string[]).includes(waarde)) return waarde as TabId
  // Een project dat in productie staat open je om de productie te zien; alles
  // ervóór begint bij Algemeen.
  return status === 'productie' ? 'productie' : 'algemeen'
}

function bouwSlot(
  holderName: string | null,
  isReadOnly: boolean,
  holderIdle: boolean,
  opslag: 'idle' | 'saving' | 'saved' | 'error',
): SlotVM {
  const tekst =
    opslag === 'saving'
      ? 'Bezig met opslaan…'
      : opslag === 'error'
        ? `Opslaan mislukt — opnieuw geprobeerd ${tijdstip(new Date().toISOString())}`
        : opslag === 'saved'
          ? `Opgeslagen ${tijdstip(new Date().toISOString())}`
          : 'Geen wijzigingen'

  return {
    houder: holderName
      ? `${holderName} heeft dit project open${holderIdle ? ' · inactief' : ''}`
      : null,
    vreemd: isReadOnly,
    opslag: opslag === 'idle' ? 'stil' : opslag === 'saving' ? 'bezig' : opslag === 'error' ? 'mislukt' : 'opgeslagen',
    opslagTekst: tekst,
  }
}

/**
 * De projectdetailpagina — de herindeling uit `shopcommand-projectdetail-spec.md`.
 *
 * Vijf regio's: objectkop met facetten, meldingsbalk, tabbalk met
 * statusbadges, inhoud met zijkolom, en een footer die de volgende stap toont
 * mét de reden waarom hij eventueel niet kan.
 *
 * De afleidingen (welke actie is de volgende, wat blokkeert terugdraaien, wat
 * vraagt aandacht) staan in pure functies onder `lib/`, zonder React of fetch,
 * zodat ze later ongewijzigd naar de server kunnen.
 */
export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const poppedOut = usePopoutRoutes()
  const inPopoutWindow = window.location.pathname.startsWith('/pop/')
  const isPoppedOut = !inPopoutWindow && poppedOut.has(`/projecten/${id}`)
  const { isReadOnly, holderName, holderIdle } = useProjectLock(id, !isPoppedOut)
  const saveState = useProjectSaveState(id)

  const { data: project, isPending } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
    retry: 5,
    retryDelay: 300,
  })

  // Let op de vorm: AppLayout vult diezelfde cachesleutel ['todos'] met de
  // hele envelope ({ data }), niet met de lijst. Wie het eerst laadt bepaalt
  // wat hier binnenkomt, dus moet dit dezelfde vorm aanhouden — anders staat er
  // soms een object waar een array verwacht wordt, en precies dát liet de
  // pagina klappen zodra de zijbalk als eerste geladen had.
  const { data: todosEnvelope } = useQuery({
    queryKey: ['todos'],
    queryFn: todosApi.list,
  })
  const todos = todosEnvelope?.data ?? []
  const { data: reserveringen = [] } = useQuery({
    queryKey: ['reservations', id],
    queryFn: () => reservationsApi.listVoorProject(id),
    enabled: !!id,
  })
  // De nacalculatie kan 404'en zolang er niets te rekenen valt; dat is een
  // lege staat, geen fout, dus niet opnieuw proberen.
  const { data: nacalcRuw = null } = useQuery({
    queryKey: ['nacalculatie', 'project', id],
    queryFn: () => nacalculatieApi.project(id),
    enabled: !!id,
    retry: false,
  })
  // Een project waarvan geen enkel artikel een calculatie heeft levert wél een
  // antwoord op, maar met nul orders erin. Dat is geen kostprijs van € 0,00 —
  // dat is geen kostprijs. Hier één keer platgeslagen, zodat de facetten, de
  // badge, de FactBox Geld en het tabblad niet elk apart die vergissing maken.
  const nacalc = nacalcRuw && nacalcRuw.orders.length > 0 ? nacalcRuw : null

  // Altijd uitgeklapt bij het openen van een project. Dit stond eerder in
  // localStorage, en dan begon een project ingeklapt omdat je wéken eerder een
  // keer ruimte nodig had op een ander project. Inklappen geldt nu zolang je op
  // deze pagina bent.
  const [kopIngeklapt, setKopIngeklapt] = useState(false)
  const acties = useProjectActies(project, (t) => kiesTab(t as TabId))

  const relatie = useMemo(() => {
    if (!project?.relatieId) return null
    return relatiesApi.listSync().find((r) => r.id === project.relatieId) ?? null
  }, [project?.relatieId])

  const projectTodos = useMemo(
    () => todos.filter((t) => t.projectId === id),
    [todos, id],
  )

  const tab = leesTab(searchParams.get('tab'), project?.status)

  function kiesTab(t: TabId) {
    setSearchParams(
      (vorige) => {
        const volgende = new URLSearchParams(vorige)
        volgende.set('tab', t)
        return volgende
      },
      { replace: true },
    )
  }

  function toggleKop() {
    setKopIngeklapt((v) => !v)
  }

  function nogNiet(wat: string) {
    notifications.show({
      color: 'blue',
      title: 'Nog niet aangesloten in v2',
      message: `${wat} werkt op het bestaande scherm — deze pagina is voorlopig de indeling, niet de bediening.`,
    })
  }

  if (isPending) return <div className="pdv2-empty">Laden…</div>
  if (!project) return <div className="pdv2-empty">Project niet gevonden.</div>

  const geblokkeerd = actiesGeblokkeerd(project) || isReadOnly
  // Eén berekening voor de hele pagina: de Opdracht-tab toont hem per regel,
  // Productie telt er stuks mee, en de footer leest eruit wat de volgende stap
  // is. Drie keer apart rekenen levert drie antwoorden op.
  const voortgang = berekenVoortgang(project)
  const facetten = bouwFacetten(project, relatie, nacalc)
  const reserveringVMs = bouwReserveringen(reserveringen)
  const todoVMs = bouwTodos(projectTodos)
  const primair = primaireActie(project, voortgang)
  const terug = terugActie(project)
  const slot = bouwSlot(holderName, isReadOnly, holderIdle, saveState)
  const aandacht = bouwAandacht({
    project,
    todos: projectTodos,
    nacalculatieAfwijkingPct: nacalc?.verschilPct ?? null,
    opslagMislukt: saveState === 'error',
  })
  const badges = bouwTabBadges(project, nacalc, {
    reserveringen: reserveringVMs.length,
    aandacht: aandacht.length,
  })
  const tabStanden = bouwTabStanden({
    project,
    nacalc,
    openTodos: projectTodos.filter((t) => !t.done).length,
    reserveringen: {
      totaal: reserveringVMs.length,
      wacht: reserveringVMs.filter((r) => r.wacht).length,
    },
    aandacht: {
      totaal: aandacht.length,
      rood: aandacht.filter((a) => a.ernst === 'rood').length,
    },
  })

  return (
    <div className="pdv2">
      <ObjectHeader
        project={project}
        facetten={facetten}
        samenvatting={bouwSamenvatting(project, relatie)}
        slot={slot}
        ingeklapt={kopIngeklapt}
        onToggle={toggleKop}
        geblokkeerd={geblokkeerd}
        onOnHold={acties.onHold}
        onAnnuleer={acties.annuleer}
        onAfdrukken={() => window.print()}
      />

      <StatusStrip project={project} />

      <TabBar actief={tab} badges={badges} standen={tabStanden} onKies={kiesTab} />

      <div className="pdv2-body">
        <div className="pdv2-main">
          {tab === 'algemeen' && (
            <AlgemeenTab
              project={project}
              relatie={relatie}
              activiteit={bouwActiviteit(project)}
              geblokkeerd={geblokkeerd}
              onGewijzigd={acties.ververs}
            />
          )}
          {tab === 'offertes' && (
            <OffertesTab
              project={project}
              geblokkeerd={geblokkeerd}
              onNieuweVersie={acties.nieuweOfferteVersie}
              onKopieer={acties.kopieerOfferte}
              onVerzend={acties.verzendOfferte}
              onAccepteer={acties.accepteerOfferte}
              onGewijzigd={acties.ververs}
              onRegel={acties.bewerkRegel}
              onVerwijderRegel={acties.verwijderRegel}
              onPrijzen={acties.werkPrijzenBij}
            />
          )}
          {tab === 'opdracht' && (
            <OpdrachtTab
              project={project}
              voortgang={voortgang}
              todos={projectTodos}
              reserveringen={reserveringen}
              geblokkeerd={geblokkeerd}
              onAanmaken={acties.maakOpdracht}
              onOpenen={() => kiesTab('documenten')}
              onOpnieuwVersturen={acties.verzendOB}
              onNaarOrder={() => kiesTab('productie')}
            />
          )}
          {tab === 'productie' && (
            <ProductieTab
              project={project}
              geblokkeerd={geblokkeerd}
              onPlanner={() => navigate('/planning-queue')}
              onStap={acties.stapCheck}
              onStuks={acties.meldStuksGereed}
            />
          )}
          {tab === 'nacalculatie' && <NacalculatieTab nacalc={nacalc} />}
          {tab === 'financieel' && <FinancieelTab geld={bouwGeld(project, nacalc)} />}
          {tab === 'reserveringen' && <ReserveringenTab items={reserveringVMs} />}
          {tab === 'aandacht' && <AandachtTab aandacht={aandacht} todos={todoVMs} />}
          {tab === 'documenten' && (
            <DocumentenTab
              project={project}
              voortgang={voortgang}
              geblokkeerd={geblokkeerd}
              onOpenen={(doc) => nogNiet(`${doc} openen`)}
              onMaken={(doc) =>
                doc === 'Paklijst'
                  ? acties.maakPaklijst()
                  : doc === 'Factuur'
                    ? acties.maakFactuur()
                    : acties.primair()
              }
            />
          )}
        </div>
      </div>

      <FooterBar
        primair={{ ...primair, kan: primair.kan && !geblokkeerd }}
        terug={terug}
        onPrimair={acties.primair}
        onTerug={acties.terug}
      />
      {acties.dialoog}
    </div>
  )
}
