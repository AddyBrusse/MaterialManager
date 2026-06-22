// Planning board mock data (Dutch) — projects, production orders, steps,
// machines, capacity + offerte (ghost) workload. Standalone; reuses the
// StaalTrack visual tokens.

// --- Project color: deterministic accent per project id -------------------
// 8-color palette, hashed from the project id. Color = PROJECT (not step),
// consistent everywhere the project appears.
const PROJECT_PALETTE = [
  "#2d6df6", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#dc2626", "#0d9488", "#7c3aed",
];
function projectKleur(projectId) {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 31 + projectId.charCodeAt(i)) | 0;
  }
  return PROJECT_PALETTE[Math.abs(h) % PROJECT_PALETTE.length];
}

// --- Capacity constants ---------------------------------------------------
const EFFECTIEVE_MIN = 294; // 4.9 h/day effective (70% efficiency)
const MAX_MIN = 420;        // 7 h/day hard cap
const WERKDAGEN = 5;        // per week

// --- Time model -----------------------------------------------------------
// Window: Mon 15 Jun 2026 .. Sun 19 Jul 2026 (5 weeks). Today = 22 Jun (idx 7).
const WINDOW_START = new Date(2026, 5, 15); // June = month 5
const TOTAL_DAYS = 35;
const TODAY_IDX = 7;

const MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const DAG_LANG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

