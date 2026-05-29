// Mock data for steel inventory tracker (Dutch)

const STEEL_TYPES = [
  { id: "plaat", name: "Plaat", icon: "plate" },
  { id: "buis", name: "Buis", icon: "tube" },
  { id: "koker", name: "Koker", icon: "box" },
  { id: "ipe", name: "IPE-profiel", icon: "ipe" },
  { id: "hea", name: "HEA-profiel", icon: "hea" },
  { id: "heb", name: "HEB-profiel", icon: "hea" },
  { id: "unp", name: "UNP-profiel", icon: "u" },
  { id: "hoek", name: "Hoekstaal", icon: "angle" },
  { id: "stafstaal", name: "Stafstaal", icon: "bar" },
  { id: "rondstaal", name: "Rondstaal", icon: "round" },
];

const GRADES = ["S235JR", "S275JR", "S355J2", "S355MC", "S460M", "C45", "42CrMo4"];
const LOCATIONS = [
  "Hal A · Stelling 01", "Hal A · Stelling 02", "Hal A · Stelling 03",
  "Hal A · Stelling 04", "Hal A · Stelling 05",
  "Hal B · Vak 12", "Hal B · Vak 14", "Hal B · Vak 17", "Hal B · Vak 21",
  "Hal C · Buitenopslag", "Hal C · Rek 03", "Hal C · Rek 08",
  "Hal D · Knipvoorraad", "Werkplaats · Voorraadkast",
];
const SUPPLIERS = ["Tata Steel NL", "ArcelorMittal", "Voestalpine", "SSAB Benelux", "Salzgitter", "Outokumpu", "Riva Group"];
const FINISHES = ["Blank", "Gestraald", "Verzinkt", "Gepoedercoat", "Primer", "Geslepen"];
const CUSTOMERS = [
  "Bakker Constructies",
  "Metaalbouw Heuvelman",
  "Vermeulen Machinebouw",
  "Damen Shipyards",
  "VDL Groep",
  "Aalbers Metaal",
  "Holtkamp Engineering",
  "Beumer Group",
  "Konings Mechanica",
  "Royal IHC",
  "Terberg Special Vehicles",
  "Mammoet",
];
const OPERATIONS = [
  { id: "laser",   name: "Lasersnijden" },
  { id: "kant",    name: "Kanten" },
  { id: "draai",   name: "Draaien" },
  { id: "frees",   name: "Frezen" },
  { id: "boor",    name: "Boren" },
  { id: "las",     name: "Lassen" },
  { id: "pons",    name: "Ponsen" },
  { id: "zaag",    name: "Zagen" },
];

