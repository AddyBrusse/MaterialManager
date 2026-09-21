import { useState } from 'react'
import type { Offerte, Project } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { datum, eur, getal } from '../lib/format'
import { geaccepteerdeOfferte } from '../lib/status'

function statusPill(o: Offerte) {
  switch (o.status) {
    case 'geaccepteerd':
      return { tekst: 'Geaccepteerd', kleur: 'ok' }
    case 'vervallen':
      return { tekst: 'Vervallen', kleur: '' }
    case 'verzonden':
      return { tekst: 'Verzonden', kleur: 'accent' }
    default:
      return { tekst: 'Concept', kleur: '' }
  }
}

function RegelsPaneel({ offerte, geldend }: { offerte: Offerte; geldend: boolean }) {
  const totaal = offerte.regels.reduce((s, r) => s + r.totaal, 0)
  const pill = statusPill(offerte)

  return (
    <div style={{ background: 'var(--alt)', borderTop: '1px solid var(--border)' }}>
      <div className="pdv2-card-head" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2>REGELS — {offerte.id}</h2>
        <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
        <span className="pdv2-count">
          {geldend
            ? 'dit is de geldende versie — hierop draait de productie'
            : 'vervallen versie, alleen ter vergelijking'}
        </span>
      </div>
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th>Artikel</th>
            <th>Bewerkingen</th>
            <th className="num" style={{ width: 70 }}>
              Aantal
            </th>
            <th className="num" style={{ width: 96 }}>
              Prijs/st
            </th>
            <th className="num" style={{ width: 104 }}>
              Totaal
            </th>
          </tr>
        </thead>
        <tbody>
          {offerte.regels.map((r) => (
            <tr key={r.id}>
              <td>
                <span style={{ fontWeight: 600 }}>{r.naam}</span>
                {r.omschrijving && <span className="sub">{r.omschrijving}</span>}
              </td>
              <td>
                {r.bewerkingen.length === 0
                  ? '—'
                  : r.bewerkingen.map((b) => (
                      <span className="pdv2-chip" key={b}>
                        {b}
                      </span>
                    ))}
              </td>
              <td className="num">
                {getal(r.qty)} {r.eenheid}
              </td>
              <td className="num">{eur(r.verkoopprijs)}</td>
              <td className="num">{eur(r.totaal)}</td>
            </tr>
          ))}
          <tr className="totaal">
            <td colSpan={4}>Offertetotaal excl. btw</td>
            <td className="num">{eur(totaal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** §5.2 — versietabel plus het regelspaneel van de gekozen versie. */
export function OffertesTab({
  project,
  geblokkeerd,
  onNieuweVersie,
}: {
  project: Project
  geblokkeerd: boolean
  onNieuweVersie: () => void
}) {
  const versies = [...project.offertes].sort((a, b) => b.versie - a.versie)
  const acc = geaccepteerdeOfferte(project)
  // Standaard de geaccepteerde versie, anders de hoogste — dat is de versie
  // waar iemand die dit scherm opent naar op zoek is.
  const [gekozen, setGekozen] = useState<string | null>(acc?.id ?? versies[0]?.id ?? null)
  const actief = versies.find((v) => v.id === gekozen) ?? versies[0] ?? null

  if (versies.length === 0) {
    return (
      <Card
        titel="Offertes"
        acties={
          <button
            type="button"
            className="pdv2-btn s primair"
            onClick={onNieuweVersie}
            disabled={geblokkeerd}
          >
            Nieuwe versie
          </button>
        }
      >
        <div className="pdv2-empty">
          Nog geen offerte. De status springt naar Offerte zodra je er één verstuurt.
        </div>
      </Card>
    )
  }

  return (
    <Card
      titel="Offertes"
      teller={`${versies.length} versies · ${acc ? 1 : 0} geaccepteerd`}
      plat
      acties={
        <button
          type="button"
          className="pdv2-btn s"
          onClick={onNieuweVersie}
          disabled={geblokkeerd}
        >
          Nieuwe versie
        </button>
      }
    >
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th style={{ width: 34 }}>v.</th>
            <th style={{ width: 118 }}>Nummer</th>
            <th>Status</th>
            <th style={{ width: 92 }}>Verzonden</th>
            <th style={{ width: 100 }}>Geaccepteerd</th>
            <th style={{ width: 92 }}>Geldig tot</th>
            <th className="num" style={{ width: 104 }}>
              Totaal
            </th>
          </tr>
        </thead>
        <tbody>
          {versies.map((o) => {
            const pill = statusPill(o)
            const klassen = [
              o.status === 'geaccepteerd' ? 'geaccepteerd' : '',
              o.status === 'vervallen' ? 'vervallen' : '',
              o.id === actief?.id ? 'gekozen' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr key={o.id} className={klassen}>
                <td className="mono">{o.versie}</td>
                <td>
                  <button type="button" className="pdv2-link" onClick={() => setGekozen(o.id)}>
                    {o.id}
                  </button>
                </td>
                <td>
                  <span className={`pdv2-pill ${pill.kleur}`}>{pill.tekst}</span>
                </td>
                <td className="mono">{datum(o.verzondenOp)}</td>
                <td className="mono">{datum(o.geaccepteerdOp)}</td>
                <td className="mono">{datum(o.geldigTot)}</td>
                <td className="num">{eur(o.regels.reduce((s, r) => s + r.totaal, 0))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {actief && <RegelsPaneel offerte={actief} geldend={actief.id === (acc?.id ?? versies[0].id)} />}
    </Card>
  )
}
