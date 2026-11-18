import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BTW_PCT, conceptFactuurId, factuurBedragen, losseRegels, vandaagIso, waaromNietLosseCredit, waaromNietLosseRegels,
  type LosseFactuurWijzig, type LosseRegelInvoer, type VerkoopFactuur,
} from '@stockmanager/shared'
import { articlesApi, type Article } from '../../api/articles'
import { facturenApi } from '../../api/facturen'
import { gradesApi } from '../../api/grades'
import { machinesApi } from '../../api/machines'
import { prijsafsprakenApi } from '../../api/prijsafspraken'
import { profilesApi } from '../../api/profiles'
import { relatiesApi } from '../../api/relaties'
import type { ConceptKop } from './LosseFactuurKop'
import type { ConceptRegel } from './LosseRegelsTabel'
import { voorgesteldePrijs } from './regel-prijs'

/** Wat het venster bewerkt: een nieuwe factuur (`factuur` leeg) of een bestaande factuur of credit. */
export interface Bewerk {
  soort: 'factuur' | 'credit'
  factuur: VerkoopFactuur | null
}

const kopVan = (f: VerkoopFactuur | null): ConceptKop => ({
  relatieId: f?.relatieId ?? null,
  contactId: f?.contactId ?? null,
  klantRef: f?.klantRef ?? '',
  leverdatum: f?.leverdatum ?? '',
  naarEmail: f?.naarEmail ?? '',
  notities: f?.notities ?? '',
  reden: f?.reden ?? '',
  retour: f?.retour ?? false,
})

const regelsVan = (f: VerkoopFactuur | null): ConceptRegel[] => (f?.regels ?? []).map((r, i) => ({
  sleutel: `r${i}`, artikelId: r.artikelId, naam: r.naam, qty: r.qty, eenheid: r.eenheid, verkoopprijs: r.verkoopprijs,
  bron: 'factuur',
  bronTekst: f?.crediteertFactuurId ? `prijs van ${f.crediteertFactuurId}` : 'opgeslagen prijs',
}))

const invoerVan = (regels: ConceptRegel[]): LosseRegelInvoer[] => regels.map((r) => ({
  artikelId: r.artikelId, naam: r.naam.trim(), qty: r.qty, eenheid: r.eenheid || 'st', verkoopprijs: r.verkoopprijs,
}))

const stand = (kop: ConceptKop, regels: ConceptRegel[]) => JSON.stringify([kop, invoerVan(regels)])

/**
 * De invoer van het venster van een losse factuur of credit (2026-11-18): kop
 * en regels als concept, de prijsvoorstellen voor de klant, en opslaan. Pas na
 * opslaan staat het op de server; tot dan is "gewijzigd" waar.
 */
export function useConceptFactuur(bewerk: Bewerk, facturen: VerkoopFactuur[]) {
  const soort = bewerk.soort
  const [basis, setBasis] = useState(bewerk.factuur)
  const [kop, setKop] = useState(() => kopVan(bewerk.factuur))
  const [regels, setRegels] = useState(() => regelsVan(bewerk.factuur))
  const [bewaard, setBewaard] = useState(() => stand(kopVan(bewerk.factuur), regelsVan(bewerk.factuur)))
  const gewijzigd = !basis || stand(kop, regels) !== bewaard
  const relatieId = kop.relatieId

  const { data: afspraken = [] } = useQuery({
    queryKey: ['prijsafspraken', 'relatie', relatieId],
    queryFn: () => prijsafsprakenApi.list({ relatieId: relatieId! }),
    enabled: !!relatieId,
  })
  const { data: info = [] } = useQuery({
    queryKey: ['facturen', 'prijzen', relatieId],
    queryFn: () => facturenApi.verkoopInfo(relatieId!),
    enabled: !!relatieId,
  })
  const artikelen = useMemo(() => articlesApi.list().filter((a) => a.relatieId === relatieId), [relatieId])
  const klanten = useMemo(
    () => relatiesApi.listSync().filter((r) => r.id === relatieId || (r.type !== 'leverancier' && r.actief !== false)),
    [relatieId],
  )

  const stel = (a: Article, qty: number) => voorgesteldePrijs(
    a, relatieId, afspraken, info.find((i) => i.artikelId === a.id), qty,
    { grades: gradesApi.listSync(), profiles: profilesApi.listSync(), machines: machinesApi.listSync() }, vandaagIso(),
  )

  /** Waarom het (nog) niet kan; `leegMag` = een concept zonder regels mag bewaard worden. */
  const waaromNiet = (leegMag: boolean): string | null => {
    if (!relatieId) return 'Kies eerst de klant.'
    const invoer = invoerVan(regels)
    if (soort === 'factuur') return waaromNietLosseRegels(invoer, { leegMag })
    return waaromNietLosseCredit(facturen, {
      factuurId: basis?.crediteertFactuurId ?? null, relatieId, reden: kop.reden, regels: invoer,
    }, { creditId: basis?.id, leegMag })
  }

  /** Zoals hij er nu uitziet, ook vóór opslaan: voor de pdf en de pakbon. */
  const alsFactuur = (): VerkoopFactuur => {
    const r = losseRegels(invoerVan(regels).filter((x) => x.naam))
    const btwPct = basis?.btwPct ?? BTW_PCT
    return {
      id: basis?.id ?? conceptFactuurId(soort), soort, crediteertFactuurId: basis?.crediteertFactuurId ?? null,
      projectId: null, projectNaam: null, relatieId,
      klantNaam: relatiesApi.listSync().find((x) => x.id === relatieId)?.naam ?? null,
      contactId: kop.contactId, klantRef: kop.klantRef.trim() || null,
      leverdatum: soort === 'factuur' ? kop.leverdatum || null : null,
      reden: kop.reden.trim() || null, retour: kop.retour, regels: r, btwPct, ...factuurBedragen(r, btwPct),
      notities: kop.notities, vervaldatum: basis?.vervaldatum ?? null, verzondenOp: basis?.verzondenOp ?? null,
      naarEmail: kop.naarEmail.trim() || null, betaaldOp: basis?.betaaldOp ?? null,
      createdAt: basis?.createdAt ?? new Date().toISOString(),
    }
  }

  const opslaan = async (): Promise<VerkoopFactuur> => {
    const nu = stand(kop, regels)
    const velden = {
      relatieId: relatieId!, contactId: kop.contactId, klantRef: kop.klantRef.trim() || null,
      leverdatum: soort === 'factuur' ? kop.leverdatum || null : null, notities: kop.notities,
      naarEmail: kop.naarEmail.trim() || null, regels: invoerVan(regels),
    }
    const patch: LosseFactuurWijzig = soort === 'credit' ? { ...velden, reden: kop.reden.trim() || null, retour: kop.retour } : velden
    const f = basis ? await facturenApi.wijzig(basis.id, patch) : await facturenApi.maak(velden)
    setBasis(f)
    setBewaard(nu)
    return f
  }

  return { soort, basis, kop, setKop, regels, setRegels, gewijzigd, klanten, artikelen, info, stel, waaromNiet, alsFactuur, opslaan }
}
