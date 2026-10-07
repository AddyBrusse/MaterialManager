import { useMutation, useQueryClient } from '@tanstack/react-query'
import { waaromNietUitBuffer, type InkoopOverzicht, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { bestelRegelsApi } from '../../../api/bestellingen'
import { INKOOP_SLEUTELS } from '../../../api/inkooporders'
import { meldFout } from '../../../utils/fout-melding-toon'
import { eis } from '../../../utils/fout-melding'
import { useBestellen } from '../overzicht/useBestellen'
import { BufferGroep } from './BufferGroep'

/**
 * Tab 3 · Inkoopbuffer (2026-10-07): per leverancier wat gekozen is. "Bestel
 * regels" maakt de inkooporder met mail; na "Ja, verstuurd" staan ze bij Besteld.
 */
export function BufferTab({ ov, onOpen }: { ov: InkoopOverzicht; onOpen: (r: InkoopOverzichtRegel) => void }) {
  const qc = useQueryClient()
  const bestellen = useBestellen(ov)
  const regels = ov.regels.filter((r) => r.status === 'buffer')
  const groepen = new Map<string, InkoopOverzichtRegel[]>()
  for (const r of regels) {
    const id = r.leverancier?.leverancierId ?? '?'
    groepen.set(id, [...(groepen.get(id) ?? []), r])
  }
  // De leverancier die het eerst de deur uit moet, bovenaan.
  const eerste = (rs: InkoopOverzichtRegel[]) => rs.map((r) => r.plan.uiterlijk ?? '9999').sort()[0] ?? '9999'
  const volgorde = [...groepen.entries()].sort((a, b) => eerste(a[1]).localeCompare(eerste(b[1])))

  const terug = useMutation({
    mutationFn: (r: InkoopOverzichtRegel) => { eis(waaromNietUitBuffer({ ...r, inkooporder: r.order })); return bestelRegelsApi.terug(r.id) },
    onSuccess: () => { for (const k of INKOOP_SLEUTELS) qc.invalidateQueries({ queryKey: [k] }) },
    onError: (e, r) => meldFout({ actie: `${r.materiaal} terugzetten`, fout: e, gevolg: 'De regel staat nog in de buffer.' }),
  })

  if (regels.length === 0) return <div className="ib-leeg">De inkoopbuffer is leeg. Kies bij Open prijsaanvragen een leverancier en zet de regel hierheen.</div>

  return (
    <>
      <div className="ib-uitleg">Per leverancier wat gekozen is en wacht op bestellen. Wacht met bestellen tot de franco-grens gehaald is, zolang "uiterlijk bestellen" het toelaat.</div>
      {volgorde.map(([id, rs]) => (
        <BufferGroep key={id} lev={ov.leveranciers.find((l) => l.id === id)} naam={rs[0].leverancier?.naam ?? 'Onbekende leverancier'} regels={rs}
          concept={bestellen.concept} onBestel={bestellen.open} onTerug={(r) => terug.mutate(r)} onOpen={onOpen} />
      ))}
      {bestellen.dialoog}
    </>
  )
}
