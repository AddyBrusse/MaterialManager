import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { projectsApi, herlaadProject } from '../../../api/projects'
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
import { PakbonnenTab } from './tabs/PakbonnenTab'
import { FacturenTab } from './tabs/FacturenTab'
import { useFactuurDocument } from './tabs/facturen/useFactuurDocument'
import { useOfferteDocument } from './tabs/offertes/useOfferteDocument'
import { toonDocument } from './lib/toon-document'
import { openDocument } from './lib/open-document'
import { pakbonBestandsnaam, pakbonPdf, picklistBestandsnaam, picklistPdf } from './lib/pakbon-document'
import { DocumentenTab } from './tabs/DocumentenTab'

import { berekenVoortgang } from '@stockmanager/shared'
import { useProjectActies } from './useProjectActies'
import { actiesGeblokkeerd, geldendeOfferte, terugActie } from './lib/status'
import { tabActie } from './lib/tab-actie'
import { useObDocument } from './tabs/opdracht/useObDocument'
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
  'pakbonnen',
  'facturen',
  'nacalculatie',
  'documenten',
]

/** Tabs die sinds 2026-10-05 op Algemeen staan; een oude link komt daar uit. */
const NAAR_ALGEMEEN = ['financieel', 'reserveringen', 'aandacht']

