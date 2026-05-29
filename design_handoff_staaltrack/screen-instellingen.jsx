// Instellingen — settings with tabs

function Instellingen() {
  const [tab, setTab] = React.useState("algemeen");
  const TABS = [
    ["algemeen", "Algemeen"],
    ["locaties", "Locaties"],
    ["gebruikers", "Gebruikers & rollen"],
    ["nummering", "Nummering"],
    ["meldingen", "Meldingen"],
    ["integraties", "Integraties"],
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Instellingen</div>
          <div className="page-sub">Configureer het voorraadsysteem voor uw organisatie</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} data-active={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px 24px" }}>
        {tab === "algemeen" && <Algemeen />}
        {tab === "locaties" && <Locaties />}
        {tab === "gebruikers" && <Gebruikers />}
        {tab === "nummering" && <Nummering />}
        {tab === "meldingen" && <Meldingen />}
        {tab === "integraties" && <Integraties />}
      </div>
    </>
  );
}

function SettingRow({ title, desc, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{title}</div>
        <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3, maxWidth: 540 }}>{desc}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>{children}</div>
    </div>
  );
}

function Algemeen() {
  const [unit, setUnit] = React.useState("kg");
  const [auto, setAuto] = React.useState(true);
  const [neg, setNeg] = React.useState(false);
  const [strict, setStrict] = React.useState(true);

  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Organisatie</h3>
      <p style={{ color: "var(--text-3)", margin: "0 0 8px", fontSize: 12.5 }}>Gegevens die in pakbonnen en exports worden gebruikt.</p>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <SettingRow title="Bedrijfsnaam" desc="Verschijnt op pakbonnen, etiketten en exports.">
          <input className="input" defaultValue="Van Dijk Staal B.V." style={{ width: "100%" }} />
        </SettingRow>
        <SettingRow title="KvK / BTW" desc="Voor automatische facturatie-koppelingen.">
          <input className="input cell-mono" defaultValue="NL 8742 13 421 B01" style={{ width: "100%" }} />
        </SettingRow>
        <SettingRow title="Standaard eenheid" desc="Toon gewichten in deze eenheid in overzichten.">
          <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: "100%" }}>
            <option value="kg">Kilogram (kg)</option>
            <option value="ton">Ton (1000 kg)</option>
            <option value="lbs">Pound (lbs)</option>
          </select>
        </SettingRow>
        <SettingRow title="Tijdzone" desc="Voor mutaties en historische rapportages.">
          <select className="select" defaultValue="europe-amsterdam" style={{ width: "100%" }}>
            <option value="europe-amsterdam">Europe/Amsterdam (CET)</option>
            <option value="europe-brussels">Europe/Brussels (CET)</option>
            <option value="europe-london">Europe/London (GMT)</option>
          </select>
        </SettingRow>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "28px 0 4px" }}>Voorraadgedrag</h3>
      <p style={{ color: "var(--text-3)", margin: "0 0 8px", fontSize: 12.5 }}>Bepaalt hoe het systeem zich gedraagt bij mutaties.</p>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <SettingRow title="Automatisch reserveren" desc="Reserveer voorraad zodra een werkorder op 'gepland' staat.">
          <button className="toggle-sw" data-on={auto} onClick={() => setAuto(!auto)}><i /></button>
        </SettingRow>
        <SettingRow title="Negatieve voorraad toestaan" desc="Schakel uit voor strikte controle; aan voor productieflexibiliteit.">
          <button className="toggle-sw" data-on={neg} onClick={() => setNeg(!neg)}><i /></button>
        </SettingRow>
        <SettingRow title="Smeltnummer verplicht" desc="Vereis een geldig smeltnummer bij elke ontvangst voor traceerbaarheid.">
          <button className="toggle-sw" data-on={strict} onClick={() => setStrict(!strict)}><i /></button>
        </SettingRow>
        <SettingRow title="Drempel lage voorraad" desc="Globale ondergrens; wordt per artikel overschreven door min-waarde.">
          <input className="input cell-mono" defaultValue="10" style={{ width: "100%" }} />
        </SettingRow>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
        <button className="btn">Annuleren</button>
        <button className="btn primary">Wijzigingen opslaan</button>
      </div>
    </div>
  );
}

