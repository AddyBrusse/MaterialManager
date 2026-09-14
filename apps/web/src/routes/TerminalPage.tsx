import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import {
  IconUser, IconPlayerPause, IconPlayerPlay, IconCheck, IconMoon,
  IconArrowRight, IconAlertTriangle, IconX,
} from '@tabler/icons-react'
import { secondenNaarKlok, secondenNaarUren, type TijdSoort } from '@stockmanager/shared'
import { usersApi } from '../api/users'
import { articlesApi } from '../api/articles'
import { reservationsApi } from '../api/reservations'
import { projectsApi, initProjects } from '../api/projects'
import { machinesApi } from '../api/machines'
import { useLopendeTijd, useTijdActies, useKlok } from '../hooks/useTijdregistratie'
import { useUserStore } from '../stores/user'
import { bepaalToewijzing, hoortBijMachine } from '../utils/terminal-wachtrij'
import { TE_LANG_SECONDEN } from '../components/tijd/ActieveRegistratie'

/**
 * Een melding op formaat werkvloer.
 *
 * De terminal staat op anderhalve meter afstand en de operator kijkt er maar
 * kort op. Zonder bevestiging lijkt elke druk op de knop niets te doen: de
 * klok start wel, maar het scherm zegt het niet. Gemeld 2026-09-14.
 */
function melding(kleur: 'green' | 'red', titel: string, bericht: string) {
  notifications.show({
    color: kleur, title: titel, message: bericht, autoClose: 4000,
    styles: { title: { fontSize: 17 }, description: { fontSize: 15 } },
  })
}

/**
 * Waar staat deze stap gepland, gezien vanaf deze terminal.
 *
 * Drie gevallen, en alle drie moeten ze zichtbaar zijn: op deze machine (geen
 * badge, dat is de normale gang van zaken), op een andere bestaande machine
 * (waarschuwing — je boekt werk om), of op iets dat helemaal geen machine
 * benoemt. Dat laatste is de bewerkingsnaam van de offerteregel; de stap is
 * dan nooit ingepland. Zonder badge zou zulk werk er hier uitzien alsof het
 * voor deze machine bedoeld was.
 */
function StapMachineBadge(props: {
  stapMachine: string | null
  eigenMachineNaam: string | null
  machineNamen: string[]
}) {
  if (!props.eigenMachineNaam) return null
  const t = bepaalToewijzing(props.stapMachine, props.eigenMachineNaam, props.machineNamen)
  if (t.soort === 'eigen') return null
  if (t.soort === 'andere') {
    return (
      <span className="st-badge warn" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
        gepland op {t.machine}
      </span>
    )
  }
  return (
    <span className="st-badge" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
      {t.label ? `niet ingepland · ${t.label}` : 'niet ingepland'}
    </span>
  )
}

/**
 * De terminal bij de machine — het enige scherm dat op de werkvloer-pc draait.
 *
 * Lichte stijl, dezelfde tokenset als de rest van de app. Knoppen van 64 px voor
 * vingers met handschoenen aan, en 'stap klaar' het verst van de rand zodat hij
 * niet per ongeluk geraakt wordt bij het schoonvegen van het scherm.
 *
 * Het account waarmee dit scherm draait is de máchine, niet een persoon (rol
 * 'terminal'). Wie er werkelijk staat kiest zichzelf bij het starten van bemand
 * werk — zonder dat zijn de manuren van niemand. De API weigert dit account
 * alles behalve de klok; zie middleware/terminal-scope.ts.
 */
