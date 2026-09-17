// Alle facturen en creditnota's van een project, één kaart per document.
//
// Eerder was er één factuur per project, over de hele offerte. Dat kan niet
// meer: bij een deellevering factureer je wat er geleverd is, en de rest volgt
// later. Aanmaken gebeurt op de projectpagina bij de kolomgroep Factuur, waar
// ook staat hoeveel er openstaat. Crediteren gebeurt hier, want dat hoort bij
// een bestáánde factuur.
import { useState } from 'react'
import { IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { projectsApi, formatBedrag, formatDate } from '../../api/projects'
import { articlesApi } from '../../api/articles'
import { ArtikelPreviewThumb } from './ArtikelPreviewThumb'
import {
  berekenVoortgang, basisRegels, gefactureerdInclBtw,
  type Project, type Factuur,
} from '@stockmanager/shared'

interface Props {
  project: Project
  onChanged: () => void
}

export function FactuurTab({ project, onChanged }: Props) {
  const voortgang = berekenVoortgang(project)
  const [crediteert, setCrediteert] = useState<string | null>(null)

  function handleVerzend(factuurId: string) {
    try {
      projectsApi.verzendFactuur(project.id, factuurId)
      notifications.show({ color: 'blue', message: `${factuurId} als verzonden gemarkeerd` })
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  function handleCredit(factuurId: string) {
    try {
      projectsApi.createCredit(project.id, factuurId)
      notifications.show({ color: 'green', message: `Creditnota op ${factuurId} aangemaakt` })
      setCrediteert(null)
      onChanged()
    } catch (e: any) {
      notifications.show({ color: 'red', message: e.message })
    }
  }

  if (project.facturen.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-2)', border: '1px dashed var(--border)', borderRadius: 8,
        padding: 32, textAlign: 'center', color: 'var(--text-3)',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 8 }}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nog geen facturen</div>
        <div style={{ fontSize: 12.5 }}>
          {voortgang.teFactureren > 0
            ? `${voortgang.teFactureren} geleverde stuks staan open (${formatBedrag(voortgang.teFacturerenBedrag)}) — factureren doe je op de projectpagina.`
            : 'Er is nog niets geleverd om te factureren.'}
        </div>
      </div>
    )
  }

  const totaal = gefactureerdInclBtw(project)
  const heeftCredit = project.facturen.some(f => f.soort === 'credit')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 14px', fontSize: 12.5, color: 'var(--text-2)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span>
          Gefactureerd{heeftCredit ? ' (credits eraf)' : ''}:{' '}
          <strong className="cell-mono">{formatBedrag(totaal)}</strong> incl. btw
        </span>
        {voortgang.teFactureren > 0 && (
          <span style={{ color: 'var(--warning)' }}>
            Nog open: {voortgang.teFactureren} stuks ·{' '}
            <strong className="cell-mono">{formatBedrag(voortgang.teFacturerenBedrag)}</strong> excl. btw
          </span>
        )}
      </div>

      {project.facturen.map(f => (
        <FactuurKaart
          key={f.id}
          factuur={f}
          project={project}
          creditOpen={crediteert === f.id}
          onVerzend={() => handleVerzend(f.id)}
          onCreditVragen={() => setCrediteert(f.id)}
          onCreditAnnuleren={() => setCrediteert(null)}
          onCreditBevestigen={() => handleCredit(f.id)}
        />
      ))}
    </div>
  )
}

