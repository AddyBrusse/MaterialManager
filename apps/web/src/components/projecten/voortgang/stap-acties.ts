// Van "welke stap is aan de beurt" naar "wat staat er op de knop en wat doet hij".
//
// `stapStanden` in de gedeelde kern bepaalt de toestand; hier komen de woorden
// en de handeling erbij. Apart gehouden omdat het de enige plek is waar het
// scherm iets wijzigt — de matrix zelf tekent alleen.
import { notifications } from '@mantine/notifications'
import { projectsApi } from '../../../api/projects'
import {
  stapStanden, type Project, type ProjectVoortgang, type StapStand,
} from '@stockmanager/shared'
import type { StapActies } from './ProjectMatrix'

function melden(fn: () => void, gelukt: string): () => void {
  return () => {
    try {
      fn()
      notifications.show({ color: 'green', message: gelukt })
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }
}

export function bouwStapActies(
  project: Project,
  v: ProjectVoortgang,
  opnieuw: () => void,
  naarTab: (tab: string) => void,
  alleenLezen: boolean,
  gebruiker: string,
): StapActies {
  const standen = stapStanden(project, v)
  const geaccepteerd = project.offertes.find(o => o.status === 'geaccepteerd')
  const concept = project.offertes.find(o => o.status === 'concept')
  const verzonden = project.offertes.find(o => o.status === 'verzonden')

  // Een project dat stilligt of geannuleerd is mag niet verder geduwd worden;
  // de knoppen blijven wel zichtbaar, zodat je ziet waar het bleef steken.
  const stand = (s: StapStand): StapStand => (alleenLezen && s === 'nu' ? 'rust' : s)
  const doe = (fn: () => void, bericht: string) =>
    alleenLezen ? undefined : melden(() => { fn(); opnieuw() }, bericht)

  return {
    offerte: offerteActie(),
    productie: {
      stand: stand(standen.productie),
      tekst: standen.productie === 'klaar' ? 'gemaakt' : `${v.teMaken} inplannen`,
      titel: standen.productie === 'uit' ? 'Er is nog geen opdracht om in te plannen' : undefined,
      fn: standen.productie === 'uit' ? undefined : () => naarTab('productie'),
    },
    levering: {
      stand: stand(standen.levering),
      tekst: v.klaar > 0
        ? `${v.aantalPakbonnen + 1}e pakbon · ${v.klaar} st →`
        : v.geleverd > 0 ? 'geleverd' : 'Pakbon maken',
      titel: v.klaar === 0 && v.geleverd === 0 ? 'Er ligt nog niets klaar om te leveren' : undefined,
      fn: v.klaar === 0
        ? undefined
        : doe(() => projectsApi.createPaklijst(project.id), `Pakbon met ${v.klaar} stuks aangemaakt`),
    },
    factuur: {
      stand: stand(standen.factuur),
      tekst: v.teFactureren > 0 ? 'Factureren' : v.gefactureerd > 0 ? 'gefactureerd' : 'Factureren',
      titel: v.teFactureren === 0 && v.gefactureerd === 0
        ? 'Er is nog niets geleverd om te factureren' : undefined,
      fn: v.teFactureren === 0
        ? undefined
        : doe(() => projectsApi.createFactuur(project.id), 'Factuur aangemaakt'),
    },
  }

  function offerteActie(): StapActies['offerte'] {
    if (geaccepteerd || project.opdrachtbevestiging) {
      const bron = geaccepteerd
        ?? project.offertes.find(o => o.id === project.opdrachtbevestiging?.offerteId)
      return {
        stand: 'klaar',
        tekst: bron ? `v${bron.versie} akkoord` : 'akkoord',
        fn: () => naarTab('offertes'),
      }
    }
    if (verzonden) {
      return {
        stand: stand('nu'),
        tekst: 'Akkoord — opdracht maken →',
        fn: doe(
          () => projectsApi.accepteerOfferte(project.id, verzonden.id, gebruiker),
          'Opdracht aangemaakt — prijzen vastgezet en productiestappen klaargezet',
        ),
      }
    }
    if (concept) {
      return {
        stand: stand('nu'),
        tekst: 'Offerte versturen →',
        fn: doe(() => projectsApi.verzendOfferte(project.id, concept.id), 'Offerte verstuurd'),
      }
    }
    return {
      stand: stand('nu'),
      tekst: 'Offerte maken →',
      fn: doe(() => projectsApi.addOfferte(project.id), 'Offerte aangemaakt'),
    }
  }
}