function pick(arr, i) { return arr[i % arr.length]; }
function rng(seed) {
  // Mulberry32
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildItems() {
  const rand = rng(7);
  const items = [];

  // Plates
  const platen = [
    ["3", "1500x3000"], ["4", "1500x3000"], ["5", "1500x3000"], ["6", "1500x3000"],
    ["8", "1500x3000"], ["10", "1500x3000"], ["12", "1500x3000"], ["15", "1500x3000"],
    ["20", "2000x6000"], ["25", "2000x6000"], ["30", "2000x6000"], ["40", "2000x6000"],
    ["50", "2000x6000"],
  ];
  platen.forEach(([t, dims]) => items.push({
    type: "plaat", naam: `Plaat ${t} mm`, afmeting: dims, dikte: +t,
  }));

  // Tubes round
  const buizen = [
    ["21.3", "2.6"], ["26.9", "2.6"], ["33.7", "3.2"], ["42.4", "3.2"],
    ["48.3", "3.6"], ["60.3", "3.6"], ["76.1", "3.6"], ["88.9", "4.0"],
    ["114.3", "4.5"], ["139.7", "5.0"], ["168.3", "5.6"], ["219.1", "6.3"],
  ];
  buizen.forEach(([d, w]) => items.push({
    type: "buis", naam: `Buis Ø${d} × ${w}`, afmeting: `L 6000`, dikte: +w,
  }));

  // Kokers
  const kokers = [
    ["30x30x3"], ["40x40x3"], ["40x40x4"], ["50x50x3"], ["50x50x4"], ["60x60x4"],
    ["70x70x5"], ["80x80x4"], ["80x80x6"], ["100x100x5"], ["100x100x8"],
    ["120x80x4"], ["140x80x5"], ["160x80x5"], ["200x100x6"],
  ];
  kokers.forEach((k) => items.push({
    type: "koker", naam: `Koker ${k[0]}`, afmeting: "L 6000",
  }));

  // IPE
  ["80","100","120","140","160","180","200","220","240","270","300","330","360","400","450","500"].forEach((p) =>
    items.push({ type: "ipe", naam: `IPE ${p}`, afmeting: "L 12000" })
  );
  // HEA
  ["100","120","140","160","180","200","220","240","260","280","300","340"].forEach((p) =>
    items.push({ type: "hea", naam: `HEA ${p}`, afmeting: "L 12000" })
  );
  // HEB
  ["100","120","140","160","180","200","240","280"].forEach((p) =>
    items.push({ type: "heb", naam: `HEB ${p}`, afmeting: "L 12000" })
  );
  // UNP
  ["50","80","100","120","140","160","180","200","240"].forEach((p) =>
    items.push({ type: "unp", naam: `UNP ${p}`, afmeting: "L 6000" })
  );
  // Hoeken
  [["30x30x3"],["40x40x4"],["50x50x5"],["60x60x6"],["70x70x7"],["80x80x8"],["100x100x10"],["120x120x12"]].forEach((h) =>
    items.push({ type: "hoek", naam: `Hoekstaal ${h[0]}`, afmeting: "L 6000" })
  );
  // Stafstaal
  [["20x10"],["25x12"],["30x15"],["40x20"],["50x10"],["50x20"],["60x30"],["80x40"]].forEach((s) =>
    items.push({ type: "stafstaal", naam: `Platstaal ${s[0]}`, afmeting: "L 6000" })
  );
  // Rondstaal
  ["10","12","16","20","25","30","40","50","60","80","100"].forEach((r) =>
    items.push({ type: "rondstaal", naam: `Rondstaal Ø${r}`, afmeting: "L 6000" })
  );

  // Enrich
  return items.map((it, i) => {
    const id = `ST-${String(10000 + i).padStart(5, "0")}`;
    const grade = pick(GRADES, Math.floor(rand() * GRADES.length));
    const loc = pick(LOCATIONS, Math.floor(rand() * LOCATIONS.length));
    const supplier = pick(SUPPLIERS, Math.floor(rand() * SUPPLIERS.length));
    // Finish — mostly blank, some treated. Coated/zinc finishes only make
    // sense for profiles and tubes, not freshly delivered plates.
    const finishPool = ["plaat","stafstaal","rondstaal"].includes(it.type)
      ? ["Blank","Blank","Blank","Gestraald","Geslepen"]
      : ["Blank","Blank","Verzinkt","Gepoedercoat","Primer","Gestraald"];
    const afwerking = pick(finishPool, Math.floor(rand() * finishPool.length));
    const min = 4 + Math.floor(rand() * 20);
    const max = 80 + Math.floor(rand() * 200);
    let stock = Math.floor(rand() * (max + 20));
    // Skew distribution so most are healthy, some low/out
    if (rand() < 0.12) stock = Math.floor(rand() * min); // low
    if (rand() < 0.05) stock = 0; // out
    const reserved = Math.min(stock, Math.floor(rand() * 8));
    const eenheid = ["plaat","buis","koker","ipe","hea","heb","unp","hoek","stafstaal","rondstaal"].includes(it.type)
      ? (it.type === "plaat" ? "stuks" : "stuks") : "stuks";
    const kgPerUnit =
      it.type === "plaat" ? +(it.dikte * 7.85 * 4.5).toFixed(1)
      : it.type === "buis" ? +(20 + rand() * 80).toFixed(1)
      : it.type === "koker" ? +(30 + rand() * 60).toFixed(1)
      : +(60 + rand() * 240).toFixed(1);
    const daysAgo = Math.floor(rand() * 60);
    return {
      id, ...it, grade, locatie: loc, leverancier: supplier,
      voorraad: stock, gereserveerd: reserved, min, max,
      eenheid, kg: kgPerUnit, afwerking,
      heatNr: `H${Math.floor(100000 + rand() * 899999)}`,
      laatsteMutatie: daysAgo === 0 ? "vandaag" : daysAgo === 1 ? "gisteren" : `${daysAgo} dagen geleden`,
      laatsteMutatieDays: daysAgo,
      prijs: +(0.85 + rand() * 2.4).toFixed(2),
    };
  });
}

// === Articles — finished/semi-finished products kept in stock per customer
// to reduce lead time. Each article has a fixed customer & operation chain.
function buildArticles() {
  const rand = rng(31);
  const families = [
    // [customer, articles[]]
    ["Bakker Constructies", [
      ["BAK-1042", "Frame-plaat A1",          ["laser","kant"],     "Plaat 8 mm",      "S235JR"],
      ["BAK-1043", "Frame-plaat A2",          ["laser","kant"],     "Plaat 8 mm",      "S235JR"],
      ["BAK-1156", "Hijsoog 12-ton",          ["laser","frees","boor"], "Plaat 25 mm", "S355J2"],
      ["BAK-1201", "Console L-150",           ["laser","kant","las"], "Plaat 10 mm",   "S355J2"],
      ["BAK-1208", "Console L-220",           ["laser","kant","las"], "Plaat 10 mm",   "S355J2"],
    ]],
    ["Metaalbouw Heuvelman", [
      ["HVM-2210", "Steunpoot 90°",           ["laser","kant"],     "Plaat 6 mm",      "S235JR"],
      ["HVM-2215", "Steunpoot 45°",           ["laser","kant"],     "Plaat 6 mm",      "S235JR"],
      ["HVM-2380", "Eindplaat 200×200",       ["laser","boor"],     "Plaat 12 mm",     "S355J2"],
      ["HVM-2384", "Eindplaat 250×250",       ["laser","boor"],     "Plaat 15 mm",     "S355J2"],
    ]],
    ["Vermeulen Machinebouw", [
      ["VER-3104", "As Ø40 × 320",            ["draai","frees"],    "Rondstaal Ø50",   "42CrMo4"],
      ["VER-3105", "As Ø40 × 480",            ["draai","frees"],    "Rondstaal Ø50",   "42CrMo4"],
      ["VER-3220", "Flens DN100",             ["draai","boor"],     "Plaat 20 mm",     "S355J2"],
      ["VER-3221", "Flens DN150",             ["draai","boor"],     "Plaat 25 mm",     "S355J2"],
      ["VER-3450", "Lagerblok 80",            ["frees","boor"],     "Plaat 30 mm",     "C45"],
    ]],
    ["Damen Shipyards", [
      ["DMN-4001", "Bolder-fundering",        ["laser","kant","las"], "Plaat 20 mm",  "S355J2"],
      ["DMN-4014", "Knieplaat KP-12",         ["laser"],            "Plaat 15 mm",     "S355J2"],
      ["DMN-4015", "Knieplaat KP-16",         ["laser"],            "Plaat 20 mm",     "S355J2"],
      ["DMN-4302", "Schaarblok",              ["laser","frees"],    "Plaat 40 mm",     "S355J2"],
    ]],
    ["VDL Groep", [
      ["VDL-5012", "Montagebeugel UB-50",     ["laser","kant"],     "Plaat 4 mm",      "S235JR"],
      ["VDL-5013", "Montagebeugel UB-80",     ["laser","kant"],     "Plaat 5 mm",      "S235JR"],
      ["VDL-5240", "Versteviging V-3",        ["laser"],            "Plaat 6 mm",      "S355MC"],
      ["VDL-5601", "Klemstrip 40×6",          ["laser","boor"],     "Platstaal 40x6",  "S235JR"],
    ]],
    ["Aalbers Metaal", [
      ["AAL-6080", "Hoekplaat 90°",           ["laser","kant"],     "Plaat 5 mm",      "S235JR"],
      ["AAL-6120", "Sluitplaat",              ["laser"],            "Plaat 3 mm",      "S235JR"],
      ["AAL-6450", "Trapboomklem",            ["laser","kant","las"], "Plaat 10 mm",   "S355J2"],
    ]],
    ["Holtkamp Engineering", [
      ["HOL-7011", "Tandwiel Z=24",           ["draai","frees"],    "Rondstaal Ø100",  "C45"],
      ["HOL-7012", "Tandwiel Z=32",           ["draai","frees"],    "Rondstaal Ø120",  "C45"],
      ["HOL-7330", "Schroefdraadbus M30",     ["draai"],            "Rondstaal Ø50",   "C45"],
    ]],
    ["Beumer Group", [
      ["BEU-8104", "Geleidingsbeugel L-200",  ["laser","kant"],     "Plaat 8 mm",      "S355J2"],
      ["BEU-8105", "Geleidingsbeugel L-300",  ["laser","kant"],     "Plaat 8 mm",      "S355J2"],
      ["BEU-8420", "Rollagerblok",            ["frees","boor"],     "Plaat 25 mm",     "S355J2"],
    ]],
    ["Konings Mechanica", [
      ["KON-9011", "Smoorplaat Ø80",          ["laser"],            "Plaat 4 mm",      "S355MC"],
      ["KON-9012", "Smoorplaat Ø120",         ["laser"],            "Plaat 4 mm",      "S355MC"],
    ]],
    ["Royal IHC", [
      ["IHC-1142", "Stortkoker-flens 600",    ["laser","boor","las"], "Plaat 30 mm", "S355J2"],
      ["IHC-1188", "Versterking VS-440",      ["laser","kant"],     "Plaat 20 mm",     "S460M"],
      ["IHC-1322", "Pijpklem DN200",          ["laser","kant","las"], "Plaat 8 mm",   "S355J2"],
    ]],
    ["Terberg Special Vehicles", [
      ["TER-2202", "Trekoog 5T",              ["laser","frees","boor"], "Plaat 30 mm", "S355J2"],
      ["TER-2203", "Trekoog 10T",             ["laser","frees","boor"], "Plaat 40 mm", "S355J2"],
      ["TER-2410", "Bumpersteun",             ["laser","kant","las"], "Plaat 8 mm",   "S355MC"],
    ]],
    ["Mammoet", [
      ["MAM-3050", "Heflug 32-ton",           ["laser","frees","boor"], "Plaat 50 mm", "S355J2"],
      ["MAM-3055", "Heflug 50-ton",           ["laser","frees","boor"], "Plaat 60 mm", "S460M"],
    ]],
  ];

  const out = [];
  families.forEach(([klant, arr]) => {
    arr.forEach(([nr, naam, ops, grondstof, grade]) => {
      const min = 4 + Math.floor(rand() * 12);
      const max = 30 + Math.floor(rand() * 80);
      let stock = Math.floor(rand() * (max + 10));
      if (rand() < 0.18) stock = Math.floor(rand() * min);
      if (rand() < 0.06) stock = 0;
      const reserved = Math.min(stock, Math.floor(rand() * 5));
      const daysProd = Math.floor(rand() * 80);
      const daysNext = Math.floor(rand() * 20) + 1;
      const tek = `TK-${String(Math.floor(1000 + rand() * 8999))}`;
      out.push({
        id: nr,
        naam,
        klant,
        bewerkingen: ops,
        grondstof,
        grade,
        voorraad: stock,
        gereserveerd: reserved,
        min, max,
        locatie: pick(LOCATIONS, Math.floor(rand() * LOCATIONS.length)),
        tekening: tek,
        rev: pick(["A","B","C"], Math.floor(rand() * 3)),
        prijs: +(8 + rand() * 240).toFixed(2),
        looptijd: 2 + Math.floor(rand() * 12),
        laatsteProductie: daysProd === 0 ? "vandaag" : daysProd === 1 ? "gisteren" : `${daysProd} dgn geleden`,
        laatsteProductieDays: daysProd,
        volgendePlanning: rand() < 0.55 ? `over ${daysNext} dgn` : null,
      });
    });
  });
  return out;
}

const ARTICLES = buildArticles();

const ITEMS = buildItems();

const RECENT_RECEIPTS = [
  { nr: "ONT-2026-0418", datum: "26 mei 2026", leverancier: "Tata Steel NL", regels: 8, kg: 4280, status: "verwerkt" },
  { nr: "ONT-2026-0417", datum: "26 mei 2026", leverancier: "ArcelorMittal", regels: 3, kg: 1120, status: "open" },
  { nr: "ONT-2026-0416", datum: "25 mei 2026", leverancier: "Voestalpine", regels: 12, kg: 8950, status: "verwerkt" },
  { nr: "ONT-2026-0415", datum: "25 mei 2026", leverancier: "SSAB Benelux", regels: 5, kg: 2240, status: "verwerkt" },
  { nr: "ONT-2026-0414", datum: "24 mei 2026", leverancier: "Salzgitter", regels: 7, kg: 3675, status: "verwerkt" },
  { nr: "ONT-2026-0413", datum: "24 mei 2026", leverancier: "Riva Group", regels: 4, kg: 1560, status: "concept" },
  { nr: "ONT-2026-0412", datum: "23 mei 2026", leverancier: "Outokumpu", regels: 9, kg: 5210, status: "verwerkt" },
  { nr: "ONT-2026-0411", datum: "23 mei 2026", leverancier: "Tata Steel NL", regels: 2, kg: 480, status: "verwerkt" },
];

window.STEEL = {
  ITEMS, ARTICLES, STEEL_TYPES, GRADES, LOCATIONS, SUPPLIERS, RECENT_RECEIPTS,
  FINISHES, CUSTOMERS, OPERATIONS,
};
