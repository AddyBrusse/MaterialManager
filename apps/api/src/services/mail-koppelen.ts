import type { Prisma } from '@prisma/client'
import {
  bewerkingenVan, mailAfzender, offerteReferentieUitMail, prijsVoor, projectVeldenUitMail,
  receptTaakTitel, volgendeVersie, waaromNietWijzigen,
  type CandidateLine, type MailAttachment, type MailImport, type MailIntent, type MailKoppeling,
  type MailOvername, type Offerte, type OfferteRegel, type Project,
} from '@stockmanager/shared'
import { prisma } from '../db/client'
import { AppError } from '../middleware/error'
import { nieuwArtikelId } from './artikel-nummer'
import { nextDocId } from './doc-nummer'
import { kopieerTekeningen } from './mail-bestanden'
import { serializeMailImport } from './mail-import'
import { bronnenLaden, calcArtikel } from './prijs-snapshot'
import { withProject } from './project-schrijven'

type Db = Prisma.TransactionClient

interface KoppelKeuze {
  projectId: string
  relatieId: string
  contactId: string | null
  intent: MailIntent
}

function nu() { return new Date().toISOString() }

function omschrijvingVan(line: CandidateLine): string {
  return [
    line.tekening ? `Tekening ${line.tekening}` : null,
    line.rev ? `rev ${line.rev}` : null,
    line.positie !== null ? `pos. ${line.positie}` : null,
    'uit mail',
  ].filter(Boolean).join(' · ')
}

/**
 * Een artikel voor iets wat we nog niet kenden, met de tekeningen die de klant
 * meestuurde. Bewust leeg op de calculatie na: een prijs verzinnen we niet. De
 * offerteregel staat op € 0 en de taak "Recept maken" onthoudt dat er nog een
 * recept onder moet (2026-10-28).
 */
async function maakArtikel(
  tx: Db, line: CandidateLine, mail: MailImport, klant: { id: string; naam: string } | null,
  misluktebestanden: string[],
) {
  const id = await nieuwArtikelId(tx)
  const gekopieerd = line.bestanden.length > 0
    ? kopieerTekeningen(mail, mail.bijlagen as MailAttachment[], id, line.bestanden)
    : { bijlagen: [], overgeslagen: [] }
  for (const g of gekopieerd.overgeslagen) misluktebestanden.push(`${g.naam} (${g.reden})`)
  const artikel = await tx.article.create({
    data: {
      id,
      naam: line.tekening ?? line.ruweTekst.slice(0, 60),
      klant: klant?.naam ?? null,
      relatieId: klant?.id ?? null,
      tekening: line.tekening,
      rev: line.rev,
      notes: { workholding: '', general: `Aangemaakt uit mail "${mail.onderwerp}".` },
      attachments: gekopieerd.bijlagen as unknown as Prisma.InputJsonValue,
    },
  })
  return { artikel, bestanden: gekopieerd.bijlagen.length }
}

/**
 * De regels uit de mail op de offerte zetten: de laatste versie, of een nieuwe
 * als het project er nog geen heeft. Prijzen uit de calculatie bij het gevraagde
 * aantal; een nieuw artikel heeft er nog geen en komt op € 0.
 */
