import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Loader } from '@mantine/core'
import { kaderUitPunten, type Kader } from '../../utils/verbeterpunt'
import { KADER_KLEUR } from '../../services/verbeterpunt/schermafbeelding'

interface Props {
  beeld: Blob | null
  bezig: boolean
  fout: string | null
  kaders: Kader[]
  onKaders: (k: Kader[]) => void
}

/**
 * De schermafbeelding met rode kaders erop: slepen = een kader om wat je bedoelt.
 * Kaders zijn fracties van het beeld, dus ze kloppen ook als het venster een
 * andere maat heeft dan de afbeelding zelf.
 */
export function Schets({ beeld, bezig, fout, kaders, onKaders }: Props) {
  const url = useMemo(() => (beeld ? URL.createObjectURL(beeld) : null), [beeld])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const vlak = useRef<HTMLDivElement>(null)
  const [begin, setBegin] = useState<{ x: number; y: number } | null>(null)
  const [nu, setNu] = useState<{ x: number; y: number } | null>(null)

  function punt(e: PointerEvent): { x: number; y: number } {
    const r = vlak.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  if (!url) {
    return (
      <div className="vp-schets-leeg">
        {bezig ? <><Loader size="sm" /><span>Schermafbeelding maken…</span></>
          : fout ? <span>De schermafbeelding lukte niet ({fout}). Plak er zelf een met Ctrl+V, of verstuur zonder.</span>
          : <span>Geen schermafbeelding. Plak er een met Ctrl+V, of verstuur zonder.</span>}
      </div>
    )
  }

  const bezigKader = begin && nu ? kaderUitPunten(begin, nu) : null
  return (
    <div className="vp-schets">
      <div className="vp-schets-vlak" ref={vlak}>
        <img src={url} alt="Schermafbeelding van de pagina" draggable={false} />
        <svg
          className="vp-schets-laag"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          data-testid="schets-laag"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setBegin(punt(e)); setNu(punt(e)) }}
          onPointerMove={(e) => { if (begin) setNu(punt(e)) }}
          onPointerUp={(e) => {
            const k = begin ? kaderUitPunten(begin, punt(e)) : null
            if (k) onKaders([...kaders, k])
            setBegin(null); setNu(null)
          }}
        >
          {[...kaders, ...(bezigKader ? [bezigKader] : [])].map((k, i) => (
            <rect key={i} x={k.x} y={k.y} width={k.b} height={k.h} fill="none"
              stroke={KADER_KLEUR} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
    </div>
  )
}
