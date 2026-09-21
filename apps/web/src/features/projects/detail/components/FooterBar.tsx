import { useState } from 'react'
import { IconArrowBackUp, IconLock, IconInfoCircle } from '@tabler/icons-react'
import type { ActieVM, TerugVM } from '../types'
import { RollbackPopover } from './RollbackPopover'

interface Props {
  primair: ActieVM
  terug: TerugVM | null
  onPrimair: () => void
}

/**
 * De footerbalk (§3.5).
 *
 * De reden waarom de primaire actie niet kan staat er altijd naast, vóór het
 * klikken — nooit pas in een melding achteraf. Dat is het hele idee van deze
 * balk: je ziet wat de volgende stap is én waarom hij nog niet kan.
 */
export function FooterBar({ primair, terug, onPrimair }: Props) {
  const [open, setOpen] = useState(false)
  const dicht = (terug?.blokkades.length ?? 0) > 0

  return (
    <footer className="pdv2-foot">
      <span className="pdv2-foot-lbl">Volgende stap</span>

      {terug && (
        <span className="pdv2-anchor">
          <button type="button" className="pdv2-btn s ghost" onClick={() => setOpen((v) => !v)}>
            <IconArrowBackUp size={13} />
            {terug.label}
            {dicht && <IconLock size={12} style={{ color: 'var(--text3)' }} />}
          </button>
          {open && <RollbackPopover terug={terug} onSluit={() => setOpen(false)} />}
        </span>
      )}

      <span className="pdv2-spacer" />

      {primair.reden && (
        <span className={`pdv2-reden ${primair.kan ? '' : 'blok'}`}>
          <IconInfoCircle size={13} className="ico" />
          {primair.reden}
        </span>
      )}

      <button
        type="button"
        className="pdv2-btn primair"
        disabled={!primair.kan}
        onClick={onPrimair}
      >
        {primair.label}
      </button>
    </footer>
  )
}
