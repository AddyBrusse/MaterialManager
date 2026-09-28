import { obInhoud, obWijzigingen, type Project } from '@stockmanager/shared'
import { IconDownload, IconExternalLink, IconMail } from '@tabler/icons-react'
import { Card } from '../../components/Card'
import { datum } from '../../lib/format'
import { offerteLabel } from '../../lib/ob-document'

interface Props {
  project: Project
  geblokkeerd: boolean
  onOpenen: () => void
  onPdf: () => void
  onVersturen: () => void
  onZet: (patch: { notities?: string; opdrachtRef?: string | null; levertijdDatum?: string | null }) => void
  onNaarOffertes: () => void
}

/**
 * De kop van de opdracht: het document, waarmee de klant opdracht gaf, en wat
 * de klant ervan heeft gekregen.
 *
 * Alles is aan te passen, ook na versturen (principe van 2026-09-28: de app
 * blokkeert geen wijziging, maar zegt wat er al gebeurd is). Wijkt de huidige
 * stand af van wat de klant kreeg, dan staat dat er — met wat hij nog heeft —
 * en wordt Opnieuw versturen weer de blauwe knop.
 */
export function ObKaart({ project: p, geblokkeerd, onOpenen, onPdf, onVersturen, onZet, onNaarOffertes }: Props) {
  const ob = p.opdrachtbevestiging!
  const log = ob.verzendingen ?? []
  const laatste = log[log.length - 1]
  const nu = obInhoud(p)!
  const wijzigingen = laatste ? obWijzigingen(laatste.inhoud, nu) : []
  const verstuurd = Boolean(ob.verzondenOp)
  const moetVersturen = !verstuurd || wijzigingen.length > 0

  return (
    <Card
      titel="Opdrachtbevestiging"
      teller={ob.id}
      acties={
        <>
          <span className={`pdv2-pill ${verstuurd ? (wijzigingen.length ? 'warn' : 'ok') : ''}`}>
            {verstuurd ? (wijzigingen.length ? 'Gewijzigd na versturen' : 'Verstuurd') : 'Nog niet verstuurd'}
          </span>
          <button type="button" className="pdv2-btn s" onClick={onOpenen} title="Toont de pdf in een eigen venster">
            <IconExternalLink size={12} />
            Openen
          </button>
          <button type="button" className="pdv2-btn s" onClick={onPdf}>
            <IconDownload size={12} />
            Pdf
          </button>
          <button
            type="button"
            className={`pdv2-btn s ${moetVersturen ? 'primair' : ''}`}
            onClick={onVersturen}
            disabled={geblokkeerd}
            title="Zet de mail met de pdf klaar in Outlook"
          >
            <IconMail size={12} />
            {verstuurd ? 'Opnieuw versturen' : 'Versturen'}
          </button>
        </>
      }
    >
      <div className="pdv2-grid3">
        <div className="pdv2-veld">
          <label htmlFor="ob-ref">Opdrachtreferentie *</label>
          <input
            id="ob-ref"
            key={ob.opdrachtRef ?? ''}
            defaultValue={ob.opdrachtRef ?? ''}
            maxLength={200}
            disabled={geblokkeerd}
            placeholder="inkoopnummer, of mail/WhatsApp + datum"
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v !== (ob.opdrachtRef ?? '')) onZet({ opdrachtRef: v || null })
            }}
          />
          <div className="hint">Waarmee de klant opdracht gaf. Nodig om te versturen.</div>
        </div>
        <div className="pdv2-veld">
          <label htmlFor="ob-lever">Levertijd</label>
          <input
            id="ob-lever"
            type="date"
            key={p.levertijdDatum ?? ''}
            defaultValue={p.levertijdDatum?.slice(0, 10) ?? ''}
            disabled={geblokkeerd}
            onBlur={(e) => {
              const v = e.currentTarget.value || null
              if (v !== (p.levertijdDatum?.slice(0, 10) ?? null)) onZet({ levertijdDatum: v })
            }}
          />
          <div className="hint">Dezelfde datum als in de kop van het project.</div>
        </div>
        <div className="pdv2-veld">
          <label>Uit offerte</label>
          <button type="button" className="pdv2-link mono" onClick={onNaarOffertes}>
            {offerteLabel(p)}
          </button>
        </div>
      </div>

      <div className="pdv2-veld" style={{ marginTop: 9 }}>
        <label htmlFor="ob-notitie">Opmerking voor de klant (komt op de pdf)</label>
        <textarea
          id="ob-notitie"
          key={ob.notities}
          defaultValue={ob.notities}
          maxLength={2000}
          disabled={geblokkeerd}
          placeholder="bijvoorbeeld: levering in twee delen, of: wordt afgehaald"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v !== ob.notities.trim()) onZet({ notities: v })
          }}
        />
      </div>

      {wijzigingen.length > 0 && (
        <div className="pdv2-melding warn">
          <strong>Gewijzigd na versturen</strong> — de klant heeft nog de stand van {datum(laatste!.op)}:
          <ul>
            {wijzigingen.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {log.length > 0 && (
        <div className="pdv2-log">
          {log.map((v, i) => (
            <span key={`${v.op}-${i}`}>
              {i === 0 ? 'Verstuurd' : 'Opnieuw verstuurd'} {datum(v.op)} door {v.door}
              {v.naar ? ` naar ${v.naar}` : ''}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
