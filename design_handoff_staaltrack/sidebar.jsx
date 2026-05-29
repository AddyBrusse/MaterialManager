// Sidebar — two grouped sections with nav items

function Sidebar({ active, onNavigate, counts }) {
  const NAV = [
    {
      label: "Materiaal beheer",
      items: [
        { id: "voorraad", label: "Voorraad", icon: Icon.layers, count: counts.voorraad },
        { id: "binnenboeken", label: "Binnen boeken", icon: Icon.inbox, count: counts.binnen },
        { id: "instellingen", label: "Instellingen", icon: Icon.settings },
      ],
    },
    {
      label: "Artikelen",
      items: [
        { id: "artikelen", label: "Artikelen", icon: Icon.list, count: counts.artikelen },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-mark">ST</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sb-brand-name">StaalTrack</div>
          <div className="sb-brand-sub">Voorraadbeheer</div>
        </div>
      </div>

      <div className="sb-org-switch">
        <span className="dot"></span>
        <span>Van Dijk Staal B.V.</span>
        <span className="chev"><Ic d={Icon.chevronDown} size={12} /></span>
      </div>

      <nav className="sb-nav">
        {NAV.map((group) => (
          <React.Fragment key={group.label}>
            <div className="sb-group-label">{group.label}</div>
            {group.items.map((it) => (
              <button
                key={it.id}
                className="sb-item"
                data-active={active === it.id}
                onClick={() => onNavigate(it.id)}>
                <Ic d={it.icon} />
                <span>{it.label}</span>
                {it.count != null && <span className="count">{it.count}</span>}
              </button>
            ))}
          </React.Fragment>
        ))}
      </nav>

      <div className="sb-footer">
        <div className="sb-avatar">JV</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sb-user">Jeroen van Velsen</div>
          <div className="sb-user-sub">Magazijnchef</div>
        </div>
        <button className="icon-btn" title="Meldingen">
          <Ic d={Icon.bell} />
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
