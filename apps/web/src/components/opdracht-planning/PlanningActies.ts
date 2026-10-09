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
    los: (k: Kaart, waarde: number, m?: Machine) => doe({
      aanleiding: `Werkbord: ${wie(k)}${m ? ` naar ${m.name}` : ` ${waarde < k.rang ? 'hoger' : 'lager'} gezet`}`,
      prioriteit: { stapId: k.job.id, waarde },
      machine: m ? { stapId: k.job.id, naam: m.name } : undefined,
    }),
    wachtUit: (k: Kaart) => doe({ aanleiding: `Werkbord: ${wie(k)} — machine mag weer vullen`, machineWacht: { stapId: k.job.id, waarde: false } }),
    herbereken: (opLevertijd = false) =>
      doe({ aanleiding: opLevertijd ? 'Herbereken op leverdatum' : 'Herbereken', opLevertijd }),
  }
}
