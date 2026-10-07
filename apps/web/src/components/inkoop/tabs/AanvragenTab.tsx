import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { prijsVanAntwoord, waaromNietNaarBuffer, type BestelRegel, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { meldFout } from '../../../utils/fout-melding-toon'
import { Weigering } from '../../../utils/fout-melding'
import { aantalTekst, kg } from '../bestellingen/bestel-tekst'
import { ddmm } from '../overzicht/tekst'
import { AntwoordRij } from './AntwoordRij'
import { LeveranciersKiezer } from './LeveranciersKiezer'
import { useAanvragenVersturen } from './useAanvragenVersturen'

type Gevraagd = InkoopOverzichtRegel['gevraagd'][number]

/** Per leverancier alleen de nieuwste aanvraag: twee keer gevraagd is één rij. */
function perLeverancier(gevraagd: Gevraagd[]): Gevraagd[] {
  const m = new Map<string, Gevraagd>()
  for (const g of gevraagd) { const al = m.get(g.leverancierId); if (!al || g.aanvraagId > al.aanvraagId) m.set(g.leverancierId, g) }
  return [...m.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
}

const totaalVan = (r: InkoopOverzichtRegel, g: Gevraagd) =>
  g.antwoord ? prijsVanAntwoord(g.antwoord, { stuks: r.stuks, kg: r.kg, gradeId: '', rawMaterialId: null }).totaal : null

/**
 * Tab 2 · Open prijsaanvragen (2026-10-07): per regel de leveranciers die we
 * vroegen, met hun antwoord in de rij. Kiezen doe je per regel; daarna gaat de
 * regel naar de inkoopbuffer.
 */
export function AanvragenTab({ ov, bestelRegels, onOpen }: { ov: InkoopOverzicht; bestelRegels: BestelRegel[]; onOpen: (r: InkoopOverzichtRegel) => void }) {
  const qc = useQueryClient()
  const regels = ov.regels.filter((r) => r.status === 'aangevraagd')
  const ververs = () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) }
  const versturen = useAanvragenVersturen(bestelRegels)
  const keuze = (r: InkoopOverzichtRegel) => (r.leverancier?.gekozen ? r.leverancier : null)
  const metKeuze = regels.filter((r) => keuze(r))

  const naarBuffer = useMutation({
    mutationFn: (rs: InkoopOverzichtRegel[]) => {
      for (const r of rs) { const nee = waaromNietNaarBuffer({ ...r, keuze: keuze(r) }); if (nee) throw new Weigering(nee) }
      return bestelRegelsApi.naarBuffer(rs.map((r) => r.id))
    },
    onSuccess: (rs) => { ververs(); notifications.show({ color: 'green', message: `${rs.length} regel${rs.length === 1 ? '' : 's'} naar de inkoopbuffer` }) },
    onError: (e) => meldFout({ actie: 'Naar de inkoopbuffer', fout: e, gevolg: 'Er is niets verplaatst.' }),
  })
  const goedkoopste = useMutation({
    mutationFn: () => bestelRegelsApi.goedkoopste(regels.filter((r) => !keuze(r)).map((r) => r.id)),
    onSuccess: (u) => {
      ververs()
      notifications.show({ color: u.zonderPrijs.length ? 'orange' : 'green', message: `${u.gekozen} keer de goedkoopste gekozen${u.zonderPrijs.length ? `; nog geen prijs bij ${u.zonderPrijs.join(', ')}` : ''}` })
    },
    onError: (e) => meldFout({ actie: 'Overal de goedkoopste kiezen', fout: e, gevolg: 'Een deel is misschien al gekozen; kijk de regels na.' }),
  })

  if (regels.length === 0) return <div className="ib-leeg">Geen open prijsaanvragen. Vraag prijzen aan bij Te bestellen.</div>

  return (
    <>
      <div className="ib-balk">
        <span>{regels.length} regel{regels.length === 1 ? '' : 's'} · {metKeuze.length} met een gekozen leverancier</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="st-btn sm" disabled={goedkoopste.isPending} onClick={() => goedkoopste.mutate()}>Overal de goedkoopste kiezen</button>
        <button type="button" className="st-btn primary sm" onClick={() => (metKeuze.length
          ? naarBuffer.mutate(metKeuze)
          : meldFout({ actie: 'Naar de inkoopbuffer', fout: new Weigering('Er is nog bij geen enkele regel een leverancier gekozen.'), gevolg: 'Er is niets verplaatst.' }))}>
          Gekozen regels naar buffer{metKeuze.length ? ` (${metKeuze.length})` : ''}
        </button>
      </div>
      <div className="ib-kaart">
        <table className="st-tbl ib-aanv">
          <thead>
            <tr><th>Leverancier</th><th>Aanvraag</th><th>Prijs als</th><th>Prijs</th><th>Zagen / snede</th><th>Levertijd</th><th className="ta-r">Totaal</th><th style={{ textAlign: 'center' }}>Kies</th></tr>
          </thead>
          {regels.map((r) => {
            const rijen = perLeverancier(r.gevraagd)
            const totalen = rijen.map((g) => totaalVan(r, g)).filter((t): t is number => t != null)
            const laagste = totalen.length ? Math.min(...totalen) : null
            const k = keuze(r)
            return (
              <tbody key={r.id}>
                <tr className="kop">
                  <td colSpan={5}>
                    <button type="button" className="ib-lev-knop" style={{ color: 'var(--text)', fontWeight: 600 }} onClick={() => onOpen(r)}>{r.materiaal}</button>
                    {r.exoot && <span className="ib-exoot">EXOOT</span>}
                    <span className="cell-mono" style={{ color: 'var(--text-2)' }}> · {aantalTekst(r)} · {kg(r.kg)}</span>
                    <span className="ib-sub" style={{ display: 'inline' }}> · {r.projectId ?? 'voorraad'}{r.klantNaam ? ` ${r.klantNaam}` : ''}{r.nodig.datum ? ` · nodig ${ddmm(r.nodig.datum)}${r.nodig.machine ? ` (${r.nodig.machine})` : ''}` : ''}</span>
                  </td>
                  <td colSpan={3} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <LeveranciersKiezer label="+ leverancier" knopKlasse="st-btn ghost sm" leveranciers={ov.leveranciers} al={rijen.map((g) => g.leverancierId)} aantal={1}
                      onKies={(ids) => { const extra = ids.filter((id) => !rijen.some((g) => g.leverancierId === id)); if (extra.length) versturen.aanvragen([r.id], extra) }} />
                    {' '}
                    {k ? <button type="button" className="st-btn primary sm" onClick={() => naarBuffer.mutate([r])}>Naar inkoopbuffer →</button>
                      : <span className="ib-sub" style={{ display: 'inline' }}>kies eerst een leverancier</span>}
                  </td>
                </tr>
                {rijen.map((g) => (
                  <AntwoordRij key={`${g.aanvraagId}-${g.leverancierId}`} r={r} g={g}
                    goedkoopst={laagste != null && totaalVan(r, g) === laagste && totalen.length > 1}
                    gekozen={!!k && k.leverancierId === g.leverancierId} />
                ))}
              </tbody>
            )
          })}
        </table>
      </div>
      <div className="ib-uitleg">Ingevuld wordt bewaard zodra je het veld verlaat. De goedkoopste is gemarkeerd; kiezen doe je zelf, of met "Overal de goedkoopste kiezen".</div>
      {versturen.dialoog}
    </>
  )
}
