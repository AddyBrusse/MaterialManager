import { IconAlertTriangle, IconClockExclamation, IconPackage, IconFileInvoice, IconCash } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { SignaalId } from './signalen'

export interface TegelTellingen {
  geenReactie: number
  overLevertijd: number
  teLeveren: { projecten: number; stuks: number }
  teFactureren: { projecten: number; bedrag: number }
  openstaand: { projecten: number; bedrag: number; vervallen: number }
}

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

interface Props {
  t: TegelTellingen
  nabelDagen: number
  actief: (id: SignaalId) => boolean
  onWissel: (id: SignaalId) => void
}

/**
 * De vijf tegels boven het projectenoverzicht (2026-10-05). Een klik zet het
 * filter in de filterbalk, nog een klik haalt het weg. De tellingen volgen de
 * andere filters: kies je een klant, dan zijn het de cijfers van die klant.
 */
export function ProjectTegels({ t, nabelDagen, actief, onWissel }: Props) {
  return (
    <div className="st-stats prj-tegels">
      <Tegel
        id="geenReactie" actief={actief} onWissel={onWissel} toon={t.geenReactie > 0 ? 'warn' : undefined}
        icoon={<IconAlertTriangle size={13} />} label="Geen reactie op offerte" waarde={String(t.geenReactie)}
        voet={`langer dan ${nabelDagen} ${nabelDagen === 1 ? 'dag' : 'dagen'} uit — nabellen`}
      />
      <Tegel
        id="overLevertijd" actief={actief} onWissel={onWissel} toon={t.overLevertijd > 0 ? 'dgr' : undefined}
        icoon={<IconClockExclamation size={13} />} label="Over levertijd" waarde={String(t.overLevertijd)}
        voet="levertijd voorbij, nog niet alles geleverd"
      />
      <Tegel
        id="teLeveren" actief={actief} onWissel={onWissel}
        icoon={<IconPackage size={13} />} label="Te leveren" waarde={String(t.teLeveren.projecten)}
        voet={t.teLeveren.stuks > 0 ? `${t.teLeveren.stuks} stuks klaar, nog geen pakbon` : 'niets klaar om te leveren'}
      />
      <Tegel
        id="teFactureren" actief={actief} onWissel={onWissel}
        icoon={<IconFileInvoice size={13} />} label="Te factureren" waarde={eur(t.teFactureren.bedrag)}
        voet={`${t.teFactureren.projecten} ${t.teFactureren.projecten === 1 ? 'project' : 'projecten'} · excl. btw`}
      />
      <Tegel
        id="openstaand" actief={actief} onWissel={onWissel} toon={t.openstaand.vervallen > 0 ? 'dgr' : undefined}
        icoon={<IconCash size={13} />} label="Openstaand" waarde={eur(t.openstaand.bedrag)}
        voet={
          t.openstaand.vervallen > 0 ? (
            <span style={{ color: 'var(--danger)', fontWeight: 500 }}>{t.openstaand.vervallen} vervallen</span>
          ) : (
            `${t.openstaand.projecten} ${t.openstaand.projecten === 1 ? 'project' : 'projecten'} · incl. btw`
          )
        }
      />
    </div>
  )
}

function Tegel(props: {
  id: SignaalId
  actief: (id: SignaalId) => boolean
  onWissel: (id: SignaalId) => void
  toon?: 'warn' | 'dgr'
  icoon: ReactNode
  label: string
  waarde: string
  voet: ReactNode
}) {
  const aan = props.actief(props.id)
  return (
    <button
      type="button"
      className={`st-stat prj-tegel${aan ? ' aan' : ''}${props.toon ? ` ${props.toon}` : ''}`}
      aria-pressed={aan}
      title={aan ? 'Filter weghalen' : 'Alleen deze projecten tonen'}
      onClick={() => props.onWissel(props.id)}
    >
      <div className="st-stat-lbl">{props.icoon}{props.label}</div>
      <div className="st-stat-val">{props.waarde}</div>
      <div className="st-stat-foot"><span>{props.voet}</span></div>
    </button>
  )
}
