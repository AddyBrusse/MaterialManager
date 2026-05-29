import { useState } from 'react'
import { IconPlus, IconDots } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { GradesTab }    from '../../components/settings/GradesTab'
import { ProfilesTab }  from '../../components/settings/ProfilesTab'
import { LocationsTab } from '../../components/settings/LocationsTab'

// ── shared primitives ─────────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="st-toggle" data-on={on} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

function SettingRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{title}</div>
        <div style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 3, maxWidth: 540 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  )
}

// ── tab panes ─────────────────────────────────────────────────────────────────
function Algemeen() {
  const [unit, setUnit]     = useState('kg')
  const [auto, setAuto]     = useState(true)
  const [neg, setNeg]       = useState(false)
  const [strict, setStrict] = useState(true)

  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Organisatie</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 8px', fontSize: 12.5 }}>Gegevens die in pakbonnen en exports worden gebruikt.</p>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow title="Bedrijfsnaam" desc="Verschijnt op pakbonnen, etiketten en exports.">
          <input className="st-input" defaultValue="Van Dijk Staal B.V." />
        </SettingRow>
        <SettingRow title="KvK / BTW" desc="Voor automatische facturatie-koppelingen.">
          <input className="st-input cell-mono" defaultValue="NL 8742 13 421 B01" />
        </SettingRow>
        <SettingRow title="Standaard eenheid" desc="Toon gewichten in deze eenheid in overzichten.">
          <select className="st-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="kg">Kilogram (kg)</option>
            <option value="ton">Ton (1000 kg)</option>
            <option value="lbs">Pound (lbs)</option>
          </select>
        </SettingRow>
        <SettingRow title="Tijdzone" desc="Voor mutaties en historische rapportages.">
          <select className="st-select" defaultValue="europe-amsterdam">
            <option value="europe-amsterdam">Europe/Amsterdam (CET)</option>
            <option value="europe-brussels">Europe/Brussels (CET)</option>
            <option value="europe-london">Europe/London (GMT)</option>
          </select>
        </SettingRow>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '28px 0 4px' }}>Voorraadgedrag</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 8px', fontSize: 12.5 }}>Bepaalt hoe het systeem zich gedraagt bij mutaties.</p>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow title="Automatisch reserveren" desc="Reserveer voorraad zodra een werkorder op 'gepland' staat.">
          <ToggleSwitch on={auto} onChange={setAuto} />
        </SettingRow>
        <SettingRow title="Negatieve voorraad toestaan" desc="Schakel uit voor strikte controle; aan voor productieflexibiliteit.">
          <ToggleSwitch on={neg} onChange={setNeg} />
        </SettingRow>
        <SettingRow title="Smeltnummer verplicht" desc="Vereis een geldig smeltnummer bij elke ontvangst voor traceerbaarheid.">
          <ToggleSwitch on={strict} onChange={setStrict} />
        </SettingRow>
        <SettingRow title="Drempel lage voorraad" desc="Globale ondergrens; wordt per artikel overschreven door min-waarde.">
          <input className="st-input cell-mono" defaultValue="10" />
        </SettingRow>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button className="st-btn">Annuleren</button>
        <button className="st-btn primary" onClick={() => notifications.show({ color: 'green', message: 'Instellingen opgeslagen' })}>
          Wijzigingen opslaan
        </button>
      </div>
    </div>
  )
}


function Gebruikers() {
  const users = [
    ['JV', 'Jeroen van Velsen', 'j.vanvelsen@vandijk-staal.nl', 'Magazijnchef', 'Alle',     'vandaag, 08:14',  'ok'],
    ['MS', 'Mariska Smit',      'm.smit@vandijk-staal.nl',      'Administratie','—',         'gisteren, 17:02', 'ok'],
    ['TB', 'Tarik Boudini',     't.boudini@vandijk-staal.nl',   'Operator',     'Hal A, B',  'vandaag, 06:58',  'ok'],
    ['EJ', 'Erik Janssen',      'e.janssen@vandijk-staal.nl',   'Operator',     'Hal C',     '3 dagen geleden', 'warn'],
    ['DH', 'Diana Hendriks',    'd.hendriks@vandijk-staal.nl',  'Inkoop',       '—',         'vandaag, 09:30',  'ok'],
    ['RV', 'Rob Vermeer',       'r.vermeer@vandijk-staal.nl',   'Beheerder',    'Alle',      'vandaag, 07:45',  'ok'],
  ] as const

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Team</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>Wie heeft toegang tot StaalTrack en welke rechten?</p>
        </div>
        <button className="st-btn primary sm" style={{ marginLeft: 'auto' }}><IconPlus size={12} />Gebruiker</button>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Rol</th>
              <th>Locaties</th>
              <th>Laatste login</th>
              <th>Status</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {users.map(([init, name, email, role, loc, last, st]) => (
              <tr key={email}>
                <td>
                  <div className="st-art-cell">
                    <div className="st-sb-avatar">{init}</div>
                    <div className="st-art-name">{name}</div>
                  </div>
                </td>
                <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{email}</td>
                <td><span className="st-badge info"><span className="dot" />{role}</span></td>
                <td className="cell-muted">{loc}</td>
                <td className="cell-muted">{last}</td>
                <td>
                  <span className={`st-badge ${st === 'ok' ? 'ok' : 'warn'}`}>
                    <span className="dot" />{st === 'ok' ? 'Actief' : 'Inactief'}
                  </span>
                </td>
                <td><button className="st-icon-btn"><IconDots size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Nummering() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Nummerreeksen</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 12.5 }}>Patronen voor automatisch genereren van nummers.</p>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow title="Artikelcode" desc="Variabelen: {YYYY}, {SEQ:5}, {TYPE}">
          <input className="st-input cell-mono" defaultValue="ST-{SEQ:5}" />
        </SettingRow>
        <SettingRow title="Ontvangst" desc="Volgende: ONT-2026-0419">
          <input className="st-input cell-mono" defaultValue="ONT-{YYYY}-{SEQ:4}" />
        </SettingRow>
        <SettingRow title="Werkorder" desc="Volgende: WO-2026-0344">
          <input className="st-input cell-mono" defaultValue="WO-{YYYY}-{SEQ:4}" />
        </SettingRow>
        <SettingRow title="Smeltnummer" desc="Validatieformaat voor heatnummers bij ontvangst.">
          <input className="st-input cell-mono" defaultValue="H{6}" />
        </SettingRow>
      </div>
    </div>
  )
}

