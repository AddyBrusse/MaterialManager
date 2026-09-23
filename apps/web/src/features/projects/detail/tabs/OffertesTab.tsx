import { useState } from 'react'
import type { Offerte, Project } from '@stockmanager/shared'
import { ArtikelPickerModal } from '../../../../components/projecten/ArtikelPickerModal'
import { PrijzenBijwerkenModal } from '../../../../components/projecten/PrijzenBijwerkenModal'
import type { Bijwerking } from '../../../../components/projecten/prijs-bijwerken'
import { Card } from '../components/Card'
import { IconRefresh, IconTrash } from '@tabler/icons-react'
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

/**
 * Een getal dat je in de tabel zelf aanpast. Opslaan gebeurt bij het verlaten
 * van het veld, niet bij elke toetsaanslag: anders gaat er per cijfer een
 * verzoek naar de server en telt een half ingetypt getal als de nieuwe waarde.
 */
function CelGetal({
  waarde,
  decimalen = 0,
  onKlaar,
}: {
  waarde: number
  decimalen?: number
  onKlaar: (n: number) => void
}) {
  const toon = waarde.toLocaleString('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  })
  return (
    <input
      defaultValue={toon}
      key={toon}
      inputMode="decimal"
      style={{
        width: '100%',
        border: '1px solid transparent',
        borderRadius: 3,
        background: 'transparent',
        font: 'inherit',
        fontFamily: 'var(--mono)',
        textAlign: 'right',
        color: 'inherit',
        padding: '1px 4px',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--border2)'
        e.currentTarget.style.background = 'var(--bg2)'
        e.currentTarget.select()
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.background = 'transparent'
        const n = Number(e.currentTarget.value.replace(/\./g, '').replace(',', '.'))
        if (Number.isFinite(n) && n >= 0 && n !== waarde) onKlaar(n)
        else e.currentTarget.value = toon
      }}
    />
  )
}