export function TerminalPage() {
  const machineAccount = useUserStore((s) => s.user)
  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [gekozenStap, setGekozenStap] = useState<string | null>(null)
  // Planning verandert op het laatste moment: een klus die voor de Doosan
  // stond kan alsnog op de DMG. Standaard tonen we de eigen wachtrij, maar
  // alles moet te kiezen zijn — anders staat de operator met een machine
  // stil terwijl er werk ligt.
  const [alleMachines, setAlleMachines] = useState(false)
  // Gereedmelden is één tik op een scherm dat ook schoongeveegd wordt. Daarom
  // een bevestiging: terugzetten kan alleen op kantoor.
  const [bevestigGereed, setBevestigGereed] = useState(false)

  const qc = useQueryClient()
  const lopend = useLopendeTijd()
  const acties = useTijdActies()

  const { data: usersResp } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() })
  // Andere terminals staan niet in de namenlijst: een machinescherm is geen
  // operator, en hem aanbieden levert alleen verkeerde manuren op.
  const operators = (usersResp?.data ?? []).filter((u) => u.role !== 'terminal')
  const operator = operators.find((u) => u.id === operatorId) ?? null

  // projectsApi.list() leest een synchrone cache die eerst gevuld moet worden;
  // zonder initProjects() blijft de wachtrij leeg terwijl er wél werk ligt.
  // (Waargenomen 2026-09-13: terminal toonde nul kaarten bij een echte order.)
  // De machine waar dit scherm aan hangt. Via de koppeling op het account, niet
  // via de naam: die moest anders exact gelijk zijn aan wat er op de stap staat.
  const { data: machinesResp } = useQuery({ queryKey: ['machines'], queryFn: () => machinesApi.list() })
  const eigenMachine = (machinesResp?.data ?? []).find((m) => m.id === machineAccount?.machineId) ?? null
  const eigenMachineNaam = eigenMachine?.name ?? null

  const { data: projecten } = useQuery({
    queryKey: ['projects', 'terminal'],
    queryFn: async () => { await initProjects(); return projectsApi.list() },
    refetchInterval: 10_000,
  })

  /**
   * De wachtrij van deze machine: openstaande stappen uit lopende productie,
   * op volgorde van de planning. Dezelfde bron als de wachtrijpagina op kantoor,
   * zodat hal en kantoor nooit een andere volgorde tonen.
   */
  const alleStappen = useMemo(() => {
    const rijen: {
      stapId: string; orderId: string; projectId: string
      artikel: string; klant: string; qty: number; eenheid: string
      artikelId: string | null
      /** De machine waarop deze stap gepland stond. Null = nog niet toegewezen. */
      geplandOp: string | null
      volgorde: number; totaalStappen: number; positie: number
      routing: { naam: string; gereed: boolean }[]
    }[] = []
    for (const p of projecten ?? []) {
      for (const o of p.productieOrders ?? []) {
        const stappen = o.stappen ?? []
        stappen.forEach((s, i) => {
          if (s.gereedOp) return
          rijen.push({
            stapId: s.id, orderId: o.id, projectId: p.id,
            artikel: o.artikelNaam, klant: p.naam,
            qty: o.qty, eenheid: o.eenheid,
            artikelId: o.artikelId ?? null,
            geplandOp: s.geplandMachine ?? s.machine ?? null,
            volgorde: i + 1, totaalStappen: stappen.length,
            routing: stappen.map((st) => ({ naam: st.naam, gereed: !!st.gereedOp })),
            positie: s.queuePosition ?? Number.MAX_SAFE_INTEGER,
          })
        })
      }
    }
    return rijen.sort((a, b) => a.positie - b.positie)
  }, [projecten])

  // Alle machinenamen, om te zien of de tekst op een stap er wel één benoemt.
  // Zie utils/terminal-wachtrij.ts: een tekst die geen machine benoemt (de
  // bewerkingsnaam van de offerteregel, bijvoorbeeld) kan ook geen machine
  // uitsluiten, en zulk werk hoort dus op elke terminal zichtbaar te zijn.
  const machineNamen = useMemo(
    () => (machinesResp?.data ?? []).map((m) => m.name),
    [machinesResp],
  )

  const voorDezeMachine = useMemo(
    () => alleStappen.filter((r) => hoortBijMachine(r.geplandOp, eigenMachineNaam, machineNamen)),
    [alleStappen, eigenMachineNaam, machineNamen],
  )

  // Hangt het scherm nergens aan, dan tonen we alles: een leeg scherm terwijl er
  // werk ligt is erger dan een lijst die te lang is.
  const wachtrij = (alleMachines || !eigenMachineNaam ? alleStappen : voorDezeMachine).slice(0, 20)

  const actieveStap = gekozenStap ?? wachtrij[0]?.stapId ?? null

  // Een openstaande bevestiging hoort bij één stap. Springt de keuze naar een
  // andere klus, dan zou 'ja, gereed' de verkeerde stap afmelden.
  useEffect(() => { setBevestigGereed(false) }, [actieveStap])
  const registratie = (lopend.data ?? []).find((r) => r.stapId === actieveStap) ?? null
  const seconden = useKlok(registratie)
  const teLang = !!registratie && seconden > TE_LANG_SECONDEN
  const huidig = wachtrij.find((w) => w.stapId === actieveStap)

  // Tekening en zaagbon bij de actieve stap. De terminal mag deze twee lezen
  // (middleware/terminal-scope.ts): het is werkvloerinformatie, geen prijs.
  const { data: artikel } = useQuery({
    queryKey: ['article', huidig?.artikelId],
    queryFn: () => articlesApi.get(huidig!.artikelId!),
    enabled: !!huidig?.artikelId,
  })
  const { data: reserveringen } = useQuery({
    queryKey: ['reservations', 'terminal'],
    queryFn: reservationsApi.list,
    refetchInterval: 30_000,
  })
  const zaagbon = (reserveringen ?? []).find(
    (r) => r.artikelId && r.artikelId === huidig?.artikelId && r.status !== 'geannuleerd',
  )

  // De tekening: eerst een echte afbeelding uit de bijlagen, anders het
  // tekeningpad van het artikel zelf.
  const tekening = (() => {
    const bijlage = (artikel?.attachments ?? []).find(
      (a) => a.path && /\.(png|jpe?g|webp|gif)$/i.test(a.name),
    )
    if (bijlage?.path) return { url: bijlage.path, naam: bijlage.name }
    if (artikel?.drawingPath) return { url: artikel.drawingPath, naam: artikel.tekening ?? 'tekening' }
    return null
  })()

  function start(soort: TijdSoort, bemand: boolean) {
    if (!actieveStap) return
    acties.start.mutate({
      stapId: actieveStap, soort, bemand,
      operatorId: bemand ? operatorId : null,
      // De machine waar het werk werkelijk gebeurt, niet waar het gepland stond.
      // Draait de DMG een klus van de Doosan, dan hoort die tijd tegen het
      // DMG-tarief in de nacalculatie — anders rekent hij met een uurtarief van
      // een machine die niets gedaan heeft.
      machineNaam: eigenMachineNaam,
    }, {
      onSuccess: () => melding(
        'green', `Klok loopt — ${soort}`,
        `${huidig?.artikel ?? ''} op ${eigenMachineNaam ?? 'deze machine'}`,
      ),
    })
  }

  /**
   * De stap gereedmelden.
   *
   * Eén verzoek, want de server rondt in dezelfde transactie de nog lopende
   * klok af (zie routes/projects.ts). Twee losse verzoeken konden halverwege
   * stranden en lieten dan een stap achter die klaar is met een klok die
   * doortelt — en de nacalculatie loopt dan op ná het werk.
   *
   * Bewust awaited en niet optimistisch: de operator loopt weg zodra het
   * scherm klaar zegt, en een stap die daarna toch niet is afgemeld staat
   * morgen nog in de wachtrij.
   */
  const gereed = useMutation({
    mutationFn: (w: {
      projectId: string; orderId: string; stapId: string; qty: number; liepEenKlok: boolean
    }) =>
      projectsApi.meldStapGereed(w.projectId, w.orderId, w.stapId, operator?.name ?? 'Operator', w.qty),
    onSuccess: (_d, w) => {
      setBevestigGereed(false)
      // De afgemelde stap valt uit de wachtrij; de keuze moet mee, anders
      // blijft het middenvak op een stap staan die er niet meer is.
      setGekozenStap((huidige) => (huidige === w.stapId ? null : huidige))
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tijdregistratie'] })
      qc.invalidateQueries({ queryKey: ['nacalculatie'] })
      melding('green', 'Stap gereedgemeld', w.liepEenKlok
        ? 'De klok is afgerond en de stap is uit de wachtrij.'
        : 'De stap is uit de wachtrij. Er is geen tijd geboekt.')
    },
    onError: (e) => melding(
      'red', 'Gereedmelden mislukt',
      `${e instanceof Error ? e.message : 'Onbekende fout'} — de stap staat nog open.`,
    ),
  })

  // Wie staat er? Zolang dat niet gekozen is kan er geen bemand werk starten —
  // anders komen de manuren op het machine-account terecht en is achteraf niet
  // te zien wie er stond.
  if (!operator) {
    return (
      <div className="tr-term">
        <div className="tr-term-top">
          <div className="tr-term-merk">B</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>
            {machineAccount?.name ?? 'Terminal'}
          </div>
        </div>
        <div className="tr-term-midden">
          <div className="st-page-title" style={{ marginBottom: 4 }}>Wie staat er aan de machine?</div>
          <div className="st-page-sub" style={{ marginBottom: 18 }}>
            Nodig om bemande uren op de juiste naam te zetten. Onbemand draaien kan zonder.
          </div>
          <div className="tr-wie-grid">
            {operators.map((u) => (
              <button key={u.id} className="tr-wie-knop" onClick={() => setOperatorId(u.id)}>
                {u.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tr-term">
      <div className="tr-term-top">
        <div className="tr-term-merk">B</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>
          {/* De gekoppelde machine, niet de accountnaam: die bepaalt op welk
              uurtarief de uren geboekt worden, en de twee kunnen uiteenlopen. */}
          {eigenMachineNaam ?? machineAccount?.name ?? 'Terminal'}
        </div>
        <div className="st-sep-v" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 16, color: 'var(--text-2)' }}>
          <IconUser size={19} stroke={1.8} />{operator.name}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="cell-mono" style={{ fontSize: 20, color: 'var(--text-2)' }}>
            {new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button className="tr-tbtn" style={{ height: 44, fontSize: 14, padding: '0 16px' }}
            onClick={() => setOperatorId(null)}>
            wissel gebruiker
          </button>
        </div>
      </div>

      <div className="tr-term-body">
        <div className="tr-term-wachtrij">
          <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="st-sb-group-lbl">Wachtrij</span>
            <span className="st-badge">{wachtrij.length}</span>
          </div>

          {/* Planning verandert op het laatste moment. Standaard de eigen
              wachtrij, één tik om alles te zien — anders staat de machine stil
              terwijl er werk ligt dat hier prima kan. */}
          {eigenMachineNaam ? (
            <div style={{ padding: '0 14px 12px' }}>
              <div className="tr-seg" style={{ width: '100%' }}>
                <button
                  style={{ flex: 1, height: 40, fontSize: 14 }}
                  className={!alleMachines ? 'is-actief' : ''}
                  onClick={() => setAlleMachines(false)}
                >
                  {eigenMachineNaam} ({voorDezeMachine.length})
                </button>
                <button
                  style={{ flex: 1, height: 40, fontSize: 14 }}
                  className={alleMachines ? 'is-actief' : ''}
                  onClick={() => setAlleMachines(true)}
                >
                  alle ({alleStappen.length})
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 14px 12px' }}>
              <div className="tr-telang">
                <IconAlertTriangle size={14} stroke={2} />
                <span>
                  Dit scherm hangt nog aan geen machine. Alle openstaande stappen
                  worden getoond. Koppel hem op kantoor bij Instellingen &rarr; Gebruikers.
                </span>
              </div>
            </div>
          )}
          <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {wachtrij.length === 0 && (
              alleStappen.length > 0 ? (
                // Nooit "niks te doen" zeggen terwijl er werk ligt: dan zet de
                // operator het scherm uit. Zeg wát er ligt en waar het staat.
                <div className="tr-telang">
                  <IconAlertTriangle size={14} stroke={2} />
                  <span>
                    Niets gepland op {eigenMachineNaam}. Er {alleStappen.length === 1 ? 'staat' : 'staan'} wel{' '}
                    {alleStappen.length} {alleStappen.length === 1 ? 'stap' : 'stappen'} open op andere
                    machines — tik op <strong>alle</strong> hierboven.
                  </span>
                </div>
              ) : (
                <div className="st-empty">Geen openstaand werk.</div>
              )
            )}
            {wachtrij.map((w, i) => {
              const actief = w.stapId === actieveStap
              const loopt = (lopend.data ?? []).some((r) => r.stapId === w.stapId)
              return (
                <button
                  key={w.stapId}
                  className={`tr-tcard${actief ? ' is-actief' : ''}`}
                  onClick={() => setGekozenStap(w.stapId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {loopt && <span className="tr-dot" />}
                    <span className="tr-tcard-m">
                      {loopt ? 'nu bezig' : i === 0 ? 'Volgende' : 'Daarna'}
                    </span>
                    <span className="cell-mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)' }}>
                      {w.orderId}
                    </span>
                  </div>
                  <div className="tr-tcard-d">{w.artikel}</div>
                  <div className="tr-tcard-k">{w.klant}</div>
                  <div className="tr-tcard-q">
                    {w.qty} {w.eenheid} · stap {w.volgorde} van {w.totaalStappen}
                  </div>
                  {/* Waar staat deze stap gepland? Op een andere machine is dat
                      een waarschuwing — dan boek je werk om. Benoemt de tekst
                      geen bekende machine, dan is de stap niet aan een machine
                      toegewezen; dat is geen fout maar moet wel te zien zijn,
                      anders lijkt het werk van deze machine te zijn. */}
                  <StapMachineBadge
                    stapMachine={w.geplandOp}
                    eigenMachineNaam={eigenMachineNaam}
                    machineNamen={machineNamen}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className="tr-term-midden">
          {!huidig ? (
            <div className="st-empty">Kies een klus uit de wachtrij.</div>
          ) : (
            <>
              <span className="st-sb-group-lbl">Actieve stap</span>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>{huidig.artikel}</div>
                <div style={{ fontSize: 15, color: 'var(--text-2)', marginTop: 5 }}>
                  {huidig.klant} · {huidig.orderId} · stap {huidig.volgorde} van {huidig.totaalStappen} · {huidig.qty} {huidig.eenheid}
                </div>
              </div>

              {eigenMachineNaam
                && bepaalToewijzing(huidig.geplandOp, eigenMachineNaam, machineNamen).soort === 'andere' && (
                <div className="tr-telang" style={{ marginTop: 14 }}>
                  <IconAlertTriangle size={16} stroke={2} />
                  <span>
                    Deze stap stond gepland op <strong>{huidig.geplandOp}</strong>. Je klokt hem
                    op <strong>{eigenMachineNaam}</strong>; de uren gaan tegen het tarief van
                    deze machine, want daar wordt het werk gedaan.
                  </span>
                </div>
              )}

              <div style={{
                marginTop: 22, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-2)', padding: '22px 24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {registratie && <span className="tr-dot" style={{ width: 12, height: 12 }} />}
                  <span className="tr-groot is-xl">{secondenNaarKlok(seconden)}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {registratie ? (
                    <>
                      <span className="st-badge info">{registratie.soort}</span>
                      <span className="st-badge">
                        {registratie.bemand
                          ? <><IconUser size={12} stroke={1.8} /> {registratie.userNaam}</>
                          : <><IconMoon size={12} stroke={1.8} /> onbemand</>}
                      </span>
                      {registratie.status === 'gepauzeerd' && <span className="st-badge warn">op pauze</span>}
                    </>
                  ) : (
                    <span className="cell-muted">Nog geen klok op deze stap.</span>
                  )}
                </div>
              </div>

              {teLang && (
                <div className="tr-telang" style={{ marginTop: 12 }}>
                  <IconAlertTriangle size={16} stroke={2} />
                  <span>
                    Deze klok loopt al {secondenNaarUren(seconden)}. Is hij blijven staan?
                    Rond hem af; op kantoor kan de tijd bijgesteld worden.
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                {!registratie ? (
                  <>
                    <button className="tr-tbtn is-primair" disabled={acties.start.isPending}
                      onClick={() => start('instellen', true)}>
                      start instellen
                    </button>
                    <button className="tr-tbtn" disabled={acties.start.isPending}
                      onClick={() => start('draaien', true)}>
                      start draaien
                    </button>
                  </>
                ) : (
                  <>
                    {registratie.status === 'gepauzeerd' ? (
                      <button className="tr-tbtn" onClick={() => acties.hervat.mutate(registratie.id, {
                        onSuccess: () => melding('green', 'Klok loopt weer', 'De tijd telt door.'),
                      })}>
                        <IconPlayerPlay size={22} stroke={1.8} /> hervat
                      </button>
                    ) : (
                      <button className="tr-tbtn" onClick={() => acties.pauze.mutate(registratie.id, {
                        onSuccess: (r) => melding(
                          'green', 'Klok op pauze',
                          `${secondenNaarKlok(r.seconden)} geteld. De stap blijft open.`,
                        ),
                      })}>
                        <IconPlayerPause size={22} stroke={1.8} /> pauze
                      </button>
                    )}
                    <button
                      className="tr-tbtn"
                      onClick={() => acties.wissel.mutate({
                        id: registratie.id,
                        naar: { soort: registratie.soort === 'instellen' ? 'draaien' : 'instellen', operatorId: operator.id },
                      }, {
                        onSuccess: (r) => melding(
                          'green', `Nu ${r.soort}`,
                          'De vorige regel is afgerond; instellen en draaien tellen apart.',
                        ),
                      })}
                    >
                      <IconArrowRight size={22} stroke={1.8} />
                      nu {registratie.soort === 'instellen' ? 'draaien' : 'instellen'}
                    </button>
                  </>
                )}
              </div>

              {registratie && (
                <button
                  className="tr-tbtn" style={{ marginTop: 12 }}
                  onClick={() => acties.wissel.mutate({
                    id: registratie.id,
                    naar: { bemand: !registratie.bemand, operatorId: registratie.bemand ? null : operator.id },
                  }, {
                    onSuccess: (r) => melding(
                      'green', r.bemand ? 'Weer bemand' : 'Loopt onbemand door',
                      r.bemand
                        ? `De uren komen weer op naam van ${r.userNaam ?? operator.name}.`
                        : 'De machine telt door, er worden geen manuren geboekt.',
                    ),
                  })}
                >
                  <IconMoon size={22} stroke={1.8} />
                  {registratie.bemand ? 'onbemand laten lopen' : 'weer bemand'}
                </button>
              )}

              {/* Routing: waar zit deze stap in het geheel. Zonder dit weet de
                  operator niet of er na hem nog iets gebeurt. */}
              {huidig.routing.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <span className="st-sb-group-lbl">Routing</span>
                  <div className="tr-route">
                    {huidig.routing.map((st, i) => {
                      const nu = i + 1 === huidig.volgorde
                      return (
                        <div key={i} className={`tr-route-rij${nu ? ' is-nu' : ''}`}>
                          <span className={`tr-route-bol${st.gereed ? ' is-klaar' : nu ? ' is-nu' : ''}`}>
                            {st.gereed && <IconCheck size={11} stroke={3} />}
                          </span>
                          <span style={{ flex: 1 }}>{i + 1} · {st.naam}</span>
                          {nu && registratie && <span style={{ color: 'var(--accent)', fontSize: 14 }}>bezig</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Materiaal: welke staaf en welke lengte. Komt uit de
                  materiaalselectie bij het aanmaken van de opdracht. */}
              {zaagbon && (
                <div style={{ marginTop: 20 }}>
                  <span className="st-sb-group-lbl">Materiaal</span>
                  <div className="tr-mat">
                    <div>
                      <div className="tr-mat-groot">{zaagbon.materiaal} &Oslash;{zaagbon.diameter}</div>
                      <div className="tr-mat-sub">{zaagbon.barLocation}</div>
                    </div>
                    <div className="tr-mat-sep" />
                    <div>
                      <div className="tr-mat-groot cell-mono">{zaagbon.pieces} &times; {Math.round(zaagbon.productLen)} mm</div>
                      <div className="tr-mat-sub">
                        uit staaf {zaagbon.barCode}
                        {zaagbon.restLengteMm != null && <> · {Math.round(zaagbon.restLengteMm)} mm rest</>}
                      </div>
                    </div>
                    <span className={`st-badge ${zaagbon.status === 'done' ? 'ok' : ''}`} style={{ marginLeft: 'auto', fontSize: 14, padding: '6px 13px' }}>
                      {zaagbon.status === 'done' ? 'gezaagd' : 'nog niet gezaagd'}
                    </span>
                  </div>
                </div>
              )}

              {/* Gereedmelden. Niet alleen de klok stoppen: een stap die klaar
                  is hoort uit de wachtrij te verdwijnen, en de volgende bewerking
                  moet zichtbaar worden voor de machine erna. Zonder dit bleef de
                  stap na 'stap klaar' gewoon staan en leek de knop niets te doen
                  (gemeld 2026-09-14).

                  Ook zonder lopende klok te gebruiken: wie vergeet te klokken
                  moet het werk alsnog kunnen afmelden — anders blijft de order
                  eeuwig open en klopt de planning niet meer. */}
              {!bevestigGereed ? (
                <button
                  className="tr-tbtn is-primair is-klaar"
                  disabled={gereed.isPending}
                  onClick={() => setBevestigGereed(true)}
                >
                  <IconCheck size={28} stroke={2.2} /> stap klaar
                </button>
              ) : (
                <div className="tr-bevestig">
                  <div className="tr-bevestig-t">
                    Stap {huidig.volgorde} · {huidig.routing[huidig.volgorde - 1]?.naam ?? ''} gereedmelden?
                  </div>
                  <div className="tr-bevestig-s">
                    {registratie
                      ? `De lopende klok (${secondenNaarKlok(seconden)}) wordt afgerond op ${huidig.qty} ${huidig.eenheid}.`
                      : 'Er loopt geen klok op deze stap; er wordt geen tijd geboekt.'}
                    {' '}Terugzetten kan alleen op kantoor.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                    <button className="tr-tbtn" onClick={() => setBevestigGereed(false)}>
                      <IconX size={22} stroke={1.8} /> terug
                    </button>
                    <button
                      className="tr-tbtn is-primair"
                      disabled={gereed.isPending}
                      onClick={() => gereed.mutate({
                        projectId: huidig.projectId, orderId: huidig.orderId,
                        stapId: huidig.stapId, qty: huidig.qty, liepEenKlok: !!registratie,
                      })}
                    >
                      <IconCheck size={22} stroke={2.2} />
                      {gereed.isPending ? 'bezig…' : 'ja, gereed'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Derde kolom: de tekening bij de actieve stap. */}
        <div className="tr-term-tekening">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="st-sb-group-lbl">Tekening</span>
            <span className="cell-mono" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {artikel?.tekening ?? '—'}{artikel?.rev ? ` rev ${artikel.rev}` : ''}
            </span>
          </div>
          <div className="tr-term-doek">
            {tekening
              ? <img src={tekening.url} alt={tekening.naam} />
              : <span className="cell-muted" style={{ fontSize: 15 }}>Geen tekening bij dit artikel.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
