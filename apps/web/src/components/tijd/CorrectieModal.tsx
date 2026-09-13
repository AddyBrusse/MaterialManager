import { useState } from 'react'
import { Modal, NumberInput, Textarea, Button, Group } from '@mantine/core'
import { secondenNaarKlok, secondenNaarUren } from '@stockmanager/shared'
import type { TijdRegistratieDTO } from '../../api/tijdregistratie'

function klokTijd(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/**
 * Een gemeten tijd bijstellen.
 *
 * Het gemeten blok is met opzet niet te bewerken. De klokwaarde blijft naast de
 * correctie staan, want het verschil tussen wat de klok zag en wat een mens
 * ervan maakte is zelf een signaal: stelt iemand elke week een uur bij, dan
 * klopt er iets niet aan de manier van registreren, en dat wil je zien.
 *
 * De reden is verplicht. Zonder reden is een correctie achteraf niet te wegen,
 * en dan vervuilt hij de dataset waar de calculatie straks op leunt.
 */
export function CorrectieModal({
  registratie, open, onClose, onOpslaan, bezig,
}: {
  registratie: TijdRegistratieDTO | null
  open: boolean
  onClose: () => void
  onOpslaan: (v: { bijgesteldeSeconden: number; reden: string; aantalStuks: number | null }) => void
  bezig?: boolean
}) {
  const gemeten = registratie?.gemetenSeconden ?? 0
  const [uren, setUren] = useState<number | ''>(Math.floor(gemeten / 3600))
  const [minuten, setMinuten] = useState<number | ''>(Math.floor((gemeten % 3600) / 60))
  const [stuks, setStuks] = useState<number | ''>(registratie?.aantalStuks ?? '')
  const [reden, setReden] = useState('')

  // Opnieuw invullen zodra er een andere regel gekozen wordt; zonder dit toont
  // de modal de tijd van de vorige correctie.
  const [vorigeId, setVorigeId] = useState<string | null>(null)
  if (registratie && registratie.id !== vorigeId) {
    setVorigeId(registratie.id)
    const basis = registratie.bijgesteldeSeconden ?? registratie.gemetenSeconden
    setUren(Math.floor(basis / 3600))
    setMinuten(Math.floor((basis % 3600) / 60))
    setStuks(registratie.aantalStuks ?? '')
    // De reden bewust NIET voorinvullen met de vorige. Zou hij er al staan, dan
    // is een tweede correctie op te slaan met de verantwoording van de eerste —
    // en dat is precies de controle die deze modal moet afdwingen.
    setReden('')
  }

  if (!registratie) return null

  const nieuweSeconden = (Number(uren) || 0) * 3600 + (Number(minuten) || 0) * 60
  const verschil = nieuweSeconden - registratie.gemetenSeconden
  const redenOk = reden.trim().length >= 3

  return (
    <Modal opened={open} onClose={onClose} title="Tijdregel corrigeren" size="lg" centered>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div>
          <div className="tr-gemeten-lbl" style={{ marginBottom: 6 }}>Gemeten</div>
          <div className="tr-gemeten">
            <div>
              <div className="tr-gemeten-lbl">Gestart</div>
              <div className="tr-gemeten-val">{klokTijd(registratie.gestartOp)}</div>
            </div>
            <div>
              <div className="tr-gemeten-lbl">Gestopt</div>
              <div className="tr-gemeten-val">{klokTijd(registratie.gestoptOp)}</div>
            </div>
            <div>
              <div className="tr-gemeten-lbl">Duur</div>
              <div className="tr-gemeten-val">{secondenNaarKlok(registratie.gemetenSeconden)}</div>
            </div>
            <div>
              <div className="tr-gemeten-lbl">Stuks</div>
              <div className="tr-gemeten-val">{registratie.aantalStuks ?? '—'}</div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
            Blijft bewaard. De correctie komt ernaast te staan, niet ervoor in de plaats.
          </div>
        </div>

        <div>
          <div className="tr-gemeten-lbl" style={{ marginBottom: 6 }}>Bijgesteld naar</div>
          <Group gap="sm" align="flex-end">
            <NumberInput
              size="xs" label="Uren" min={0} max={99} w={90}
              value={uren} onChange={(v) => setUren(v === '' ? '' : Number(v))}
            />
            <NumberInput
              size="xs" label="Minuten" min={0} max={59} w={90}
              value={minuten} onChange={(v) => setMinuten(v === '' ? '' : Number(v))}
            />
            <NumberInput
              size="xs" label="Stuks" min={0} w={90}
              value={stuks} onChange={(v) => setStuks(v === '' ? '' : Number(v))}
            />
            <div style={{ fontSize: 12, color: 'var(--text-2)', paddingBottom: 6 }}>
              = {secondenNaarUren(nieuweSeconden)}
              {verschil !== 0 && (
                <span className={`tr-delta ${verschil > 0 ? 'is-over' : 'is-onder'}`} style={{ marginLeft: 8 }}>
                  {verschil > 0 ? '+' : '−'}{secondenNaarUren(Math.abs(verschil))}
                </span>
              )}
            </div>
          </Group>
        </div>

        <Textarea
          size="xs" label="Waarom" required minRows={2}
          placeholder="Bijvoorbeeld: klok bleef aanstaan tijdens de pauze"
          value={reden} onChange={(e) => setReden(e.currentTarget.value)}
          error={reden.length > 0 && !redenOk ? 'Geef een reden van minstens drie tekens' : undefined}
        />

        {registratie.gecorrigeerd && registratie.correctieReden && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: -6 }}>
            Eerder bijgesteld door {registratie.correctieDoor}: &ldquo;{registratie.correctieReden}&rdquo;
          </div>
        )}

        <div className="tr-uitleg">
          De gemeten tijd blijft staan naast jouw correctie. Dat verschil is zelf een
          signaal: stel je het elke week bij, dan klopt er iets niet aan de manier
          waarop er geregistreerd wordt — en dat wil je zien, niet wegpoetsen.
        </div>

        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onClose}>Annuleren</Button>
          <Button
            size="xs" disabled={!redenOk || bezig} loading={bezig}
            onClick={() => onOpslaan({
              bijgesteldeSeconden: nieuweSeconden,
              reden: reden.trim(),
              aantalStuks: stuks === '' ? null : Number(stuks),
            })}
          >Bijstellen</Button>
        </Group>
      </div>
    </Modal>
  )
}
