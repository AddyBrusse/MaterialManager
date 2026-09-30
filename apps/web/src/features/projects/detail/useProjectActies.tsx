import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import type { OpdrachtWijziging, Project } from '@stockmanager/shared'
import {
  volgendeVersie,
  waaromNietVersturen, waaromNietAccepteren, waaromNietWijzigen,
  waaromNietVerwijderen, waaromNietIntrekken, waaromNietVersturenOB,
  waaromNietVrijgeven, waaromNietTerugNaarVoorbereiding,
} from '@stockmanager/shared'
import { projectsApi, wachtOpOpslag } from '../../../api/projects'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import type { Bijwerking } from '../../../components/projecten/prijs-bijwerken'
import { useUserStore } from '../../../stores/user'
import { InvoerModal } from './components/InvoerModal'
import { AccepteerVenster } from './components/AccepteerVenster'
import { BevestigModal } from './components/BevestigModal'
import type { Stap } from './lib/tab-actie'
import type { NaarProjectKeuze } from './tabs/NaarProjectModal'
import { ApiFout } from '../../../api/client'

/**
 * Alles wat dit scherm schrijft, op één plek.
 *
 * De tabs en de footer tekenen; hier gebeurt het. Zo staat elke melding en elke
 * cache-invalidatie één keer, en is in één oogopslag te zien wat de pagina
 * werkelijk kan veranderen aan een project.
 *
 * `projectsApi` schrijft synchroon in zijn eigen cache en stuurt het verzoek op
 * de achtergrond; mislukt dat, dan meldt de wrapper dat zelf. Wij hoeven alleen
 * de query te invalideren zodat het scherm de nieuwe cache leest.
 */

type Vraag = {
  titel: string
  uitleg: string
  label: string
  soort: 'tekst' | 'aantal'
  max?: number
  eenheid?: string
  start?: string
  knop: string
  klaar: (waarde: string) => void
}

export interface ProjectActies {
  /** Het dialoogje dat openstaat, of niets. Rendert de pagina onderaan. */
  dialoog: ReactNode
  /** De queries opnieuw laten lezen, voor onderdelen die zelf schrijven. */
  ververs: () => void
  voerUit: (stap: Stap) => void
  terugNaarVoorbereiding: (orderId: string) => void
  onHold: () => void
  annuleer: () => void
  terug: () => void
  nieuweOfferteVersie: () => void
  kopieerOfferte: (offerteId: string) => void
  zetReferentie: (offerteId: string, ref: string) => void
  verzendOfferte: (offerteId: string) => void
  accepteerOfferte: (offerteId: string) => void
  maakOpdracht: () => void
  /** De opdracht aanpassen; `false` als het mislukte (de melding is dan al getoond). */
  wijzigOpdracht: (w: OpdrachtWijziging) => Promise<boolean>
  /** Een concept voor een directe opdracht, zonder offerte. */
  maakDirecteOpdracht: () => void
  /** Vastleggen dat de opdrachtbevestiging verstuurd is — na "Ja, verstuurd". */
  verzendOB: (naar: string | null) => void
  /** Opdrachtreferentie, opmerking of levertijd op de opdrachtbevestiging. */
  zetOB: (patch: { notities?: string; opdrachtRef?: string | null; levertijdDatum?: string | null }) => void
  stapCheck: (orderId: string, stapId: string, gereed: boolean) => void
  meldStuksGereed: (orderId: string) => void
  maakPaklijst: () => void
  verzendPaklijst: (paklijstId: string) => void
  maakFactuur: () => void
  verzendFactuur: (factuurId: string) => void
  crediteer: (factuurId: string) => void
  bewerkRegel: (
    offerteId: string,
    regelId: string,
    patch: { qty?: number; verkoopprijs?: number },
  ) => void
  verwijderRegel: (offerteId: string, regelId: string) => void
  werkPrijzenBij: (offerteId: string, gekozen: Bijwerking[]) => void
  verwijderOfferte: (offerteId: string) => void
  trekOfferteIn: (offerteId: string) => void
  /** `false` als het mislukte; de melding is dan al getoond. */
  naarNieuwProject: (offerteId: string, keuze: NaarProjectKeuze) => Promise<boolean>
}

