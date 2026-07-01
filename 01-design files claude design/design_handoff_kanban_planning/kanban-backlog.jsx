// Te plannen (backlog) — unplanned cards grouped on the left. Drag onto the
// board to plan; drag a planned card back here to unplan. Filter + sort.

function KanbanBacklog({
  cards, dens, machineFilter, setMachineFilter, sortBy, setSortBy,
  selectedId, selectedOrder, selStyle, onSelect, onDragStart, onDragEnd,
  draggingId, onDropBacklog,
}) {
  const K = window.KB;
  const [over, setOver] = React.useState(false);
  const dimOthers = selStyle === "dimmen" || selStyle === "lijnen";
  const ringLinked = selStyle === "markeren" || selStyle === "lijnen";

  let list = K.backlog(cards);
  if (machineFilter !== "all") list = list.filter((c) => c.machine === machineFilter);
  list = list.slice().sort((a, b) => {
    if (sortBy === "deadline") return a.deadlineIdx - b.deadlineIdx;
    if (sortBy === "duur") return b.duurMin - a.duurMin;
    if (sortBy === "klant") return a.klant.localeCompare(b.klant);
    return a.orderId === b.orderId ? a.volgorde - b.volgorde : a.orderId.localeCompare(b.orderId);
  });

  const totalMin = list.reduce((s, c) => s + c.duurMin, 0);

  return (
    <aside className="kb-backlog">
      <div className="kb-bl-head">
        <div className="kb-bl-title">
          <Ic d={Icon.inbox} size={16} />
          <span className="t">Te plannen</span>
          <span className="n">{list.length}</span>
        </div>
        <div className="kb-bl-sub">{K.dur(totalMin)} aan bewerkingstijd · sleep naar een machine + dag</div>
        <div className="kb-bl-controls">
          <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
            <option value="all">Alle machines</option>
            {K.MACHINES.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="default">Order</option>
            <option value="deadline">Leverdatum</option>
            <option value="duur">Tijd</option>
            <option value="klant">Klant</option>
          </select>
        </div>
      </div>

      <div
        className={"kb-bl-list" + (over ? " drop-active" : "")}
        onDragOver={(e) => { if (draggingId) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); onDropBacklog(); }}
      >
        {list.length === 0 && (
          <div className="kb-bl-empty">
            {machineFilter === "all"
              ? "Alles is ingepland 🎉"
              : "Geen open bewerkingen voor deze machine."}
          </div>
        )}
        {list.map((c) => (
          <KanbanCard
            key={c.id} card={c} dens={dens}
            selected={selectedId === c.id}
            dimmed={selectedOrder && dimOthers && c.orderId !== selectedOrder}
            linked={selectedOrder && ringLinked && c.orderId === selectedOrder && c.id !== selectedId}
            onSelect={onSelect}
            onDragStart={onDragStart} onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </aside>
  );
}

Object.assign(window, { KanbanBacklog });
