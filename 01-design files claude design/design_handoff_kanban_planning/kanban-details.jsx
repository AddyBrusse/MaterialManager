// Kanban details — collapsible right panel. Drawing preview + link, links to
// the parent order and article, full task facts, and the route's steps.

function KanbanDetails({ card, collapsed, onToggle, onFlashLink, onUnplan }) {
  const K = window.KB;

  if (collapsed) {
    return (
      <aside className="kb-details collapsed">
        <div className="kb-det-head">
          <button className="kb-det-collapse" onClick={onToggle} title="Details tonen">
            <Ic d={Icon.chevronRight} size={15} />
          </button>
        </div>
        <div className="kb-det-rail">Details</div>
      </aside>
    );
  }

  return (
    <aside className="kb-details">
      <div className="kb-det-head">
        <span className="t">{card ? "Taakdetails" : "Details"}</span>
        <button className="kb-det-collapse" onClick={onToggle} title="Inklappen">
          <Ic d={Icon.chevronRight} size={15} />
        </button>
      </div>

      {!card ? (
        <div className="kb-det-empty">
          <span className="ic"><Ic d={Icon.list} size={18} /></span>
          <div>Selecteer een kaart om de tekening,<br />het project en de details te zien.</div>
        </div>
      ) : (
        <DetailBody card={card} onFlashLink={onFlashLink} onUnplan={onUnplan} />
      )}
    </aside>
  );
}

function DetailBody({ card, onFlashLink, onUnplan }) {
  const K = window.KB;
  const order = K.ORDER_MAP[card.orderId];
  const left = K.daysLeft(card.deadlineIdx);
  const planned = card.planDayIdx != null;
  const machine = K.MACHINE_MAP[card.machine];

  // route steps for this order
  const steps = K.CARDS.filter((c) => c.orderId === card.orderId)
    .sort((a, b) => a.volgorde - b.volgorde);

  const dlClass = left < 0 ? "late" : left <= 4 ? "warn" : "";

  return (
    <div className="kb-det-body" style={{ "--c": card.kleur }}>
      {/* drawing preview */}
      <div className="kb-drawing">
        <span className="corner" style={{ top: 10, left: 10, borderRight: 0, borderBottom: 0 }} />
        <span className="corner" style={{ top: 10, right: 10, borderLeft: 0, borderBottom: 0 }} />
        <span className="corner" style={{ bottom: 10, left: 10, borderRight: 0, borderTop: 0 }} />
        <span className="corner" style={{ bottom: 10, right: 10, borderLeft: 0, borderTop: 0 }} />
        <span className="label">tekening · preview</span>
        <span className="num">{card.tekening}</span>
        <button className="btn sm openbtn" onClick={() => onFlashLink(`Tekening ${card.tekening} openen…`)}>
          <Ic d={Icon.file} size={13} /> Open
        </button>
      </div>

      {/* title */}
      <div className="kb-det-title">
        <span className="sliver" />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{card.part}</div>
          <div className="sub">{card.tekening}</div>
        </div>
      </div>

      <div className="kb-det-badges">
        {planned
          ? <span className="badge info sm"><span className="dot" />Ingepland</span>
          : <span className="badge warn sm"><span className="dot" />Te plannen</span>}
        {left < 0 && <span className="badge danger sm"><span className="dot" />Te laat</span>}
        {left >= 0 && left <= 4 && <span className="badge warn sm">{left === 0 ? "Vandaag leveren" : left + " werkdg."}</span>}
        <span className="badge sm">Stap {card.volgorde}/{card.stappen}</span>
      </div>

      {/* facts */}
      <div className="kb-det-grid">
        <div className="kb-det-row"><span className="k">Onderdeel</span><span className="v">{card.part}</span></div>
        <div className="kb-det-row"><span className="k">Tekeningnr.</span><span className="v mono">{card.tekening}</span></div>
        <div className="kb-det-row"><span className="k">Klant</span><span className="v">{card.klant}</span></div>
        <div className="kb-det-row"><span className="k">Aantal</span><span className="v mono">{card.qty} st</span></div>
        <div className="kb-det-row"><span className="k">Machine</span><span className="v">{machine.naam}</span></div>
        <div className="kb-det-row"><span className="k">Bewerkingstijd</span><span className="v mono">{K.dur(card.duurMin)}</span></div>
        <div className="kb-det-row">
          <span className="k">Gepland op</span>
          <span className="v">{planned ? K.fmtDateLong(card.planDayIdx) : "niet ingepland"}</span>
        </div>
        <div className="kb-det-row">
          <span className="k">Leverdatum</span>
          <span className={"v mono " + dlClass}>{K.fmtDate(card.deadlineIdx)}{left < 0 ? " · te laat" : ""}</span>
        </div>
      </div>

      {/* links */}
      <div className="kb-det-section-label">Snel naar</div>
      <div className="kb-link-row" onClick={() => onFlashLink(`Tekening ${card.tekening} openen…`)}>
        <span className="ic"><Ic d={Icon.file} size={15} /></span>
        <span className="lk"><span className="l1">Open tekening</span><span className="l2">{card.tekening}.pdf</span></span>
        <span className="chev"><Ic d={Icon.arrowRight} size={14} /></span>
      </div>
      <div className="kb-link-row" onClick={() => onFlashLink(`Naar order ${order.id}`)}>
        <span className="ic" style={{ color: card.kleur, background: "color-mix(in srgb, " + card.kleur + " 14%, var(--bg-2))" }}>
          <Ic d={Icon.layers} size={15} />
        </span>
        <span className="lk"><span className="l1">Order {order.id}</span><span className="l2">{order.klant} · {order.stappen} bewerkingen</span></span>
        <span className="chev"><Ic d={Icon.arrowRight} size={14} /></span>
      </div>
      <div className="kb-link-row" onClick={() => onFlashLink(`Naar artikel ${card.tekening.split("-").slice(0, 2).join("-")}`)}>
        <span className="ic"><Ic d={Icon.tag} size={15} /></span>
        <span className="lk"><span className="l1">Artikel {card.part}</span><span className="l2">Stamgegevens & calculatie</span></span>
        <span className="chev"><Ic d={Icon.arrowRight} size={14} /></span>
      </div>

      {/* route */}
      <div className="kb-det-section-label">Route ({steps.length} bewerkingen)</div>
      <div className="kb-steps">
        {steps.map((s) => (
          <div key={s.id} className={"kb-step" + (s.id === card.id ? " cur" : "")}>
            <span className="v">{s.volgorde}</span>
            <span className="mn">{K.MACHINE_MAP[s.machine].naam}</span>
            <span className={"st" + (s.planDayIdx != null ? " planned" : "")}>
              {s.planDayIdx != null ? K.fmtDate(s.planDayIdx) : "te plannen"}
            </span>
          </div>
        ))}
      </div>

      {planned && (
        <div className="kb-det-actions">
          <button className="btn" onClick={() => onUnplan(card)}>
            <Ic d={Icon.undo} size={13} /> Terug naar te plannen
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { KanbanDetails });
