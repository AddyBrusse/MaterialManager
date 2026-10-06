import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft } from '@tabler/icons-react'
import { celBronnenVoor, celVoor, goedkoopste, perLeverancier, waaromNietKiezen, type BestelRegel, type Cel } from '@stockmanager/shared'
import { bestelRegelsApi, prijsaanvragenApi } from '../../api/bestellingen'
import { meldFout } from '../../utils/fout-melding-toon'
import { eis } from '../../utils/fout-melding'
import { ExootLabel } from '../../components/inkoop/ExootLabel'
import { VergelijkCel } from '../../components/inkoop/bestellingen/VergelijkCel'
import { AntwoordVenster } from '../../components/inkoop/bestellingen/AntwoordVenster'
import { aantalTekst, eur, kg } from '../../components/inkoop/bestellingen/bestel-tekst'
import '../../components/inkoop/bestellingen/bestellingen.css'

/**
 * Vergelijken (2026-10-06): rijen zijn de regels, kolommen de leveranciers. In
 * een cel het antwoord op een prijsaanvraag, anders de prijslijst. Per regel
 * kies je er één; de prijs wordt dan vastgelegd zoals hij nu is.
 */
export function BestellingVergelijkPage() {
  const { ids = '' } = useParams<{ ids: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const regelIds = ids.split(',').filter(Boolean)
  const [bewaar, setBewaar] = useState(true)
  const [antwoord, setAntwoord] = useState<{ aanvraagId: string; leverancierId: string } | null>(null)

  const q = useQuery({ queryKey: ['vergelijk', regelIds], queryFn: () => bestelRegelsApi.vergelijk(regelIds), enabled: regelIds.length > 0 })
  const aanvragenQ = useQuery({ queryKey: ['prijsaanvragen'], queryFn: prijsaanvragenApi.list })
  const ververs = () => { for (const k of ['vergelijk', 'bestel-regels', 'leverancier-prijzen']) qc.invalidateQueries({ queryKey: [k] }) }

  const kies = useMutation({
    mutationFn: async ({ r, levId, cel }: { r: BestelRegel; levId: string; cel: Cel }) => {
      eis(waaromNietKiezen(r, cel))
      if (cel.soort !== 'prijs') return null
      return bestelRegelsApi.kies(r.id, { leverancierId: levId, bron: cel.bron, antwoordId: cel.antwoordId, bewaarPrijs: bewaar })
    },
    onSuccess: (uit) => {
      ververs()
      if (uit?.prijsBewaard?.gelukt) notifications.show({ color: 'green', message: 'Gekozen, en de prijs staat in de prijslijst van de leverancier' })
      else if (uit?.prijsBewaard && uit.prijsBewaard.reden) notifications.show({ color: 'yellow', message: `Gekozen. Niet in de prijslijst gezet: ${uit.prijsBewaard.reden}` })
    },
    onError: (e, { r }) => meldFout({ actie: `Leverancier kiezen voor ${r.materiaal}`, fout: e, gevolg: 'De keuze is niet veranderd.' }),
  })
  const wis = useMutation({
    mutationFn: (r: BestelRegel) => bestelRegelsApi.wisKeuze(r.id),
    onSuccess: ververs,
    onError: (e, r) => meldFout({ actie: `Keuze wissen voor ${r.materiaal}`, fout: e, gevolg: 'De keuze staat er nog.' }),
  })

  const d = q.data
  const rijen = (d?.regels ?? []).map((r) => {
    const b = d ? celBronnenVoor(d, r) : null
    const cellen = new Map((d?.leveranciers ?? []).map((l) => [l.id, b ? celVoor(r, l.id, b) : ({ soort: 'geen' } as Cel)]))
    return { r, cellen, goedkoopst: goedkoopste(cellen) }
  })
  const kiesGoedkoopste = async () => {
    for (const { r, cellen, goedkoopst } of rijen) {
      if (!goedkoopst || r.keuze?.leverancierId === goedkoopst) continue
      await kies.mutateAsync({ r, levId: goedkoopst, cel: cellen.get(goedkoopst)! }).catch(() => undefined)
    }
  }
  const groepen = perLeverancier(d?.regels ?? [])
  const aanvraag = antwoord ? aanvragenQ.data?.find((a) => a.id === antwoord.aanvraagId) : undefined
  const lev = aanvraag?.leveranciers.find((l) => l.leverancierId === antwoord?.leverancierId)
  const kolommen = `minmax(240px, 1.2fr) repeat(${Math.max(1, d?.leveranciers.length ?? 1)}, minmax(200px, 1fr))`

  return (
    <div className="bs-vergelijk">
      <button className="st-btn ghost sm" onClick={() => navigate('/bestellingen')}><IconArrowLeft size={14} />Bestellingen</button>
      <div className="st-page-hd" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div>
          <div className="st-page-title">Vergelijken — {regelIds.length} regel{regelIds.length === 1 ? '' : 's'}</div>
          <div className="st-page-sub">Een antwoord op een prijsaanvraag gaat voor de prijslijst. Kies per regel één leverancier.</div>
        </div>
        <div className="st-page-actions">
          <Checkbox size="xs" label="Gekozen antwoord in de prijslijst bewaren" checked={bewaar} onChange={(e) => setBewaar(e.currentTarget.checked)} />
          <button className="st-btn" disabled={kies.isPending} onClick={kiesGoedkoopste}>Goedkoopste overal kiezen</button>
        </div>
      </div>

      {q.isLoading ? <div className="st-empty">Laden…</div>
        : q.error ? <div className="st-empty">De vergelijking kon niet geladen worden: {(q.error as Error).message}</div>
        : !d || d.leveranciers.length === 0 ? <div className="st-empty">Voor deze regels is er nog geen leverancier met een prijs of een aanvraag. Koppel een prijs in de voorraad of op de relatie, of maak een prijsaanvraag.</div>
        : (
          <div className="bs-matrix">
            <div className="bs-matrix-rij kop" style={{ gridTemplateColumns: kolommen }}>
              <div>Regel</div>
              {d.leveranciers.map((l) => <div key={l.id}>{l.naam}</div>)}
            </div>
            {rijen.map(({ r, cellen, goedkoopst }) => (
              <div key={r.id} className="bs-matrix-rij" style={{ gridTemplateColumns: kolommen }}>
                <div>
                  <div className="cell-strong">{r.materiaal} {r.exoot && <ExootLabel compact />}</div>
                  <div className="bs-sub">{aantalTekst(r)} · {kg(r.kg)}{r.projectId ? ` · ${r.projectId}` : ''}</div>
                </div>
                {d.leveranciers.map((l) => (
                  <VergelijkCel
                    key={l.id} cel={cellen.get(l.id)!} goedkoopst={goedkoopst === l.id} gekozen={r.keuze?.leverancierId === l.id}
                    bezig={kies.isPending || wis.isPending}
                    onKies={() => kies.mutate({ r, levId: l.id, cel: cellen.get(l.id)! })}
                    onWis={() => wis.mutate(r)}
                    onAntwoord={(aanvraagId) => setAntwoord({ aanvraagId, leverancierId: l.id })}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

      {groepen.length > 0 && (
        <div className="bs-samenvatting">
          <b>Wordt {groepen.length} inkooporder{groepen.length === 1 ? '' : 's'}</b>
          {groepen.map((g) => <span key={g.leverancierId}>{g.naam} · {g.regelIds.length} regel{g.regelIds.length === 1 ? '' : 's'} · <span className="cell-mono">{eur(g.totaal)}</span></span>)}
          <span className="bs-sub">De keuze blijft bewaard; inkooporders maken komt in de volgende stap van de inkoopmodule.</span>
        </div>
      )}
      {aanvraag && lev && d && <AntwoordVenster aanvraag={aanvraag} leverancier={lev} regels={d.regels} onSluit={() => setAntwoord(null)} />}
    </div>
  )
}
