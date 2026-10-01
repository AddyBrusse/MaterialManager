import { useNavigate } from 'react-router-dom'
import { minToHm, secondenNaarUren, type Klokregel, type MachineNacalculatie } from '@stockmanager/shared'
import { datumKort, eur, tijdstip } from '../../lib/format'
import { BoomCel, VerschilCellen } from './cellen'

interface Props {
  m: MachineNacalculatie
  /** Gecalculeerde machines van deze order waar niet op gewerkt is: "calculatie: DMG". */
  ongebruikt: string[]
  open: boolean
  onToggle: () => void
}

const pctVan = (verschil: number, basis: number) => (basis === 0 ? null : (verschil / basis) * 100)

/** "1:00 u → 1:30 u", of alleen de kant die er is. */
function tijdTekst(gecalcMin: number | null, werkSec: number | null): string {
  const g = gecalcMin === null ? null : minToHm(gecalcMin)
  const w = werkSec === null ? null : secondenNaarUren(werkSec)
  if (g && w) return `${g} → ${w}`
  return g ?? w ?? '—'
}

/**
 * Eén machine van een order, met instellen en draaien eronder en daaronder elke
 * keer dat er geklokt is (besloten 2026-10-01).
 *
 * Draaide het werk op een andere machine dan gecalculeerd, dan staan ze er
 * allebei: de gecalculeerde met "niet gebruikt", de andere met "niet
 * gecalculeerd". Anders lijkt de ene duur zonder reden en verdwijnt de andere.
 */
export function MachineRijen({ m, ongebruikt, open, onToggle }: Props) {
  const g = m.gecalculeerd
  const w = m.werkelijk
  const labels = [
    !g && <span key="ng" className="pdv2-pill warn">niet gecalculeerd{ongebruikt.length > 0 && ` — calculatie: ${ongebruikt.join(', ')}`}</span>,
    g && !w && <span key="nb" className="pdv2-pill">niet gebruikt</span>,
    m.tariefOnbekend && <span key="nt" className="pdv2-pill dgr" title="Deze naam staat niet in de machinelijst, dus er is geen uurtarief: de uren tellen als € 0.">geen tarief</span>,
  ].filter(Boolean)

  return (
    <>
      <tr className="pdv2-boom-1">
        <BoomCel diepte={1} open={m.klokregels.length > 0 || g ? open : undefined} onToggle={onToggle}>
          <strong>{m.naam}</strong> {labels}
        </BoomCel>
        <td className="num">
          {tijdTekst(g ? g.instelMin + g.draaienMin : null, w ? w.instelSeconden + w.draaienSeconden : null)}
        </td>
        <td className="num">{g ? eur(m.gecalculeerdTotaal) : '—'}</td>
        <td className="num">{w ? eur(m.werkelijkTotaal) : '—'}</td>
        <VerschilCellen verschil={g && w ? m.verschil : null} pctWaarde={m.verschilPct} />
      </tr>
      {open && (
        <>
          <PostRij
            label="Instellen"
            tijd={tijdTekst(g?.instelMin ?? null, w?.instelSeconden ?? null)}
            gecalc={g?.instelKosten ?? null}
            werk={w?.instelKosten ?? null}
          />
          <PostRij
            label="Draaien"
            sub={w && w.onbemandSeconden > 0 ? `waarvan ${secondenNaarUren(w.onbemandSeconden)} onbemand` : undefined}
            tijd={tijdTekst(g?.draaienMin ?? null, w?.draaienSeconden ?? null)}
            gecalc={g?.draaienKosten ?? null}
            werk={w?.draaienKosten ?? null}
          />
          {m.klokregels.map((k) => <KlokRij key={k.id} k={k} />)}
        </>
      )}
    </>
  )
}

function PostRij({ label, sub, tijd, gecalc, werk }: {
  label: string; sub?: string; tijd: string; gecalc: number | null; werk: number | null
}) {
  const verschil = gecalc !== null && werk !== null ? werk - gecalc : null
  return (
    <tr className="pdv2-boom-2">
      <BoomCel diepte={2}>
        {label}
        {sub && <span className="sub">{sub}</span>}
      </BoomCel>
      <td className="num">{tijd}</td>
      <td className="num">{gecalc === null ? '—' : eur(gecalc)}</td>
      <td className="num">{werk === null ? '—' : eur(werk)}</td>
      <VerschilCellen verschil={verschil} pctWaarde={verschil === null ? null : pctVan(verschil, gecalc ?? 0)} />
    </tr>
  )
}

const SOORT: Record<string, string> = { instellen: 'Instellen', draaien: 'Draaien' }

/** Lokale datum als yyyy-mm-dd — de dag waarop de Tijdregistratie-pagina hem toont. */
function dagVan(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Eén klokregel. Alleen kijken; klikken opent hem op de Tijdregistratie-pagina. */
function KlokRij({ k }: { k: Klokregel }) {
  const navigate = useNavigate()
  const loopt = k.status !== 'afgerond'
  const soort = !k.bemand && k.soort === 'draaien' ? 'Onbemand' : SOORT[k.soort]
  const wie = k.bemand ? (k.userNaam ?? 'onbekend') : 'geen operator'
  return (
    <tr
      className={`pdv2-boom-3 pdv2-klik${loopt ? ' loopt' : ''}`}
      onClick={() => navigate(`/tijdregistratie?datum=${dagVan(k.gestartOp)}&regel=${k.id}`)}
      title="Openen in Tijdregistratie"
    >
      <BoomCel diepte={3}>
        <span className="mono">{datumKort(k.gestartOp)} {tijdstip(k.gestartOp)}</span>
        {' · '}{soort} · {wie}
        {k.aantalStuks != null && ` · ${k.aantalStuks} st`}
        {loopt && <span className="pdv2-pill" style={{ marginLeft: 6 }}>{k.status === 'lopend' ? 'loopt nog' : 'gepauzeerd'}</span>}
        {k.gecorrigeerd && k.correctieReden && <span className="sub">bijgesteld: {k.correctieReden}</span>}
      </BoomCel>
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
