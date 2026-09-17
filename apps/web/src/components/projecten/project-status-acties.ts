import type { Project } from '@stockmanager/shared'

// Wat het rechtermuismenu op een projectrij onder "Status wijzigen" mag doen.
//
// De status van een project is in deze app geen vrij veld: hij is het gevólg
// van een document (zie de noot onderaan `api/projects.ts`). Vooruit betekent
// dus altijd dat er iets gemaakt of gekozen moet worden — welke offerte je
// verstuurt, welke je accepteert — en dat kan het menu niet voor je raden.
// Vooruit opent daarom de juiste tab op het project; terug gaat wél direct,
// want daar bestaat per stap een `revert`-call mét servergarde.
//
// Eén stap tegelijk terug. Twee stappen ineens zou twee reverts achter elkaar
// afvuren die elk documenten weggooien, terwijl de tweede op een garde kan
// stuklopen — dan sta je halverwege zonder dat iemand dat gevraagd heeft.

export type ProjectTab = 'offertes' | 'opdrachtbevestiging' | 'productie' | 'paklijst' | 'factuur'

/** Welke `projectsApi.revert*`-call hoort bij een stap terug vanaf deze status. */
export type RevertKey = 'bevestigd' | 'productie' | 'paklijst' | 'verzonden' | 'gefactureerd'

export type StatusActie =
  | { soort: 'huidig' }
  | { soort: 'vooruit'; tab: ProjectTab }
  | { soort: 'terug'; revert: RevertKey; waarschuwing: string }
  | { soort: 'geblokkeerd'; reden: string }

export interface StatusItem {
  status: Project['status']
  label: string
  actie: StatusActie
}

/** De zeven fases in volgorde; `tab` is waar je vooruit naartoe navigeert. */
const LEVENSCYCLUS: { status: Project['status']; label: string; tab: ProjectTab | null }[] = [
  { status: 'concept',      label: 'Concept',      tab: null        },
  { status: 'offerte',      label: 'Offerte',      tab: 'offertes'  },
  { status: 'bevestigd',    label: 'Opdracht',     tab: 'offertes'  },
  { status: 'productie',    label: 'In productie', tab: 'productie' },
  { status: 'paklijst',     label: 'Pakbon',       tab: 'paklijst'  },
  { status: 'verzonden',    label: 'Verzonden',    tab: 'paklijst'  },
  { status: 'gefactureerd', label: 'Factuur',      tab: 'factuur'   },
]

// Projecten komen uit een ongevalideerde JSON.parse van localStorage, dus een
// oude rij kan de arrays missen — net als in projectColumns.ts eerst guarden.
const offertesVan = (p: Project) => (Array.isArray(p.offertes) ? p.offertes : [])
const ordersVan   = (p: Project) => (Array.isArray(p.productieOrders) ? p.productieOrders : [])

/**
 * Waar één stap terug uitkomt, als index in LEVENSCYCLUS. `null` als er vanaf
 * deze status geen weg terug is.
 *
 * Vanaf `bevestigd` hangt dat af van de offertes: `revertBevestigd` zet het
 * project op `offerte` als er ooit één verzonden is, en anders op `concept`.
 */
function terugDoelIdx(p: Project): number | null {
  switch (p.status) {
    case 'bevestigd':    return offertesVan(p).some(o => o.verzondenOp) ? 1 : 0
    case 'productie':    return 2
    case 'paklijst':     return 3
    case 'verzonden':    return 4
    case 'gefactureerd': return 5
    default:             return null
  }
}

/** De garde per stap terug — dezelfde die de server afdwingt. */
function terugActie(p: Project): StatusActie {
  switch (p.status) {
    case 'bevestigd':
      return ordersVan(p).some(o => (o.stappen ?? []).some(s => s.gereedOp))
        ? { soort: 'geblokkeerd', reden: 'Stappen zijn al afgevinkt' }
        : { soort: 'terug', revert: 'bevestigd', waarschuwing: 'De opdrachtbevestiging en de productieorders vervallen.' }
    case 'productie':
      return ordersVan(p).some(o => o.status === 'gereed')
        ? { soort: 'geblokkeerd', reden: 'Orders zijn al gereedgemeld' }
        : { soort: 'terug', revert: 'productie', waarschuwing: 'Afgevinkte stappen worden teruggezet.' }
    case 'paklijst':
      return p.paklijst?.verzondenOp
        ? { soort: 'geblokkeerd', reden: 'Paklijst is al verzonden' }
        : { soort: 'terug', revert: 'paklijst', waarschuwing: 'De paklijst vervalt.' }
    case 'verzonden':
      return { soort: 'terug', revert: 'verzonden', waarschuwing: 'De paklijst komt terug op niet-verzonden.' }
    case 'gefactureerd':
      return { soort: 'terug', revert: 'gefactureerd', waarschuwing: 'De factuur vervalt.' }
    default:
      return { soort: 'geblokkeerd', reden: 'Hier is geen weg terug' }
  }
}

function bepaalActie(p: Project, huidigIdx: number, idx: number): StatusActie {
  // on_hold en geannuleerd staan buiten de rij (index -1): eerst hervatten,
  // anders zou de status van vóór het stilleggen stil overschreven worden.
  if (huidigIdx < 0) return { soort: 'geblokkeerd', reden: 'Project staat stil — eerst hervatten' }
  if (idx === huidigIdx) return { soort: 'huidig' }

  if (idx > huidigIdx) {
    const tab = LEVENSCYCLUS[idx].tab
    return tab ? { soort: 'vooruit', tab } : { soort: 'geblokkeerd', reden: 'Niet vooruit te zetten' }
  }

  const doel = terugDoelIdx(p)
  if (doel === null) {
    return {
      soort: 'geblokkeerd',
      reden: p.status === 'offerte'
        ? 'Een verzonden offerte kan niet terug naar concept'
        : 'Hier is geen weg terug',
    }
  }
  if (idx !== doel) return { soort: 'geblokkeerd', reden: `Eerst terug naar ${LEVENSCYCLUS[doel].label}` }
  return terugActie(p)
}

/** De zeven statusregels voor dit project, in levenscyclusvolgorde. */
export function statusActies(p: Project): StatusItem[] {
  const huidigIdx = LEVENSCYCLUS.findIndex(s => s.status === p.status)
  return LEVENSCYCLUS.map((stap, idx) => ({
    status: stap.status,
    label: stap.label,
    actie: bepaalActie(p, huidigIdx, idx),
  }))
}

export const isStilgezet = (p: Project) => p.status === 'on_hold' || p.status === 'geannuleerd'