function FactuurKaart({
  factuur, project, creditOpen,
  onVerzend, onCreditVragen, onCreditAnnuleren, onCreditBevestigen,
}: {
  factuur: Factuur
  project: Project
  creditOpen: boolean
  onVerzend: () => void
  onCreditVragen: () => void
  onCreditAnnuleren: () => void
  onCreditBevestigen: () => void
}) {
  const isCredit = factuur.soort === 'credit'
  // Wat er van deze factuur nog te crediteren valt.
  const alGecrediteerd = project.facturen
    .filter(f => f.crediteertFactuurId === factuur.id)
    .reduce((t, f) => t + f.regels.reduce((s, r) => s + r.qty, 0), 0)
  const gefactureerd = factuur.regels.reduce((t, r) => t + r.qty, 0)
  const kanCrediteren = !isCredit && alGecrediteerd < gefactureerd

  const regelBron = basisRegels(project)

  return (
    <div
      className="prj-off-card"
      // Een creditnota staat ingesprongen onder de factuur waar hij bij hoort,
      // zodat je in één blik ziet dat het er twee zijn die bij elkaar horen.
      style={isCredit ? { marginLeft: 28, borderLeft: '3px solid var(--warning)' } : undefined}
    >
      <div className="prj-off-hd" style={{ cursor: 'default' }}>
        <div className="prj-off-nr">{factuur.id}</div>
        {isCredit && (
          <span className="st-badge warn" style={{ fontSize: 10.5 }}>
            <span className="dot" style={{ width: 5, height: 5 }} />
            Creditnota op {factuur.crediteertFactuurId}
          </span>
        )}
        <span className={`st-badge ${factuur.verzondenOp ? 'ok' : 'info'}`} style={{ fontSize: 10.5 }}>
          <span className="dot" style={{ width: 5, height: 5 }} />
          {factuur.verzondenOp ? 'Verzonden' : 'Concept'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {formatDate(factuur.createdAt)}
          {factuur.vervaldatum ? ` · vervalt ${formatDate(factuur.vervaldatum)}` : ''}
        </span>
      </div>
      <div className="prj-off-body">
        <table className="st-tbl" style={{ fontSize: 12.5, tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ width: 116 }}>Voorbeeld</th>
              <th>Omschrijving</th>
              <th style={{ textAlign: 'right', width: 80 }}>Qty</th>
              <th style={{ textAlign: 'right', width: 110 }}>Prijs/stuk</th>
              <th style={{ textAlign: 'right', width: 110 }}>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {factuur.regels.map((r, i) => {
              const artikelId = regelBron.find(x => x.id === r.offerteRegelId)?.artikelId ?? null
              const art = artikelId ? articlesApi.list().find(a => a.id === artikelId) ?? null : null
              return (
                <tr key={`${r.offerteRegelId}-${i}`}>
                  <td className="cell-muted">{i + 1}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <ArtikelPreviewThumb article={art} />
                  </td>
                  <td><span className="cell-strong">{r.naam}</span></td>
                  <td className="cell-num">{isCredit ? '−' : ''}{r.qty} {r.eenheid}</td>
                  <td className="cell-num cell-mono">{formatBedrag(r.verkoopprijs)}</td>
                  <td className="cell-num cell-mono cell-strong">
                    {isCredit ? '−' : ''}{formatBedrag(r.totaal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 24,
          padding: '10px 12px', fontSize: 12.5, color: 'var(--text-2)',
        }}>
          <span>Subtotaal <span className="cell-mono">{isCredit ? '−' : ''}{formatBedrag(factuur.subtotaal)}</span></span>
          <span>Btw {factuur.btwPct}% <span className="cell-mono">{isCredit ? '−' : ''}{formatBedrag(factuur.btwBedrag)}</span></span>
          <strong>Totaal <span className="cell-mono">{isCredit ? '−' : ''}{formatBedrag(factuur.totaalInclBtw)}</span></strong>
        </div>

        {creditOpen && (
          <div style={{
            background: 'var(--warning-soft)', border: '1px solid rgba(168,90,0,.25)',
            borderRadius: 6, padding: '10px 12px', margin: '0 12px 10px', fontSize: 12.5,
          }}>
            <div style={{ marginBottom: 8 }}>
              Creditnota maken voor de resterende <strong>{gefactureerd - alGecrediteerd}</strong> stuks
              van {factuur.id}. De factuur zelf blijft staan — die is verstuurd.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="st-btn sm" onClick={onCreditAnnuleren}>Annuleren</button>
              <button className="st-btn sm primary" onClick={onCreditBevestigen}>Creditnota maken</button>
            </div>
          </div>
        )}

        <div className="prj-off-footer">
          <button className="st-btn sm ghost" disabled title="PDF generatie beschikbaar na backend implementatie">
            ↓ PDF
          </button>
          <div style={{ flex: 1 }} />
          {kanCrediteren && !creditOpen && (
            <button className="st-btn sm" onClick={onCreditVragen}>Crediteren</button>
          )}
          {!factuur.verzondenOp && (
            <button className="st-btn sm primary" onClick={onVerzend}>
              <IconSend size={13} />Markeer als verzonden
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
