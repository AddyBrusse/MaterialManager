import { useQuery } from '@tanstack/react-query'
import type { LeverancierPrijs } from '@stockmanager/shared'
import { rawMaterialsApi, formatDimensions } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { LeverancierPrijzen } from '../inkoop/LeverancierPrijzen'

/**
 * Alle prijzen van één leverancier (2026-10-06): per materiaal en per
 * kwaliteit. Hetzelfde als in de voorraad, maar dan vanaf de andere kant.
 */
export function RelatiePrijzenTab({ leverancierId }: { leverancierId: string }) {
  const { data: mat } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const { data: gr } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const materialen = (mat?.data ?? []).map((m) => ({
    value: m.id, gradeId: m.gradeId,
    label: `${m.code} · ${m.grade.name} ${m.profile.name} ${formatDimensions(m.profile, m.dimensions)} · L${Number(m.lengthMm).toLocaleString('nl-NL')}${m.exoot ? ' · exoot' : ''}`,
  }))
  const kwaliteiten = (gr?.data ?? gradesApi.listSync()).map((g) => ({ value: g.id, label: g.name }))
  const doelNaam = (p: LeverancierPrijs) =>
    p.gradeId
      ? (kwaliteiten.find((k) => k.value === p.gradeId)?.label ?? 'onbekende kwaliteit')
      : (materialen.find((m) => m.value === p.rawMaterialId)?.label ?? 'onbekend materiaal')

  return (
    <div style={{ maxWidth: 1100 }}>
      <LeverancierPrijzen
        filter={{ leverancierId }}
        keuze={{ leverancierId, materialen, kwaliteiten }}
        kolom="doel"
        doelNaam={doelNaam}
        leeg="Nog geen prijzen van deze leverancier. Een prijs per kwaliteit geldt voor elk materiaal van die kwaliteit, tenzij er voor een materiaal een eigen prijs staat."
      />
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
        De calculatie rekent met de €/kg van de kwaliteit; deze prijzen gebruik je bij het vergelijken en bestellen.
      </div>
    </div>
  )
}
