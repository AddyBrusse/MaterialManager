import { IconChevronDown, IconChevronUp, IconDots, IconPrinter } from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'
import type { FacetVM, SlotVM } from '../types'
import { HeaderFacets } from './HeaderFacets'
import { statusLabel } from '../lib/build-vm'

interface Props {
  project: Project
  facetten: FacetVM[]
  samenvatting: string
  slot: SlotVM
  ingeklapt: boolean
  onToggle: () => void
  geblokkeerd: boolean
  onOnHold: () => void
  onAnnuleer: () => void
  onAfdrukken: () => void
}

function statusPillKleur(s: Project['status']): string {
  if (s === 'gefactureerd') return 'ok'
  if (s === 'on_hold') return 'warn'
  if (s === 'geannuleerd') return 'dgr'
  if (s === 'productie') return 'accent'
  return ''
}

/**
 * De objectkop (§3.1): nummer, naam, status, slot-/opslagstand, zijspoorknoppen
 * en de zes facetten. Ingeklapt verdwijnt de facettenrij en komt er één
 * samenvattende regel achter de statuspill — dat wint ± 65 px voor de inhoud.
 */
export function ObjectHeader(props: Props) {
  const { project: p, slot, ingeklapt, geblokkeerd } = props

  return (
    <header className="pdv2-head">
      <div className="pdv2-head-row1">
        <span className="pdv2-nr">{p.id}</span>
        <span className="pdv2-title">{p.naam}</span>
        <span className={`pdv2-pill ${statusPillKleur(p.status)}`}>{statusLabel(p.status)}</span>
        {ingeklapt && <span className="pdv2-samenvatting">{props.samenvatting}</span>}

        <span className="pdv2-spacer" />

        <span className="pdv2-slot">
          <i className={`pdv2-dot ${slot.vreemd ? 'warn' : 'ok'}`} />
          {slot.houder && <span>{slot.houder}</span>}
          <span className="pdv2-sep">|</span>
          <span className={`pdv2-opslag ${slot.opslag === 'mislukt' ? 'mislukt' : ''}`}>
            {slot.opslagTekst}
          </span>
        </span>

        <button
          type="button"
          className="pdv2-btn s"
          onClick={p.status === 'on_hold' ? props.onAnnuleer : props.onOnHold}
          disabled={p.status === 'geannuleerd'}
        >
          {p.status === 'on_hold' ? 'Annuleren' : 'On hold zetten'}
        </button>
        <button type="button" className="pdv2-btn s" onClick={props.onAfdrukken}>
          <IconPrinter size={13} /> Afdrukken
        </button>
        <button type="button" className="pdv2-btn s" aria-label="Meer acties" disabled={geblokkeerd}>
          <IconDots size={13} />
        </button>
      </div>

      {!ingeklapt && <HeaderFacets facetten={props.facetten} />}

      <button
        type="button"
        className="pdv2-collapse"
        onClick={props.onToggle}
        aria-label="Kop in- of uitklappen"
      >
        {ingeklapt ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
      </button>
    </header>
  )
}
