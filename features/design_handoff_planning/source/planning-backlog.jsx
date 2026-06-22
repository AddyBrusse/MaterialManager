// Backlog panel — "Te plannen": unplanned steps, filter by project,
// sort by default/deadline, draggable cards onto the Gantt.

function Backlog({ steps, projectFilter, setProjectFilter, sortBy, setSortBy,
                   selectedProject, onSelectStep, onDragStartStep, onDragEndStep,
                   draggingId }) {
  const { PROJECT_MAP, fmtDur, TODAY_IDX } = window.PLAN;

  const projects = Array.from(new Set(steps.map((s) => s.projectId)));
  let list = steps.slice();
  if (projectFilter !== "all") list = list.filter((s) => s.projectId === projectFilter);
  if (sortBy === "deadline") list.sort((a, b) => a.deadline - b.deadline);
  else list.sort((a, b) => (a.projectId === b.projectId ? a.volgorde - b.volgorde : a.projectId.localeCompare(b.projectId)));

  return (
    <div className="backlog">
      <div className="backlog-head">
        <div className="backlog-title">
          <Ic d={Icon.inbox} size={16} />
          <span className="t">Te plannen</span>
          <span className="n">{steps.length}</span>
        </div>
        <div className="backlog-sub">Sleep een stap op de tijdlijn om te plannen</div>
        <div className="backlog-controls">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">Alle projecten</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p} · {PROJECT_MAP[p].klant}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ maxWidth: 96 }}>
            <option value="default">Standaard</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>
      </div>

      <div className="backlog-list">
        {list.length === 0 && <div className="bl-empty">Niets te plannen — alles is ingepland.</div>}
        {list.map((s) => {
          const dl = s.deadline - TODAY_IDX;
          const urgent = dl <= 4;
          const linked = selectedProject && s.projectId === selectedProject;
          const dimmed = selectedProject && s.projectId !== selectedProject;
          return (
            <div
              key={s.id}
              className={"bl-card" + (draggingId === s.id ? " dragging" : "")
                + (linked ? " proj-linked" : "") + (dimmed ? " dimmed" : "")}
              style={{ "--proj": s.kleur }}
              draggable
              onDragStart={(e) => onDragStartStep(e, s)}
              onDragEnd={onDragEndStep}
              onClick={() => onSelectStep(s)}>
              <div className="bl-card-top">
                <span className="bl-dot"></span>
                <span className="bl-proj">{s.projectId}</span>
                <span className="bl-mach">{window.PLAN.MACHINE_NAAM[s.machine]}</span>
              </div>
              <div className="bl-name">{s.artikel}</div>
              <div className="bl-meta">
                <span className="dur">{s.isPlaceholder ? "~" : ""}{fmtDur(s.duurMin)}</span>
                <span>·</span>
                <span>{s.qty} st</span>
                <span style={{ flex: 1 }}></span>
                <span className={"dl" + (urgent ? " urgent" : "")}>
                  <Ic d={Icon.calendar} size={11} />
                  {window.PLAN.fmtDayShort(s.deadline)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Backlog });