export function useProjectActies(
  project: Project | undefined,
  naarTab: (t: string) => void,
): ProjectActies {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const gebruiker = useUserStore((s) => s.user)
  const [vraag, setVraag] = useState<Vraag | null>(null)
  // Vrijgeven met waarschuwingen: eerst de zinnen, dan pas doen (principe 2026-09-28).
  const [vrijMetVraag, setVrijMetVraag] = useState<{ orderIds: string[]; waarschuwingen: string[] } | null>(null)
  const [teAccepteren, setTeAccepteren] = useState<string | null>(null)

  const ververs = useCallback(() => {
    if (!project) return
    qc.invalidateQueries({ queryKey: ['projects', project.id] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['nacalculatie', 'project', project.id] })
  }, [qc, project])

  /**
   * Voert uit, ververst, en meldt het resultaat — pas als de server het
   * bevestigd heeft. De groene melding verscheen eerder op het moment van
   * klikken, en dan stond er "v7 gemaakt" terwijl de server er nog niets van
   * wist; ging het daarna mis, dan stonden groen en rood onder elkaar.
   *
   * Twee soorten fout, elk met een melding volgens de afspraak (wat, waar,
   * gevolg — zie CLAUDE.md):
   *  - in de browser, vóór er iets verstuurd is (fn gooit): hier gemeld;
   *  - op de server: gemeld door syncProject, dat ook het scherm terugzet.
   */
  const doe = useCallback(
    (actie: string, gelukt: string, fn: () => void): boolean => {
      if (!project) return false
      try {
        fn()
      } catch (fout) {
        meldFout({
          actie,
          fout,
          gevolg: 'Er is niets gewijzigd — niet op de server en niet op je scherm.',
        })
        return false
      }
      ververs()
      wachtOpOpslag(project.id).then((ok) => {
        // Ook bij een fout opnieuw lezen: syncProject heeft het scherm dan
        // teruggezet naar de server, en dat moet ook zichtbaar worden.
        ververs()
        if (ok) notifications.show({ color: 'green', message: gelukt })
      })
      return true
    },
    [project, ververs],
  )

  const leeg: ProjectActies = {
    dialoog: null,
    ververs,
    voerUit: () => {},
    terugNaarVoorbereiding: () => {},
    onHold: () => {},
    annuleer: () => {},
    terug: () => {},
    nieuweOfferteVersie: () => {},
    kopieerOfferte: () => {},
    zetReferentie: () => {},
    verzendOfferte: () => {},
    accepteerOfferte: () => {},
    maakOpdracht: () => {},
    wijzigOpdracht: async () => false,
    maakDirecteOpdracht: () => {},
    verzendOB: () => {},
    zetOB: () => {},
    stapCheck: () => {},
    meldStuksGereed: () => {},
    maakPaklijst: () => {},
    verzendPaklijst: () => {},
    maakFactuur: () => {},
    verzendFactuur: () => {},
    crediteer: () => {},
    bewerkRegel: () => {},
    verwijderRegel: () => {},
    werkPrijzenBij: () => {},
    verwijderOfferte: () => {},
    trekOfferteIn: () => {},
    naarNieuwProject: async () => false,
  }
  if (!project) return leeg

  const id = project.id
  const naam = gebruiker?.name ?? 'onbekend'
  /** "v2" zoals in de tabel — het interne id zegt de gebruiker niets. */
  const versieVan = (offerteId: string) => {
    const o = project.offertes.find((x) => x.id === offerteId)
    return o ? `v${o.versie}` : offerteId
  }

  const stop = (status: 'on_hold' | 'geannuleerd') =>
    setVraag({
      titel: status === 'on_hold' ? 'Project on hold zetten' : 'Project annuleren',
      uitleg:
        'De reden komt op de meldingsbalk te staan en blijft bewaard, ook na hervatten. ' +
        'Zonder uitleg levert een stilliggend project over een maand alleen vragen op.',
      label: 'Reden',
      soort: 'tekst',
      knop: status === 'on_hold' ? 'On hold zetten' : 'Annuleren',
      klaar: (reden) => {
        setVraag(null)
        doe(
          status === 'on_hold' ? 'Project on hold zetten' : 'Project annuleren',
          status === 'on_hold' ? 'Project staat on hold' : 'Project geannuleerd',
          () =>
          projectsApi.stopProject(id, status, reden),
        )
      },
    })

  const meldStuksGereed = (orderId: string) => {
    const order = project.productieOrders.find((o) => o.id === orderId)
    if (!order) return
    setVraag({
      titel: `Gereedmelden — ${order.artikelNaam}`,
      uitleg:
        'Hoeveel stuks zijn er klaar? Dat aantal bepaalt wat er op de volgende pakbon kan. ' +
        'Je kunt het later ophogen als er meer af komt.',
      label: `Aantal gereed (${order.id})`,
      soort: 'aantal',
      max: order.qty,
      eenheid: order.eenheid,
      start: String(order.aantalGereed ?? 0),
      knop: 'Gereedmelden',
      klaar: (w) => {
        setVraag(null)
        const aantal = Number(w.replace(',', '.'))
        doe(`Gereedmelden op ${order.id}`, `${aantal} ${order.eenheid} gereedgemeld op ${order.id}`, () =>
          projectsApi.markOrderGereed(id, orderId, aantal),
        )
      },
    })
  }

  const terug = () => {
    const naar: Record<string, (() => void) | undefined> = {
      offerte: () => projectsApi.revertBevestigd(id),
      bevestigd: () => projectsApi.revertBevestigd(id),
      productie: () => projectsApi.revertProductie(id),
      paklijst: () => projectsApi.revertPaklijst(id),
      verzonden: () => projectsApi.revertVerzonden(id),
      gefactureerd: () => projectsApi.revertGefactureerd(id),
    }
    const fn = naar[project.status]
    if (!fn) return
    doe('Fase terugdraaien', 'Eén fase teruggedraaid', fn)
  }

  /**
   * Wat de blauwe knop in de footer doet. Welke stap het is, beslist
   * `tabActie` (lib/tab-actie.ts) — hier alleen het uitvoeren, zodat label en
   * handeling niet uit elkaar kunnen lopen. Opdracht versturen doet de pagina
   * zelf: dat loopt via de mail in Outlook (useObDocument).
   */
  const voerUit = (stap: Stap) => {
    switch (stap.soort) {
      case 'naar':
        return naarTab(stap.tab)
      case 'offerte-maken':
        return doe('Nieuwe offerte aanmaken', 'Nieuwe offerte aangemaakt', () => projectsApi.addOfferte(id))
      case 'offerte-versturen': {
        const o = project.offertes.find((x) => x.id === stap.offerteId)
        return doe(`Offerte v${o?.versie ?? '?'} versturen`, `Offerte v${o?.versie ?? '?'} verstuurd`, () => {
          eis(waaromNietVersturen(o))
          projectsApi.verzendOfferte(id, stap.offerteId)
        })
      }
      case 'offerte-accepteren':
        return accepteer(stap.offerteId)
      case 'opdracht-versturen':
        return
      case 'paklijst-maken': {
        const gelukt = doe('Paklijst aanmaken', 'Paklijst aangemaakt van wat klaarligt', () => projectsApi.createPaklijst(id))
        if (gelukt) naarTab('documenten')
        return
      }
      case 'paklijst-versturen':
        return doe(`${stap.paklijstId} versturen`, `${stap.paklijstId} verzonden`, () =>
          projectsApi.verzendPaklijst(id, stap.paklijstId),
        )
      case 'factuur-maken':
        return doe('Factuur aanmaken', 'Factuur aangemaakt over het geleverde', () => projectsApi.createFactuur(id))
      case 'factuur-versturen':
        return doe(`${stap.factuurId} versturen`, `${stap.factuurId} verstuurd`, () =>
          projectsApi.verzendFactuur(id, stap.factuurId),
        )
      case 'hervatten':
        return doe('Project hervatten', 'Project hervat', () => projectsApi.hervatProject(id))
      case 'vrijgeven':
        if (stap.waarschuwingen.length > 0) return setVrijMetVraag(stap)
        return vrijgevenNu(stap.orderIds)
    }
  }

  const vrijgevenNu = (orderIds: string[]) => {
    setVrijMetVraag(null)
    const n = orderIds.length
    doe(
      `${n} ${n === 1 ? 'order' : 'orders'} in productie geven`,
      `${n} ${n === 1 ? 'order' : 'orders'} vrijgegeven — nu in de wachtrij, de planning en op de terminal`,
      () => {
        eis(waaromNietVrijgeven(project, orderIds))
        projectsApi.vrijgeven(id, orderIds)
      },
    )
  }

  // Eerst het venster met de opdrachtreferentie; de handeling zelf gebeurt
  // bij bevestigen (`accepteerNu`). De voorwaarde wordt vóór het openen al
  // gecontroleerd, zodat er geen venster verschijnt voor iets wat niet kan.
  function accepteer(offerteId: string) {
    if (!project) return
    const o = project.offertes.find((x) => x.id === offerteId)
    const reden = waaromNietAccepteren(o, project.offertes)
    if (reden) {
      doe(`Offerte ${versieVan(offerteId)} accepteren`, '', () => eis(reden))
      return
    }
    setTeAccepteren(offerteId)
  }

  const accepteerNu = (offerteId: string, opdrachtRef: string | null) => {
    const o = project.offertes.find((x) => x.id === offerteId)
    setTeAccepteren(null)
    // Na accepteren is de opdracht het werk, dus daar naartoe — ook vanaf de
    // knop in de versielijst. Meteen, niet pas na de server: het scherm toont
    // de opdracht al, en mislukt het, dan zet syncProject hem terug en meldt
    // het (2026-09-30).
    const gelukt = doe(
      o?.direct ? 'Opdracht maken' : `Offerte ${versieVan(offerteId)} accepteren`,
      o?.direct
        ? 'Opdracht gemaakt — productieorders en materiaal-todo\'s staan klaar'
        : `Offerte ${versieVan(offerteId)} geaccepteerd — opdracht en productieorders aangemaakt`,
      () => {
        eis(waaromNietAccepteren(o, project.offertes))
        projectsApi.accepteerOfferte(id, offerteId, naam, opdrachtRef)
      },
    )
    if (gelukt) naarTab('opdracht')
  }
  const accOfferte = teAccepteren ? project.offertes.find((x) => x.id === teAccepteren) : undefined

  return {
    dialoog: vrijMetVraag ? (
      <BevestigModal
        titel={`${vrijMetVraag.orderIds.length} ${vrijMetVraag.orderIds.length === 1 ? 'order' : 'orders'} in productie geven?`}
        knop="Toch vrijgeven"
        onSluit={() => setVrijMetVraag(null)}
        onBevestig={() => vrijgevenNu(vrijMetVraag.orderIds)}
      >
        {vrijMetVraag.waarschuwingen.map((w) => (
          <p key={w}>{w}</p>
        ))}
        <p>Vrijgegeven orders staan meteen in de wachtrij, de planning en op de terminal.</p>
      </BevestigModal>
    ) : accOfferte ? (
      <AccepteerVenster
        offerte={accOfferte}
        start={project.klantRef ?? ''}
        onAccepteer={(ref) => accepteerNu(accOfferte.id, ref)}
        onSluit={() => setTeAccepteren(null)}
      />
    ) : vraag ? (
      <InvoerModal
        titel={vraag.titel}
        uitleg={vraag.uitleg}
        label={vraag.label}
        soort={vraag.soort}
        max={vraag.max}
        eenheid={vraag.eenheid}
        start={vraag.start}
        knop={vraag.knop}
        onBevestig={vraag.klaar}
        onSluit={() => setVraag(null)}
      />
    ) : null,
    ververs,
    voerUit,
    terugNaarVoorbereiding: (orderId) =>
      doe(`${orderId} terug naar voorbereiding`, `${orderId} staat weer in voorbereiding — uit de wachtrij en de planning`, () => {
        eis(waaromNietTerugNaarVoorbereiding(project, [orderId]))
        projectsApi.terugNaarVoorbereiding(id, [orderId])
      }),
    onHold: () => stop('on_hold'),
    annuleer: () => stop('geannuleerd'),
    terug,
    nieuweOfferteVersie: () =>
      doe('Nieuwe offerteversie aanmaken', 'Nieuwe offerteversie aangemaakt', () => projectsApi.addOfferte(id)),
    // Stil, net als een regel bewerken: een groene melding bij elk ingevuld
    // veld is ruis. Fout gaat wel de deur uit — dat meldt syncProject zelf.
    zetReferentie: (offerteId, ref) => {
      projectsApi.updateOfferte(id, offerteId, { externeRef: ref })
      ververs()
    },
    kopieerOfferte: (offerteId) => {
      const bron = project.offertes.find((o) => o.id === offerteId)
      doe(
        `v${bron?.versie ?? '?'} kopiëren`,
        `v${volgendeVersie(project.offertes)} gemaakt op basis van v${bron?.versie ?? '?'}`,
        () => projectsApi.addOfferte(id, offerteId),
      )
    },
    // Eerst de voorwaarde uit `offerte-voorwaarden`, dezelfde die de server
    // controleert: zo verschijnt er niets op het scherm dat daarna weer terug
    // moet, en staat er in de melding wát er eerst moet gebeuren.
    verzendOfferte: (offerteId) => {
      const o = project.offertes.find((x) => x.id === offerteId)
      doe(`Offerte ${versieVan(offerteId)} versturen`, `Offerte ${versieVan(offerteId)} verstuurd`, () => {
        eis(waaromNietVersturen(o))
        projectsApi.verzendOfferte(id, offerteId)
      })
    },
    accepteerOfferte: accepteer,
    maakOpdracht: () => naarTab('offertes'),
    // Niet via `doe`: de server rekent uit wat er met de productieorders
    // gebeurt, dus hier wachten we op zijn antwoord in plaats van het scherm
    // vooruit te laten lopen.
    wijzigOpdracht: async (w) => {
      const regel = w.soort === 'erbij' ? null : project.opdrachtbevestiging?.regels.find((r) => r.id === w.regelId)
      const actie =
        w.soort === 'erbij' ? 'Regel toevoegen aan de opdracht'
        : w.soort === 'weg' ? `"${regel?.naam ?? ''}" van de opdracht halen`
        : w.soort === 'aantal' ? `Aantal van "${regel?.naam ?? ''}" wijzigen`
        : `Prijs van "${regel?.naam ?? ''}" wijzigen`
      try {
        await projectsApi.wijzigOpdracht(id, w)
        ververs()
        qc.invalidateQueries({ queryKey: ['todos'] })
        if (w.soort === 'erbij' || w.soort === 'weg') {
          notifications.show({ color: 'green', message: w.soort === 'erbij' ? 'Toegevoegd aan de opdracht, met productieorder' : 'Van de opdracht gehaald' })
        }
        return true
      } catch (fout) {
        ververs()
        meldFout({
          actie,
          fout,
          gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
            ? 'Onbekend of de wijziging is opgeslagen: de server antwoordde niet op tijd. Ververs de pagina voor je het opnieuw doet.'
            : 'Er is niets gewijzigd aan de opdracht of de productieorders.',
        })
        return false
      }
    },
    maakDirecteOpdracht: () =>
      doe('Directe opdracht beginnen', 'Directe opdracht begonnen — voeg de bestelde artikelen toe', () => {
        const al = project.offertes.find((o) => o.direct && o.status === 'concept')
        if (al) return
        projectsApi.addOfferte(id, undefined, { direct: true })
      }),
    verzendOB: (naar) =>
      doe(
        `Opdrachtbevestiging ${project.opdrachtbevestiging?.id ?? ''} versturen`,
        'Opdrachtbevestiging vastgelegd als verstuurd',
        () => {
          eis(waaromNietVersturenOB(project))
          projectsApi.verzendOB(id, naar, naam)
        },
      ),
    // Stil, zoals de referentie van een offerte: een groene melding per
    // ingevuld veld is ruis. Een fout meldt syncProject zelf.
    zetOB: (patch) => {
      try {
        projectsApi.updateOB(id, patch)
        ververs()
      } catch (fout) {
        meldFout({
          actie: 'Opdrachtbevestiging bijwerken',
          fout,
          gevolg: 'Er is niets gewijzigd — niet op de server en niet op je scherm.',
        })
      }
    },
    stapCheck: (orderId, stapId, gereed) =>
      doe(
        gereed ? 'Stap gereedmelden' : 'Gereedmelding intrekken',
        gereed ? 'Stap gereedgemeld' : 'Gereedmelding ingetrokken',
        () =>
        gereed
          ? projectsApi.checkOffStap(id, orderId, stapId, naam)
          : projectsApi.uncheckStap(id, orderId, stapId),
      ),
    meldStuksGereed,
    maakPaklijst: () => doe('Paklijst aanmaken', 'Paklijst aangemaakt', () => projectsApi.createPaklijst(id)),
    verzendPaklijst: (paklijstId) =>
      doe(`${paklijstId} versturen`, `${paklijstId} verzonden`, () => projectsApi.verzendPaklijst(id, paklijstId)),
    maakFactuur: () => doe('Factuur aanmaken', 'Factuur aangemaakt', () => projectsApi.createFactuur(id)),
    verzendFactuur: (factuurId) =>
      doe(`${factuurId} versturen`, `${factuurId} verstuurd`, () => projectsApi.verzendFactuur(id, factuurId)),
    crediteer: (factuurId) =>
      doe(`Creditnota op ${factuurId} maken`, `Creditnota op ${factuurId} aangemaakt`, () => projectsApi.createCredit(id, factuurId)),
    // Regels aanpassen gebeurt cel voor cel. Daar hoort geen groene melding bij:
    // die zou bij het invullen van een offerte om de paar seconden verschijnen.
    // Fout gaat wel de deur uit, want dan staat er iets anders op het scherm dan
    // in de database.
    bewerkRegel: (offerteId, regelId, patch) => {
      try {
        eis(waaromNietWijzigen(project.offertes.find((x) => x.id === offerteId)))
        projectsApi.updateOfferteRegel(id, offerteId, regelId, patch)
        ververs()
      } catch (fout) {
        meldFout({
          actie: `Regel in ${versieVan(offerteId)} bijwerken`,
          fout,
          gevolg: 'Er is niets gewijzigd — niet op de server en niet op je scherm.',
        })
      }
    },
    verwijderRegel: (offerteId, regelId) =>
      doe(`Regel uit ${versieVan(offerteId)} verwijderen`, 'Regel verwijderd', () => {
        eis(waaromNietWijzigen(project.offertes.find((x) => x.id === offerteId)))
        projectsApi.removeOfferteRegel(id, offerteId, regelId)
      }),
    verwijderOfferte: (offerteId) => {
      const label = versieVan(offerteId)
      doe(`Offerte ${label} verwijderen`, `Offerte ${label} verwijderd`, () => {
        eis(waaromNietVerwijderen(project.offertes.find((x) => x.id === offerteId)))
        projectsApi.verwijderOfferte(id, offerteId)
      })
    },
    trekOfferteIn: (offerteId) => {
      const label = versieVan(offerteId)
      doe(`Offerte ${label} intrekken`, `Offerte ${label} ingetrokken — hij staat nu als vervallen`, () => {
        eis(waaromNietIntrekken(project.offertes.find((x) => x.id === offerteId)))
        projectsApi.trekOfferteIn(id, offerteId)
      })
    },
    // Niet via `doe`: dit wacht wél op de server, want het nieuwe projectnummer
    // komt daarvandaan en pas dan valt er iets te openen.
    naarNieuwProject: async (offerteId, keuze) => {
      const label = versieVan(offerteId)
      try {
        const nieuw = await projectsApi.naarNieuwProject(id, offerteId, keuze)
        qc.invalidateQueries({ queryKey: ['projects'] })
        notifications.show({
          color: 'green',
          autoClose: 8000,
          title: `${nieuw.id} aangemaakt op basis van ${label}`,
          message: 'De prijzen komen uit het bronproject. Controleer ze met "Prijzen bijwerken" '
            + 'als de calculatie sindsdien veranderd is.',
        })
        navigate(`/projecten/${nieuw.id}?tab=offertes`)
        return true
      } catch (fout) {
        meldFout({
          actie: `Offerte ${label} naar nieuw project kopiëren`,
          fout,
          gevolg: fout instanceof ApiFout && fout.code === 'TIMEOUT'
            ? 'Onbekend of het project is aangemaakt: de server antwoordde niet op tijd. '
              + 'Kijk in de projectlijst voor je het opnieuw probeert, anders staat het er twee keer.'
            : 'Er is geen nieuw project aangemaakt. Dit project is niet veranderd.',
        })
        return false
      }
    },
    // `bewerkingen` gaat mee met de prijs en niet los: ze komen uit dezelfde
    // calculatie, en de productiestappen worden er straks uit gemaakt. Alleen de
    // prijs verversen zou een regel opleveren met het bedrag van het nieuwe
    // recept en de stappen van het oude.
    werkPrijzenBij: (offerteId, gekozen) =>
      doe(
        'Prijzen bijwerken',
        `${gekozen.length} regel${gekozen.length === 1 ? '' : 's'} bijgewerkt uit de calculaties`,
        () => {
          eis(waaromNietWijzigen(project.offertes.find((x) => x.id === offerteId)))
          for (const b of gekozen) {
            projectsApi.updateOfferteRegel(id, offerteId, b.regelId, {
              verkoopprijs: b.nieuweVerkoopprijs,
              bewerkingen: b.nieuweBewerkingen,
            })
          }
        },
      ),
  }
}
