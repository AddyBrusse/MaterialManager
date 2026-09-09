import type { CandidateLine } from '@stockmanager/shared'

/**
 * Het vergelijken van een gelezen mail met het goede antwoord —
 * features/62-mail-import-ai-ontwerp.md §5.
 *
 * Apart van het script omdat een scorer die zelf niet klopt erger is dan geen
 * scorer: hij zou een verslechtering als winst kunnen rapporteren. Alles hier is
 * zuivere rekenkunde op twee objecten, dus het is gewoon te testen — zie
 * __tests__/mail-score.test.ts.
 *
 * De regel die alles bij elkaar houdt: **er wordt alleen gekeken naar velden die
 * in `verwacht.json` staan.** Een fixture die niets zegt over `certificaat`
 * blijft geldig als dat veld er later bij komt.
 */
export interface VerwachteRegel {
  tekening?: string | null
  qty?: number | null
  prijs?: number | null
  rev?: string | null
  positie?: number | null
  materiaal?: string | null
  materiaalDoorKlant?: boolean | null
  certificaat?: string | null
  klantArtikel?: string | null
  omschrijving?: string | null
  bestanden?: string[]
}

export interface Verwacht {
  intent?: string
  document?: string | null
  klantRef?: string | null
  leverdatum?: string | null
  regels?: VerwachteRegel[]
}

/** Alleen letters en cijfers: punt, streep en underscore verschillen per systeem. */
export function sleutel(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Losse spaties en hoofdletters mogen verschillen; de inhoud niet. */
function tekstGelijk(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    v === null || v === undefined ? '' : String(v).toLowerCase().replace(/\s+/g, ' ').trim()
  return norm(a) === norm(b)
}

export function gelijk(verwacht: unknown, gekregen: unknown): boolean {
  if (verwacht === null) return gekregen === null || gekregen === undefined
  if (typeof verwacht === 'number') return typeof gekregen === 'number' && Math.abs(verwacht - gekregen) < 0.005
  if (typeof verwacht === 'boolean') return verwacht === gekregen
  return tekstGelijk(verwacht, gekregen)
}

function toon(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export class Telling {
  goed = 0
  totaal = 0
  readonly missers: string[] = []

  check(label: string, verwacht: unknown, gekregen: unknown): void {
    this.totaal++
    if (gelijk(verwacht, gekregen)) this.goed++
    else this.missers.push(`${label}: verwacht ${toon(verwacht)}, kreeg ${toon(gekregen)}`)
  }

  /** Bestanden zijn een verzameling: volgorde doet er niet toe, compleetheid wel. */
  checkBestanden(label: string, verwacht: string[], gekregen: string[]): void {
    const heb = new Set(gekregen.map(sleutel))
    const mis = verwacht.filter((v) => !heb.has(sleutel(v)))
    const teveel = gekregen.filter((g) => !verwacht.some((v) => sleutel(v) === sleutel(g)))
    for (const v of verwacht) {
      this.totaal++
      if (heb.has(sleutel(v))) this.goed++
    }
    if (mis.length) this.missers.push(`${label}: mist ${mis.join(', ')}`)
    if (teveel.length) this.missers.push(`${label}: te veel ${teveel.join(', ')}`)
  }
}

export function scoreRegels(t: Telling, verwacht: VerwachteRegel[], gekregen: CandidateLine[]): void {
  t.check('aantal regels', verwacht.length, gekregen.length)

  const nogOver = [...gekregen]
  for (const v of verwacht) {
    const idx = nogOver.findIndex(
      (g) => sleutel(g.tekening) === sleutel(v.tekening) || sleutel(g.ruweTekst).includes(sleutel(v.tekening))
    )
    const label = `regel ${v.tekening ?? '?'}`
    if (idx < 0) {
      t.totaal++
      t.missers.push(`${label}: niet teruggevonden in de gelezen regels`)
      continue
    }
    t.totaal++
    t.goed++
    const g = nogOver.splice(idx, 1)[0]! as unknown as Record<string, unknown>

    for (const [veld, waarde] of Object.entries(v)) {
      if (veld === 'tekening') continue
      if (veld === 'bestanden') {
        const namen = ((g.bestanden ?? []) as { filename: string }[]).map((b) => b.filename)
        t.checkBestanden(`${label} bestanden`, waarde as string[], namen)
        continue
      }
      t.check(`${label} ${veld}`, waarde, g[veld])
    }
  }

  for (const g of nogOver) {
    t.totaal++
    t.missers.push(`regel te veel: ${g.tekening ?? g.ruweTekst.slice(0, 60)}`)
  }
}

