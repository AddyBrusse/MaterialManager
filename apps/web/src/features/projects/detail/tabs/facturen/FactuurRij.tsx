import { IconArrowBackUp, IconChevronDown, IconChevronRight, IconCornerDownRight, IconFileTypePdf, IconTrash } from '@tabler/icons-react'
import { factuurNummerTekst, heeftFactuurnummer, isVervallen, type Factuur } from '@stockmanager/shared'
import { CelTekst } from '../../components/CelTekst'
import { datum, eur } from '../../lib/format'

interface Props {
  f: Factuur
  open: boolean
  geblokkeerd: boolean
  onToggle: () => void
  onAdres: (naar: string) => void
  onPdf: () => void
  onVerstuur: () => void
  onVerwijder: () => void
  onNummerIn: () => void
  onCrediteer: () => void
  onBetaald: (betaald: boolean) => void
}

/** Wat de status in een woord en een zin zegt. */
export function factuurStatus(
  f: Pick<Factuur, 'id' | 'soort' | 'verzondenOp' | 'betaaldOp' | 'vervaldatum' | 'crediteertFactuurId'>,
): { pill: string; kleur: string; uitleg: string } {
  if (!f.verzondenOp && heeftFactuurnummer(f.id)) return { pill: 'Genummerd', kleur: 'warn', uitleg: 'nog niet verstuurd' }
  if (!f.verzondenOp) return { pill: 'Concept', kleur: '', uitleg: 'nummer komt bij versturen' }
  if (f.soort === 'credit' && !f.crediteertFactuurId) return { pill: 'Verstuurd', kleur: 'ok', uitleg: 'losse credit' }
  if (f.soort === 'credit') return { pill: 'Verstuurd', kleur: 'ok', uitleg: `verrekend met ${f.crediteertFactuurId}` }
  if (f.betaaldOp) return { pill: 'Betaald', kleur: 'ok', uitleg: `op ${datum(f.betaaldOp)}` }
  if (isVervallen(f)) return { pill: 'Vervallen', kleur: 'dgr', uitleg: `had ${datum(f.vervaldatum)} betaald moeten zijn` }
  return { pill: 'Verstuurd', kleur: 'accent', uitleg: `wacht op betaling, uiterlijk ${datum(f.vervaldatum)}` }
}

/**
 * Eén factuur of credit in de lijst. Een credit staat ingesprongen onder de
 * factuur die hij crediteert. Het mailadres is aan te passen zolang hij
 * concept is; daarna staat er naar wie hij ging.
 */
export function FactuurRij(props: Props) {
  const { f, open, geblokkeerd } = props
  const s = factuurStatus(f)
  const credit = f.soort === 'credit'
  const concept = !f.verzondenOp
  const genummerd = heeftFactuurnummer(f.id)
  return (
    <tr className={credit ? 'pdv2-credit-rij' : undefined}>
      <td>
        <button type="button" className="pdv2-uitklap" aria-expanded={open} onClick={props.onToggle}
          aria-label={`Regels van ${factuurNummerTekst(f.id)} ${open ? 'verbergen' : 'tonen'}`}>
          {credit && <IconCornerDownRight size={12} />}
          {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
          <span className="mono" style={{ whiteSpace: 'nowrap' }}>{factuurNummerTekst(f.id)}</span>
        </button>
      </td>
      <td>
        <span className={`pdv2-pill ${s.kleur}`}>{s.pill}</span>
        <span className="pdv2-status-uitleg">{s.uitleg}</span>
      </td>
      <td>
        {concept ? (
          <CelTekst waarde={f.naarEmail} className={`ref ${f.naarEmail ? '' : 'nodig'}`} placeholder="Mailadres invullen"
            uit={geblokkeerd} max={200} onKlaar={props.onAdres} />
        ) : (
          <span className="mono" style={{ fontSize: 11 }}>{f.naarEmail ?? '—'}</span>
        )}
      </td>
      <td className="mono">{datum(f.verzondenOp)}</td>
      <td className="mono">{credit ? '—' : datum(f.vervaldatum)}</td>
      <td className="num">{eur((credit ? -1 : 1) * f.totaalInclBtw)}</td>
      <td className="pdv2-acties">
        <div className="pdv2-pakbon-acties">
          <button type="button" className="pdv2-btn s stil" title="Pdf bekijken" onClick={props.onPdf}>
            <IconFileTypePdf size={13} />
          </button>
          {concept && (
            <>
              <button type="button" className="pdv2-btn s primair" disabled={geblokkeerd} onClick={props.onVerstuur}>Versturen</button>
              {genummerd ? (
                <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={props.onNummerIn}
                  title="Terug naar concept; kan alleen bij het laatst uitgegeven nummer">
                  <IconArrowBackUp size={12} /> Nummer intrekken
                </button>
              ) : (
                <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={props.onVerwijder}>
                  <IconTrash size={12} /> Verwijderen
                </button>
              )}
            </>
          )}
          {!concept && !credit && !f.betaaldOp && (
            <button type="button" className="pdv2-btn s primair" disabled={geblokkeerd} onClick={() => props.onBetaald(true)}>Betaald</button>
          )}
          {!concept && !credit && f.betaaldOp && (
            <button type="button" className="pdv2-btn s stil" disabled={geblokkeerd} onClick={() => props.onBetaald(false)}
              title="Toch nog niet betaald">Terugzetten</button>
          )}
          {!concept && !credit && (
            <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={props.onCrediteer}>Crediteren</button>
          )}
        </div>
      </td>
    </tr>
  )
}
