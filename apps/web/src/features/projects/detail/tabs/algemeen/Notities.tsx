/** Interne notities, onderaan de projectkaart (was een eigen kaart tot 2026-10-05). */
export function Notities({ waarde, geblokkeerd, onZet }: { waarde: string; geblokkeerd: boolean; onZet: (v: string) => void }) {
  return (
    <div className="pdv2-veld vol">
      <label htmlFor="pdv2-notities">Notities</label>
      <textarea
        id="pdv2-notities"
        key={waarde}
        defaultValue={waarde}
        disabled={geblokkeerd}
        placeholder="Intern: wat je over dit project kwijt wilt. Komt niet op een document."
        // Bij het verlaten van het veld; eerder werd dit nooit opgeslagen.
        onBlur={(e) => {
          const v = e.currentTarget.value
          if (v !== waarde) onZet(v)
        }}
      />
    </div>
  )
}
