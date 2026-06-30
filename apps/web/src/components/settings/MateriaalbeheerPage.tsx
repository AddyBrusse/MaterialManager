import { useState } from 'react'
import { GradesTab }          from './GradesTab'
import { ProfilesTab }        from './ProfilesTab'
import { LocationsTab }       from './LocationsTab'
import { SurfaceFinishesTab } from './SurfaceFinishesTab'

type SubTab = 'locaties' | 'kwaliteiten' | 'profielen' | 'afwerkingen'

export function MateriaalbeheerPage() {
  const [tab, setTab] = useState<SubTab>('locaties')

  return (
    <>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['locaties', 'kwaliteiten', 'profielen', 'afwerkingen'] as SubTab[]).map(t => (
          <button
            key={t}
            className={`st-tab-btn${tab === t ? ' active' : ''}`}
            style={t === 'locaties' ? { paddingLeft: 4 } : undefined}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'locaties'    && <LocationsTab />}
      {tab === 'kwaliteiten' && <GradesTab />}
      {tab === 'profielen'   && <ProfilesTab />}
      {tab === 'afwerkingen' && <SurfaceFinishesTab />}
    </>
  )
}
