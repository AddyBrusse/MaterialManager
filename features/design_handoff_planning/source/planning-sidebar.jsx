// Planning sidebar — matches StaalTrack sidebar, adds Productie ▸ Planning.

function PlanSidebar() {
  const NAV = [
    {
      label: "Materiaal beheer",
      items: [
        { id: "voorraad", label: "Voorraad", icon: Icon.layers },
        { id: "binnenboeken", label: "Binnen boeken", icon: Icon.inbox },
        { id: "instellingen", label: "Instellingen", icon: Icon.settings },
      ],
    },
    {
      label: "Productie",
      items: [
        { id: "planning", label: "Planning", icon: Icon.calendar, active: true },
        { id: "orders", label: "Productie­orders", icon: Icon.list },
      ],
    },
    {
      label: "Artikelen",
      items: [
        { id: "artikelen", label: "Artikelen", icon: Icon.tag },
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
              <button key={it.id} className="sb-item" data-active={!!it.active}>
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
          <div className="sb-user-sub">Werkvoorbereiding</div>
        </div>
        <button className="icon-btn" title="Meldingen">
          <Ic d={Icon.bell} />
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { PlanSidebar });
