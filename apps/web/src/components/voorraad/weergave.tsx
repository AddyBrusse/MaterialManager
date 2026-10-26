import { IconCircle, IconSquare, IconMinus, IconTestPipe } from '@tabler/icons-react'
import type { RawMaterialRow } from '../../api/raw-materials'

// Gedeeld door de voorraadtabel, de groepsregel van een exoot en de laden op
// de Voorraad-pagina.

// v = remaining mm, min = threshold mm, orig = original length mm
export function statusFor(v: number, min: number, orig: number) {
  if (v === 0)              return { tag: 'uit',  label: 'Verbruikt',   cls: 'danger' }
  if (v < min)              return { tag: 'laag', label: 'Kort',        cls: 'warn'   }
  if (v >= orig * 0.85)     return { tag: 'vol',  label: 'Volledig',    cls: 'info'   }
  return                           { tag: 'ok',   label: 'In gebruik',  cls: 'ok'     }
}

/**
 * De status waarop het filter werkt. Een exoot op 0 die nooit binnen was is
 * niet verbruikt maar "nog niet binnen" (2026-10-16): eerder heetten beide
 * "Te bestellen", ook een plaat die allang gezaagd was.
 */
export function statusTag(r: RawMaterialRow): string {
  if (r.exoot && r.exootStand === 'niet_binnen') return 'nietbinnen'
  return statusFor(Number(r.currentStock), Number(r.minStock) || 0, Number(r.lengthMm)).tag
}

/** Format mm as "x,xxx m" (3 decimal places, Dutch locale) */
export function fmm(mm: number) {
  return (mm / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 3 }) + ' m'
}

export function formatRelative(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'vandaag'
  if (d === 1) return 'gisteren'
  if (d < 7)  return `${d}d geleden`
  if (d < 30) return `${Math.floor(d / 7)}w geleden`
  return `${Math.floor(d / 30)}m geleden`
}

export function TypeGlyph({ volumeFormula, size = 16 }: { volumeFormula: string; size?: number }) {
  switch (volumeFormula) {
    case 'round':  return <IconCircle   size={size} />
    case 'square': return <IconSquare   size={size} />
    case 'tube':   return <IconTestPipe size={size} />
    default:       return <IconMinus    size={size} />
  }
}
