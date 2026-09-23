import type { Factuur, Paklijst, Project, ProjectVoortgang } from '@stockmanager/shared'
import { gefactureerdInclBtw } from '@stockmanager/shared'
import { Card } from '../components/Card'
import { datum, eur, getal, relatieveDagen, dagenTot } from '../lib/format'
import { geaccepteerdeOfferte, geldendeOfferte } from '../lib/status'
import { offerteTotaal } from '../lib/build-vm'

/**
 * §5.6 — de route van het project als één tabel. Dit is waar het principe
 * "status volgt uit een document" letterlijk op het scherm staat.
 *
 * **Afwijking van de spec.** §5.6 schrijft vier vaste *rijen* voor. Dat werkt
 * niet meer nu er in delen geleverd wordt: van Paklijst en Factuur kunnen er
 * meerdere zijn, plus creditnota's. Het vierstappen-skelet blijft, maar die
 * twee stappen zijn nu groepen: een kopregel met de stand van de stap, en
 * daaronder de losse documenten. De vraag "waar staat dit project" leest nog
 * steeds van boven naar beneden; de vraag "welke pakbon droeg wat" staat er
 * onder in plaats van verstopt.
 */

interface StapRij {
  document: string
  nummer: string
  status: string
  statusKleur: string
  datumTekst: string
  bedrag: string
  herkomst: string
  bestaat: boolean
  kan: boolean
}

function BtnCel({
  rij,
  geblokkeerd,
  onOpenen,
  onMaken,
}: {
  rij: StapRij
  geblokkeerd: boolean
  onOpenen: (doc: string) => void
  onMaken: (doc: string) => void
}) {
  return rij.bestaat ? (
    <button type="button" className="pdv2-btn s" onClick={() => onOpenen(rij.document)}>
      Openen
    </button>
  ) : (
    <button
      type="button"
      className={`pdv2-btn s ${rij.kan ? 'primair' : ''}`}
      disabled={!rij.kan || geblokkeerd}
      onClick={() => onMaken(rij.document)}
    >
      Maken
    </button>
  )
}

function Rij({
  rij,
  geblokkeerd,
  onOpenen,
  onMaken,
  inspringen,
}: {
  rij: StapRij
  geblokkeerd: boolean
  onOpenen: (doc: string) => void
  onMaken: (doc: string) => void
  inspringen?: boolean
}) {
  return (
    <tr>
      <td style={inspringen ? { paddingLeft: 26, color: 'var(--text2)' } : undefined}>
        {rij.document}
      </td>
      <td className="mono">{rij.nummer}</td>
      <td>
        <span className={`pdv2-pill ${rij.statusKleur}`}>{rij.status}</span>
      </td>
      <td className="mono">{rij.datumTekst}</td>
      <td className="num">{rij.bedrag}</td>
      <td style={{ color: 'var(--text3)' }}>{rij.herkomst}</td>
      <td>
        <BtnCel rij={rij} geblokkeerd={geblokkeerd} onOpenen={onOpenen} onMaken={onMaken} />
      </td>
    </tr>
  )
}

function paklijstRij(pl: Paklijst): StapRij {
  return {
    document: pl.id,
    nummer: pl.id,
    status: pl.verzondenOp ? 'Verzonden' : 'Concept',
    statusKleur: pl.verzondenOp ? 'ok' : '',
    datumTekst: datum(pl.verzondenOp),
    bedrag: '—',
    herkomst: `${pl.regels.length} ${pl.regels.length === 1 ? 'regel' : 'regels'} · ${pl.regels.reduce(
      (t, r) => t + r.qty,
      0,
    )} stuks`,
    bestaat: true,
    kan: true,
  }
}

function factuurRij(f: Factuur): StapRij {
  const credit = f.soort === 'credit'
  const n = dagenTot(f.vervaldatum)
  return {
    document: credit ? `${f.id} (credit)` : f.id,
    nummer: f.id,
    status: f.verzondenOp ? 'Verzonden' : 'Concept',
    statusKleur: f.verzondenOp ? (credit ? 'warn' : 'ok') : '',
    datumTekst: datum(f.verzondenOp),
    bedrag: credit ? `−${eur(f.totaalInclBtw)}` : eur(f.totaalInclBtw),
    herkomst: credit
      ? `crediteert ${f.crediteertFactuurId ?? 'een eerdere factuur'}`
      : f.vervaldatum
        ? `vervalt ${datum(f.vervaldatum)} · ${relatieveDagen(f.vervaldatum)}${
            n !== null && n < 0 ? ' — over tijd' : ''
          }`
        : 'geen vervaldatum',
    bestaat: true,
    kan: true,
  }
}

