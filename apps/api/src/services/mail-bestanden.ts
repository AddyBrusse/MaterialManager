import fs from 'fs'
import path from 'path'
import type { MailAttachment } from '@stockmanager/shared'
import { config } from '../config'
import { sanitizeFilename } from '../lib/filenames'
import { mailImportDir } from './mail-import'

/** Eén bijlage zoals `Article.attachments` hem bewaart. */
interface ArtikelBijlage {
  id: string
  kind: 'drawing'
  name: string
  sizeBytes: number
  machine: null
  note: string
  path: string
  uploadedAt: string
}

/**
 * Tekeningen uit een mail naar de bijlagenmap van een artikel kopiëren.
 *
 * Op de server, niet via de browser: een STEP-assembly is zo tientallen
 * megabytes, en die eerst downloaden om hem meteen weer te uploaden is zonde van
 * de tijd én van het netwerk op de werkvloer. De bestanden blijven ook in de
 * mailmap staan — die map is het bewijsstuk van wat de klant stuurde.
 *
 * Wat er níet mee kon staat in `overgeslagen`, met de reden. Stilzwijgend
 * overslaan levert een artikel op dat er compleet uitziet maar geen tekening
 * heeft — en dat merk je pas weken later, als iemand hem nodig heeft.
 */
export function kopieerTekeningen(
  mail: { id: string; afzenderEmail: string | null },
  bijlagen: MailAttachment[],
  artikelId: string,
  namen: string[],
): { bijlagen: ArtikelBijlage[]; overgeslagen: { naam: string; reden: string }[] } {
  const bronMap = mailImportDir(mail.id)
  const doelMap = path.join(config.uploadsDir, 'attachments', artikelId)
  const gekopieerd: ArtikelBijlage[] = []
  const overgeslagen: { naam: string; reden: string }[] = []

  for (const naam of namen) {
    const bijlage = bijlagen.find((b) => b.filename === naam)
    if (!bijlage) { overgeslagen.push({ naam, reden: 'zit niet bij deze mail' }); continue }
    if (!bijlage.path) { overgeslagen.push({ naam, reden: 'niet opgeslagen' }); continue }
    const bron = path.join(bronMap, path.basename(bijlage.path))
    if (!fs.existsSync(bron)) { overgeslagen.push({ naam, reden: 'bestand ontbreekt op schijf' }); continue }

    fs.mkdirSync(doelMap, { recursive: true })
    const doelNaam = `${Date.now()}-${sanitizeFilename(naam)}`
    fs.copyFileSync(bron, path.join(doelMap, doelNaam))
    gekopieerd.push({
      id: `att_${artikelId}_${gekopieerd.length}_${Date.now()}`,
      // Een tekening is een tekening, of hij nu als pdf of als model komt —
      // de preview kiest zelf welke hij laat zien.
      kind: 'drawing',
      name: naam,
      sizeBytes: fs.statSync(bron).size,
      machine: null,
      note: `Uit mail van ${mail.afzenderEmail ?? 'klant'}`,
      path: `/uploads/attachments/${artikelId}/${doelNaam}`,
      uploadedAt: new Date().toISOString(),
    })
  }
  return { bijlagen: gekopieerd, overgeslagen }
}
