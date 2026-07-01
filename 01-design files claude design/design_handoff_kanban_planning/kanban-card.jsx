// Kanban card — used in the backlog and inside board cells. Project-coloured
// left sliver + light tint. Bold production number on top, then part,
// drawing nr, customer, delivery + machining time.

function KanbanCard({ card, dimmed, linked, selected, onSelect, onDragStart, onDragEnd, compact }) {
  const K = window.KB;
  const left = K.daysLeft(card.deadlineIdx);
  const dlClass = left < 0 ? "late" : left <= 4 ? "urgent" : "";
  const dl = K.fmtDay(card.deadlineIdx);

  return (
    <div
      className={"kc" + (selected ? " is-selected" : "") + (linked ? " linked" : "") + (dimmed ? " dimmed" : "")}
      style={{ "--c": card.kleur }}
      draggable
      data-order-id={card.orderId}
      data-card-id={card.id}
      data-vol={card.volgorde}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onSelect(card); }}
      title={`${card.orderId} · ${card.part} · ${card.tekening}`}
    >
      <div className="kc-head">
        <span className="kc-prodnr">{card.orderId}</span>
        <span className="kc-mach">{K.MACHINE_MAP[card.machine].naam.slice(0, 4)}</span>
      </div>
      <div className="kc-part">{card.part}</div>
      <div className="kc-tek">{card.tekening}</div>
      {!compact && <div className="kc-klant">{card.klant}</div>}
      <div className="kc-meta">
        <span className="m"><Ic d={Icon.clock} size={11} /><span className="dur">{K.dur(card.duurMin)}</span></span>
        <span className={"m dl " + dlClass}>
          <Ic d={Icon.calendar} size={11} />
          {left < 0 ? "te laat" : `${dl.dnum} ${dl.mon}`}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { KanbanCard });