export function DocumentenTab({
  project: p,
  voortgang: v,
  geblokkeerd,
  onOpenen,
  onMaken,
}: {
  project: Project
  voortgang: ProjectVoortgang
  geblokkeerd: boolean
  onOpenen: (doc: string) => void
  onMaken: (doc: string) => void
}) {
  const geldend = geldendeOfferte(p)
  const acc = geaccepteerdeOfferte(p)
  const ietsVerzonden = p.paklijsten.some((pl) => pl.verzondenOp)

  const offerte: StapRij = {
    document: 'Offerte geldend',
    nummer: geldend?.documentNr ?? geldend?.id ?? '—',
    status: geldend ? (acc ? 'Geaccepteerd' : geldend.status) : 'Nog niet',
    statusKleur: acc ? 'ok' : geldend ? 'accent' : '',
    datumTekst: datum(geldend?.verzondenOp),
    bedrag: eur(offerteTotaal(p)),
    herkomst: geldend
      ? `v${geldend.versie}${
          geldend.geldigTot
            ? ` · vervalt ${datum(geldend.geldigTot)} · ${relatieveDagen(geldend.geldigTot)}`
            : ''
        }`
      : 'ontstaat zodra je een offerte opstelt',
    bestaat: Boolean(geldend),
    kan: true,
  }

  const ob: StapRij = {
    document: 'Opdrachtbevestiging',
    nummer: p.opdrachtbevestiging?.id ?? '—',
    status: p.opdrachtbevestiging
      ? p.opdrachtbevestiging.verzondenOp
        ? 'Verzonden'
        : 'Concept'
      : 'Nog niet',
    statusKleur: p.opdrachtbevestiging?.verzondenOp ? 'ok' : '',
    datumTekst: datum(p.opdrachtbevestiging?.verzondenOp),
    bedrag: '—',
    herkomst: p.opdrachtbevestiging
      ? `regels bevroren uit ${p.opdrachtbevestiging.offerteId}`
      : 'ontstaat zodra een offerte geaccepteerd is',
    bestaat: Boolean(p.opdrachtbevestiging),
    kan: Boolean(acc),
  }

  // De twee groepen. De kopregel draagt de stand van de stáp; de documenten
  // eronder dragen zichzelf. Zonder documenten is de kop gewoon de lege rij
  // die de spec beschrijft, mét de voorwaarde erin.
  const paklijstKop: StapRij = {
    document: p.paklijsten.length > 1 ? `Paklijsten (${p.paklijsten.length})` : 'Paklijst',
    nummer: p.paklijsten.length === 0 ? '—' : '',
    status: p.paklijsten.length === 0 ? 'Nog niet' : ietsVerzonden ? 'Verzonden' : 'Concept',
    statusKleur: ietsVerzonden ? 'ok' : '',
    datumTekst: p.paklijsten.length === 0 ? '—' : '',
    bedrag: '—',
    herkomst:
      p.paklijsten.length === 0
        ? 'ontstaat als er iets gemaakt is om te leveren'
        : 'een pakbon draagt wat er op dat moment klaarlag',
    bestaat: p.paklijsten.length > 0,
    // Dezelfde poort als de footer: een volgende pakbon kan pas als er iets
    // klaarligt dat nog niet geleverd is. Anders staat hier een blauwe knop
    // die een lege bon zou maken.
    kan: v.klaar > 0,
  }

  const facturen = p.facturen
  const factuurKop: StapRij = {
    document: facturen.length > 1 ? `Facturen (${facturen.length})` : 'Factuur',
    nummer: facturen.length === 0 ? '—' : '',
    status: facturen.length === 0 ? 'Nog niet' : 'Verzonden',
    statusKleur: facturen.length > 0 ? 'ok' : '',
    datumTekst: facturen.length === 0 ? '—' : '',
    bedrag: facturen.length === 0 ? '—' : eur(gefactureerdInclBtw(p)),
    herkomst:
      facturen.length === 0
        ? 'ontstaat als er geleverd is'
        : 'totaal incl. btw, creditnota’s eraf',
    bestaat: facturen.length > 0,
    kan: ietsVerzonden && v.teFactureren > 0,
  }

  return (
    <>
      <Card titel="Documenten" plat>
        <table className="pdv2-tbl">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Document</th>
              <th style={{ width: 130 }}>Nummer</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 104 }}>Datum</th>
              <th className="num" style={{ width: 116 }}>
                Bedrag
              </th>
              <th>Ontstaat doordat</th>
              <th style={{ width: 92 }} />
            </tr>
          </thead>
          <tbody>
            <Rij rij={offerte} geblokkeerd={geblokkeerd} onOpenen={onOpenen} onMaken={onMaken} />
            <Rij rij={ob} geblokkeerd={geblokkeerd} onOpenen={onOpenen} onMaken={onMaken} />

            <Rij
              rij={{ ...paklijstKop, bestaat: false, document: paklijstKop.document }}
              geblokkeerd={geblokkeerd}
              onOpenen={onOpenen}
              onMaken={() => onMaken('Paklijst')}
            />
            {p.paklijsten.map((pl) => (
              <Rij
                key={pl.id}
                rij={paklijstRij(pl)}
                geblokkeerd={geblokkeerd}
                onOpenen={onOpenen}
                onMaken={onMaken}
                inspringen
              />
            ))}

            <Rij
              rij={{ ...factuurKop, bestaat: false, document: factuurKop.document }}
              geblokkeerd={geblokkeerd}
              onOpenen={onOpenen}
              onMaken={() => onMaken('Factuur')}
            />
            {facturen.map((f) => (
              <Rij
                key={f.id}
                rij={factuurRij(f)}
                geblokkeerd={geblokkeerd}
                onOpenen={onOpenen}
                onMaken={onMaken}
                inspringen
              />
            ))}
          </tbody>
        </table>
      </Card>

      {p.paklijsten.map((pl) => (
        <Card
          key={pl.id}
          titel={`Paklijstregels — ${pl.id}`}
          teller={pl.verzondenOp ? `verzonden ${datum(pl.verzondenOp)}` : 'concept'}
          plat
        >
          <table className="pdv2-tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Productieorder</th>
                <th>Artikel</th>
                <th className="num" style={{ width: 90 }}>
                  Aantal
                </th>
              </tr>
            </thead>
            <tbody>
              {pl.regels.map((r, i) => (
                <tr key={`${r.productieOrderId}-${i}`}>
                  <td className="mono">{r.productieOrderId}</td>
                  <td>{r.artikelNaam}</td>
                  <td className="num">
                    {getal(r.qty)} {r.eenheid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </>
  )
}
