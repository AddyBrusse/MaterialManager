import type { MailKoppeling } from '@stockmanager/shared'

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

/**
 * De melding na "Koppelen": wat er op het project en de offerte kwam, en wat er
 * nog moet. Alleen zéggen dat de tekeningen mee zijn als dat ook zo is — een
 * nieuw artikel zonder tekening merk je anders pas als iemand hem nodig heeft.
 */
export function koppelMelding({ overname: r }: MailKoppeling): { color: string; title: string; message: string } {
  if (!r) {
    return { color: 'green', title: 'Mail gekoppeld', message: 'De mail hoort nu bij dit project.' }
  }
  const nieuw = r.nieuweArtikelen.length
  const zonderTekening = nieuw > 0 && r.gekoppeldeBestanden === 0
  return {
    color: r.misluktebestanden.length > 0 || zonderTekening ? 'red' : r.zonderPrijs > 0 ? 'orange' : 'green',
    title: `${meervoud(r.aantalRegels, 'regel', 'regels')} op offerte ${r.offerteId}`,
    message: [
      r.referentie ? `Referentie: ${r.referentie}.` : null,
      nieuw > 0
        ? `${meervoud(nieuw, 'nieuw artikel', 'nieuwe artikelen')} aangemaakt (${r.nieuweArtikelen.join(', ')})` +
          (r.gekoppeldeBestanden > 0
            ? `, met ${meervoud(r.gekoppeldeBestanden, 'meegestuurde tekening', 'meegestuurde tekeningen')}.`
            : ' — zónder tekening: er hing geen bestand aan deze regels.')
        : null,
      r.misluktebestanden.length > 0 ? `Niet gekopieerd: ${r.misluktebestanden.join(', ')}.` : null,
      r.receptTaken > 0
        ? `In ToDo ${r.receptTaken === 1 ? 'staat een taak' : `staan ${r.receptTaken} taken`} "Recept maken"; ` +
          `die ${r.receptTaken === 1 ? 'gaat' : 'gaan'} vanzelf dicht zodra de calculatie een prijs geeft.`
        : null,
      r.zonderPrijs > 0
        ? `${meervoud(r.zonderPrijs, 'regel staat', 'regels staan')} op € 0 — na het recept haalt "Prijzen bijwerken" de prijs op.`
        : 'Prijzen komen uit de calculatie van het artikel.',
    ].filter(Boolean).join(' '),
  }
}
