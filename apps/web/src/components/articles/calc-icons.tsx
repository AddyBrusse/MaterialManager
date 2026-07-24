// Icon set + primitives for the article-detail calculator, ported from the
// design handoff (icons.jsx) so the calculator UI matches the spec exactly.

export const Icon: Record<string, string> = {
  chevronRight: 'M6 4l4 4-4 4',
  plus: 'M8 3v10M3 8h10',
  layers: 'M8 2L2 5l6 3 6-3-6-3zM2 9l6 3 6-3M2 12l6 3 6-3',
  tool: 'M10.5 2.5a3 3 0 00-3.9 3.6L2.5 10.2a1.2 1.2 0 001.7 1.7l4.1-4.1a3 3 0 003.6-3.9l-1.8 1.8-1.6-.4-.4-1.6 1.8-1.8z',
  cpu: 'M5 5h6v6H5V5zM6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2',
  truck: 'M2 4h8v6H2V4zm8 2h2.5L14 8v2h-4M4.5 12.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zm7 0a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  bolt: 'M9 2L4 9h3l-1 5 5-7H8l1-5z',
  trash: 'M3 4h10M6.5 4V2.5h3V4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1L12 4M6.5 7v4M9.5 7v4',
  copy: 'M5 5h7v7H5V5zM3 11V3a1 1 0 011-1h7',
  download: 'M8 2v8m0 0l-3-3m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1',
  edit: 'M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z',
  check: 'M3 8l3 3 7-7',
  user: 'M8 8a3 3 0 100-6 3 3 0 000 6zM3 14a5 5 0 0110 0',
  ruler: 'M2.5 9.5l7-7 4 4-7 7-4-4zm2-2l1 1m1-3l1.5 1.5m1-3.5l1 1',
  euro: 'M11 4.2a4 4 0 100 7.6M3.5 7h5M3.5 9h5',
  pkg: 'M2 5l6-3 6 3v6l-6 3-6-3V5zM2 5l6 3m0 0l6-3M8 8v7',
  calc: 'M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm1 2h6v2.5H5V4zm0 4.5h1.5V10H5V8.5zm0 3h1.5V13H5v-1.5zm3-3h1.5V10H8V8.5zm0 3h1.5V13H8v-1.5zm3-3h1.5V13H11V8.5z',
  file: 'M4 2h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm5 0v3h3',
  history: 'M8 4v4l3 2M2.5 8a5.5 5.5 0 109.5-3.8M2.5 8V4M2.5 8h4',
  box: 'M2 5l6-3 6 3M2 5l6 3 6-3M2 5v6l6 3 6-3V5M8 8v6',
  pin: 'M8 1.5a4.5 4.5 0 014.5 4.5c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 018 1.5zM8 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  chevronDown: 'M4 6l4 4 4-4',
}

interface IcProps extends React.SVGAttributes<SVGSVGElement> {
  d: string
  size?: number
  sw?: number
}

export function Ic({ d, size = 16, sw = 1.5, ...rest }: IcProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={d} />
    </svg>
  )
}

export type GlyphKind = 'plate' | 'tube' | 'box' | 'ipe' | 'hea' | 'u' | 'angle' | 'bar' | 'round'

export function TypeGlyph({ kind, size = 16 }: { kind?: GlyphKind | string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'plate':
      return (
        <svg {...common}>
          <path d="M3 9l5-3 13 3-5 3z" />
          <path d="M3 9v3l13 3v-3" />
        </svg>
      )
    case 'tube':
      return (
        <svg {...common}>
          <ellipse cx="6" cy="12" rx="3" ry="6" />
          <path d="M6 6h12M6 18h12" />
          <ellipse cx="18" cy="12" rx="3" ry="6" />
        </svg>
      )
    case 'box':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="0.5" />
          <rect x="6" y="9" width="12" height="6" rx="0.5" />
        </svg>
      )
    case 'ipe':
      return (
        <svg {...common}>
          <path d="M5 4h14M5 20h14M12 4v16" />
        </svg>
      )
    case 'hea':
      return (
        <svg {...common}>
          <path d="M6 4v16M18 4v16M6 12h12" />
        </svg>
      )
    case 'u':
      return (
        <svg {...common}>
          <path d="M6 4v16h12M6 4h4M14 4h4" />
        </svg>
      )
    case 'angle':
      return (
        <svg {...common}>
          <path d="M5 4v16h14M5 20l2-2M5 4h2v14" />
        </svg>
      )
    case 'bar':
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="6" />
        </svg>
      )
    case 'round':
      return (
        <svg {...common}>
          <ellipse cx="6" cy="12" rx="3" ry="6" />
          <path d="M6 6h12" /><path d="M6 18h12" />
          <ellipse cx="18" cy="12" rx="2.4" ry="6" />
        </svg>
      )
    default:
      return <Ic d={Icon.box} size={size} />
  }
}
