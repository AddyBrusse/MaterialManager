import type { InkoopOverzicht, InkoopOverzichtRegel } from '@stockmanager/shared'
import { aantalTekst } from '../bestellingen/bestel-tekst'
import { GroepKaart, type ConceptActies } from './GroepKaart'
import type { PrijsActies } from './LeverancierKeuze'
import { ddmm } from './tekst'

/**
 * Te bestellen (2026-10-07), per leverancier: gekozen, anders de goedkoopste.
 * Wat nog geen prijs heeft staat apart onderaan — dat kan nog nergens heen.
 */
export function TeBestellenBlok({ ov, gekozen, zet, acties, concept, onOpen, onBestel }: {
  ov: InkoopOverzicht; gekozen: Set<string>; zet: (ids: string[], aan: boolean) => void
  acties: PrijsActies; concept: ConceptActies; onOpen: (r: InkoopOverzichtRegel) => void; onBestel: () => void
}) {
  const open = ov.regels.filter((r) => r.status === 'te_bestellen' || r.status === 'aangevraagd')
  const metPrijs = open.filter((r) => r.order || r.leverancier?.soort === 'prijs')
  const zonder = open.filter((r) => !metPrijs.includes(r)).sort((a, b) => (a.nodig.datum ?? '9999').localeCompare(b.nodig.datum ?? '9999'))
  const groepen = new Map<string, InkoopOverzichtRegel[]>()
  const opDatum = (a: InkoopOverzichtRegel, b: InkoopOverzichtRegel) => (a.plan.uiterlijk ?? '9999').localeCompare(b.plan.uiterlijk ?? '9999')
  for (const r of [...metPrijs].sort(opDatum)) groepen.set(r.leverancier!.leverancierId, [...(groepen.get(r.leverancier!.leverancierId) ?? []), r])
  // De groep die het eerst de deur uit moet, bovenaan.
  const eerste = (rs: InkoopOverzichtRegel[]) => rs.filter((r) => !r.order).map((r) => r.plan.uiterlijk ?? '9999').sort()[0] ?? '9999'
  const volgorde = [...groepen.entries()].sort((a, b) => eerste(a[1]).localeCompare(eerste(b[1])))
  const aantal = open.filter((r) => gekozen.has(r.id)).length

  return (
    <section aria-labelledby="ib-h-te">
      <div className="ib-blok-kop">
        <h2 id="ib-h-te">Te bestellen</h2>
        <span>per leverancier, goedkoopste al gekozen</span>
        <span style={{ flex: 1 }} />
        <span>{aantal} geselecteerd</span>
        <button type="button" className="st-btn primary sm" onClick={onBestel}>Bestellen{aantal ? ` (${aantal})` : ''}</button>
      </div>
      {open.length === 0 && <div className="ib-leeg">Er hoeft niets besteld te worden.</div>}
      {volgorde.map(([id, rs]) => (
        <GroepKaart key={id} lev={ov.leveranciers.find((l) => l.id === id)} naam={rs[0].leverancier!.naam} regels={rs}
          vandaag={ov.vandaag} gekozen={gekozen} zet={zet} acties={acties} concept={concept} onOpen={onOpen} />
      ))}
      {zonder.map((r) => {
        const gevraagd = r.opties.filter((o) => o.soort === 'gevraagd')
        return (
          <div key={r.id} className="ib-geenprijs" onClick={() => onOpen(r)}>
            <span className="ib-chip warn">Nog geen prijs</span>
            <span className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</span>
            <span className="ib-sub" style={{ marginTop: 0 }}>
              {[r.projectId ?? 'voorraad', aantalTekst(r), r.nodig.datum ? `nodig ${ddmm(r.nodig.datum)}` : null,
                gevraagd.length ? `gevraagd bij ${gevraagd.map((o) => o.naam).join(' en ')}, nog geen antwoord` : 'nog nergens gevraagd'].filter(Boolean).join(' · ')}
            </span>
            {r.plan.stand !== 'wacht' && <span className={`ib-chip ${r.plan.stand === 'te_laat_besteld' ? 'dgr' : 'warn'}`}>{r.plan.tekst}</span>}
            <span style={{ flex: 1 }} />
            <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
              {gevraagd.map((o) => <button key={o.leverancierId} type="button" className="st-btn sm" onClick={() => acties.antwoord(r, o)}>Antwoord {o.naam}</button>)}
              <button type="button" className="st-btn ghost sm" onClick={() => acties.vraag(r)}>Prijs vragen</button>
              <button type="button" className="st-btn ghost sm" onClick={() => acties.invullen(r)}>Prijs invullen</button>
            </span>
          </div>
        )
      })}
    </section>
  )
}
