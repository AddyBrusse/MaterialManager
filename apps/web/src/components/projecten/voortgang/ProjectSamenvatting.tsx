// Eén regel die zegt hoe het project ervoor staat, met de balk eronder.
//
// De knoppen stonden hier eerder; die zijn verhuisd naar de kolomgroepen waar
// ze over gaan. Deze regel houdt alleen nog de stand vast — en die stand is
// een zin, geen rij cijfers, omdat "60 stuks liggen klaar om te leveren" de
// vraag beantwoordt die iemand werkelijk heeft.
import { formatBedrag } from '../../../api/projects'
import { VoortgangBalk, BalkLegenda } from './VoortgangBalk'
import type { Project, ProjectVoortgang } from '@stockmanager/shared'

/** Dagen tot de leverdatum. Negatief = te laat. */
function dagenTot(datum: string): number {
  const vandaag = new Date()
  vandaag.setHours(0, 0, 0, 0)
  const doel = new Date(datum)
  doel.setHours(0, 0, 0, 0)
  return Math.round((doel.getTime() - vandaag.getTime()) / 86_400_000)
}

function kortDatum(datum: string): string {
  const d = new Date(datum)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ProjectSamenvatting({ project, voortgang: v }: {
  project: Project
  voortgang: ProjectVoortgang
}) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '13px 16px 14px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 14, lineHeight: 1.45 }}>
        <Stand voortgang={v} />
        <Levertijd datum={project.levertijdDatum} />
      </div>
      {v.besteld > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20, marginTop: 11, flexWrap: 'wrap',
        }}>
          <div style={{ width: 520, maxWidth: '100%' }}>
            <VoortgangBalk voortgang={v} hoogte={12} />
          </div>
          <BalkLegenda voortgang={v} />
        </div>
      )}
    </div>
  )
}

function Stand({ voortgang: v }: { voortgang: ProjectVoortgang }) {
  if (v.besteld === 0) {
    return <span style={{ color: 'var(--text-3)' }}>Nog geen artikelen op dit project.</span>
  }
  // De kop is wat er nú ligt te wachten; de rest staat er gedempt achter.
  const kop = v.klaar > 0
    ? `${v.klaar} stuks liggen klaar om te leveren`
    : v.teMaken > 0
      ? `${v.teMaken} stuks nog te maken`
      : v.teFactureren > 0
        ? `${v.teFactureren} stuks geleverd, nog te factureren`
        : 'Alles gemaakt, geleverd en gefactureerd'
  return (
    <>
      <strong style={{ fontWeight: 600 }}>{kop}</strong>
      {v.klaar > 0 && v.teMaken > 0 && (
        <span style={{ color: 'var(--text-3)' }}> · {v.teMaken} nog te maken</span>
      )}
      {v.teFacturerenBedrag > 0 && (
        <>
          <span style={{ color: 'var(--text-3)' }}> · </span>
          <strong className="cell-mono" style={{ fontWeight: 600 }}>
            {formatBedrag(v.teFacturerenBedrag)}
          </strong>
          <span style={{ color: 'var(--text-3)' }}> nog te factureren</span>
        </>
      )}
    </>
  )
}

function Levertijd({ datum }: { datum: string | null }) {
  if (!datum) return null
  const dagen = dagenTot(datum)
  // Te laat is rood, deze week oranje, de rest gedempt: pas als het knelt vraagt
  // het om aandacht.
  const kleur = dagen < 0 ? 'var(--danger)' : dagen <= 7 ? 'var(--warning)' : 'var(--text-3)'
  const tekst = dagen < 0
    ? `${Math.abs(dagen)} dagen te laat`
    : dagen === 0 ? 'vandaag' : `over ${dagen} dagen`
  return (
    <>
      <span style={{ color: 'var(--text-3)' }}> · leveren vóór </span>
      <strong className="cell-mono" style={{ fontWeight: 600, color: kleur }}>{kortDatum(datum)}</strong>
      <span style={{ color: kleur }}> ({tekst})</span>
    </>
  )
}