function RegelsPaneel({
  offerte,
  geldend,
  bewerkbaar,
  onToevoegen,
  onPrijzen,
  onRegel,
  onVerwijder,
}: {
  offerte: Offerte
  geldend: boolean
  bewerkbaar: boolean
  onToevoegen: () => void
  onPrijzen: () => void
  onRegel: (regelId: string, patch: { qty?: number; verkoopprijs?: number }) => void
  onVerwijder: (regelId: string) => void
}) {
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
        {bewerkbaar && (
          <>
            <span className="pdv2-spacer" />
            {/* Prijzen komen uit de artikelcalculatie, maar een regel kan ook
                met de hand zijn ingevuld — vandaar een knop met een overzicht
                vooraf in plaats van stilzwijgend overschrijven. */}
            <button
              type="button"
              className="pdv2-btn s"
              onClick={onPrijzen}
              disabled={offerte.regels.length === 0}
            >
              <IconRefresh size={12} />
              Prijzen bijwerken
            </button>
            <button type="button" className="pdv2-btn s primair" onClick={onToevoegen}>
              Artikelen toevoegen
            </button>
          </>
        )}
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
            {bewerkbaar && <th style={{ width: 34 }} />}
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
                {/* Alleen een concept mag nog veranderen: een verstuurde versie
                    is de deur uit en een geaccepteerde draagt de productie. */}
                {bewerkbaar ? (
                  <CelGetal waarde={r.qty} onKlaar={(qty) => onRegel(r.id, { qty })} />
                ) : (
                  <>
                    {getal(r.qty)} {r.eenheid}
                  </>
                )}
              </td>
              <td className="num">
                {bewerkbaar ? (
                  <CelGetal
                    waarde={r.verkoopprijs}
                    decimalen={2}
                    onKlaar={(verkoopprijs) => onRegel(r.id, { verkoopprijs })}
                  />
                ) : (
                  eur(r.verkoopprijs)
                )}
              </td>
              <td className="num">{eur(r.totaal)}</td>
              {bewerkbaar && (
                <td>
                  <button
                    type="button"
                    className="pdv2-btn s"
                    title="Regel verwijderen"
                    aria-label={`Regel ${r.naam} verwijderen`}
                    onClick={() => onVerwijder(r.id)}
                  >
                    <IconTrash size={12} />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {offerte.regels.length === 0 && (
            <tr>
              <td colSpan={bewerkbaar ? 6 : 5} className="pdv2-empty">
                Nog geen regels. Een offerte zonder regels valt niet te versturen.
              </td>
            </tr>
          )}
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
  onVerzend,
  onAccepteer,
  onGewijzigd,
  onRegel,
  onVerwijderRegel,
  onPrijzen,
}: {
  project: Project
  geblokkeerd: boolean
  onNieuweVersie: () => void
  onVerzend: (offerteId: string) => void
  onAccepteer: (offerteId: string) => void
  onGewijzigd: () => void
  onRegel: (offerteId: string, regelId: string, patch: { qty?: number; verkoopprijs?: number }) => void
  onVerwijderRegel: (offerteId: string, regelId: string) => void
  onPrijzen: (offerteId: string, gekozen: Bijwerking[]) => void
}) {
  const versies = [...project.offertes].sort((a, b) => b.versie - a.versie)
  const acc = geaccepteerdeOfferte(project)
  // Standaard de geaccepteerde versie, anders de hoogste — dat is de versie
  // waar iemand die dit scherm opent naar op zoek is.
  const [gekozen, setGekozen] = useState<string | null>(acc?.id ?? versies[0]?.id ?? null)
  const actief = versies.find((v) => v.id === gekozen) ?? versies[0] ?? null
  const [picker, setPicker] = useState(false)
  const [prijzen, setPrijzen] = useState(false)

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
            <th style={{ width: 150 }} />
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
                <td>
                  {/* Vooruit is per versie een keuze die alleen een mens maakt:
                      wélke versie gaat de deur uit, wélke accepteert de klant. */}
                  {o.status === 'concept' && (
                    <button
                      type="button"
                      className="pdv2-btn s"
                      disabled={geblokkeerd || o.regels.length === 0}
                      title={o.regels.length === 0 ? 'Deze versie heeft nog geen regels' : undefined}
                      onClick={() => onVerzend(o.id)}
                    >
                      Versturen
                    </button>
                  )}
                  {o.status === 'verzonden' && !acc && (
                    <button
                      type="button"
                      className="pdv2-btn s primair"
                      disabled={geblokkeerd}
                      onClick={() => onAccepteer(o.id)}
                    >
                      Accepteren
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {actief && (
        <RegelsPaneel
          offerte={actief}
          geldend={actief.id === (acc?.id ?? versies[0].id)}
          bewerkbaar={actief.status === 'concept' && !geblokkeerd}
          onToevoegen={() => setPicker(true)}
          onPrijzen={() => setPrijzen(true)}
          onRegel={(regelId, patch) => onRegel(actief.id, regelId, patch)}
          onVerwijder={(regelId) => onVerwijderRegel(actief.id, regelId)}
        />
      )}

      {/* Dezelfde kiezer als op het oude scherm: artikelen zoeken, marge en
          verkoopprijs afstemmen, in één keer wegschrijven. Alleen een
          concept-offerte mag nog veranderen — een verstuurde versie is de deur
          uit. */}
      {actief && (
        <PrijzenBijwerkenModal
          opened={prijzen}
          offerte={actief}
          onClose={() => setPrijzen(false)}
          onBijwerken={(gekozen) => {
            setPrijzen(false)
            onPrijzen(actief.id, gekozen)
          }}
        />
      )}

      {actief && (
        <ArtikelPickerModal
          opened={picker}
          projectId={project.id}
          offerteId={actief.id}
          relatieId={project.relatieId}
          onClose={() => setPicker(false)}
          onAdded={onGewijzigd}
        />
      )}
    </Card>
  )
}
