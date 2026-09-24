import { IconRefresh, IconTrash } from '@tabler/icons-react'
import type { Offerte } from '@stockmanager/shared'
import { eur, getal } from '../lib/format'

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
      className="pdv2-cel-getal"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        const n = Number(e.currentTarget.value.replace(/\./g, '').replace(',', '.'))
        if (Number.isFinite(n) && n >= 0 && n !== waarde) onKlaar(n)
        else e.currentTarget.value = toon
      }}
    />
  )
}

interface Props {
  offerte: Offerte
  bewerkbaar: boolean
  onToevoegen: () => void
  onPrijzen: () => void
  onRegel: (regelId: string, patch: { qty?: number; verkoopprijs?: number }) => void
  onVerwijder: (regelId: string) => void
}

/**
 * De regels van één offerteversie, als kinderen van die versie.
 *
 * Springt in ten opzichte van de versietabel (`.pdv2-kind`), zodat je zonder
 * lijnen of kaders ziet dat deze regels bij de versie erboven horen en niet bij
 * de versie eronder.
 */
export function OfferteRegels({
  offerte,
  bewerkbaar,
  onToevoegen,
  onPrijzen,
  onRegel,
  onVerwijder,
}: Props) {
  const totaal = offerte.regels.reduce((s, r) => s + r.totaal, 0)

  return (
    <div className="pdv2-kind">
      {bewerkbaar && (
        <div className="pdv2-kind-acties">
          {/* Prijzen komen uit de artikelcalculatie, maar een regel kan ook met
              de hand zijn ingevuld — vandaar een knop met een overzicht vooraf
              in plaats van stilzwijgend overschrijven. */}
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
        </div>
      )}

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
            {bewerkbaar && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
