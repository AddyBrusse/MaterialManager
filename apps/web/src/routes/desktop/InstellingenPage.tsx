import { useState, useEffect } from 'react'
import { IconPlus, IconDots, IconCheck, IconX, IconPencil, IconTrash } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MateriaalbeheerPage } from '../../components/settings/MateriaalbeheerPage'
import { OverheadPage }        from '../../components/settings/OverheadPage'
import { companyApi }          from '../../api/company'
import { usersApi }            from '../../api/users'
import type { Company, User, CreateUser } from '@stockmanager/shared'

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

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: desc ? 4 : 8, marginTop: 28 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
      {desc && <p style={{ color: 'var(--text-3)', margin: '3px 0 0', fontSize: 12.5 }}>{desc}</p>}
    </div>
  )
}

// ── Bedrijf tab ───────────────────────────────────────────────────────────────

function BedrijfTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => companyApi.get().then(r => r.data),
  })
  const [form, setForm] = useState<Partial<Company>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) { setForm(data); setDirty(false) }
  }, [data])

  const save = useMutation({
    mutationFn: (body: Partial<Company>) =>
      companyApi.update({ naam: body.naam ?? '', ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company'] })
      notifications.show({ color: 'green', message: 'Bedrijfsgegevens opgeslagen' })
      setDirty(false)
    },
    onError: () => notifications.show({ color: 'red', message: 'Opslaan mislukt' }),
  })

  function field(key: keyof Company) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [key]: e.target.value || null }))
        setDirty(true)
      },
    }
  }

  if (isLoading) return <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>Laden…</div>

  return (
    <div style={{ maxWidth: 920 }}>
      <SectionHeader title="Bedrijfsgegevens" desc="Verschijnen op offertes, productieformulieren en facturen." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow title="Bedrijfsnaam" desc="Volledige naam zoals op documenten.">
          <input className="st-input" {...field('naam')} />
        </SettingRow>
        <SettingRow title="Adres" desc="">
          <input className="st-input" {...field('adres')} placeholder="Straat en huisnummer" />
        </SettingRow>
        <SettingRow title="Postcode / Stad" desc="">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="st-input" style={{ width: 100 }} {...field('postcode')} placeholder="1234 AB" />
            <input className="st-input" style={{ flex: 1 }} {...field('stad')} placeholder="Stad" />
          </div>
        </SettingRow>
        <SettingRow title="Telefoon" desc="">
          <input className="st-input cell-mono" {...field('telefoon')} placeholder="+31 53 123 4567" />
        </SettingRow>
        <SettingRow title="E-mail" desc="Algemeen bedrijfsadres (info@…).">
          <input className="st-input" {...field('email')} placeholder="info@bedrijf.nl" />
        </SettingRow>
        <SettingRow title="Website" desc="">
          <input className="st-input" {...field('website')} placeholder="www.bedrijf.nl" />
        </SettingRow>
      </div>

      <SectionHeader title="Fiscale gegevens" />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow title="KvK-nummer" desc="">
          <input className="st-input cell-mono" {...field('kvk')} placeholder="12345678" />
        </SettingRow>
        <SettingRow title="BTW-nummer" desc="">
          <input className="st-input cell-mono" {...field('btw')} placeholder="NL123456789B01" />
        </SettingRow>
        <SettingRow title="IBAN" desc="Voor betalingsinformatie op facturen.">
          <input className="st-input cell-mono" {...field('iban')} placeholder="NL02ABNA0123456789" />
        </SettingRow>
      </div>

      <SectionHeader title="Microsoft 365 — e-mail integratie" desc="Vereist voor het versturen van offertes en documenten vanuit de app via uw eigen Outlook." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <SettingRow
          title="Tenant ID"
          desc="Azure Active Directory → uw tenant ID (GUID)."
        >
          <input className="st-input cell-mono" {...field('graphTenantId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </SettingRow>
        <SettingRow
          title="Client ID (App ID)"
          desc="Azure App Registration → Application (client) ID."
        >
          <input className="st-input cell-mono" {...field('graphClientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </SettingRow>
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-2)' }}>Instelling:</strong> Registreer een SPA-app in Azure AD met permissie{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Mail.Send</code> (delegated).
            Voeg <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>http://localhost:5173/auth-popup.html</code> (dev) en{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>https://shop.&lt;domein&gt;.nl/auth-popup.html</code> (productie) toe als Redirect URI.
            Gebruikers loggen eenmalig in via een popup wanneer ze voor het eerst een e-mail versturen.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button className="st-btn" onClick={() => { setForm(data ?? {}); setDirty(false) }} disabled={!dirty}>
          Annuleren
        </button>
        <button
          className="st-btn primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(form)}
        >
          {save.isPending ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </button>
      </div>
    </div>
  )
}

// ── Gebruikers tab ────────────────────────────────────────────────────────────

interface UserRowProps {
  user: User
  onSave: (id: string, patch: Partial<User>) => void
  onDelete: (id: string) => void
}

function UserRow({ user, onSave, onDelete }: UserRowProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...user })

  function f(key: keyof User) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value || null })),
    }
  }

  const initials = [user.name[0], user.achternaam?.[0]].filter(Boolean).join('').toUpperCase() || user.name.slice(0, 2).toUpperCase()

  if (editing) {
    return (
      <tr style={{ background: 'var(--bg-1)' }}>
        <td>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="st-input" style={{ width: 90 }} placeholder="Voornaam" {...f('name')} />
            <input className="st-input" style={{ flex: 1 }} placeholder="Achternaam" {...f('achternaam')} />
          </div>
        </td>
        <td><input className="st-input" placeholder="Functietitel" {...f('titel')} /></td>
        <td><input className="st-input cell-mono" style={{ fontSize: 11.5 }} placeholder="naam@bedrijf.nl" {...f('email')} /></td>
        <td><input className="st-input cell-mono" style={{ fontSize: 11.5 }} placeholder="+31 6 …" {...f('telefoon')} /></td>
        <td>
          <select className="st-select" {...f('role')}>
            <option value="user">Gebruiker</option>
            <option value="admin">Beheerder</option>
          </select>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="st-icon-btn" title="Opslaan" onClick={() => { onSave(user.id, form); setEditing(false) }}>
              <IconCheck size={14} style={{ color: 'var(--success)' }} />
            </button>
            <button className="st-icon-btn" title="Annuleren" onClick={() => { setForm({ ...user }); setEditing(false) }}>
              <IconX size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <div className="st-art-cell">
          <div className="st-sb-avatar">{initials}</div>
          <div>
            <div className="st-art-name">{[user.name, user.achternaam].filter(Boolean).join(' ')}</div>
            {user.titel && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.titel}</div>}
          </div>
        </div>
      </td>
      <td className="cell-muted">{user.titel ?? '—'}</td>
      <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{user.email ?? '—'}</td>
      <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{user.telefoon ?? '—'}</td>
      <td>
        <span className={`st-badge ${user.role === 'admin' ? 'info' : ''}`}>
          <span className="dot" />{user.role === 'admin' ? 'Beheerder' : 'Gebruiker'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="st-icon-btn" title="Bewerken" onClick={() => setEditing(true)}>
            <IconPencil size={14} />
          </button>
          <button className="st-icon-btn" title="Verwijderen" onClick={() => onDelete(user.id)}>
            <IconTrash size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddUserRow({ onAdd }: { onAdd: (u: CreateUser) => void }) {
  const empty = { name: '', achternaam: '', titel: '', email: '', telefoon: '', role: 'user' as const }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)

  function f(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    }
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={6}>
          <button className="st-btn ghost sm" style={{ margin: '4px 0' }} onClick={() => setOpen(true)}>
            <IconPlus size={12} /> Gebruiker toevoegen
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ background: 'var(--bg-1)' }}>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="st-input" style={{ width: 90 }} placeholder="Voornaam *" {...f('name')} />
          <input className="st-input" style={{ flex: 1 }} placeholder="Achternaam" {...f('achternaam')} />
        </div>
      </td>
      <td><input className="st-input" placeholder="Functietitel" {...f('titel')} /></td>
      <td><input className="st-input cell-mono" style={{ fontSize: 11.5 }} placeholder="naam@bedrijf.nl" {...f('email')} /></td>
      <td><input className="st-input cell-mono" style={{ fontSize: 11.5 }} placeholder="+31 6 …" {...f('telefoon')} /></td>
      <td>
        <select className="st-select" {...f('role')}>
          <option value="user">Gebruiker</option>
          <option value="admin">Beheerder</option>
        </select>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="st-icon-btn"
            title="Toevoegen"
            disabled={!form.name}
            onClick={() => {
              onAdd({
                name: form.name,
                achternaam: form.achternaam || null,
                titel: form.titel || null,
                email: form.email || null,
                telefoon: form.telefoon || null,
                role: form.role,
              })
              setForm(empty)
              setOpen(false)
            }}
          >
            <IconCheck size={14} style={{ color: 'var(--success)' }} />
          </button>
          <button className="st-icon-btn" onClick={() => { setForm(empty); setOpen(false) }}>
            <IconX size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function GebruikersTab() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  })
  const users: User[] = data?.data ?? []

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<User> }) =>
      usersApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      notifications.show({ color: 'green', message: 'Gebruiker bijgewerkt' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Opslaan mislukt' }),
  })

  const createUser = useMutation({
    mutationFn: (body: CreateUser) => usersApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      notifications.show({ color: 'green', message: 'Gebruiker aangemaakt' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Aanmaken mislukt' }),
  })

  const deleteUser = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      notifications.show({ color: 'teal', message: 'Gebruiker verwijderd' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
  })

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Team</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12.5 }}>
            Beheer wie toegang heeft tot ShopCommand en stel e-mailadressen in voor Microsoft 365.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>Laden…</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Naam</th>
                <th style={{ minWidth: 120 }}>Functie</th>
                <th style={{ minWidth: 180 }}>E-mail (M365)</th>
                <th style={{ minWidth: 130 }}>Telefoon</th>
                <th style={{ minWidth: 110 }}>Rol</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  onSave={(id, patch) => updateUser.mutate({ id, patch })}
                  onDelete={id => deleteUser.mutate(id)}
                />
              ))}
              <AddUserRow onAdd={body => createUser.mutate(body)} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Remaining static tabs (unchanged) ────────────────────────────────────────