function Locaties() {
  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Magazijnlocaties</h3>
          <p style={{ color: "var(--text-3)", margin: "2px 0 0", fontSize: 12.5 }}>Hallen, stellingen en vakken waar artikelen liggen.</p>
        </div>
        <button className="btn primary sm" style={{ marginLeft: "auto" }}><Ic d={Icon.plus} size={12} />Locatie</button>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--bg-2)" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th>Naam</th>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Capaciteit (kg)</th>
              <th style={{ textAlign: "right" }}>Bezet</th>
              <th>Status</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {[
              ["HAL-A-01", "Hal A · Stelling 01", "Stelling", 8000, 5240, "ok"],
              ["HAL-A-02", "Hal A · Stelling 02", "Stelling", 8000, 7820, "warn"],
              ["HAL-A-03", "Hal A · Stelling 03", "Stelling", 8000, 3110, "ok"],
              ["HAL-B-12", "Hal B · Vak 12", "Vak", 12000, 8400, "ok"],
              ["HAL-B-14", "Hal B · Vak 14", "Vak", 12000, 11920, "warn"],
              ["HAL-C-BU", "Hal C · Buitenopslag", "Buiten", 40000, 22300, "ok"],
              ["HAL-D-KN", "Hal D · Knipvoorraad", "Werkplaats", 6000, 2200, "ok"],
              ["WP-KAST",  "Werkplaats · Voorraadkast", "Kast", 800, 240, "ok"],
            ].map(([code, name, type, cap, used, st]) => (
              <tr key={code}>
                <td className="cell-mono cell-strong">{code}</td>
                <td>{name}</td>
                <td className="cell-muted">{type}</td>
                <td className="cell-num">{cap.toLocaleString("nl-NL")}</td>
                <td>
                  <div className="lvl" style={{ minWidth: 100 }}>
                    <div className="lvl-bar"><i style={{ width: `${(used/cap)*100}%`, background: used/cap > 0.9 ? "var(--warning)" : "var(--success)" }}></i></div>
                    <span className="lvl-num">{Math.round(used/cap*100)}%</span>
                  </div>
                </td>
                <td><span className={`badge ${st === "ok" ? "ok" : "warn"}`}><span className="dot"></span>{st === "ok" ? "Actief" : "Bijna vol"}</span></td>
                <td><button className="icon-btn"><Ic d={Icon.more} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Gebruikers() {
  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Team</h3>
          <p style={{ color: "var(--text-3)", margin: "2px 0 0", fontSize: 12.5 }}>Wie heeft toegang tot StaalTrack en welke rechten?</p>
        </div>
        <button className="btn primary sm" style={{ marginLeft: "auto" }}><Ic d={Icon.plus} size={12} />Gebruiker</button>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--bg-2)" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Rol</th>
              <th>Locaties</th>
              <th>Laatste login</th>
              <th>Status</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {[
              ["JV", "Jeroen van Velsen", "j.vanvelsen@vandijk-staal.nl", "Magazijnchef", "Alle", "vandaag, 08:14", "ok"],
              ["MS", "Mariska Smit", "m.smit@vandijk-staal.nl", "Administratie", "—", "gisteren, 17:02", "ok"],
              ["TB", "Tarik Boudini", "t.boudini@vandijk-staal.nl", "Operator", "Hal A, B", "vandaag, 06:58", "ok"],
              ["EJ", "Erik Janssen", "e.janssen@vandijk-staal.nl", "Operator", "Hal C", "3 dagen geleden", "warn"],
              ["DH", "Diana Hendriks", "d.hendriks@vandijk-staal.nl", "Inkoop", "—", "vandaag, 09:30", "ok"],
              ["RV", "Rob Vermeer", "r.vermeer@vandijk-staal.nl", "Beheerder", "Alle", "vandaag, 07:45", "ok"],
            ].map(([init, name, email, role, loc, last, st]) => (
              <tr key={email}>
                <td>
                  <div className="art-cell">
                    <div className="sb-avatar" style={{ width: 26, height: 26 }}>{init}</div>
                    <div className="art-name">{name}</div>
                  </div>
                </td>
                <td className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{email}</td>
                <td><span className="badge info"><span className="dot"></span>{role}</span></td>
                <td className="cell-muted">{loc}</td>
                <td className="cell-muted">{last}</td>
                <td><span className={`badge ${st === "ok" ? "ok" : "warn"}`}><span className="dot"></span>{st === "ok" ? "Actief" : "Inactief"}</span></td>
                <td><button className="icon-btn"><Ic d={Icon.more} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Nummering() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Nummerreeksen</h3>
      <p style={{ color: "var(--text-3)", margin: "0 0 12px", fontSize: 12.5 }}>Patronen voor automatisch genereren van nummers.</p>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <SettingRow title="Artikelcode" desc="Variabelen: {YYYY}, {SEQ:5}, {TYPE}">
          <input className="input cell-mono" defaultValue="ST-{SEQ:5}" style={{ width: "100%" }} />
        </SettingRow>
        <SettingRow title="Ontvangst" desc="Volgende: ONT-2026-0419">
          <input className="input cell-mono" defaultValue="ONT-{YYYY}-{SEQ:4}" style={{ width: "100%" }} />
        </SettingRow>
        <SettingRow title="Werkorder" desc="Volgende: WO-2026-0344">
          <input className="input cell-mono" defaultValue="WO-{YYYY}-{SEQ:4}" style={{ width: "100%" }} />
        </SettingRow>
        <SettingRow title="Smeltnummer" desc="Validatieformaat voor heatnummers bij ontvangst.">
          <input className="input cell-mono" defaultValue="H{6}" style={{ width: "100%" }} />
        </SettingRow>
      </div>
    </div>
  );
}

function Meldingen() {
  const items = [
    ["Lage voorraad", "Wanneer een artikel onder zijn minimum komt", true, true, false],
    ["Niet op voorraad", "Wanneer voorraad op 0 valt", true, true, true],
    ["Ontvangst verwerkt", "Bevestiging dat een ontvangst is verwerkt", true, false, false],
    ["Smeltcertificaat ontbreekt", "Smeltnummer zonder bijbehorend certificaat", true, true, false],
    ["Wekelijkse rapportage", "Maandagochtend overzicht van mutaties", false, true, false],
    ["Inventarisatie deadline", "Herinnering voor periodieke telling", true, true, true],
  ];
  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Meldingen</h3>
      <p style={{ color: "var(--text-3)", margin: "0 0 12px", fontSize: 12.5 }}>Kies hoe en wanneer u op de hoogte wordt gebracht.</p>
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--bg-2)" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Gebeurtenis</th>
              <th style={{ width: 80, textAlign: "center" }}>In-app</th>
              <th style={{ width: 80, textAlign: "center" }}>E-mail</th>
              <th style={{ width: 80, textAlign: "center" }}>SMS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <NotifRow key={i} {...{ title: it[0], desc: it[1], inapp: it[2], email: it[3], sms: it[4] }} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotifRow({ title, desc, inapp, email, sms }) {
  const [a, setA] = React.useState(inapp);
  const [e, setE] = React.useState(email);
  const [s, setS] = React.useState(sms);
  return (
    <tr>
      <td>
        <div className="cell-strong">{title}</div>
        <div className="cell-muted" style={{ fontSize: 11.5 }}>{desc}</div>
      </td>
      <td style={{ textAlign: "center" }}><button className="toggle-sw" data-on={a} onClick={() => setA(!a)}><i /></button></td>
      <td style={{ textAlign: "center" }}><button className="toggle-sw" data-on={e} onClick={() => setE(!e)}><i /></button></td>
      <td style={{ textAlign: "center" }}><button className="toggle-sw" data-on={s} onClick={() => setS(!s)}><i /></button></td>
    </tr>
  );
}

function Integraties() {
  const apps = [
    { name: "Exact Online", desc: "Boekhouding & facturatie", connected: true },
    { name: "AFAS Profit", desc: "ERP-koppeling", connected: false },
    { name: "Lantek Expert", desc: "Nestpakket voor snijdtekeningen", connected: true },
    { name: "Bystronic ByVision", desc: "Lasersnijmachine", connected: true },
    { name: "Trumpf TruTops", desc: "Plaatbewerking & ponsen", connected: false },
    { name: "Microsoft Teams", desc: "Meldingen in kanaal", connected: false },
  ];
  return (
    <div style={{ maxWidth: 920 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Integraties</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {apps.map(a => (
          <div key={a.name} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 6, background: "var(--bg-sidebar)", border: "1px solid var(--border)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11 }}>
                {a.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                <div className="cell-muted" style={{ fontSize: 11.5 }}>{a.desc}</div>
              </div>
            </div>
            {a.connected
              ? <button className="btn ghost sm" style={{ width: "100%", justifyContent: "center" }}><span className="badge ok"><span className="dot"></span>Verbonden</span></button>
              : <button className="btn sm" style={{ width: "100%", justifyContent: "center" }}>Koppelen</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Instellingen });