function dateFromIdx(i) {
  const d = new Date(WINDOW_START);
  d.setDate(d.getDate() + i);
  return d;
}
function fmtDay(i) {
  const d = dateFromIdx(i);
  return `${DAG[d.getDay()]} ${d.getDate()} ${MND[d.getMonth()]}`;
}
function fmtDayShort(i) {
  const d = dateFromIdx(i);
  return `${d.getDate()} ${MND[d.getMonth()]}`;
}
function isWeekend(i) {
  const dow = dateFromIdx(i).getDay();
  return dow === 0 || dow === 6;
}
function weekNr(i) {
  // ISO-ish week number for label
  const d = dateFromIdx(i);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

// --- Machines (rows) ------------------------------------------------------
const MACHINES = [
  { id: "laser", naam: "Lasersnijden", sub: "TruLaser 3030", icon: "layers" },
  { id: "kant",  naam: "Kantbank",     sub: "TruBend 5130",  icon: "tool" },
  { id: "draai", naam: "Draaibank",    sub: "DMG CTX beta",  icon: "cpu" },
  { id: "frees", naam: "Freescentrum", sub: "Hermle C32",    icon: "cpu" },
  { id: "boor",  naam: "Kolomboor",    sub: "Ibarmia",       icon: "cpu" },
  { id: "las",   naam: "Lasrobot",     sub: "MIG/MAG",       icon: "bolt" },
  { id: "zaag",  naam: "Zaagmachine",  sub: "Kasto",         icon: "tool" },
  { id: "geen",  naam: "Geen machine", sub: "Niet toegewezen", icon: "pkg" },
];
const MACHINE_NAAM = Object.fromEntries(MACHINES.map((m) => [m.id, m.naam]));

// --- Projects + steps -----------------------------------------------------
// Authored for a busy-but-readable multi-week board. Each step:
//  { machine, volgorde, duurMin, planDay (idx|null=backlog), gereed(bool),
//    placeholder(bool) }. planMachine defaults to machine.
const PROJECT_SPECS = [
  {
    id: "P-2401", klant: "Vermeulen Machinebouw", artikel: "VER-3105 · As Ø40 × 480",
    qty: 12, deadline: 12,
    steps: [
      { machine: "zaag",  v: 1, duur: 90,  day: 2,  gereed: true },
      { machine: "draai", v: 2, duur: 240, day: 5,  gereed: true },
      { machine: "frees", v: 3, duur: 180, day: 8 },
      { machine: "boor",  v: 4, duur: 120, day: 10 },
    ],
  },
  {
    id: "P-2402", klant: "Bakker Constructies", artikel: "BAK-1156 · Hijsoog 12-ton",
    qty: 8, deadline: 14,
    steps: [
      { machine: "laser", v: 1, duur: 200, day: 6, gereed: false }, // achterstand (past, not done)
      { machine: "frees", v: 2, duur: 300, day: 9 },
      { machine: "boor",  v: 3, duur: 150, day: 11 },
    ],
  },
  {
    id: "P-2403", klant: "Damen Shipyards", artikel: "DMN-4001 · Bolder-fundering",
    qty: 4, deadline: 16,
    steps: [
      { machine: "laser", v: 1, duur: 260, day: 8 },
      { machine: "kant",  v: 2, duur: 180, day: 10 },
      { machine: "las",   v: 3, duur: 420, day: 12 },
    ],
  },
  {
    id: "P-2404", klant: "VDL Groep", artikel: "VDL-5013 · Montagebeugel UB-80",
    qty: 40, deadline: 11,
    steps: [
      { machine: "laser", v: 1, duur: 150, day: 7 },
      { machine: "kant",  v: 2, duur: 220, day: 9 },
    ],
  },
  {
    id: "P-2405", klant: "Holtkamp Engineering", artikel: "HOL-7012 · Tandwiel Z=32",
    qty: 6, deadline: 19,
    steps: [
      { machine: "zaag",  v: 1, duur: 60,  day: 9 },
      { machine: "draai", v: 2, duur: 300, day: 11 },
      { machine: "frees", v: 3, duur: 360, day: 14 },
    ],
  },
  {
    id: "P-2406", klant: "Mammoet", artikel: "MAM-3055 · Heflug 50-ton",
    qty: 2, deadline: 22,
    steps: [
      { machine: "laser", v: 1, duur: 380, day: 13 },
      { machine: "frees", v: 2, duur: 420, day: 16 },
      { machine: "boor",  v: 3, duur: 180, day: 18, placeholder: true },
    ],
  },
  {
    id: "P-2407", klant: "Royal IHC", artikel: "IHC-1142 · Stortkoker-flens 600",
    qty: 5, deadline: 18,
    steps: [
      { machine: "laser", v: 1, duur: 240, day: 12 },
      { machine: "boor",  v: 2, duur: 200, day: 15 },
      { machine: "las",   v: 3, duur: 300, day: 17 },
    ],
  },
  {
    id: "P-2408", klant: "Terberg Special Vehicles", artikel: "TER-2203 · Trekoog 10T",
    qty: 10, deadline: 15,
    steps: [
      { machine: "laser", v: 1, duur: 180, day: 4, gereed: true },
      { machine: "frees", v: 2, duur: 240, day: 13 },
      { machine: "boor",  v: 3, duur: 120, day: null }, // backlog
    ],
  },
  {
    id: "P-2409", klant: "Beumer Group", artikel: "BEU-8420 · Rollagerblok",
    qty: 7, deadline: 20,
    steps: [
      { machine: "frees", v: 1, duur: 280, day: 19 },
      { machine: "boor",  v: 2, duur: 160, day: null }, // backlog
    ],
  },
  {
    id: "P-2410", klant: "Aalbers Metaal", artikel: "AAL-6450 · Trapboomklem",
    qty: 15, deadline: 13,
    steps: [
      { machine: "laser", v: 1, duur: 160, day: null }, // backlog
      { machine: "kant",  v: 2, duur: 200, day: null, placeholder: true }, // backlog
      { machine: "las",   v: 3, duur: 240, day: null }, // backlog
    ],
  },
];

// Flatten into a STEPS array with absolute fields + a derived PROJECTS map.
const STEPS = [];
const PROJECTS = PROJECT_SPECS.map((p) => {
  const kleur = projectKleur(p.id);
  const proj = {
    id: p.id, klant: p.klant, artikel: p.artikel, qty: p.qty,
    deadline: p.deadline, kleur,
    stapTotaal: p.steps.length,
  };
  p.steps.forEach((s, i) => {
    const id = `${p.id}-S${s.v}`;
    STEPS.push({
      id,
      projectId: p.id,
      klant: p.klant,
      artikel: p.artikel,
      kleur,
      naam: `Stap ${s.v} · ${MACHINE_NAAM[s.machine]}`,
      machine: s.machine,
      volgorde: s.v,
      duurMin: s.duur,
      planDay: s.day == null ? null : s.day,
      planMachine: s.day == null ? null : s.machine,
      gereed: !!s.gereed,
      gereedOp: s.gereed ? fmtDayShort(Math.max(0, (s.day ?? 0))) : null,
      gereedDoor: s.gereed ? pickWorker(i) : null,
      isPlaceholder: !!s.placeholder,
      deadline: p.deadline,
      qty: p.qty,
    });
  });
  return proj;
});
const PROJECT_MAP = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

function pickWorker(i) {
  const w = ["M. Bakker", "J. de Wit", "S. Visser", "R. Jansen"];
  return w[i % w.length];
}

// Duration formatter: minutes -> "Hu MMm" / "MMm".
function fmtDur(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0 && m > 0) return `${h}u ${m}m`;
  if (h > 0) return `${h}u`;
  return `${m}m`;
}

