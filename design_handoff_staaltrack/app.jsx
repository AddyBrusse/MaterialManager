// Main app — routes + tweaks panel

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "compact",
  "accent": "#2d6df6",
  "sidebarStyle": "grouped",
  "tableStyle": "lined"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState("voorraad");

  // Apply theme + density + accent to root
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.style.setProperty("--accent", t.accent);
    // derive accent-soft + hover
    r.style.setProperty("--accent-soft", hexAlpha(t.accent, t.theme === "dark" ? 0.18 : 0.10));
    r.style.setProperty("--accent-hover", shade(t.accent, -10));
  }, [t.theme, t.density, t.accent]);

  // Apply table style class
  React.useEffect(() => {
    document.documentElement.setAttribute("data-table", t.tableStyle);
  }, [t.tableStyle]);

  const items = window.STEEL.ITEMS;
  const counts = {
    voorraad: items.length,
    binnen: 2,
    artikelen: items.length,
  };

  const CRUMB = {
    voorraad: ["Materiaal beheer", "Voorraad"],
    binnenboeken: ["Materiaal beheer", "Binnen boeken"],
    instellingen: ["Materiaal beheer", "Instellingen"],
    artikelen: ["Artikelen", "Catalogus"],
  };

  return (
    <div className="app" data-sidebar={t.sidebarStyle}>
      <Sidebar active={route} onNavigate={setRoute} counts={counts} />
      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>{CRUMB[route][0]}</span>
            <Ic d={Icon.chevronRight} size={12} />
            <strong>{CRUMB[route][1]}</strong>
          </div>
          <div className="spacer"></div>
          <button className="btn ghost sm">
            <Ic d={Icon.history} size={13} />
            Geschiedenis
          </button>
          <button className="btn ghost sm">
            <Ic d={Icon.qrcode} size={13} />
            Etiket printen
          </button>
          <span style={{ width: 1, height: 18, background: "var(--border)" }}></span>
          <button className="btn primary sm">
            <Ic d={Icon.plus} size={13} />
            Nieuw
          </button>
        </header>

        <div className="content">
          {route === "voorraad" && <Voorraad items={items} accent={t.accent} />}
          {route === "binnenboeken" && <BinnenBoeken items={items} />}
          {route === "artikelen" && <Artikelen items={items} />}
          {route === "instellingen" && <Instellingen />}
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Weergave" />
        <TweakRadio label="Thema" value={t.theme} options={["light", "dark"]}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Dichtheid" value={t.density} options={["compact", "comfortable"]}
          onChange={(v) => setTweak("density", v)} />

        <TweakSection label="Stijl" />
        <TweakColor label="Accent" value={t.accent}
          options={["#2d6df6", "#0f1116", "#117a45", "#c2410c"]}
          onChange={(v) => setTweak("accent", v)} />

        <TweakSection label="Navigeer naar" />
        <TweakSelect label="Scherm" value={route}
          options={[
            { value: "voorraad", label: "Voorraad" },
            { value: "binnenboeken", label: "Binnen boeken" },
            { value: "artikelen", label: "Artikelen" },
            { value: "instellingen", label: "Instellingen" },
          ]}
          onChange={setRoute} />
      </TweaksPanel>
    </div>
  );
}

// Color helpers
function hexAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function shade(hex, percent) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  let r = parseInt(n.slice(0, 2), 16);
  let g = parseInt(n.slice(2, 4), 16);
  let b = parseInt(n.slice(4, 6), 16);
  const adj = (c) => Math.max(0, Math.min(255, Math.round(c * (100 + percent) / 100)));
  r = adj(r); g = adj(g); b = adj(b);
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
