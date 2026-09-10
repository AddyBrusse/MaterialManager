import type { MailImport, SenderConfidence } from '@stockmanager/shared'

/**
 * Alles wat je alléén nodig hebt als er iets niet klopt — features/60 §3.7.
 *
 * Het controlescherm ging eraan onderdoor: uitgelezen pdf-tekst, zekerheids-
 * onderbouwing, herkomst van de afzender en de ruwe berichttekst stonden
 * allemaal even prominent als de regels zelf. Dat maakt een scherm dat je
 * dagelijks gebruikt moeilijker te lezen om een geval dat zelden voorkomt.
 *
 * Dus: standaard ingeklapt. Wie iets wil narekenen klapt het open, en vindt dan
 * alles bij elkaar in plaats van verspreid over het scherm.
 */

const CONFIDENCE_LABEL: Record<SenderConfidence, string> = {
  hoog: 'zeker', midden: 'waarschijnlijk', laag: 'onzeker',
}

export function MailDebugPaneel({ mailImport }: { mailImport: MailImport }) {
  const res = mailImport.resolutie
  const ex = mailImport.extractie
  const bijlagen = mailImport.bijlagen.filter((b) => !b.isEmbeddedMessage)

  return (
    <details className="mi-debug">
      <summary>Technische details</summary>
      <div className="mi-debug-body">
        <div className="mi-debug-blok">
          <div className="kop">Afzender</div>
          <dl className="mi-meta">
            <dt>Van</dt>
            <dd>{[mailImport.afzenderNaam, mailImport.afzenderEmail].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Ontvangen</dt>
            <dd>{mailImport.ontvangenOp ? new Date(mailImport.ontvangenOp).toLocaleString('nl-NL') : '—'}</dd>
            {res && (
              <>
                <dt>Herkomst</dt>
                <dd>{CONFIDENCE_LABEL[res.confidence]} — {res.reden}</dd>
              </>
            )}
          </dl>
        </div>

        {ex && (
          <div className="mi-debug-blok">
            <div className="kop">Uitlezen</div>
            <dl className="mi-meta">
              <dt>Gelezen door</dt>
              <dd>{ex.aiGebruikt ? ex.model : 'niets — zie melding'}{ex.controleGedaan ? ' · met controlelezing' : ''}</dd>
              <dt>Zekerheid</dt>
              <dd>gemiddeld {Math.round(ex.zekerheid * 100)}% · laagste regel {Math.round(ex.laagsteZekerheid * 100)}%</dd>
              <dt>Bron van de regels</dt>
              <dd>{ex.documentGebruikt ?? 'geen document — uit de mailtekst en bestandsnamen'}</dd>
              {ex.volledigMeegestuurd.length > 0 && (
                <>
                  <dt>Volledig meegestuurd</dt>
                  <dd>{ex.volledigMeegestuurd.join(', ')}</dd>
                </>
              )}
              {ex.titelblokGelezen.length > 0 && (
                <>
                  <dt>Titelblok gelezen</dt>
                  <dd>{ex.titelblokGelezen.join(', ')}</dd>
                </>
              )}
              {ex.gescandeBijlagen.length > 0 && (
                <>
                  <dt>Zonder tekstlaag</dt>
                  <dd>{ex.gescandeBijlagen.join(', ')}</dd>
                </>
              )}
              {(ex.ongegrondeRegels > 0 || ex.onbevestigdeRegels > 0) && (
                <>
                  <dt>Aandachtspunten</dt>
                  <dd style={{ color: 'var(--danger)' }}>
                    {[
                      ex.ongegrondeRegels > 0 ? `${ex.ongegrondeRegels} regel(s) niet letterlijk terug te vinden` : null,
                      ex.onbevestigdeRegels > 0 ? `${ex.onbevestigdeRegels} regel(s) waarover de lezingen het oneens waren` : null,
                    ].filter(Boolean).join(' · ')}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}

        <div className="mi-debug-blok">
          <div className="kop">Bijlagen ({bijlagen.length})</div>
          {bijlagen.map((b) => (
            <div key={b.path ?? b.filename} className="mi-bijlage-rij">
              <div className="mi-bijlage">
                <span className="naam">
                  {b.path ? <a href={b.path} target="_blank" rel="noreferrer">{b.filename}</a> : b.filename}
                </span>
                <span className="maat">{Math.max(1, Math.round(b.sizeBytes / 1024))} kB</span>
              </div>
              {b.tekst ? (
                <details>
                  <summary className="mi-noot" style={{ cursor: 'pointer' }}>
                    Uitgelezen tekst ({b.tekst.length.toLocaleString('nl-NL')} tekens)
                    {b.tekstPath && (
                      <> · <a href={b.tekstPath} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>volledig</a></>
                    )}
                  </summary>
                  <textarea readOnly value={b.tekst} spellCheck={false} className="mi-tekstlaag" />
                </details>
              ) : (
                b.filename.toLowerCase().endsWith('.pdf') && (
                  <div className="mi-noot">Geen tekstlaag — als afbeelding gelezen of een scan.</div>
                )
              )}
            </div>
          ))}
        </div>

        <div className="mi-debug-blok">
          <div className="kop">Berichttekst</div>
          <pre className="mi-berichttekst">{mailImport.bodyText || '(leeg)'}</pre>
        </div>
      </div>
    </details>
  )
}
