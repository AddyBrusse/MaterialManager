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
  calc: 'M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm1 2h6v2.5H5V4zm0 4.5h1.5V10H5V8.5zm0 3h1.5V13H5v-1.5zm3-3h1.5V10H8V8.5zm0 3h1.5V13H8v-1.5zm3-3h1.5V13H11V8.5z',
  file: 'M4 2h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm5 0v3h3',
  tool: 'M10.5 2.5a3 3 0 00-3.9 3.6L2.5 10.2a1.2 1.2 0 001.7 1.7l4.1-4.1a3 3 0 003.6-3.9l-1.8 1.8-1.6-.4-.4-1.6 1.8-1.8z',
  cpu: 'M5 5h6v6H5V5zM6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2',
  truck: 'M2 4h8v6H2V4zm8 2h2.5L14 8v2h-4M4.5 12.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zm7 0a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z',
  tag: 'M2.5 2.5h4.2a1 1 0 01.7.3l5.8 5.8a1 1 0 010 1.4l-3.2 3.2a1 1 0 01-1.4 0L2.8 7.4a1 1 0 01-.3-.7V2.5zm2.2 2.2h.01',
  edit: 'M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z',
  trash: 'M3 4h10M6.5 4V2.5h3V4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1L12 4M6.5 7v4M9.5 7v4',
  ruler: 'M2.5 9.5l7-7 4 4-7 7-4-4zm2-2l1 1m1-3l1.5 1.5m1-3.5l1 1',
  copy: 'M5 5h7v7H5V5zM3 11V3a1 1 0 011-1h7',
  link: 'M6.5 9.5l3-3M5.5 8L4 9.5a2 2 0 102.8 2.8L8.5 11M10.5 8L12 6.5a2 2 0 10-2.8-2.8L7.5 5',
  euro: 'M11 4.2a4 4 0 100 7.6M3.5 7h5M3.5 9h5',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  calendar: 'M3 4h10v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 3h10M5.5 2v3M10.5 2v3',
  zoomIn: 'M7 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM7 5v3M5.5 6.5h3M13.5 13.5l-3.5-3.5',
  zoomOut: 'M7 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM5.5 6.5h3M13.5 13.5l-3.5-3.5',
  undo: 'M5 5L2.5 7.5 5 10M2.5 7.5H10a3.5 3.5 0 010 7H7',
  target: 'M8 14A6 6 0 108 2a6 6 0 000 12zM8 11a3 3 0 100-6 3 3 0 000 6zM8 7.5v.01',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z',
  eyeOff: 'M6.5 4a5.6 5.6 0 011.5-.2c4 0 6.5 4.2 6.5 4.2a11 11 0 01-1.8 2.2M4 5.2A11 11 0 001.5 8S4 12.2 8 12.2c.9 0 1.7-.2 2.4-.4M2 2l12 12M7 7a1.5 1.5 0 002 2',
  ghost: 'M3 13V7a5 5 0 0110 0v6l-1.5-1.2-1.5 1.2-1.5-1.2L9 13l-1.5-1.2L6 13l-1.5-1.2L3 13zM6.5 6.5v.01M9.5 6.5v.01',
  layersStack: 'M8 2L2 5l6 3 6-3-6-3z',
  arrowRight: 'M3 8h10m0 0l-4-4m4 4l-4 4',
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
