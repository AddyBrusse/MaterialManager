/**
 * Een tekst die je in de tabel zelf invult. Ziet eruit als tekst tot je erin
 * klikt, zoals het bewerkbare getal in de regeltabel (`.pdv2-cel-getal`).
 *
 * Opslaan bij het verlaten van het veld of op Enter, niet per toetsaanslag —
 * anders gaat er per letter een verzoek naar de server. Escape zet terug.
 */
export function CelTekst({
  waarde,
  placeholder,
  uit,
  onKlaar,
}: {
  waarde: string | null
  placeholder: string
  uit?: boolean
  onKlaar: (tekst: string) => void
}) {
  const toon = waarde ?? ''
  return (
    <input
      key={toon}
      defaultValue={toon}
      placeholder={placeholder}
      disabled={uit}
      className="pdv2-cel-tekst"
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = toon
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const nieuw = e.currentTarget.value.trim()
        if (nieuw !== toon) onKlaar(nieuw)
      }}
    />
  )
}