function NotifRow({ title, desc, inapp: ia, email: em, sms: sm }: {
  title: string; desc: string; inapp: boolean; email: boolean; sms: boolean
}) {
  const [a, setA] = useState(ia)
  const [e, setE] = useState(em)
  const [s, setS] = useState(sm)
  return (
    <tr>
      <td>
        <div className="cell-strong">{title}</div>
        <div className="cell-muted" style={{ fontSize: 11.5 }}>{desc}</div>
      </td>
      <td style={{ textAlign: 'center' }}><ToggleSwitch on={a} onChange={setA} /></td>
      <td style={{ textAlign: 'center' }}><ToggleSwitch on={e} onChange={setE} /></td>
      <td style={{ textAlign: 'center' }}><ToggleSwitch on={s} onChange={setS} /></td>
    </tr>
  )
}

function Meldingen() {
  const rows = [
    ['Lage voorraad',               'Wanneer een artikel onder zijn minimum komt',         true,  true,  false],
    ['Niet op voorraad',            'Wanneer voorraad op 0 valt',                          true,  true,  true ],
    ['Ontvangst verwerkt',          'Bevestiging dat een ontvangst is verwerkt',           true,  false, false],
    ['Smeltcertificaat ontbreekt',  'Smeltnummer zonder bijbehorend certificaat',          true,  true,  false],
    ['Wekelijkse rapportage',       'Maandagochtend overzicht van mutaties',               false, true,  false],
    ['Inventarisatie deadline',     'Herinnering voor periodieke telling',                 true,  true,  true ],
  ] as const

  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Meldingen</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 12.5 }}>Kies hoe en wanneer u op de hoogte wordt gebracht.</p>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
        <table className="st-tbl">
          <thead>
            <tr>
              <th>Gebeurtenis</th>
              <th style={{ width: 80, textAlign: 'center' }}>In-app</th>
              <th style={{ width: 80, textAlign: 'center' }}>E-mail</th>
              <th style={{ width: 80, textAlign: 'center' }}>SMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([title, desc, inapp, email, sms]) => (
              <NotifRow key={title} title={title} desc={desc} inapp={inapp} email={email} sms={sms} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Integraties() {
  const apps = [
    { name: 'Exact Online',     desc: 'Boekhouding & facturatie',          connected: true  },
    { name: 'AFAS Profit',      desc: 'ERP-koppeling',                     connected: false },
    { name: 'Lantek Expert',    desc: 'Nestpakket voor snijdtekeningen',    connected: true  },
    { name: 'Bystronic ByVision', desc: 'Lasersnijmachine',                connected: true  },
    { name: 'Trumpf TruTops',   desc: 'Plaatbewerking & ponsen',           connected: false },
    { name: 'Microsoft Teams',  desc: 'Meldingen in kanaal',               connected: false },
  ]
  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Integraties</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {apps.map(a => (
          <div key={a.name} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--bg-sidebar)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11 }}>
                {a.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                <div className="cell-muted" style={{ fontSize: 11.5 }}>{a.desc}</div>
              </div>
            </div>
            {a.connected
              ? <button className="st-btn ghost sm" style={{ width: '100%', justifyContent: 'center' }}>
                  <span className="st-badge ok"><span className="dot" />Verbonden</span>
                </button>
              : <button className="st-btn sm" style={{ width: '100%', justifyContent: 'center' }}>Koppelen</button>
            }
          </div>
        ))}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
const TABS = [
  ['algemeen',    'Algemeen'],
  ['locaties',    'Locaties'],
  ['kwaliteiten', 'Kwaliteiten'],
  ['profielen',   'Profielen'],
  ['gebruikers',  'Gebruikers & rollen'],
  ['nummering',   'Nummering'],
  ['meldingen',   'Meldingen'],
  ['integraties', 'Integraties'],
] as const

type TabId = typeof TABS[number][0]

export function InstellingenPage() {
  const [tab, setTab] = useState<TabId>('algemeen')

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Instellingen</div>
          <div className="st-page-sub">Configureer het voorraadsysteem voor uw organisatie</div>
        </div>
      </div>

      <div className="st-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={`st-tab-btn${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="st-tab-content" style={{ padding: '20px 24px 40px', overflowY: 'auto', flex: 1 }}>
        {tab === 'algemeen'    && <Algemeen />}
        {tab === 'locaties'    && <LocationsTab />}
        {tab === 'kwaliteiten' && <GradesTab />}
        {tab === 'profielen'   && <ProfilesTab />}
        {tab === 'gebruikers'  && <Gebruikers />}
        {tab === 'nummering'   && <Nummering />}
        {tab === 'meldingen'   && <Meldingen />}
        {tab === 'integraties' && <Integraties />}
      </div>
    </>
  )
}
