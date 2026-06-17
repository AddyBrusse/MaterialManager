import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Checkbox, NumberInput, Select, Textarea, TextInput } from '@mantine/core'
import { relatiesApi, type Relatie } from '../../api/relaties'

type Form = {
  naam: string
  type: Relatie['type']
  telefoon: string; email: string; emailFactuur: string; emailOfferte: string; website: string
  straat: string; postcode: string; stad: string; land: string
  factuurAdresZelfde: boolean
  factuurStraat: string; factuurPostcode: string; factuurStad: string; factuurLand: string
  afleverAdresZelfde: boolean
  afleverStraat: string; afleverPostcode: string; afleverStad: string; afleverLand: string
  kvk: string; btw: string; iban: string; betalingstermijn: number | ''
  notities: string
}

function toForm(r: Relatie): Form {
  return {
    naam: r.naam,
    type: r.type,
    telefoon: r.telefoon ?? '', email: r.email ?? '',
    emailFactuur: r.emailFactuur ?? '', emailOfferte: r.emailOfferte ?? '', website: r.website ?? '',
    straat: r.straat ?? '', postcode: r.postcode ?? '', stad: r.stad ?? '', land: r.land ?? 'Nederland',
    factuurAdresZelfde: r.factuurAdresZelfde ?? true,
    factuurStraat: r.factuurStraat ?? '', factuurPostcode: r.factuurPostcode ?? '',
    factuurStad: r.factuurStad ?? '', factuurLand: r.factuurLand ?? '',
    afleverAdresZelfde: r.afleverAdresZelfde ?? true,
    afleverStraat: r.afleverStraat ?? '', afleverPostcode: r.afleverPostcode ?? '',
    afleverStad: r.afleverStad ?? '', afleverLand: r.afleverLand ?? '',
    kvk: r.kvk ?? '', btw: r.btw ?? '', iban: r.iban ?? '',
    betalingstermijn: r.betalingstermijn ?? '',
    notities: r.notities ?? '',
  }
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginTop: 24, marginBottom: 8, paddingBottom: 6,
      borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

const G4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }

