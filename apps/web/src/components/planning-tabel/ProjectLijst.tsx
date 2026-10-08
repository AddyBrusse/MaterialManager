import { IconWand } from '@tabler/icons-react'

export interface ProjectRij { id: string; naam: string; klant: string; open: number; nietIngepland: number }

export interface ProjectZoek { klant: string; project: string; stap: string }

interface Props {
  projecten: ProjectRij[]
  zoek: ProjectZoek
  onZoek: (z: ProjectZoek) => void
  gekozen: string | null
  onKies: (id: string | null) => void
  onInplannen: (id: string) => void
}

/**
 * Links van de tabel (2026-10-08): één kolom projecten. Een project kiezen laat
 * in de tabel alleen zijn stappen zien. "Inplannen" maakt een voorstel voor
 * wat er van dat project nog niet ingepland is.
 */
export function ProjectLijst({ projecten, zoek, onZoek, gekozen, onKies, onInplannen }: Props) {
  const gekozenRij = projecten.find((p) => p.id === gekozen)
  return (
    <div className="pt-box pt-proj">
      <div className="f">
        <input placeholder="Klant…" aria-label="Zoek op klant" value={zoek.klant} onChange={(e) => onZoek({ ...zoek, klant: e.currentTarget.value })} />
        <input placeholder="Project…" aria-label="Zoek op project" value={zoek.project} onChange={(e) => onZoek({ ...zoek, project: e.currentTarget.value })} />
        <input placeholder="Stap / bewerking…" aria-label="Zoek op stap" value={zoek.stap} onChange={(e) => onZoek({ ...zoek, stap: e.currentTarget.value })} />
      </div>
      <div className="lijst">
        <button type="button" className="r" data-sel={gekozen == null} onClick={() => onKies(null)}>
          <b>Alle projecten</b>
          <div className="k"><span>{projecten.length} projecten</span><span>{projecten.reduce((s, p) => s + p.open, 0)}</span></div>
        </button>
        {projecten.map((p) => (
          <button key={p.id} type="button" className="r" data-sel={gekozen === p.id} onClick={() => onKies(gekozen === p.id ? null : p.id)} title={p.naam}>
            <b>{p.id}</b>
            <div className="k"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.klant}</span><span>{p.open}{p.nietIngepland ? ` · ${p.nietIngepland} los` : ''}</span></div>
          </button>
        ))}
        {projecten.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Geen projecten met open stappen.</div>}
      </div>
      {gekozenRij && (
        <button type="button" className="st-btn sm primary plan" onClick={() => onInplannen(gekozenRij.id)}
          title={gekozenRij.nietIngepland ? 'Een voorstel om de losse stappen van dit project in te plannen' : 'Alles van dit project is al ingepland'}>
          <IconWand size={13} /> Inplannen{gekozenRij.nietIngepland ? ` (${gekozenRij.nietIngepland})` : ''}
        </button>
      )}
    </div>
  )
}
