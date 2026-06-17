import { useState } from 'react'
import { BedrijfskostenTab } from './BedrijfskostenTab'
import { OverheadTab }       from './OverheadTab'

type SubTab = 'bedrijfskosten' | 'machines'

export function OverheadPage() {
  const [tab, setTab] = useState<SubTab>('bedrijfskosten')

  return (
    <>
      {/* Inner tab bar — reuses st-tab-btn, no outer page padding */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          className={`st-tab-btn${tab === 'bedrijfskosten' ? ' active' : ''}`}
          style={{ paddingLeft: 4 }}
          onClick={() => setTab('bedrijfskosten')}
        >
          Bedrijfskosten
        </button>
        <button
          className={`st-tab-btn${tab === 'machines' ? ' active' : ''}`}
          onClick={() => setTab('machines')}
        >
          Machines
        </button>
      </div>

      {tab === 'bedrijfskosten' && <BedrijfskostenTab />}
      {tab === 'machines'       && <OverheadTab />}
    </>
  )
}
