// Kanban planning data — machines (columns), a ~6-month horizon of WORKDAYS
// (rows), and generated production orders → cards. Standalone (window.KB);
// reuses the StaalTrack visual tokens + machine vocabulary.

// --- Project/order colour: deterministic accent per order id --------------
const KB_PALETTE = [
  "#2d6df6", "#16a34a", "#d97706", "#9333ea",
  "#0891b2", "#dc2626", "#0d9488", "#7c3aed",
  "#ca8a04", "#4f46e5", "#be185d", "#0369a1",
];
function kbKleur(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return KB_PALETTE[Math.abs(h) % KB_PALETTE.length];
}

// --- Machines (columns) with a finite daily capacity (minutes) ------------
// Most capped at 7h (420). A couple differ (zaag faster, boor a 6h cell).
const KB_MACHINES = [
  { id: "laser", naam: "Lasersnijden",  sub: "TruLaser 3030",   icon: "layers", capMin: 420 },
  { id: "zaag",  naam: "Zaagmachine",   sub: "Kasto KASTOwin",  icon: "tool",   capMin: 480 },
  { id: "kant",  naam: "Kantbank",      sub: "TruBend 5130",    icon: "tool",   capMin: 420 },
  { id: "draai", naam: "Draaibank",     sub: "DMG CTX beta",    icon: "cpu",    capMin: 420 },
  { id: "frees", naam: "Freescentrum",  sub: "Hermle C32",      icon: "cpu",    capMin: 420 },
  { id: "boor",  naam: "Kolomboor",     sub: "Ibarmia ZVH",     icon: "cpu",    capMin: 360 },
  { id: "las",   naam: "Lasrobot",      sub: "MIG/MAG cel",     icon: "bolt",   capMin: 450 },
];
const KB_MACHINE_MAP = Object.fromEntries(KB_MACHINES.map((m) => [m.id, m]));

// --- Calendar -------------------------------------------------------------
const KB_MND  = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const KB_MNDL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const KB_DAG  = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const KB_DAGL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

const KB_TODAY = new Date(2026, 5, 22); // Mon 22 jun 2026
function kbMondayOf(d) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
const KB_START = kbMondayOf(KB_TODAY);
const KB_WEEKS = 26; // ~6 months rolling

// Build the workday list (Mon–Fri), one entry per row.
const KB_DAYS = [];
(function buildDays() {
  for (let w = 0; w < KB_WEEKS; w++) {
    for (let dow = 0; dow < 5; dow++) {
      const d = new Date(KB_START);
      d.setDate(d.getDate() + w * 7 + dow);
      KB_DAYS.push({ date: d, week: w, dow });
    }
  }
})();

function kbWeekNr(d) {
  const t = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  t.setDate(t.getDate() - dayNr + 3);
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const diff = t - firstThursday;
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}
function kbSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const KB_TODAY_IDX = Math.max(0, KB_DAYS.findIndex((x) => kbSameDay(x.date, KB_TODAY)));

function kbFmtDay(idx) {
  const e = KB_DAYS[idx];
  if (!e) return { dow: "", dnum: "", mon: "", wk: "", date: null, week: 0 };
  const d = e.date;
  return { dow: KB_DAG[d.getDay()], dnum: d.getDate(), mon: KB_MND[d.getMonth()], wk: kbWeekNr(d), date: d, week: e.week };
}
function kbFmtDate(idx) {
  const f = kbFmtDay(idx);
  if (!f.date) return "—";
  return `${f.dow} ${f.dnum} ${f.mon}`;
}
function kbFmtDateLong(idx) {
  const e = KB_DAYS[idx];
  if (!e) return "—";
  const d = e.date;
  return `${KB_DAGL[d.getDay()]} ${d.getDate()} ${KB_MNDL[d.getMonth()]} ${d.getFullYear()}`;
}

// Duration: minutes -> "Hu MMm".
function kbDur(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0 && m > 0) return `${h}u ${String(m).padStart(2, "0")}`;
  if (h > 0) return `${h}u`;
  return `${m}m`;
}

