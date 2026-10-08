import type { Machine } from '../../api/machines'
import { herberekenPlanning } from './herbereken'
import type { Kaart } from './planning-logica'

/** Wat het werkbord doet, als herberekening met een aanleiding die in de melding en het logboek staat. */
export function werkbordActies(setBezig: (b: boolean) => void, ververs: () => void) {
  const doe = async (p: Parameters<typeof herberekenPlanning>[0]) => {
    setBezig(true)
    try { await herberekenPlanning(p) } finally { setBezig(false); ververs() }
  }
  const wie = (k: Kaart) => `${k.job.orderId} stap ${k.stapNr} (${k.job.naam})`
  return {
    prioriteit: (k: Kaart, waarde: number) =>
      doe({ aanleiding: `Werkbord: ${wie(k)} ${waarde < k.rang ? 'hoger' : 'lager'} gezet`, prioriteit: { stapId: k.job.id, waarde } }),
    machine: (k: Kaart, m: Machine) =>
      doe({ aanleiding: `Werkbord: ${wie(k)} naar ${m.name}`, machine: { stapId: k.job.id, naam: m.name } }),
    herbereken: (opLevertijd = false) =>
      doe({ aanleiding: opLevertijd ? 'Herbereken op leverdatum' : 'Herbereken', opLevertijd }),
  }
}