async function neemRegelsOver(
  tx: Db, p: Project, mail: MailImport, klant: { id: string; naam: string } | null, door: string,
): Promise<{ project: Project; kandidaten: CandidateLine[]; overname: MailOvername }> {
  let off: Offerte | undefined = p.offertes[p.offertes.length - 1]
  let offertes = p.offertes
  if (!off) {
    const id = await nextDocId(tx, 'OFF')
    off = {
      id, documentNr: id, projectId: p.id, versie: volgendeVersie(p.offertes), status: 'concept',
      regels: [], notities: '', externeRef: null, direct: false, vervallenDoor: null,
      geldigTot: null, verzondenOp: null, geaccepteerdOp: null, createdAt: nu(), updatedAt: nu(),
    }
    offertes = [...offertes, off]
  }
  const reden = waaromNietWijzigen(off)
  if (reden) throw new AppError(409, 'VOORWAARDE', reden)

  const bronnen = await bronnenLaden(tx)
  const afzender = mailAfzender(mail)
  const overname: MailOvername = {
    offerteId: off.id, aantalRegels: mail.kandidaten.length, zonderPrijs: 0, nieuweArtikelen: [],
    gekoppeldeBestanden: 0, misluktebestanden: [], referentie: null, receptTaken: 0,
  }
  const regels: OfferteRegel[] = []
  const kandidaten: CandidateLine[] = []

  for (const line of mail.kandidaten) {
    const qty = line.qty ?? 1
    let artikel = line.artikelId ? await tx.article.findUnique({ where: { id: line.artikelId } }) : null
    if (!artikel) {
      const nieuw = await maakArtikel(tx, line, mail, klant, overname.misluktebestanden)
      artikel = nieuw.artikel
      overname.nieuweArtikelen.push(artikel.id)
      overname.gekoppeldeBestanden += nieuw.bestanden
      await tx.todo.create({
        data: {
          title: receptTaakTitel(artikel, p.id, afzender),
          soort: 'recept_maken', projectId: p.id, artikelId: artikel.id, createdByUserId: door,
        },
      })
      overname.receptTaken++
    }
    // Onthouden welk artikel deze regel werd, ook als het nieuw is: zo vindt
    // "Tekeningen alsnog koppelen" het terug, en toont het reviewscherm het.
    kandidaten.push({ ...line, artikelId: artikel.id })

    const calc = calcArtikel(artikel)
    const { verkoopprijs } = prijsVoor(calc, bronnen, qty)
    if (verkoopprijs === 0) overname.zonderPrijs++
    regels.push({
      id: `regel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sortOrder: off.regels.length + regels.length + 1,
      artikelId: artikel.id,
      naam: artikel.naam,
      omschrijving: omschrijvingVan(line),
      qty,
      eenheid: 'st',
      verkoopprijs,
      totaal: Math.round(qty * verkoopprijs * 100) / 100,
      bewerkingen: bewerkingenVan(calc, bronnen.machines),
    })
  }

  const doel = off
  const referentie = doel.externeRef?.trim() ? null : offerteReferentieUitMail(mail)
  overname.referentie = referentie
  const project: Project = {
    ...p,
    updatedAt: nu(),
    offertes: offertes.map((o) => o.id !== doel.id ? o : {
      ...o,
      regels: [...o.regels, ...regels],
      externeRef: referentie ?? o.externeRef,
      updatedAt: nu(),
    }),
  }
  return { project, kandidaten, overname }
}

/**
 * Een mail aan een project koppelen, en als de offerte nog leeg is de regels
 * overnemen — in één transactie (2026-10-28).
 *
 * Tot nu deed de browser dit in losse stappen: artikelen aanmaken zonder op de
 * server te wachten (een mislukking verdween stil), regels één voor één, en de
 * gegevens van het project helemaal niet meer sinds de nieuwe projectpagina.
 * Nu staat alles er, of niets: klant, referentie en levertijd op het project,
 * de regels en de referentie op de offerte, de nieuwe artikelen met hun
 * tekeningen, en per nieuw artikel de taak "Recept maken".
 */
export async function koppelMail(mailImportId: string, keuze: KoppelKeuze, door: string): Promise<MailKoppeling> {
  const rij = await prisma.mailImport.findUnique({ where: { id: mailImportId } })
  if (!rij) throw new AppError(404, 'NOT_FOUND', 'Mail-import niet gevonden')
  if (rij.projectId && rij.projectId !== keuze.projectId) {
    throw new AppError(409, 'VOORWAARDE',
      `Deze mail hoort al bij project ${rij.projectId}. Maak hem daar eerst los met "Loskoppelen van project".`)
  }
  const relatie = await prisma.relatie.findUnique({ where: { id: keuze.relatieId }, select: { id: true, naam: true } })
  if (!relatie) throw new AppError(400, 'VALIDATION', 'De gekozen klant bestaat niet (meer). Kies hem opnieuw.')

  let mailImport = serializeMailImport(rij)
  let overname: MailOvername | null = null

  // Ruimer dan de standaard 5 s: er worden tekeningen gekopieerd, en een
  // STEP-bestand is zo tientallen megabytes.
  const project = await withProject(keuze.projectId, async (p, tx) => {
    let next: Project = { ...p, ...projectVeldenUitMail(p, mailImport, keuze), updatedAt: nu() }
    let kandidaten = mailImport.kandidaten
    const laatste = next.offertes[next.offertes.length - 1]
    if (kandidaten.length > 0 && (!laatste || laatste.regels.length === 0)) {
      const r = await neemRegelsOver(tx, next, mailImport, relatie, door)
      next = r.project
      kandidaten = r.kandidaten
      overname = r.overname
    }
    const bijgewerkt = await tx.mailImport.update({
      where: { id: mailImportId },
      data: {
        relatieId: keuze.relatieId,
        contactId: keuze.contactId,
        intent: keuze.intent,
        projectId: keuze.projectId,
        status: 'verwerkt',
        kandidaten: kandidaten as unknown as Prisma.InputJsonValue,
      },
    })
    mailImport = serializeMailImport(bijgewerkt)
    return next
  }, { timeoutMs: 60_000 })

  return { mailImport, project, overname }
}