// --- Generator ------------------------------------------------------------
function kbMulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _rnd = kbMulberry32(20260622);
const _pick = (arr) => arr[Math.floor(_rnd() * arr.length)];
const _ri = (a, b) => Math.floor(_rnd() * (b - a + 1)) + a;
const _clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const KB_KLANTEN = [
  ["Vermeulen Machinebouw", "VER"], ["Bakker Constructies", "BAK"], ["Damen Shipyards", "DMN"],
  ["VDL Groep", "VDL"], ["Holtkamp Engineering", "HOL"], ["Mammoet", "MAM"], ["Royal IHC", "IHC"],
  ["Terberg Special Vehicles", "TER"], ["Beumer Group", "BEU"], ["Aalbers Metaal", "AAL"],
  ["Konings Mechanica", "KON"], ["Hoogendoorn Staalbouw", "HGD"], ["Geurts Industries", "GEU"],
  ["Van Halteren Technologies", "VHT"], ["Kampen Metaal", "KMP"], ["Lensen Toelevering", "LEN"],
  ["Wesselink Apparatenbouw", "WES"], ["Frencken Group", "FRE"], ["Nedstaal B.V.", "NED"],
  ["Rovsing Staalbouw", "ROV"], ["Brouwer Precisie", "BRP"], ["Dijkstra Metaaltechniek", "DMT"],
];
const KB_PARTS = [
  "As Ø40 × 480", "Flensplaat Ø300", "Tandwiel Z=32", "Hijsoog 12-ton", "Lagerblok LB-90",
  "Koppelstuk K-220", "Klembeugel UB-80", "Geleidingsrail 1200", "Adapterplaat A4", "Spindelhuis SH-6",
  "Drukring Ø160", "Excenteras E-18", "Stortkoker-flens 600", "Trekoog 10T", "Borgplaat BP-12",
  "Afstandsbus Ø60", "Keerschijf KS-40", "Naafflens NF-5", "Steunconsole SC-30", "Pasbus Ø75",
  "Drijfstang DS-220", "Nokkenas NA-8", "Kruiskoppeling KK-50", "Montageframe MF-3", "Tussenas TA-14",
  "Geleidebus GB-22", "Spanflens SF-90", "Kruktap KT-6", "Reductiehuis RH-4", "Aandrijfas Ø55 × 620",
];
// Realistic machining routes (sequence of machines a part passes through).
const KB_CHAINS = [
  ["zaag", "draai", "frees", "boor"],
  ["laser", "kant", "las"],
  ["laser", "frees", "boor"],
  ["zaag", "draai", "frees"],
  ["laser", "kant", "boor", "las"],
  ["zaag", "frees"],
  ["draai", "frees", "boor"],
  ["laser", "las"],
  ["zaag", "draai"],
  ["laser", "kant", "frees", "las"],
];
const KB_DUREN = [45, 60, 75, 90, 120, 150, 180, 210, 240, 300, 360, 420];
const KB_QTYS  = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 40, 60];

const KB_ORDERS = [];
const KB_CARDS = [];
const N_ORDERS = 70;
const LAST = KB_DAYS.length - 1;

for (let i = 0; i < N_ORDERS; i++) {
  const [klant, abbr] = _pick(KB_KLANTEN);
  const part = _pick(KB_PARTS);
  const id = `P-24${String(100 + i).padStart(3, "0")}`;
  const tekBase = `${abbr}-${_ri(1000, 9999)}`;
  const qty = _pick(KB_QTYS);
  const kleur = kbKleur(id);
  const chain = _pick(KB_CHAINS);

  // Deadline weighted toward the near term so the first weeks read busy.
  const deadlineIdx = _clamp(Math.floor(Math.pow(_rnd(), 1.5) * LAST), 3, LAST);
  KB_ORDERS.push({ id, klant, abbr, part, tekening: tekBase, qty, kleur, deadlineIdx, stappen: chain.length });

  // Lay the route's steps in a tight window a few days before the deadline.
  const span = chain.length + _ri(0, 3);
  let cursor = deadlineIdx - span;
  chain.forEach((m, si) => {
    const duur = _pick(KB_DUREN);
    const unplanned = _rnd() < 0.15; // ~15% land in "Te plannen"
    let planDayIdx = null, planMachine = null;
    if (!unplanned) {
      planDayIdx = _clamp(cursor, 0, LAST);
      planMachine = m;
      cursor += _ri(0, 1); // step forward, occasionally same day → overbooking
    }
    KB_CARDS.push({
      id: `${id}-S${si + 1}`,
      orderId: id, klant, abbr, part,
      tekening: `${tekBase}-${String(si + 1).padStart(2, "0")}`,
      kleur, qty,
      machine: m, volgorde: si + 1, stappen: chain.length,
      duurMin: duur,
      deadlineIdx,
      planDayIdx, planMachine,
    });
  });
}
const KB_ORDER_MAP = Object.fromEntries(KB_ORDERS.map((o) => [o.id, o]));

// --- Derived helpers ------------------------------------------------------
function kbCellCards(cards, machine, dayIdx) {
  return cards
    .filter((c) => c.planMachine === machine && c.planDayIdx === dayIdx)
    .sort((a, b) => (a.orderId === b.orderId ? a.volgorde - b.volgorde : a.orderId.localeCompare(b.orderId)));
}
function kbCellLoad(cards, machine, dayIdx) {
  let m = 0;
  for (const c of cards) if (c.planMachine === machine && c.planDayIdx === dayIdx) m += c.duurMin;
  return m;
}
function kbBacklog(cards) {
  return cards.filter((c) => c.planDayIdx == null);
}
// Working days from today until a card's deadline (negative = overdue).
function kbDaysLeft(deadlineIdx) {
  return deadlineIdx - KB_TODAY_IDX;
}

window.KB = {
  PALETTE: KB_PALETTE, kleur: kbKleur,
  MACHINES: KB_MACHINES, MACHINE_MAP: KB_MACHINE_MAP,
  DAYS: KB_DAYS, WEEKS: KB_WEEKS, TODAY_IDX: KB_TODAY_IDX,
  MND: KB_MND, DAG: KB_DAG, DAGL: KB_DAGL,
  fmtDay: kbFmtDay, fmtDate: kbFmtDate, fmtDateLong: kbFmtDateLong, weekNr: kbWeekNr, dur: kbDur,
  ORDERS: KB_ORDERS, ORDER_MAP: KB_ORDER_MAP, CARDS: KB_CARDS,
  cellCards: kbCellCards, cellLoad: kbCellLoad, backlog: kbBacklog, daysLeft: kbDaysLeft,
};
