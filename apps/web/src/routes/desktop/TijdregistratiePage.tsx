import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconAlertTriangle, IconPencil, IconCheck, IconMoon, IconUser } from '@tabler/icons-react'
import { secondenNaarKlok, secondenNaarUren } from '@stockmanager/shared'
import type { TijdRegistratieDTO } from '../../api/tijdregistratie'
import { useLopendeTijd, useTijdVanDag, useTijdActies, useKlok } from '../../hooks/useTijdregistratie'
import { CorrectieModal } from '../../components/tijd/CorrectieModal'
import { TE_LANG_SECONDEN } from '../../components/tijd/ActieveRegistratie'

function vandaagISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function langeDatum(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function tijdstip(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/** Eén rij in "Nu bezig" — apart zodat de klok per rij kan doortikken. */
function LopendeRij({
  r, onPauze, onHervat, onKlaar,
}: {
  r: TijdRegistratieDTO
  onPauze: () => void; onHervat: () => void; onKlaar: () => void
}) {
  const seconden = useKlok(r)
  const teLang = seconden > TE_LANG_SECONDEN
  const gepauzeerd = r.status === 'gepauzeerd'

  return (
    <>
      <tr>
        <td className="cell-mono cell-muted">{tijdstip(r.gestartOp)}</td>
        <td>
          <div className="cell-strong">{r.artikelNaam}</div>
          <div className="cell-muted" style={{ fontSize: 11.5 }}>
            <Link to={`/projecten/${r.projectId}`}>{r.orderId}</Link>
          </div>
        </td>
        <td>{r.machineNaam ?? '—'}</td>
        <td>
          <span className={`st-badge${r.soort === 'instellen' ? ' info' : ''}`}>{r.soort}</span>
        </td>
        <td>
          {r.bemand
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <IconUser size={13} stroke={1.8} />{r.userNaam ?? 'onbekend'}
              </span>
            : <span className="cell-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <IconMoon size={13} stroke={1.8} />onbemand
              </span>}
        </td>
        <td className="cell-mono cell-num" style={teLang ? { color: 'var(--warning)', fontWeight: 600 } : undefined}>
          {secondenNaarKlok(seconden)}
        </td>
        <td className="row-actions">
          {gepauzeerd
            ? <button className="st-btn xs" onClick={onHervat}>hervat</button>
            : <button className="st-btn xs" onClick={onPauze}>pauze</button>}
          <button className="st-btn xs primary" onClick={onKlaar}>klaar</button>
        </td>
      </tr>
      {teLang && (
        <tr>
          <td colSpan={7} style={{ padding: '0 12px 8px' }}>
            <div className="tr-telang">
              <IconAlertTriangle size={14} stroke={2} />
              <span>
                Loopt al {secondenNaarUren(seconden)}. Bijna altijd een klok die is blijven
                staan. Rond hem af en stel de tijd bij — automatisch afsluiten zou tijd verzinnen.
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Tijdregistratie — de enige echt nieuwe kantoorpagina.
 *
 * De wachtrij houdt de klok bij het werk; hier zie je de dag als geheel: wat er
 * nu loopt, wat er vandaag geregistreerd is, en welke klok is blijven staan. Dat
 * laatste is de grootste vervuiler van de dataset waar de calculatie op leunt.
 */
export function TijdregistratiePage() {
  const [datum, setDatum] = useState(vandaagISO())
  const lopend = useLopendeTijd()
  const dag = useTijdVanDag(datum)
  const acties = useTijdActies()
  const [corrigeren, setCorrigeren] = useState<TijdRegistratieDTO | null>(null)

  const lopendeRijen = lopend.data ?? []
  const dagRijen = useMemo(
    () => (dag.data ?? []).filter((r) => r.status === 'afgerond'),
    [dag.data],
  )

  const tellers = useMemo(() => {
    const totaal = dagRijen.reduce((s, r) => s + r.seconden, 0)
    const instellen = dagRijen.filter((r) => r.soort === 'instellen').reduce((s, r) => s + r.seconden, 0)
    const onbemand = dagRijen.filter((r) => !r.bemand).reduce((s, r) => s + r.seconden, 0)
    return { totaal, instellen, onbemand }
  }, [dagRijen])

  // Berekend uit de lopende regels zelf en niet uit een teller die per seconde
  // tikt: het gaat om hoeveel er te lang lopen, niet om de precieze stand.
  const teLang = lopendeRijen.filter(
    (r) => r.seconden > TE_LANG_SECONDEN,
  ).length

  const bezig = acties.pauze.isPending || acties.hervat.isPending || acties.stop.isPending

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Tijdregistratie</div>
          <div className="st-page-sub">Wat er nu loopt, en wat er vandaag geregistreerd is</div>
        </div>
        <div className="st-page-actions">
          <input
            className="st-input" type="date" value={datum} style={{ width: 150 }}
            onChange={(e) => setDatum(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="st-stats">
        <div className="st-stat">
          <span className="st-stat-lbl">Nu bezig</span>
          <span className="st-stat-val">{lopendeRijen.length}</span>
          <span className="st-stat-foot">
            {lopendeRijen.filter((r) => r.status === 'gepauzeerd').length} op pauze
          </span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Vandaag geregistreerd</span>
          <span className="st-stat-val">{secondenNaarUren(tellers.totaal)}</span>
          <span className="st-stat-foot">{dagRijen.length} afgeronde regels</span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Waarvan instellen</span>
          <span className="st-stat-val">{secondenNaarUren(tellers.instellen)}</span>
          <span className="st-stat-foot">telt één keer per batch</span>
        </div>
        <div className="st-stat" style={teLang > 0 ? { borderColor: 'var(--warning)' } : undefined}>
          <span className="st-stat-lbl">Loopt te lang</span>
          <span className="st-stat-val">{teLang}</span>
          <span className="st-stat-foot">meer dan {secondenNaarUren(TE_LANG_SECONDEN)} op één klok</span>
        </div>
        <div className="st-stat">
          <span className="st-stat-lbl">Onbemande uren</span>
          <span className="st-stat-val">{secondenNaarUren(tellers.onbemand)}</span>
          <span className="st-stat-foot">machine-uren zonder operator</span>
        </div>
      </div>

      <div className="st-card">
        <div className="st-card-hd">Nu bezig</div>
        <div className="st-table-wrap">
          {lopendeRijen.length === 0 ? (
            <div className="st-empty">Er loopt op dit moment geen klok.</div>
          ) : (
            <table className="st-tbl">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Gestart</th>
                  <th>Wat</th>
                  <th style={{ width: 130 }}>Machine</th>
                  <th style={{ width: 90 }}>Soort</th>
                  <th style={{ width: 140 }}>Wie</th>
                  <th style={{ width: 90 }}>Loopt</th>
                  <th style={{ width: 130 }}></th>
                </tr>
              </thead>
              <tbody>
                {lopendeRijen.map((r) => (
                  <LopendeRij
                    key={r.id} r={r}
                    onPauze={() => acties.pauze.mutate(r.id)}
                    onHervat={() => acties.hervat.mutate(r.id)}
                    onKlaar={() => acties.stop.mutate({ id: r.id })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="st-card" style={{ marginTop: 12 }}>
        <div className="st-card-hd">Afgerond op {langeDatum(datum)}</div>
        <div className="st-table-wrap">
          {dagRijen.length === 0 ? (
            <div className="st-empty">Niets geregistreerd op deze dag.</div>
          ) : (
            <table className="st-tbl">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Tijd</th>
                  <th>Wat</th>
                  <th style={{ width: 130 }}>Machine</th>
                  <th style={{ width: 90 }}>Soort</th>
                  <th style={{ width: 140 }}>Wie</th>
                  <th style={{ width: 60 }}>Stuks</th>
                  <th style={{ width: 90 }}>Duur</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {dagRijen.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-mono cell-muted">
                      {tijdstip(r.gestartOp)}–{tijdstip(r.gestoptOp)}
                    </td>
                    <td>
                      <div className="cell-strong">{r.artikelNaam}</div>
                      <div className="cell-muted" style={{ fontSize: 11.5 }}>
                        <Link to={`/projecten/${r.projectId}`}>{r.orderId}</Link>
                        {r.gecorrigeerd && (
                          <> · gemeten {secondenNaarUren(r.gemetenSeconden)} · bijgesteld naar{' '}
                            {secondenNaarUren(r.bijgesteldeSeconden ?? 0)} door {r.correctieDoor}</>
                        )}
                      </div>
                    </td>
                    <td>{r.machineNaam ?? '—'}</td>
                    <td><span className={`st-badge${r.soort === 'instellen' ? ' info' : ''}`}>{r.soort}</span></td>
                    <td>
                      {r.bemand
                        ? (r.userNaam ?? 'onbekend')
                        : <span className="cell-muted">onbemand</span>}
                    </td>
                    <td className="cell-mono cell-num">{r.aantalStuks ?? '—'}</td>
                    <td className="cell-mono cell-num">
                      {secondenNaarUren(r.seconden)}
                      {r.gecorrigeerd && <IconCheck size={12} stroke={2} style={{ marginLeft: 4, color: 'var(--text-3)' }} />}
                    </td>
                    <td className="row-actions">
                      <button className="st-btn xs" onClick={() => setCorrigeren(r)}>
                        <IconPencil size={12} stroke={1.8} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CorrectieModal
        registratie={corrigeren}
        open={!!corrigeren}
        onClose={() => setCorrigeren(null)}
        bezig={acties.corrigeer.isPending}
        onOpslaan={(v) => {
          if (!corrigeren) return
          acties.corrigeer.mutate({ id: corrigeren.id, ...v }, { onSuccess: () => setCorrigeren(null) })
        }}
      />
      {bezig && null}
    </>
  )
}
