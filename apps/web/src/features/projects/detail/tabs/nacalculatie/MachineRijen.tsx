import { useNavigate } from 'react-router-dom'
import { secondenNaarUren, type Klokregel, type MachineNacalculatie } from '@stockmanager/shared'
import { eur, tijdstip } from '../../lib/format'
import { BoomCel, KostenCellen, TijdCellen, VerschilCellen } from './cellen'

interface Props {
  m: MachineNacalculatie
  open: boolean
  onToggle: () => void
}

const pctVan = (verschil: number, basis: number) => (basis === 0 ? null : (verschil / basis) * 100)

/** De uitleg onder de machinenaam, in een zin — of niets als alles klopt. */
function Notitie({ m }: { m: MachineNacalculatie }) {
  const zinnen: { tekst: string; let: boolean }[] = []
  if (m.gecalculeerdOp) {
    zinnen.push({ tekst: `Let op! Er is gecalculeerd met de ${m.gecalculeerdOp}`, let: true })
  } else if (!m.gecalculeerd) {
    zinnen.push({ tekst: 'Let op! Deze machine staat niet in de calculatie', let: true })
  } else if (m.klokregels.length === 0) {
    zinnen.push({ tekst: 'Gecalculeerd, nog geen uren op geklokt', let: false })
  }
  if (m.tariefOnbekend) {
    zinnen.push({ tekst: 'Geen uurtarief: deze naam staat niet in de machinelijst, de uren tellen als € 0', let: true })
  }
  if (zinnen.length === 0) return null
  return (
    <>
      {zinnen.map((z) => (
        <span key={z.tekst} className={`sub${z.let ? ' pdv2-let' : ''}`}>{z.tekst}</span>
      ))}
    </>
  )
}

/**
 * Eén machine van een order, met instellen en draaien eronder en daaronder elke
 * keer dat er geklokt is.
 *
 * Ging het werk naar een andere machine, dan staat alleen die erin, met de
 * calculatie van de machine waar niet op geklokt is en een notitie welke dat
 * was (besloten 2026-10-02).
 */
export function MachineRijen({ m, open, onToggle }: Props) {
  const g = m.gecalculeerd
  const w = m.werkelijk

  return (
    <>
      <tr className="pdv2-boom-1">
        <BoomCel diepte={1} open={open} onToggle={onToggle}>
          <strong>{m.naam}</strong>
          <Notitie m={m} />
        </BoomCel>
        <TijdCellen
          gecalcMin={g ? g.instelMin + g.draaienMin : null}
          werkSec={w ? w.instelSeconden + w.draaienSeconden : null}
        />
        <KostenCellen gecalc={g ? m.gecalculeerdTotaal : null} werk={w ? m.werkelijkTotaal : null} />
        <VerschilCellen verschil={g && w ? m.verschil : null} pctWaarde={m.verschilPct} />
      </tr>
      {open && (
        <>
          <PostRij
            label="Instellen"
            gecalcMin={g?.instelMin ?? null}
            werkSec={w?.instelSeconden ?? null}
            gecalc={g?.instelKosten ?? null}
            werk={w?.instelKosten ?? null}
          />
          <PostRij
            label="Draaien"
            sub={w && w.onbemandSeconden > 0
              ? `waarvan ${secondenNaarUren(w.onbemandSeconden)} onbemand (alleen machinetarief)`
              : undefined}
            gecalcMin={g?.draaienMin ?? null}
            werkSec={w?.draaienSeconden ?? null}
            gecalc={g?.draaienKosten ?? null}
            werk={w?.draaienKosten ?? null}
          />
          {m.klokregels.map((k) => <KlokRij key={k.id} k={k} />)}
        </>
      )}
    </>
  )
}

function PostRij({ label, sub, gecalcMin, werkSec, gecalc, werk }: {
  label: string; sub?: string
  gecalcMin: number | null; werkSec: number | null
  gecalc: number | null; werk: number | null
}) {
  const verschil = gecalc !== null && werk !== null ? werk - gecalc : null
  return (
    <tr className="pdv2-boom-2">
      <BoomCel diepte={2}>
        {label}
        {sub && <span className="sub">{sub}</span>}
      </BoomCel>
      <TijdCellen gecalcMin={gecalcMin} werkSec={werkSec} />
      <KostenCellen gecalc={gecalc} werk={werk} />
      <VerschilCellen verschil={verschil} pctWaarde={verschil === null ? null : pctVan(verschil, gecalc ?? 0)} />
    </tr>
  )
}

/** Lokale datum als yyyy-mm-dd — de dag waarop de Tijdregistratie-pagina hem toont. */
function dagVan(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "wo 30-09 · 07:00–07:45" */
function wanneer(k: Klokregel): string {
  const d = new Date(k.gestartOp)
  const dag = d.toLocaleDateString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${dag} · ${tijdstip(k.gestartOp)}–${k.gestoptOp ? tijdstip(k.gestoptOp) : 'nu'}`
}

/** Eén klokregel. Alleen kijken; klikken opent hem op de Tijdregistratie-pagina. */
function KlokRij({ k }: { k: Klokregel }) {
  const navigate = useNavigate()
  const loopt = k.status !== 'afgerond'
  const wat = k.soort === 'instellen' ? 'Instellen' : k.bemand ? 'Draaien' : 'Draaien onbemand'
  const delen = [wat, k.bemand ? (k.userNaam ?? 'onbekend') : null, k.aantalStuks != null ? `${k.aantalStuks} stuks` : null]
  return (
    <tr
      className={`pdv2-boom-3 pdv2-klik${loopt ? ' loopt' : ''}`}
      onClick={() => navigate(`/tijdregistratie?datum=${dagVan(k.gestartOp)}&regel=${k.id}`)}
      title="Openen in Tijdregistratie"
    >
      <BoomCel diepte={3}>
        {delen.filter(Boolean).join(' · ')}
        {loopt && (
          <span className="pdv2-pill" style={{ marginLeft: 6 }}>
            {k.status === 'lopend' ? 'loopt nog — telt nog niet mee' : 'gepauzeerd — telt nog niet mee'}
          </span>
        )}
        <span className="sub">
          {wanneer(k)}
          {k.gecorrigeerd && k.correctieReden && ` · bijgesteld: ${k.correctieReden}`}
        </span>
      </BoomCel>
      {/* Een klokregel heeft geen calculatie: die kolommen blijven leeg. */}
      <td />
      <td className="num">
        {k.gecorrigeerd && <s style={{ color: 'var(--text3)', marginRight: 6 }}>{secondenNaarUren(k.gemetenSeconden)}</s>}
        {secondenNaarUren(k.seconden)}
      </td>
      <td />
      <td className="num">{k.kosten === null ? '—' : eur(k.kosten)}</td>
      <td colSpan={3} />
    </tr>
  )
}
