import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import type { Project } from '@stockmanager/shared'
import { laatsteFactuur, laatstePaklijst, volgendeVersie } from '@stockmanager/shared'
import { projectsApi } from '../../../api/projects'
import type { Bijwerking } from '../../../components/projecten/prijs-bijwerken'
import { useUserStore } from '../../../stores/user'
import { InvoerModal } from './components/InvoerModal'

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
  primair: () => void
  onHold: () => void
  annuleer: () => void
  terug: () => void
  nieuweOfferteVersie: () => void
  kopieerOfferte: (offerteId: string) => void
  zetReferentie: (offerteId: string, ref: string) => void
  verzendOfferte: (offerteId: string) => void
  accepteerOfferte: (offerteId: string) => void
  maakOpdracht: () => void
  verzendOB: () => void
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
}

export function useProjectActies(project: Project | undefined, naarTab: (t: string) => void): ProjectActies {
  const qc = useQueryClient()
  const gebruiker = useUserStore((s) => s.user)
  const [vraag, setVraag] = useState<Vraag | null>(null)

  const ververs = useCallback(() => {
    if (!project) return
    qc.invalidateQueries({ queryKey: ['projects', project.id] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['nacalculatie', 'project', project.id] })
  }, [qc, project])

  /** Voert uit, meldt het resultaat, en ververst. Een fout uit de API-wrapper
   *  komt als melding binnen in plaats van als lege pagina. */
  const doe = useCallback(
    (wat: string, fn: () => void) => {
      try {
        fn()
        notifications.show({ color: 'green', message: wat })
        ververs()
      } catch (e) {
        notifications.show({
          color: 'red',
          title: 'Mislukt',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [ververs],
  )

  const leeg: ProjectActies = {
    dialoog: null,
    ververs,
    primair: () => {},
    onHold: () => {},
    annuleer: () => {},
    terug: () => {},
    nieuweOfferteVersie: () => {},
    kopieerOfferte: () => {},
    zetReferentie: () => {},
    verzendOfferte: () => {},
    accepteerOfferte: () => {},
    maakOpdracht: () => {},
    verzendOB: () => {},
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
  }
  if (!project) return leeg

  const id = project.id
  const naam = gebruiker?.name ?? 'onbekend'

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
        doe(status === 'on_hold' ? 'Project staat on hold' : 'Project geannuleerd', () =>
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
        doe(`${aantal} ${order.eenheid} gereedgemeld op ${order.id}`, () =>
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
    doe('Eén fase teruggedraaid', fn)
  }

  /**
   * De primaire actie in de footer. Vooruit betekent soms een keuze die alleen
   * een mens kan maken — wélke offerte je verstuurt, wélke je accepteert. In
   * dat geval brengt deze knop je naar de tab waar die keuze staat in plaats
   * van er zelf een te verzinnen.
   */
  const primair = () => {
    switch (project.status) {
      case 'concept': {
        const concept = project.offertes.find((o) => o.status === 'concept')
        if (!concept) return doe('Nieuwe offerte aangemaakt', () => projectsApi.addOfferte(id))
        if (concept.regels.length === 0) return naarTab('offertes')
        return doe(`${concept.id} verstuurd`, () =>
          projectsApi.verzendOfferte(id, concept.id),
        )
      }
      case 'offerte':
        return naarTab('offertes')
      case 'bevestigd':
        if (!project.opdrachtbevestiging) return naarTab('offertes')
        // Welke order, welke stap, hoeveel stuks — dat kiest een mens op de
        // Productie-tab. Deze knop brengt je daarheen in plaats van er zelf
        // een order uit te pikken.
        return naarTab('productie')
      case 'productie':
        return doe('Paklijst aangemaakt van wat klaarligt', () => projectsApi.createPaklijst(id))
      case 'paklijst': {
        const pl = laatstePaklijst(project)
        if (!pl) return
        return doe(`${pl.id} verzonden`, () => projectsApi.verzendPaklijst(id, pl.id))
      }
      case 'verzonden':
        return doe('Factuur aangemaakt over het geleverde', () => projectsApi.createFactuur(id))
      case 'gefactureerd': {
        const f = laatsteFactuur(project)
        if (f && !f.verzondenOp) {
          return doe(`${f.id} verstuurd`, () => projectsApi.verzendFactuur(id, f.id))
        }
        return notifications.show({
          color: 'blue',
          message: 'Alles is gefactureerd en verstuurd — dit project is rond.',
        })
      }
      case 'on_hold':
      case 'geannuleerd':
        return doe('Project hervat', () => projectsApi.hervatProject(id))
    }
  }

  return {
    dialoog: vraag ? (
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
    primair,
    onHold: () => stop('on_hold'),
    annuleer: () => stop('geannuleerd'),
    terug,
    nieuweOfferteVersie: () =>
      doe('Nieuwe offerteversie aangemaakt', () => projectsApi.addOfferte(id)),
    // Stil, net als een regel bewerken: een groene melding bij elk ingevuld
    // veld is ruis. Fout gaat wel de deur uit — dat meldt syncProject zelf.
    zetReferentie: (offerteId, ref) => {
      projectsApi.updateOfferte(id, offerteId, { externeRef: ref })
      ververs()
    },
    kopieerOfferte: (offerteId) => {
      const bron = project.offertes.find((o) => o.id === offerteId)
      doe(
        `v${volgendeVersie(project.offertes)} gemaakt op basis van v${bron?.versie ?? '?'}`,
        () => projectsApi.addOfferte(id, offerteId),
      )
    },
    verzendOfferte: (offerteId) =>
      doe(`${offerteId} verstuurd`, () => projectsApi.verzendOfferte(id, offerteId)),
    accepteerOfferte: (offerteId) =>
      doe(`${offerteId} geaccepteerd — opdracht en productieorders aangemaakt`, () =>
        projectsApi.accepteerOfferte(id, offerteId, naam),
      ),
    maakOpdracht: () => naarTab('offertes'),
    verzendOB: () => doe('Opdrachtbevestiging verstuurd', () => projectsApi.verzendOB(id)),
    stapCheck: (orderId, stapId, gereed) =>
      doe(gereed ? 'Stap gereedgemeld' : 'Gereedmelding ingetrokken', () =>
        gereed
          ? projectsApi.checkOffStap(id, orderId, stapId, naam)
          : projectsApi.uncheckStap(id, orderId, stapId),
      ),
    meldStuksGereed,
    maakPaklijst: () => doe('Paklijst aangemaakt', () => projectsApi.createPaklijst(id)),
    verzendPaklijst: (paklijstId) =>
      doe(`${paklijstId} verzonden`, () => projectsApi.verzendPaklijst(id, paklijstId)),
    maakFactuur: () => doe('Factuur aangemaakt', () => projectsApi.createFactuur(id)),
    verzendFactuur: (factuurId) =>
      doe(`${factuurId} verstuurd`, () => projectsApi.verzendFactuur(id, factuurId)),
    crediteer: (factuurId) =>
      doe(`Creditnota op ${factuurId} aangemaakt`, () => projectsApi.createCredit(id, factuurId)),
    // Regels aanpassen gebeurt cel voor cel. Daar hoort geen groene melding bij:
    // die zou bij het invullen van een offerte om de paar seconden verschijnen.
    // Fout gaat wel de deur uit, want dan staat er iets anders op het scherm dan
    // in de database.
    bewerkRegel: (offerteId, regelId, patch) => {
      try {
        projectsApi.updateOfferteRegel(id, offerteId, regelId, patch)
        ververs()
      } catch (e) {
        notifications.show({
          color: 'red',
          title: 'Regel bijwerken mislukt',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    verwijderRegel: (offerteId, regelId) =>
      doe('Regel verwijderd', () => projectsApi.removeOfferteRegel(id, offerteId, regelId)),
    // `bewerkingen` gaat mee met de prijs en niet los: ze komen uit dezelfde
    // calculatie, en de productiestappen worden er straks uit gemaakt. Alleen de
    // prijs verversen zou een regel opleveren met het bedrag van het nieuwe
    // recept en de stappen van het oude.
    werkPrijzenBij: (offerteId, gekozen) =>
      doe(
        `${gekozen.length} regel${gekozen.length === 1 ? '' : 's'} bijgewerkt uit de calculaties`,
        () => {
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
