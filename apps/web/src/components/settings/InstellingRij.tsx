/** De bouwstenen van een instellingenpagina: een kop per onderdeel en een rij met uitleg links, invoer rechts. */
export function SettingRow({ title, desc, children }: { title: string; desc: React.ReactNode; children: React.ReactNode }) {
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

export function SectionHeader({ title, desc, id }: { title: string; desc?: string; id?: string }) {
  return (
    <div id={id} style={{ marginBottom: desc ? 4 : 8, marginTop: 28 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
      {desc && <p style={{ color: 'var(--text-3)', margin: '3px 0 0', fontSize: 12.5 }}>{desc}</p>}
    </div>
  )
}
