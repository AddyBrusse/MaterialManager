// Shared icons + small primitives (no JSX in this file -- pure JS)

const Icon = {
  // Stroke icons, 16x16
  search: 'M14 14l-3.5-3.5M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z',
  plus: 'M8 3v10M3 8h10',
  chevronDown: 'M4 6l4 4 4-4',
  chevronRight: 'M6 4l4 4-4 4',
  chevronUp: 'M4 10l4-4 4 4',
  filter: 'M2 4h12M4 8h8M6 12h4',
  download: 'M8 2v8m0 0l-3-3m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1',
  upload: 'M8 10V2m0 0L5 5m3-3l3 3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1',
  more: 'M3 8h.01M8 8h.01M13 8h.01',
  close: 'M3 3l10 10M13 3L3 13',
  check: 'M3 8l3 3 7-7',
  warning: 'M8 5v3.5M8 11v.01M2.5 13h11L8 2.5 2.5 13z',
  arrowUp: 'M8 13V3m0 0L4 7m4-4l4 4',
  arrowDown: 'M8 3v10m0 0l4-4m-4 4l-4-4',
  inbox: 'M2 9l1.5-5h9L14 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V9zm0 0h4l1 2h2l1-2h4',
  box: 'M2 5l6-3 6 3M2 5l6 3 6-3M2 5v6l6 3 6-3V5M8 8v6',
  settings: 'M8 5.5v.01M8 10.5v.01M5.5 8h.01M10.5 8h.01M3.5 3.5l.01.01M12.5 3.5l-.01.01M3.5 12.5l.01-.01M12.5 12.5l-.01-.01M11.5 8a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z',
  layers: 'M8 2L2 5l6 3 6-3-6-3zM2 9l6 3 6-3M2 12l6 3 6-3',
  bell: 'M4 11V8a4 4 0 018 0v3l1 2H3l1-2zM6.5 13.5a1.5 1.5 0 003 0',
  scan: 'M3 6V4a1 1 0 011-1h2M10 3h2a1 1 0 011 1v2M13 10v2a1 1 0 01-1 1h-2M6 13H4a1 1 0 01-1-1v-2M3 8h10',
  pkg: 'M2 5l6-3 6 3v6l-6 3-6-3V5zM2 5l6 3m0 0l6-3M8 8v7',
  list: 'M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01',
  grid: 'M3 3h4v4H3V3zm6 0h4v4H9V3zM3 9h4v4H3V9zm6 0h4v4H9V9z',
  user: 'M8 8a3 3 0 100-6 3 3 0 000 6zM3 14a5 5 0 0110 0',
  shield: 'M8 2l5 2v4c0 3-2.5 5-5 6-2.5-1-5-3-5-6V4l5-2z',
  bolt: 'M9 2L4 9h3l-1 5 5-7H8l1-5z',
  map: 'M2 4l4-1 4 1 4-1v10l-4 1-4-1-4 1V4zM6 3v10M10 4v10',
  bookmark: 'M3 2h10v12l-5-3-5 3V2z',
  history: 'M8 4v4l3 2M2.5 8a5.5 5.5 0 109.5-3.8M2.5 8V4M2.5 8h4',
  qrcode: 'M2 2h5v5H2V2zm0 7h2v2H2V9zm0 4h2v1H2v-1zm4-3h1v3H6v-3zM9 2h5v5H9V2zm0 7h5v1H9V9zm0 3h2v2H9v-2zm3 0h2v2h-2v-2zM4 4h1v1H4V4zm7 0h1v1h-1V4z',
};

function Ic({ d, size = 16, sw = 1.5, ...rest }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={d} />
    </svg>
  );
}

// Small SVG icons for the steel type cells (filled, monochrome glyphs).
function TypeGlyph({ kind, size = 16 }) {
  const s = size;
  const stroke = "currentColor";
  const sw = 1.4;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "plate":
      return (
        <svg {...common}>
          <path d="M3 9l5-3 13 3-5 3z" />
          <path d="M3 9v3l13 3v-3" />
        </svg>
      );
    case "tube":
      return (
        <svg {...common}>
          <ellipse cx="6" cy="12" rx="3" ry="6" />
          <path d="M6 6h12M6 18h12" />
          <ellipse cx="18" cy="12" rx="3" ry="6" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="0.5" />
          <rect x="6" y="9" width="12" height="6" rx="0.5" />
        </svg>
      );
    case "ipe":
      return (
        <svg {...common}>
          <path d="M5 4h14M5 20h14M12 4v16" />
        </svg>
      );
    case "hea":
      return (
        <svg {...common}>
          <path d="M6 4v16M18 4v16M6 12h12" />
        </svg>
      );
    case "u":
      return (
        <svg {...common}>
          <path d="M6 4v16h12M6 4h4M14 4h4" />
        </svg>
      );
    case "angle":
      return (
        <svg {...common}>
          <path d="M5 4v16h14M5 20l2-2M5 4h2v14" />
        </svg>
      );
    case "bar":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="6" />
        </svg>
      );
    case "round":
      return (
        <svg {...common}>
          <ellipse cx="6" cy="12" rx="3" ry="6" />
          <path d="M6 6h12" /><path d="M6 18h12" />
          <ellipse cx="18" cy="12" rx="2.4" ry="6" />
        </svg>
      );
    default:
      return <Ic d={Icon.box} size={size} />;
  }
}

Object.assign(window, { Icon, Ic, TypeGlyph });
