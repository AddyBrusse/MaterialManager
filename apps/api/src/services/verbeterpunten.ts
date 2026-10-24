import fs from 'fs'
import path from 'path'
import { zipSync, strToU8 } from 'fflate'
import type { VerbeterpuntContext } from '@stockmanager/shared'
import { config } from '../config'
import { AppError } from '../middleware/error'

/**
 * Verbeterpunten (knop "Dit klopt niet", 2026-10-24): de schermafbeelding op
 * schijf en de export voor wie de punten oppakt.
 *
 * Eén map, één bestand per punt, genoemd naar het id van de todo. Net als bij
 * tekeningen staat in de database alleen het pad (backend/25-file-storage.md).
 */
const MAP = 'verbeterpunten'

/** Een schermafbeelding van een groot scherm op 2× is een paar MB; dit laat ruimte. */
export const MAX_SCHERMAFBEELDING = 15 * 1024 * 1024

const EXTENSIE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Schrijft de afbeelding weg en geeft het pad terug zoals de browser het opvraagt. */
export function bewaarSchermafbeelding(id: string, inhoud: Buffer, mime: string): string {
  const ext = EXTENSIE[mime]
  if (!ext) throw new AppError(400, 'VALIDATION', 'Een schermafbeelding moet een png-, jpg- of webp-afbeelding zijn. Er is niets opgeslagen.')
  const map = path.join(config.uploadsDir, MAP)
  fs.mkdirSync(map, { recursive: true })
  fs.writeFileSync(path.join(map, `${id}.${ext}`), inhoud)
  return `/uploads/${MAP}/${id}.${ext}`
}

/** Het bestand achter een opgeslagen pad — alleen binnen de eigen map, nooit daarbuiten. */
export function bestandVoor(pad: string | null): string | null {
  const voor = `/uploads/${MAP}/`
  if (!pad?.startsWith(voor)) return null
  const naam = pad.slice(voor.length)
  if (!naam || naam !== path.basename(naam)) return null
  return path.join(config.uploadsDir, MAP, naam)
}

export function verwijderSchermafbeelding(pad: string | null): void {
  const bestand = bestandVoor(pad)
  if (bestand) fs.rmSync(bestand, { force: true })
}

interface ExportPunt {
  id: string
  title: string
  createdAt: Date
  createdByName: string
  paginaUrl: string | null
  paginaNaam: string | null
  context: VerbeterpuntContext | null
  /** Naam van de afbeelding in de zip, of null. */
  afbeelding: string | null
}

// Altijd Nederlandse tijd: de NAS kan gewoon op UTC draaien.
const datum = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric' })
const tijd = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })
const datumTijd = { format: (d: Date) => `${datum.format(d)} ${tijd.format(d)}` }

function kop(zin: string): string {
  const eerste = zin.split('\n')[0].trim()
  return eerste.length > 90 ? `${eerste.slice(0, 87)}…` : eerste
}

const BRON: Record<VerbeterpuntContext['schermafbeelding'], string> = {
  nagebouwd: 'door de browser nagetekend; kan op details afwijken van het echte scherm',
  geplakt: 'echte schermafdruk, door de melder geplakt',
  geen: '',
}

/**
 * Eén leesbaar bestand met alle punten. Geschreven voor wie ze oppakt — een
 * collega of Claude — die het scherm niet voor zich heeft: daarom staat alles
 * erin wat vanzelf meeging, en niets wat leeg is.
 */
export function verbeterpuntenMarkdown(punten: ExportPunt[], nu: Date): string {
  const regels = [
    '# Verbeterpunten ShopCommand',
    '',
    `Export van ${datumTijd.format(nu)} · ${punten.length} open ${punten.length === 1 ? 'punt' : 'punten'}.`,
    'Elk punt staat in ShopCommand onder ToDo → Verbeterpunten. Vink het daar af als het opgelost is.',
  ]
  punten.forEach((p, i) => {
    const c = p.context
    regels.push('', `## ${i + 1}. ${kop(p.title)}`, '')
    if (kop(p.title) !== p.title.trim()) regels.push(...p.title.trim().split('\n').map((r) => `> ${r}`), '')
    const pagina = p.paginaNaam ?? p.paginaUrl
    if (pagina) regels.push(`- **Pagina:** ${pagina}${p.paginaUrl && p.paginaNaam ? ` (\`${p.paginaUrl}\`)` : ''}`)
    regels.push(`- **Gemeld door:** ${p.createdByName}${c?.operator ? ` (aan de machine: ${c.operator})` : ''}, ${datumTijd.format(p.createdAt)}`)
    if (c?.scherm) {
      const schaal = c.scherm.schaal !== 1 ? ` bij ${Math.round(c.scherm.schaal * 100)} %` : ''
      regels.push(`- **Scherm:** ${c.scherm.breedte} × ${c.scherm.hoogte}${schaal}${c.browser ? `, ${c.browser}` : ''}`)
    }
    if (p.afbeelding) {
      const bron = c ? BRON[c.schermafbeelding] : ''
      regels.push(`- **Schermafbeelding:** \`${p.afbeelding}\`${bron ? ` (${bron}; rode kaders zijn van de melder)` : ''}`)
    }
    if (c?.fouten.length) {
      regels.push('- **Foutmeldingen vlak ervoor:**')
      for (const f of c.fouten) regels.push(`  - ${tijd.format(new Date(f.tijd))} ${f.titel}: ${f.tekst.replace(/\s+/g, ' ')}`)
    }
    regels.push(`- **Id:** \`${p.id}\``)
  })
  return regels.join('\n') + '\n'
}

/** De zip: `verbeterpunten.md` plus de afbeeldingen, genummerd zoals in de tekst. */
export function maakExportZip(
  punten: (Omit<ExportPunt, 'afbeelding'> & { schermafbeelding: string | null })[],
  nu: Date,
): Uint8Array {
  const bestanden: Record<string, Uint8Array> = {}
  const metAfbeelding = punten.map((p, i) => {
    const bestand = bestandVoor(p.schermafbeelding)
    if (!bestand || !fs.existsSync(bestand)) return { ...p, afbeelding: null }
    const naam = `schermafbeeldingen/${String(i + 1).padStart(2, '0')}${path.extname(bestand)}`
    bestanden[naam] = fs.readFileSync(bestand)
    return { ...p, afbeelding: naam }
  })
  bestanden['verbeterpunten.md'] = strToU8(verbeterpuntenMarkdown(metAfbeelding, nu))
  // Afbeeldingen zijn al gecomprimeerd; nog eens inpakken kost tijd en levert niets op.
  return zipSync(bestanden, { level: 0 })
}