function Nummering() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Nummerreeksen</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 12.5 }}>Patronen voor automatisch genereren van nummers.</p>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {[
          ['Artikelcode', 'Variabelen: {YYYY}, {SEQ:5}, {TYPE}', 'ST-{SEQ:5}'],
          ['Ontvangst', 'Volgende: ONT-2026-0419', 'ONT-{YYYY}-{SEQ:4}'],
          ['Werkorder', 'Volgende: WO-2026-0344', 'WO-{YYYY}-{SEQ:4}'],
          ['Smeltnummer', 'Validatieformaat voor heatnummers bij ontvangst.', 'H{6}'],
        ].map(([t, d, v]) => (
          <SettingRow key={t} title={t} desc={d}>
            <input className="st-input cell-mono" defaultValue={v} />
          </SettingRow>
        ))}
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
    ['Lage voorraad', 'Wanneer een artikel onder zijn minimum komt', true, true, false],
    ['Niet op voorraad', 'Wanneer voorraad op 0 valt', true, true, true],
    ['Ontvangst verwerkt', 'Bevestiging dat een ontvangst is verwerkt', true, false, false],
    ['Smeltcertificaat ontbreekt', 'Smeltnummer zonder bijbehorend certificaat', true, true, false],
    ['Wekelijkse rapportage', 'Maandagochtend overzicht van mutaties', false, true, false],
    ['Inventarisatie deadline', 'Herinnering voor periodieke telling', true, true, true],
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
            {rows.map(([t, d, ia, em, sm]) => (
              <NotifRow key={t} title={t} desc={d} inapp={ia} email={em} sms={sm} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

const TABS = [
  ['bedrijf',        'Bedrijf'],
  ['gebruikers',     'Gebruikers'],
  ['materiaalbeheer','Materiaalbeheer'],
  ['bedrijfskosten', 'Bedrijfskosten'],
  ['nummering',      'Nummering'],
  ['meldingen',      'Meldingen'],
] as const

type TabId = typeof TABS[number][0]

export function InstellingenPage() {
  const [tab, setTab] = useState<TabId>('bedrijf')

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Instellingen</div>
          <div className="st-page-sub">Bedrijfsgegevens, gebruikers en systeemconfiguratie</div>
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
        {tab === 'bedrijf'         && <BedrijfTab />}
        {tab === 'gebruikers'      && <GebruikersTab />}
        {tab === 'materiaalbeheer' && <MateriaalbeheerPage />}
        {tab === 'bedrijfskosten'  && <OverheadPage />}
        {tab === 'nummering'       && <Nummering />}
        {tab === 'meldingen'       && <Meldingen />}
      </div>
    </>
  )
}