export function RelatieGegevensTab({ relatie }: { relatie: Relatie }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(() => toForm(relatie))
  const inited = useRef(false)

  // Reset when relatie changes (e.g. navigating between detail pages)
  useEffect(() => { inited.current = false; setForm(toForm(relatie)) }, [relatie.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { inited.current = true }, [])

  // Debounced auto-save
  useEffect(() => {
    if (!inited.current) return
    const t = setTimeout(() => {
      relatiesApi.update(relatie.id, {
        naam:             form.naam.trim() || relatie.naam,
        type:             form.type,
        telefoon:         form.telefoon.trim() || null,
        email:            form.email.trim() || null,
        emailFactuur:     form.emailFactuur.trim() || null,
        emailOfferte:     form.emailOfferte.trim() || null,
        website:          form.website.trim() || null,
        straat:           form.straat.trim() || null,
        postcode:         form.postcode.trim() || null,
        stad:             form.stad.trim() || null,
        land:             form.land.trim() || 'Nederland',
        factuurAdresZelfde: form.factuurAdresZelfde,
        factuurStraat:    form.factuurAdresZelfde ? null : (form.factuurStraat.trim() || null),
        factuurPostcode:  form.factuurAdresZelfde ? null : (form.factuurPostcode.trim() || null),
        factuurStad:      form.factuurAdresZelfde ? null : (form.factuurStad.trim() || null),
        factuurLand:      form.factuurAdresZelfde ? null : (form.factuurLand.trim() || null),
        afleverAdresZelfde: form.afleverAdresZelfde,
        afleverStraat:    form.afleverAdresZelfde ? null : (form.afleverStraat.trim() || null),
        afleverPostcode:  form.afleverAdresZelfde ? null : (form.afleverPostcode.trim() || null),
        afleverStad:      form.afleverAdresZelfde ? null : (form.afleverStad.trim() || null),
        afleverLand:      form.afleverAdresZelfde ? null : (form.afleverLand.trim() || null),
        kvk:              form.kvk.trim() || null,
        btw:              form.btw.trim() || null,
        iban:             form.iban.trim() || null,
        betalingstermijn: form.betalingstermijn === '' ? null : Number(form.betalingstermijn),
        notities:         form.notities.trim() || null,
      })
      qc.invalidateQueries({ queryKey: ['relaties', relatie.id] })
      qc.invalidateQueries({ queryKey: ['relaties'] })
    }, 400)
    return () => clearTimeout(t)
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Form>) => setForm(f => ({ ...f, ...p }))
  const tx = (key: keyof Form) => ({
    size: 'sm' as const,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [key]: e.target.value }),
  })

  return (
    <div style={{ maxWidth: 900, paddingBottom: 40 }}>

      <SectionHead>Algemeen</SectionHead>
      <div className="st-grid-2">
        <TextInput label="Bedrijfsnaam" {...tx('naam')} />
        <Select label="Type relatie" size="sm" value={form.type}
          onChange={v => v && set({ type: v as Relatie['type'] })}
          data={[
            { value: 'klant',       label: 'Klant' },
            { value: 'leverancier', label: 'Leverancier' },
            { value: 'beide',       label: 'Klant & leverancier' },
          ]} />
      </div>

      <SectionHead>Bedrijfscontact</SectionHead>
      <div className="st-grid-2">
        <TextInput label="Telefoon"  {...tx('telefoon')} />
        <TextInput label="E-mail (algemeen)" {...tx('email')} />
        <TextInput label="E-mail factuur"    {...tx('emailFactuur')} />
        <TextInput label="E-mail offerte"    {...tx('emailOfferte')} />
        <TextInput label="Website"  {...tx('website')} />
      </div>

      <SectionHead>Vestigingsadres</SectionHead>
      <div style={{ display: 'grid', gap: 14 }}>
        <TextInput label="Straat en huisnummer" {...tx('straat')} />
        <div className="st-grid-3">
          <TextInput label="Postcode" {...tx('postcode')} />
          <TextInput label="Stad / Plaats" {...tx('stad')} />
          <TextInput label="Land" {...tx('land')} />
        </div>
      </div>

      <SectionHead>Factuuradres</SectionHead>
      <Checkbox size="sm" label="Zelfde als vestigingsadres" checked={form.factuurAdresZelfde}
        onChange={e => set({ factuurAdresZelfde: e.target.checked })} style={{ marginBottom: 10 }} />
      {!form.factuurAdresZelfde && (
        <div style={{ display: 'grid', gap: 14 }}>
          <TextInput label="Straat en huisnummer" {...tx('factuurStraat')} />
          <div className="st-grid-3">
            <TextInput label="Postcode" {...tx('factuurPostcode')} />
            <TextInput label="Stad / Plaats" {...tx('factuurStad')} />
            <TextInput label="Land" {...tx('factuurLand')} />
          </div>
        </div>
      )}

      <SectionHead>Afleveradres</SectionHead>
      <Checkbox size="sm" label="Zelfde als vestigingsadres" checked={form.afleverAdresZelfde}
        onChange={e => set({ afleverAdresZelfde: e.target.checked })} style={{ marginBottom: 10 }} />
      {!form.afleverAdresZelfde && (
        <div style={{ display: 'grid', gap: 14 }}>
          <TextInput label="Straat en huisnummer" {...tx('afleverStraat')} />
          <div className="st-grid-3">
            <TextInput label="Postcode" {...tx('afleverPostcode')} />
            <TextInput label="Stad / Plaats" {...tx('afleverStad')} />
            <TextInput label="Land" {...tx('afleverLand')} />
          </div>
        </div>
      )}

      <SectionHead>Financieel</SectionHead>
      <div style={G4}>
        <TextInput label="KvK-nummer"   {...tx('kvk')} />
        <TextInput label="BTW-nummer"   {...tx('btw')} />
        <TextInput label="IBAN"         {...tx('iban')} />
        <NumberInput label="Betalingstermijn (dagen)" size="sm" min={0}
          value={form.betalingstermijn}
          onChange={v => set({ betalingstermijn: v === '' ? '' : Number(v) })} />
      </div>

      <SectionHead>Notities</SectionHead>
      <Textarea size="sm" rows={4} value={form.notities}
        onChange={e => set({ notities: e.target.value })}
        placeholder="Interne opmerkingen…" />
    </div>
  )
}
