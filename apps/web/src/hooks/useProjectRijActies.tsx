import { useState } from 'react'
import { Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import type { Project } from '@stockmanager/shared'
import { projectsApi } from '../api/projects'
import type { RevertKey, StatusItem } from '../components/projecten/project-status-acties'

// De acties achter het rijmenu op de projectenlijst. Ze zitten in een hook en
// niet in de pagina, omdat het knoppenmenu (⋯) en het rechtermuismenu exact
// hetzelfde moeten doen — twee kopieën lopen na de eerste wijziging uiteen.

const REVERT_FN: Record<RevertKey, (id: string) => void> = {
  bevestigd:    id => { projectsApi.revertBevestigd(id) },
  productie:    id => { projectsApi.revertProductie(id) },
  paklijst:     id => { projectsApi.revertPaklijst(id) },
  verzonden:    id => { projectsApi.revertVerzonden(id) },
  gefactureerd: id => { projectsApi.revertGefactureerd(id) },
}

const STOP_LABEL: Record<'on_hold' | 'geannuleerd', string> = {
  on_hold: 'On hold zetten',
  geannuleerd: 'Annuleren',
}

export interface ProjectRijActies {
  openen: (p: Project) => void
  status: (p: Project, item: StatusItem) => void
  stilleggen: (p: Project, status: 'on_hold' | 'geannuleerd') => void
  hervatten: (p: Project) => void
  verwijderen: (p: Project) => void
}

export function useProjectRijActies(onChanged: () => void): {
  acties: ProjectRijActies
  stopModal: React.ReactNode
} {
  const navigate = useNavigate()
  const [stop, setStop] = useState<{ project: Project; status: 'on_hold' | 'geannuleerd' } | null>(null)
  const [reden, setReden] = useState('')

  const acties: ProjectRijActies = {
    openen: p => navigate(`/projecten/${p.id}`),

    // Vooruit navigeert naar de tab waar het document gemaakt wordt; terug
    // draait één stap terug en gooit daarbij documenten weg, dus eerst vragen.
    status: (p, item) => {
      const a = item.actie
      if (a.soort === 'vooruit') { navigate(`/projecten/${p.id}?tab=${a.tab}`); return }
      if (a.soort !== 'terug') return
      if (!window.confirm(`Project ${p.id} terugzetten naar ${item.label}?\n\n${a.waarschuwing}`)) return
      REVERT_FN[a.revert](p.id)
      notifications.show({ color: 'orange', message: `${p.id} terug naar ${item.label}` })
      onChanged()
    },

    // Een reden is verplicht, net als op de detailpagina: een project dat
    // stilligt zonder uitleg levert over een maand alleen maar vragen op.
    stilleggen: (p, status) => { setReden(''); setStop({ project: p, status }) },

    hervatten: p => {
      projectsApi.hervatProject(p.id)
      notifications.show({ color: 'green', message: `${p.id} hervat` })
      onChanged()
    },

    verwijderen: p => {
      if (!window.confirm(`Project ${p.id} (${p.naam}) verwijderen?`)) return
      projectsApi.remove(p.id)
      notifications.show({ color: 'orange', message: `Project ${p.id} verwijderd` })
      onChanged()
    },
  }

  function bevestigStop() {
    if (!stop || !reden.trim()) return
    projectsApi.stopProject(stop.project.id, stop.status, reden.trim())
    notifications.show({ color: 'orange', message: STOP_LABEL[stop.status] })
    setStop(null)
    setReden('')
    onChanged()
  }

  const stopModal = (
    <Modal
      opened={!!stop}
      onClose={() => setStop(null)}
      size="sm"
      title={stop ? `${STOP_LABEL[stop.status]} · ${stop.project.id}` : ''}
    >
      <input
        className="st-input sm"
        autoFocus
        placeholder={stop?.status === 'on_hold' ? 'Waarom ligt het stil?' : 'Waarom afgeblazen?'}
        value={reden}
        onChange={e => setReden(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') bevestigStop() }}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="st-btn sm ghost" onClick={() => setStop(null)}>Annuleer</button>
        <button className="st-btn sm danger" disabled={!reden.trim()} onClick={bevestigStop}>
          {stop ? STOP_LABEL[stop.status] : ''}
        </button>
      </div>
    </Modal>
  )

  return { acties, stopModal }
}
