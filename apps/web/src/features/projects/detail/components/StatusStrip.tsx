import { IconAlertTriangle } from '@tabler/icons-react'
import type { Project } from '@stockmanager/shared'
import { datum } from '../lib/format'
import { statusLabel } from '../lib/build-vm'

/**
 * De meldingsbalk (§3.2), alleen zichtbaar bij on hold of geannuleerd.
 *
 * Bewust géén knop in deze balk: hervatten is een stap op de route en hoort
 * dus bij de primaire actie in de footer, niet hier.
 */
export function StatusStrip({ project }: { project: Project }) {
  if (project.status !== 'on_hold' && project.status !== 'geannuleerd') return null

  const isHold = project.status === 'on_hold'
  const terug = statusLabel(project.statusVorige ?? 'concept')

  return (
    <div className={`pdv2-strip ${isHold ? '' : 'dgr'}`}>
      <IconAlertTriangle size={14} style={{ color: isHold ? 'var(--warn)' : 'var(--dgr)' }} />
      <b>
        {isHold ? 'On hold' : 'Geannuleerd'} sinds {datum(project.updatedAt)} — {isHold ? 'hervatten' : 'heropenen'} zet
        het project terug op {terug}.
      </b>
      {project.statusReden && <span>{project.statusReden}</span>}
    </div>
  )
}
