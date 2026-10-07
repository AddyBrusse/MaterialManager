import type jsPDF from 'jspdf'
import type { Project } from '@stockmanager/shared'
import { companyApi } from '../../../../api/company'
import { houdtVast, type ZaagReservation } from '../../../../api/reservations'
import { documentAssets } from '../../../../services/document/assets'
import { zaagbonDocument, type ZaagbonDoc } from '../../../../services/document/documenten'
import { meldFout } from '../../../../utils/fout-melding-toon'
import { Weigering } from '../../../../utils/fout-melding'
import { klantVan } from './document-gegevens'
import { toonDocument } from './toon-document'

/**
 * De zaagbon van een project (2026-10-07): uit de reserveringen die nog
 * materiaal vasthouden (`houdtVast`). Wat al gezaagd of geannuleerd is, staat
 * er niet op. Op de Productie-tab en in het rechtermuisknopmenu van het
 * projectenoverzicht.
 */

export function teZagen(reserveringen: ZaagReservation[], projectId: string): ZaagReservation[] {
  return reserveringen
    .filter((r) => r.projectId === projectId && houdtVast(r))
    .sort((a, b) => a.calculatieNr.localeCompare(b.calculatieNr, 'nl') || a.barCode.localeCompare(b.barCode, 'nl'))
}

/** Waarom er geen zaagbon is, of null. */
export function waaromNietZaagbon(reserveringen: ZaagReservation[], projectId: string): string | null {
  return teZagen(reserveringen, projectId).length === 0
    ? 'Er ligt nog geen materiaal vast voor dit project: reserveer het eerst bij de materiaalselectie op de Opdracht-tab.'
    : null
}

/** Rond met de diameter; een andere vorm alleen bij naam (de "diameter" is daar geen Ø). */
function vormTekst(r: ZaagReservation): string {
  const vorm = (r.barVorm || 'rond').trim()
  return vorm.toLowerCase() === 'rond' ? `Ø${r.diameter}` : vorm.charAt(0).toUpperCase() + vorm.slice(1)
}

export function zaagbonGegevens(p: Project, reserveringen: ZaagReservation[], nu = new Date()): ZaagbonDoc {
  const { relatie } = klantVan(p)
  return {
    project: p.id,
    projectNaam: p.naam,
    klantNaam: relatie?.naam ?? p.naam,
    datum: nu.toISOString(),
    regels: teZagen(reserveringen, p.id).map((r) => ({
      staaf: r.barCode,
      materiaal: `${r.materiaal} ${vormTekst(r)}`,
      locatie: r.barLocation || null,
      stuks: `${r.pieces} × ${r.werkstukLengte} mm`,
      zaaglengte: r.sawLength,
      notitie: [r.calculatieNr, r.machine].filter(Boolean).join(' · ') || null,
    })),
  }
}

export function zaagbonPdf(p: Project, reserveringen: ZaagReservation[]): jsPDF {
  return zaagbonDocument(zaagbonGegevens(p, reserveringen), companyApi.getSync(), documentAssets())
}

export const zaagbonBestandsnaam = (p: Project) => `Zaagbon-${p.id}.pdf`

/** Openen in het documentvenster; zonder vastgelegd materiaal zegt hij waarom niet. */
export function toonZaagbon(p: Project, reserveringen: ZaagReservation[]): void {
  const actie = `Zaagbon ${p.id} openen`
  const nee = waaromNietZaagbon(reserveringen, p.id)
  if (nee) { meldFout({ actie, fout: new Weigering(nee), gevolg: 'Er is niets geopend.' }); return }
  toonDocument(actie, () => zaagbonPdf(p, reserveringen), { titel: `Zaagbon ${p.id} — ${p.naam}`, bestandsnaam: zaagbonBestandsnaam(p) })
}
