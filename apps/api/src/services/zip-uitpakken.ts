import { unzipSync } from 'fflate'

/**
 * Zip-bijlagen uitpakken bij het inlezen van een mail.
 *
 * Klanten sturen hun tekeningen regelmatig gebundeld: één `Tekeningen.zip` met
 * per onderdeel een pdf en een step. Zonder uitpakken wordt die zip als 'overig'
 * weggegooid en verdwijnt álles — bij een aanvraag van Veratio (16-07-2026) ging
 * het om veertien bestanden bij zeven regels, en werden er zeven kale artikelen
 * aangemaakt terwijl de tekeningen gewoon waren meegestuurd.
 *
 * De namen in zo'n zip zijn juist bruikbaar: ze dragen hetzelfde nummer als de
 * regels in de mail, dus zodra de bestanden los zijn koppelt `hangBestandenAan`
 * ze vanzelf aan de juiste regel.
 */

/** Bovengrenzen: een zip is invoer van buiten en mag nooit de server platleggen. */
const MAX_BESTANDEN = 100
const MAX_PER_BESTAND = 25 * 1024 * 1024
const MAX_TOTAAL = 100 * 1024 * 1024

export interface UitgepaktBestand {
  filename: string
  content: Buffer
}

export function isZip(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip')
}

/**
 * De inhoud van één zip, plat. Mappen worden genegeerd — alleen de bestandsnaam
 * blijft over, want die draagt het nummer waar we op koppelen.
 *
 * Er wordt niet in zips binnen zips gekeken. Dat komt in de praktijk niet voor
 * en het is precies de vorm waarmee een zipbom zich vermenigvuldigt.
 *
 * Gaat het uitpakken mis, dan komt er een lege lijst terug: een kapotte zip mag
 * het inlezen van de mail niet laten mislukken, de rest van de mail is nog
 * steeds bruikbaar.
 */
export function pakZipUit(bytes: Buffer): UitgepaktBestand[] {
  let inhoud: Record<string, Uint8Array>
  try {
    inhoud = unzipSync(new Uint8Array(bytes))
  } catch {
    return []
  }

  const uit: UitgepaktBestand[] = []
  let totaal = 0

  for (const [pad, data] of Object.entries(inhoud)) {
    if (uit.length >= MAX_BESTANDEN) break
    // Mapingang: eindigt op een slash en heeft geen inhoud.
    if (pad.endsWith('/') || data.length === 0) continue
    // Alleen de bestandsnaam. Dekt meteen `../` en absolute paden af: wat er
    // overblijft kan nooit buiten de doelmap wijzen.
    const naam = pad.split(/[\\/]/).pop()?.trim()
    if (!naam || naam.startsWith('.')) continue
    if (isZip(naam)) continue
    if (data.length > MAX_PER_BESTAND) continue
    if (totaal + data.length > MAX_TOTAAL) break

    totaal += data.length
    uit.push({ filename: naam, content: Buffer.from(data) })
  }

  return uit
}