function leesTab(waarde: string | null, status: string | undefined): TabId {
  if (waarde && (TAB_IDS as string[]).includes(waarde)) return waarde as TabId
  if (waarde && NAAR_ALGEMEEN.includes(waarde)) return 'algemeen'
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

  // Elke 10 s de serverstand: een gereedmelding op de terminal stond eerder pas
  // na F5 op dit scherm (2026-10-01). Zelfde ritme als de wachtrij op de
  // terminal. React Query pauzeert dit als het tabblad verborgen is en ververst
  // meteen bij terugkomen. Een eigen wijziging die nog onderweg is, wordt niet
  // overschreven (herlaadProject).
  const { data: project, isPending } = useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      await herlaadProject(id)
      return projectsApi.get(id)
    },
    enabled: !!id,
    retry: 5,
    retryDelay: 300,
    refetchInterval: 10_000,
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
  // De opengeklapte versie op de Offertes-tab. Hier en niet in de tab zelf: de
  // footerknop accepteert bij meerdere verstuurde versies de opengeklapte, en
  // de keuze moet blijven staan als je even een andere tab opent. `undefined` =
  // nog niets gekozen, dan de geldende versie.
  const [gekozenVersie, setGekozenVersie] = useState<string | null | undefined>(undefined)
  // Aangevinkte orders in voorbereiding (Productie-tab). `undefined` = nog niets
  // gekozen: dan alles, want vrijgeven wat klaarstaat is het gewone geval.
  const [gekozenOrders, setGekozenOrders] = useState<string[] | undefined>(undefined)
  useEffect(() => {
    setGekozenVersie(undefined)
    setGekozenOrders(undefined)
  }, [id])
  // Na vrijgeven (of een order erbij) staat wat overblijft weer allemaal
  // aangevinkt. Niet bij het openen van de waarschuwing: wie daar Annuleren
  // kiest, houdt zijn keuze.
  const voorbereidingSleutel = (project?.productieOrders ?? [])
    .filter((o) => o.status === 'voorbereiding')
    .map((o) => o.id)
    .join(',')
  useEffect(() => setGekozenOrders(undefined), [voorbereidingSleutel])
  const openVersie = gekozenVersie === undefined ? (project ? geldendeOfferte(project)?.id ?? null : null) : gekozenVersie
  const acties = useProjectActies(project, (t) => kiesTab(t as TabId))
  // Op de pagina, niet in de tab: "Opdracht versturen" kan ook vanuit de footer.
  const obDoc = useObDocument(project, acties.verzendOB)
  const factuurDoc = useFactuurDocument(project, acties.verzendFactuur)
  const offerteDoc = useOfferteDocument(project, acties.verzendOfferte)

  // Mislukt een opslag, dan zet syncProject het project terug naar wat er op
  // de server staat. Opnieuw lezen maakt dat zichtbaar — ook voor wijzigingen
  // die niet via een actie met eigen melding lopen (een cel in de regeltabel,
  // de referentie, de artikelkiezer). Anders bleef de mislukte wijziging op het
  // scherm staan tot iemand herlaadde.
  useEffect(() => {
    if (saveState === 'error') acties.ververs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState])

  // Uit de query, niet alleen uit de cache: een klant of contactpersoon die op
  // de Algemeen-tab wordt aangemaakt, moet meteen in de lijst en de kop staan.
  const qc = useQueryClient()
  const { data: relatiesRes } = useQuery({ queryKey: ['relaties'], queryFn: relatiesApi.list })
  const relaties = relatiesRes?.data ?? relatiesApi.listSync()
  const relatie = useMemo(
    () => (project?.relatieId ? relaties.find((r) => r.id === project.relatieId) ?? null : null),
    [project?.relatieId, relaties],
  )

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
  // Per tab een eigen knop (lib/tab-actie.ts); tabs zonder document hebben er geen.
  const inVoorbereiding = project.productieOrders.filter((o) => o.status === 'voorbereiding').map((o) => o.id)
  const gekozen = gekozenOrders?.filter((x) => inVoorbereiding.includes(x)) ?? inVoorbereiding
  const actie = tabActie(project, voortgang, tab, {
    openVersie,
    gekozenOrders: gekozen,
    regelsZonderMateriaal: projectTodos
      .filter((t) => !t.done && t.soort === 'materiaal_selecteren' && t.offerteRegelId)
      .map((t) => t.offerteRegelId as string),
  })
  // Stilgelegd dicht alles, behalve de stap die het project weer op gang brengt.
  const actieKan = Boolean(actie?.kan) && (!geblokkeerd || actie?.stap?.soort === 'hervatten')
  const terug = terugActie(project)
  const slot = bouwSlot(holderName, isReadOnly, holderIdle, saveState)
  const aandacht = bouwAandacht({
    project,
    todos: projectTodos,
    nacalculatieAfwijkingPct: nacalc?.verschilPct ?? null,
    opslagMislukt: saveState === 'error',
  })
  const aandachtTelling = {
    totaal: aandacht.length,
    rood: aandacht.filter((a) => a.ernst === 'rood').length,
  }
  const badges = bouwTabBadges(project, nacalc, aandachtTelling)
  const tabStanden = bouwTabStanden({
    project,
    nacalc,
    openTodos: projectTodos.filter((t) => !t.done).length,
    aandacht: aandachtTelling,
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
              relaties={relaties}
              onZet={acties.zetProject}
              onRelatiesGewijzigd={() => qc.invalidateQueries({ queryKey: ['relaties'] })}
              activiteit={bouwActiviteit(project)}
              aandacht={aandacht}
              todos={todoVMs}
              geld={bouwGeld(project, nacalc)}
              reserveringen={reserveringVMs}
              onNaarReserveringen={() => navigate('/reserveringen')}
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
              onReferentie={acties.zetReferentie}
              onVerzend={(offerteId) => {
                const o = project.offertes.find((x) => x.id === offerteId)
                if (o) offerteDoc.klaarzetten(o)
              }}
              onPdf={offerteDoc.openen}
              onAccepteer={acties.accepteerOfferte}
              onGewijzigd={acties.ververs}
              onRegel={acties.bewerkRegel}
              onVerwijderRegel={acties.verwijderRegel}
              onPrijzen={acties.werkPrijzenBij}
              onVerwijder={acties.verwijderOfferte}
              onIntrekken={acties.trekOfferteIn}
              onNaarProject={acties.naarNieuwProject}
              open={openVersie}
              onOpen={setGekozenVersie}
            />
          )}
          {tab === 'opdracht' && (
            <OpdrachtTab
              project={project}
              voortgang={voortgang}
              todos={projectTodos}
              reserveringen={reserveringen}
              geblokkeerd={geblokkeerd}
              geenOpdracht={{
                onAccepteer: acties.accepteerOfferte,
                onDirect: acties.maakDirecteOpdracht,
                onAnnuleerDirect: acties.verwijderOfferte,
                onRegel: acties.bewerkRegel,
                onVerwijderRegel: acties.verwijderRegel,
                onPrijzen: acties.werkPrijzenBij,
                onGewijzigd: acties.ververs,
              }}
              doc={obDoc}
              onZetOB={acties.zetOB}
              onNaarTab={kiesTab}
              onNaarReserveringen={() => navigate('/reserveringen')}
              onWijzig={acties.wijzigOpdracht}
            />
          )}
          {tab === 'productie' && (
            <ProductieTab
              project={project}
              geblokkeerd={geblokkeerd}
              gekozen={gekozen}
              onKies={(orderId, aan) =>
                setGekozenOrders(aan ? [...gekozen, orderId] : gekozen.filter((x) => x !== orderId))
              }
              onTerug={acties.terugNaarVoorbereiding}
              onPlanner={() => navigate('/planning-queue')}
              onStap={acties.stapCheck}
              onStuks={acties.meldStuksGereed}
            />
          )}
          {tab === 'pakbonnen' && (
            <PakbonnenTab
              project={project}
              voortgang={voortgang}
              geblokkeerd={geblokkeerd}
              onNieuw={acties.maakPaklijst}
              onWijzig={acties.wijzigPaklijst}
              onVerzend={acties.verzendPaklijst}
              onVerwijder={acties.verwijderPaklijst}
              onPdf={(pl) =>
                toonDocument(`Pakbon ${pl.id} openen`, () => pakbonPdf(project, pl), {
                  titel: `Pakbon ${pl.id} — ${project.naam}`,
                  bestandsnaam: pakbonBestandsnaam(pl),
                })
              }
              onPicklist={(pl) =>
                toonDocument(`Picklist ${pl.id} openen`, () => picklistPdf(project, pl), {
                  titel: `Picklist ${pl.id} — ${project.naam}`,
                  bestandsnaam: picklistBestandsnaam(pl),
                })
              }
            />
          )}
          {tab === 'facturen' && (
            <FacturenTab
              project={project}
              voortgang={voortgang}
              geblokkeerd={geblokkeerd}
              onNieuw={acties.maakFactuur}
              onWijzig={acties.wijzigFactuur}
              onPdf={factuurDoc.openen}
              onVerstuur={factuurDoc.klaarzetten}
              onVerwijder={acties.verwijderFactuur}
              onCrediteer={acties.crediteer}
              onBetaald={acties.markeerBetaald}
            />
          )}
          {tab === 'nacalculatie' && <NacalculatieTab nacalc={nacalc} />}
          {tab === 'documenten' && (
            <DocumentenTab
              project={project}
              voortgang={voortgang}
              geblokkeerd={geblokkeerd}
              onOpenen={(d) => openDocument(project, d)}
              onMaken={(doc) =>
                doc === 'Pakbon'
                  ? kiesTab('pakbonnen')
                  : doc === 'Factuur'
                    ? kiesTab('facturen')
                    : // Offerte en opdracht maak je op hun eigen tab.
                      kiesTab(doc === 'Opdrachtbevestiging' ? 'opdracht' : 'offertes')
              }
            />
          )}
        </div>
      </div>

      <FooterBar
        primair={actie ? { ...actie, kan: actieKan, menu: geblokkeerd ? undefined : actie.menu } : null}
        terug={terug}
        onPrimair={() => {
          if (!actie?.stap) return
          const stap = actie.stap
          if (stap.soort === 'opdracht-versturen') obDoc.klaarzetten()
          else if (stap.soort === 'factuur-versturen') {
            const f = project.facturen.find((x) => x.id === stap.factuurId)
            if (f) factuurDoc.klaarzetten(f)
          } else if (stap.soort === 'offerte-versturen') {
            // Via de mail, net als opdracht en factuur (2026-10-05).
            const o = project.offertes.find((x) => x.id === stap.offerteId)
            if (o) offerteDoc.klaarzetten(o)
          } else acties.voerUit(stap)
        }}
        onMenu={(i) => {
          const keuze = actie?.menu?.[i]
          if (!keuze) return
          acties.voerUit(keuze.stap)
        }}
        onTerug={acties.terug}
      />
      {acties.dialoog}
      {obDoc.dialoog}
      {factuurDoc.dialoog}
      {offerteDoc.dialoog}
    </div>
  )
}
