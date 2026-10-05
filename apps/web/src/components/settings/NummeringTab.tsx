import { useQuery } from '@tanstack/react-query'
import { nummeringApi } from '../../api/nummering'
import { foutTekst } from '../../utils/fout-melding'

/**
 * Instellingen → Nummering (2026-10-05): de echte tellers, om te lezen. Hier
 * stonden invulvelden ("ONT-{YYYY}-{SEQ:4}") die nergens iets deden. Nummers
 * geeft de server bij het aanmaken; elke reeks begint op 1 januari opnieuw.
 */
export function NummeringTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['nummering'], queryFn: nummeringApi.stand })
  const jaar = data?.[0]?.jaar ?? new Date().getFullYear()

  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Nummerreeksen {jaar}</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 12.5 }}>
        Elk document krijgt zijn nummer van de server op het moment dat het wordt aangemaakt, als
        soort-jaar-volgnummer. Op 1 januari begint elke reeks vanzelf weer bij 001.
      </p>
      {error ? (
        <div className="st-empty" style={{ color: 'var(--danger)' }}>
          {(() => {
            const t = foutTekst({
              actie: 'Nummering lezen',
              fout: error,
              gevolg: 'Alleen dit overzicht ontbreekt; documenten krijgen gewoon hun nummer.',
            })
            return `${t.wat} — ${t.waar}. ${t.gevolg}`
          })()}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <thead>
              <tr>
                <th>Soort</th>
                <th style={{ width: 170 }}>Laatst uitgegeven</th>
                <th style={{ width: 170 }}>Volgende</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={3} className="st-empty">Laden…</td></tr>
              )}
              {data?.map((r) => (
                <tr key={r.prefix}>
                  <td className="cell-strong">{r.naam}</td>
                  <td className="cell-mono">{r.laatste ?? <span className="cell-muted">nog geen dit jaar</span>}</td>
                  <td className="cell-mono">{r.volgende}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
