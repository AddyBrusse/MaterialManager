import { useState } from 'react'
import { Select } from '@mantine/core'

const NIEUW = '__nieuw__'

interface Props {
  id: string
  label: string
  placeholder: string
  opties: { value: string; label: string }[]
  waarde: string | null
  disabled?: boolean
  /** "klant" of "contact": komt in "+ Nieuwe klant …". */
  soort: string
  hint?: string
  onKies: (id: string | null) => void
  /** Maakt een nieuwe aan met de getypte naam. Gooit bij een fout; de aanroeper meldt. */
  onNieuw: (naam: string) => void
}

/**
 * Een doorzoekbare keuzelijst waar je ook iets nieuws in kunt typen. Staat de
 * naam er niet in, dan staat onderaan "+ Nieuwe klant 'Jansen BV'": kiezen maakt
 * hem aan en kiest hem meteen. Zo hoef je voor een nieuwe klant de projectpagina
 * niet uit.
 */
export function KeuzeMetNieuw({ id, label, placeholder, opties, waarde, disabled, soort, hint, onKies, onNieuw }: Props) {
  const [zoek, setZoek] = useState('')
  const getypt = zoek.trim()
  const bestaat = opties.some((o) => o.label.toLowerCase() === getypt.toLowerCase())
  const lidwoord = soort === 'klant' ? 'Nieuwe' : 'Nieuw'
  const data =
    getypt && !bestaat ? [...opties, { value: NIEUW, label: `+ ${lidwoord} ${soort} "${getypt}"` }] : opties

  return (
    <div className="pdv2-veld">
      <label htmlFor={id}>{label}</label>
      <Select
        id={id}
        size="xs"
        // Zelfde maat en rand als de gewone velden ernaast (.pdv2-form).
        styles={{
          input: {
            height: 30,
            minHeight: 30,
            fontSize: 12.5,
            borderRadius: 4,
            borderColor: 'var(--border2)',
            fontFamily: 'inherit',
          },
          option: { fontSize: 12.5 },
        }}
        searchable
        clearable
        placeholder={placeholder}
        data={data}
        value={waarde}
        disabled={disabled}
        searchValue={zoek}
        onSearchChange={setZoek}
        nothingFoundMessage={`Typ een naam om een ${soort} toe te voegen`}
        // Het "nieuw"-item moet altijd zichtbaar blijven, ook als het filter
        // het op de aanhalingstekens zou laten vallen.
        filter={({ options, search }) =>
          options.filter((o) => {
            const optie = o as { value: string; label: string }
            return optie.value === NIEUW || optie.label.toLowerCase().includes(search.trim().toLowerCase())
          })
        }
        onChange={(v) => {
          if (v === NIEUW) onNieuw(getypt)
          else onKies(v)
        }}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}