// --- Derived helpers ------------------------------------------------------
function stepsForMachine(machineId, opts = {}) {
  return STEPS.filter((s) => s.planDay != null && s.planMachine === machineId
    && (opts.showDone || !s.gereed));
}
const BACKLOG = STEPS.filter((s) => s.planDay == null);

// Achterstand: planned in the past (before today), still not done.
function achterstanden() {
  return STEPS.filter((s) => s.planDay != null && !s.gereed && s.planDay < TODAY_IDX);
}

// Volgorde-warning: a scheduled step that starts before a lower-volgorde
// sibling of the same project that is neither done nor scheduled earlier.
function volgordeWarn(step) {
  if (step.planDay == null) return false;
  return STEPS.some((o) =>
    o.projectId === step.projectId &&
    o.volgorde < step.volgorde &&
    !o.gereed &&
    (o.planDay == null || o.planDay >= step.planDay));
}

// Per-machine weekly capacity (minutes scheduled in a given week index).
function machineWeekLoad(machineId, weekIdx) {
  const start = weekIdx * 7, end = start + 7;
  let min = 0;
  STEPS.forEach((s) => {
    if (s.planMachine === machineId && s.planDay != null && !s.gereed
        && s.planDay >= start && s.planDay < end) min += s.duurMin;
  });
  return min;
}
function capStatus(min) {
  const cap = EFFECTIEVE_MIN * WERKDAGEN;
  const max = MAX_MIN * WERKDAGEN;
  if (min > max) return "over";
  if (min > cap) return "warn";
  return "ok";
}

// --- Offerte / ghost workload (projected, not committed) ------------------
// berekenOffertebelasting: projected extra minutes per machine per week from
// open offertes. Used for the ghost-planning overlay.
const OFFERTES = [
  { id: "OFF-7781", klant: "Konings Mechanica", kans: 0.7, week: 2, belasting: { laser: 320, kant: 180 } },
  { id: "OFF-7790", klant: "Damen Shipyards",   kans: 0.5, week: 3, belasting: { laser: 260, las: 400, frees: 220 } },
  { id: "OFF-7802", klant: "VDL Groep",          kans: 0.8, week: 3, belasting: { laser: 300, kant: 260 } },
  { id: "OFF-7811", klant: "Mammoet",            kans: 0.4, week: 4, belasting: { frees: 480, boor: 240 } },
  { id: "OFF-7818", klant: "Bakker Constructies",kans: 0.6, week: 4, belasting: { laser: 220, frees: 300 } },
];
function ghostLoad(machineId, weekIdx) {
  let min = 0;
  OFFERTES.forEach((o) => {
    if (o.week === weekIdx && o.belasting[machineId]) min += o.belasting[machineId] * o.kans;
  });
  return Math.round(min);
}

// --- KPI summary ----------------------------------------------------------
function kpis() {
  const week = 1; // "this week" = window week index 1 (contains TODAY)
  let planned = 0, capacityTotal = 0;
  MACHINES.forEach((m) => {
    if (m.id === "geen") return;
    planned += machineWeekLoad(m.id, week);
    capacityTotal += EFFECTIEVE_MIN * WERKDAGEN;
  });
  const bezetting = Math.round((planned / capacityTotal) * 100);
  const leverDeze = PROJECTS.filter((p) => p.deadline >= week * 7 && p.deadline < week * 7 + 7).length;
  return {
    geplandeUren: (planned / 60).toFixed(1),
    bezetting,
    achterstand: achterstanden().length,
    teplannen: BACKLOG.length,
    leveringen: leverDeze,
  };
}

window.PLAN = {
  PROJECT_PALETTE, projectKleur,
  EFFECTIEVE_MIN, MAX_MIN, WERKDAGEN,
  WINDOW_START, TOTAL_DAYS, TODAY_IDX,
  dateFromIdx, fmtDay, fmtDayShort, isWeekend, weekNr, DAG, DAG_LANG, MND,
  MACHINES, MACHINE_NAAM,
  STEPS, PROJECTS, PROJECT_MAP, BACKLOG,
  stepsForMachine, achterstanden, volgordeWarn,
  machineWeekLoad, capStatus, OFFERTES, ghostLoad, kpis, fmtDur,
};
