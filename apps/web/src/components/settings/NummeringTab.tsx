import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DocReeksStand } from '@stockmanager/shared'
import { nummeringApi } from '../../api/nummering'
import { foutTekst, Weigering } from '../../utils/fout-melding'
import { meldFout } from '../../utils/fout-melding-toon'
import { useUserStore } from '../../stores/user'
import { NummerWijzigVenster } from './NummerWijzigVenster'

const tijd = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Fout({ actie, fout }: { actie: string; fout: unknown }) {
  const t = foutTekst({ actie, fout, gevolg: 'Alleen dit overzicht ontbreekt; documenten krijgen gewoon hun nummer.' })
  return <div className="st-empty" style={{ color: 'var(--danger)' }}>{`${t.wat} — ${t.waar}. ${t.gevolg}`}</div>
}

/**
 * Instellingen → Nummering (2026-10-05): de echte tellers, en per reeks het
 * volgende nummer met de hand te zetten (alleen een admin) voor als er intern
 * iets misging. Elke wijziging staat in het logboek eronder.
 */
export function NummeringTab() {
  const isAdmin = useUserStore((s) => s.user?.role === 'admin')
  const stand = useQuery({ queryKey: ['nummering', 'stand'], queryFn: nummeringApi.stand })
  const log = useQuery({ queryKey: ['nummering', 'log'], queryFn: nummeringApi.wijzigingen })
  const [open, setOpen] = useState<DocReeksStand | null>(null)
  const jaar = stand.data?.[0]?.jaar ?? new Date().getFullYear()

  const wijzig = (r: DocReeksStand) => {
    if (isAdmin) return setOpen(r)
    meldFout({
      actie: `Nummerreeks ${r.naam.toLowerCase()} wijzigen`,
      fout: new Weigering('Alleen een beheerder mag nummerreeksen wijzigen. Vraag het aan een admin.'),
      gevolg: 'Er is niets veranderd.',
    })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Nummerreeksen {jaar}</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 12px', fontSize: 12.5 }}>
        Elk document krijgt zijn nummer van de server op het moment dat het wordt aangemaakt, als
        soort-jaar-volgnummer. Op 1 januari begint elke reeks vanzelf weer bij 001. Wijzigen is alleen
        voor als er iets fout ging.
      </p>
      {stand.error ? <Fout actie="Nummering lezen" fout={stand.error} /> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <thead>
              <tr>
                <th>Soort</th>
                <th style={{ width: 160 }}>Laatst uitgegeven</th>
                <th style={{ width: 160 }}>Volgende</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {stand.isLoading && <tr><td colSpan={4} className="st-empty">Laden…</td></tr>}
              {stand.data?.map((r) => (
                <tr key={r.prefix}>
                  <td className="cell-strong">{r.naam}</td>
                  <td className="cell-mono">{r.laatste ?? <span className="cell-muted">nog geen dit jaar</span>}</td>
                  <td className="cell-mono">{r.volgende}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="st-btn" onClick={() => wijzig(r)}>Wijzigen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 4px' }}>Logboek</h3>
      <p style={{ color: 'var(--text-3)', margin: '0 0 8px', fontSize: 12.5 }}>Elke handmatige wijziging, nieuwste eerst.</p>
      {log.error ? <Fout actie="Logboek nummering lezen" fout={log.error} /> : log.data?.length === 0 ? (
        <div className="cell-muted" style={{ fontSize: 12.5 }}>Nog niets met de hand gewijzigd.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)' }}>
          <table className="st-tbl">
            <thead>
              <tr><th style={{ width: 130 }}>Wanneer</th><th style={{ width: 90 }}>Wie</th><th style={{ width: 110 }}>Reeks</th><th style={{ width: 110 }}>Volgende</th><th>Reden</th></tr>
            </thead>
            <tbody>
              {log.data?.map((w) => (
                <tr key={w.id}>
                  <td className="cell-mono">{tijd(w.createdAt)}</td>
                  <td>{w.door}</td>
                  <td className="cell-mono">{w.sleutel}</td>
                  <td className="cell-mono">{String(w.van).padStart(3, '0')} → {String(w.naar).padStart(3, '0')}</td>
                  <td>{w.reden}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <NummerWijzigVenster reeks={open} onSluit={() => setOpen(null)} />}
    </div>
  )
}
