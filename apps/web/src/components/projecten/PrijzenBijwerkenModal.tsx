import { useMemo, useState } from 'react'
import { Modal } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { formatBedrag } from '../../api/projects'
import { articlesApi } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { berekenBijwerkingen, isBijTeWerken, samenvatting, type Bijwerking } from './prijs-bijwerken'
import type { Offerte } from '@stockmanager/shared'

/**
 * Laten zien wat er zou veranderen vóórdat het verandert.
 *
 * Dit scherm bestaat om één reden: een offerteregel weet niet of zijn prijs uit
 * de calculatie komt of met de hand is ingetypt — er is maar één veld. Zonder
 * dit overzicht zou "prijzen bijwerken" stilzwijgend een prijs overschrijven die
 * iemand bewust had aangepast, bijvoorbeeld vanwege een prijsafspraak.
 *
 * Vandaar per regel een vinkje. Standaard staat alles aan, want in het geval
 * waarvoor dit gebouwd is (mail van een nieuwe klant, alle regels op € 0) wil je
 * gewoon alles. Maar bij een regel die al een prijs had zie je precies wat je
 * weggooit voordat je het weggooit.
 */

interface Props {
  opened: boolean
  offerte: Offerte
  onClose: () => void
  onBijwerken: (gekozen: Bijwerking[]) => void
}

const REDEN_TEKST: Record<Bijwerking['reden'], string> = {
  nieuw: 'stond nog op nul',
  gewijzigd: 'prijs verandert',
  gelijk: 'ongewijzigd',
  'geen-calculatie': 'nog geen calculatie',
  'geen-artikel': 'geen gekoppeld artikel',
}

export function PrijzenBijwerkenModal({ opened, offerte, onClose, onBijwerken }: Props) {
  const bijwerkingen = useMemo(() => {
    if (!opened) return []
    return berekenBijwerkingen(offerte.regels, articlesApi.list(), {
      grades: gradesApi.listSync(),
      profiles: profilesApi.listSync(),
      machines: machinesApi.listSync(),
    })
  }, [opened, offerte.regels])

  const teDoen = bijwerkingen.filter(isBijTeWerken)
  const rest = bijwerkingen.filter((b) => !isBijTeWerken(b))
  const telling = samenvatting(bijwerkingen)

  // Standaard alles aan: het gewone geval is "alle regels staan op nul".
  const [uit, setUit] = useState<Set<string>>(new Set())
  const gekozen = teDoen.filter((b) => !uit.has(b.regelId))

  function wissel(id: string) {
    setUit((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Prijzen bijwerken uit de calculaties" size="lg">
      {teDoen.length === 0 ? (
        <div style={{ color: 'var(--text-2)', fontSize: 13, padding: '4px 0 12px' }}>
          Er is niets bij te werken — de prijzen komen overeen met de calculaties.
        </div>
      ) : (
        <>
          {telling.gewijzigd > 0 && (
            <div className="mi-alarm" style={{ marginBottom: 10 }}>
              <IconAlertTriangle size={14} />
              <span>
                {telling.gewijzigd === 1
                  ? 'Eén regel had al een prijs'
                  : `${telling.gewijzigd} regels hadden al een prijs`}
                . Was die met de hand aangepast, haal dan het vinkje weg.
              </span>
            </div>
          )}

          {/* `table.st-tbl` is `width: max-content` met `nowrap` cellen: gemaakt
              voor een scrollende container, niet voor een modal. Zonder
              `tableLayout: fixed` groeit hij buiten het venster en zag je "€ 30,0"
              met de laatste cijfers eraf. Vast maakt de procentbreedtes leidend
              en dwingt de tabel binnen de 100%. */}
          <table className="st-tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '7%' }} />
                <th style={{ width: '45%' }}>Regel</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Aantal</th>
                <th style={{ width: '17%', textAlign: 'right' }}>Nu</th>
                <th style={{ width: '17%', textAlign: 'right' }}>Wordt</th>
              </tr>
            </thead>
            <tbody>
              {teDoen.map((b) => (
                <tr key={b.regelId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!uit.has(b.regelId)}
                      onChange={() => wissel(b.regelId)}
                      aria-label={`${b.naam} bijwerken`}
                    />
                  </td>
                  {/* De reden onder de naam en niet ernaast: samen op één regel
                      werd juist de reden afgekapt, en dat is het stukje waarop je
                      beslist of het vinkje aan mag blijven. */}
                  {/* `st-tbl` geeft cellen een vaste rijhoogte; hier staan twee
                      regels onder elkaar, dus die moet los. */}
                  <td style={{ overflow: 'hidden', height: 'auto', paddingTop: 6, paddingBottom: 6 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.naam}>
                      {b.naam}
                    </div>
                    <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{REDEN_TEKST[b.reden]}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{b.qty}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                    {formatBedrag(b.oudeVerkoopprijs)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatBedrag(b.nieuweVerkoopprijs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {rest.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
          <div style={{ marginBottom: 4 }}>Blijft staan:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rest.map((b) => (
              <li key={b.regelId}>
                {b.naam} — {REDEN_TEKST[b.reden]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mi-acties" style={{ marginTop: 14 }}>
        <button className="st-btn sm ghost" onClick={onClose}>Annuleren</button>
        <button
          className="st-btn sm primary"
          disabled={gekozen.length === 0}
          onClick={() => onBijwerken(gekozen)}
        >
          {gekozen.length === 0
            ? 'Niets geselecteerd'
            : `${gekozen.length} regel${gekozen.length === 1 ? '' : 's'} bijwerken`}
        </button>
      </div>
    </Modal>
  )
}
