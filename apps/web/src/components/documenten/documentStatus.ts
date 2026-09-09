import type { DocumentRegel, DocumentSoort } from '@stockmanager/shared'

// Elke documentsoort heeft zijn eigen statuswaarden. Ze worden hier naar één
// leesbare vorm gebracht, met de badge-kleur uit tokens.css.
type Badge = { label: string; cls: string }

const STATUS: Record<string, Badge> = {
  concept:      { label: 'Concept',      cls: '' },
  open:         { label: 'Open',         cls: '' },
  verzonden:    { label: 'Verzonden',    cls: 'info' },
  geaccepteerd: { label: 'Geaccepteerd', cls: 'ok' },
  vervallen:    { label: 'Vervallen',    cls: 'danger' },
}

export function statusBadge(status: string): Badge {
  return STATUS[status] ?? { label: status, cls: '' }
}

export const SOORT_KORT: Record<DocumentSoort, string> = {
  offerte: 'Offerte',
  opdrachtbevestiging: 'Opdrachtbev.',
  paklijst: 'Paklijst',
  factuur: 'Factuur',
}

/** Alles waar de zoekbalk op mag matchen — nummer, project, klant, referentie. */
export function zoektekst(d: DocumentRegel, klantNaam: string): string {
  return [d.id, d.projectId, d.projectNaam, klantNaam, d.klantRef ?? '', SOORT_KORT[d.soort]]
    .join(' ')
    .toLowerCase()
}
