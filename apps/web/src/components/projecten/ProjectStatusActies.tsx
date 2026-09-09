import { useState } from 'react'
import { IconPlayerPause, IconPlayerPlay, IconBan } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import type { Project } from '@stockmanager/shared'
import { projectsApi } from '../../api/projects'

// On hold zetten, annuleren en weer hervatten (punt 4 uit
// features/61-orderproces-backlog.md). Een reden is verplicht: een project dat
// stilligt zonder uitleg levert over een maand alleen maar vragen op.
//
// Er wordt niets weggegooid — offertes, opdrachtbevestiging en productieorders
// blijven staan, inclusief afgevinkte stappen. Het project verdwijnt alleen uit
// de machinewachtrij en de prognose, en komt daar terug bij hervatten.
const LABEL: Record<'on_hold' | 'geannuleerd', string> = {
  on_hold: 'On hold zetten',
  geannuleerd: 'Annuleren',
}

export function ProjectStatusActies({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [kiezen, setKiezen] = useState<'on_hold' | 'geannuleerd' | null>(null)
  const [reden, setReden] = useState('')
  const stilgezet = project.status === 'on_hold' || project.status === 'geannuleerd'

  function stop() {
    if (!kiezen || !reden.trim()) return
    projectsApi.stopProject(project.id, kiezen, reden.trim())
    notifications.show({ color: 'orange', message: LABEL[kiezen] })
    setKiezen(null)
    setReden('')
    onChanged()
  }

  if (stilgezet) {
    return (
      <button
        className="st-btn sm ghost"
        title={`Terug naar ${project.statusVorige ?? 'concept'}`}
        onClick={() => {
          projectsApi.hervatProject(project.id)
          notifications.show({ color: 'green', message: 'Project hervat' })
          onChanged()
        }}
      >
        <IconPlayerPlay size={13} />Hervatten
      </button>
    )
  }

  if (kiezen) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="st-input sm"
          autoFocus
          placeholder={kiezen === 'on_hold' ? 'Waarom ligt het stil?' : 'Waarom afgeblazen?'}
          value={reden}
          onChange={e => setReden(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') stop(); if (e.key === 'Escape') setKiezen(null) }}
          style={{ width: 230 }}
        />
        <button className="st-btn sm ghost" onClick={() => { setKiezen(null); setReden('') }}>Annuleer</button>
        <button className="st-btn sm danger" disabled={!reden.trim()} onClick={stop}>
          {LABEL[kiezen]}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className="st-btn sm ghost" title="Project tijdelijk stilleggen" onClick={() => setKiezen('on_hold')}>
        <IconPlayerPause size={13} />On hold
      </button>
      <button className="st-btn sm ghost" title="Project afblazen" onClick={() => setKiezen('geannuleerd')}>
        <IconBan size={13} />Annuleren
      </button>
    </div>
  )
}
