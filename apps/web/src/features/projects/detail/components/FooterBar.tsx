import { useState } from 'react'
import { IconArrowBackUp, IconArrowRight, IconLock, IconInfoCircle } from '@tabler/icons-react'
import type { ActieVM, TerugVM } from '../types'
import { RollbackPopover } from './RollbackPopover'

interface Props {
  /** `null` op een tab zonder eigen document: dan alleen terugdraaien. */
  primair: ActieVM | null
  terug: TerugVM | null
  onPrimair: () => void
  onTerug: () => void
}

/**
 * De footerbalk (§3.5).
 *
 * De reden waarom de primaire actie niet kan staat er altijd naast, vóór het
 * klikken — nooit pas in een melding achteraf. Dat is het hele idee van deze
 * balk: je ziet wat de volgende stap is én waarom hij nog niet kan.
 *
 * "Volgende stap" staat direct vóór de blauwe knop en leest ermee als één zin
 * ("Volgende stap → Offerte accepteren"); terugdraaien staat los links. Het
 * label stond eerst links vóór het terugdraaien, en hoorde daar niet bij.
 */
export function FooterBar({ primair, terug, onPrimair, onTerug }: Props) {
  const [open, setOpen] = useState(false)
  const dicht = (terug?.blokkades.length ?? 0) > 0

  return (
    <footer className="pdv2-foot">
      {terug && (
        <span className="pdv2-anchor">
          <button type="button" className="pdv2-btn s ghost" onClick={() => setOpen((v) => !v)}>
            <IconArrowBackUp size={13} />
            {terug.label}
            {dicht && <IconLock size={12} style={{ color: 'var(--text3)' }} />}
          </button>
          {open && (
            <RollbackPopover
              terug={terug}
              onSluit={() => setOpen(false)}
              onTerug={onTerug}
            />
          )}
        </span>
      )}

      <span className="pdv2-spacer" />

      {primair?.reden && (
        <span className={`pdv2-reden ${primair.kan ? '' : 'blok'}`}>
          <IconInfoCircle size={13} className="ico" />
          {primair.reden}
        </span>
      )}

      {primair && (
        <span className="pdv2-foot-stap">
          <span className="pdv2-foot-lbl">
            Volgende stap
            <IconArrowRight size={12} />
          </span>
          <button
            type="button"
            className="pdv2-btn primair"
            disabled={!primair.kan}
            onClick={onPrimair}
          >
            {primair.label}
          </button>
        </span>
      )}
    </footer>
  )
}
