import { describe, it, expect } from 'vitest'
import { ApiFout } from '../../api/client'
import { foutTekst, laadGevolg, Weigering } from '../fout-melding'

// Het geval dat deze melding opleverde: versturen op een database waar de
// migratie van offertes.externe_ref nog niet gedraaid was. Vóór deze melding
// stond er alleen "Offerte versturen mislukt".
const migratieFout = new ApiFout(
  'De database loopt achter op de applicatie. Draai de migraties met: npm run db:deploy',
  'MIGRATIE_ONTBREEKT',
  500,
  'POST /projects/PRJ-2026-059/offertes/OFF-2026-037/verzend',
  'kolom offertes.externe_ref bestaat niet in de database',
)

describe('foutTekst', () => {
  it('zegt wat er misging in de woorden van de server; de reden apart', () => {
    const t = foutTekst({ actie: 'OFF-2026-037 versturen', fout: migratieFout, gevolg: 'Niets opgeslagen.' })
    expect(t.wat).toContain('npm run db:deploy')
    // Een Prisma-dump in "Wat" leest niemand; hij staat ingeklapt eronder.
    expect(t.wat).not.toContain('offertes.externe_ref')
    expect(t.technisch).toContain('offertes.externe_ref')
    expect(t.weigering).toBe(false)
  })

  it('maakt van een voorwaarde een weigering, geen storing', () => {
    const t = foutTekst({
      actie: 'v2 versturen',
      fout: new Weigering('Kan offerte niet versturen: er staan nog geen regels in. Voeg eerst artikelen toe.'),
      gevolg: 'Er is niets verstuurd.',
    })
    expect(t.titel).toBe('v2 versturen kan niet')
    expect(t.wat).toContain('nog geen regels')
    expect(t.weigering).toBe(true)
  })

  it('behandelt een weigering van de server net zo', () => {
    const fout = new ApiFout('Kan v1 niet accepteren: v2 is al geaccepteerd.', 'VOORWAARDE', 409, 'POST /x')
    const t = foutTekst({ actie: 'v1 accepteren', fout, gevolg: '' })
    expect(t.titel).toBe('v1 accepteren kan niet')
    expect(t.weigering).toBe(true)
  })

  it('zegt waar: de handeling, het verzoek en de status', () => {
    const t = foutTekst({ actie: 'OFF-2026-037 versturen', fout: migratieFout, gevolg: '' })
    expect(t.waar).toBe(
      'OFF-2026-037 versturen · POST /projects/PRJ-2026-059/offertes/OFF-2026-037/verzend → 500 MIGRATIE_ONTBREEKT',
    )
  })

  it('geeft het gevolg ongewijzigd door — dat weet alleen de aanroeper', () => {
    const t = foutTekst({ actie: 'x', fout: migratieFout, gevolg: 'Het scherm is teruggezet.' })
    expect(t.gevolg).toBe('Het scherm is teruggezet.')
  })

  it('noemt een verzoek dat de server nooit bereikte zonder status', () => {
    const t = foutTekst({
      actie: 'Regel bijwerken',
      fout: new ApiFout('De server is niet bereikbaar', 'GEEN_VERBINDING', 0, 'PATCH /projects/P/offertes/O/regels/R'),
      gevolg: '',
    })
    expect(t.waar).toBe('Regel bijwerken · PATCH /projects/P/offertes/O/regels/R → GEEN_VERBINDING')
  })

  it('onderscheidt een fout in de browser van een fout op de server', () => {
    const t = foutTekst({ actie: 'Versie kopiëren', fout: new Error('Te kopiëren offerteversie niet gevonden'), gevolg: '' })
    expect(t.wat).toBe('Te kopiëren offerteversie niet gevonden')
    expect(t.waar).toContain('in de browser')
  })
})

describe('laadGevolg', () => {
  it('noemt wat er niet geladen is en hoeveel er uit de browserkopie komt', () => {
    const t = laadGevolg([{ wat: 'projecten', aantalLokaal: 12, fout: null }])
    expect(t).toContain('Niet van de server geladen: projecten.')
    expect(t).toContain('12 projecten')
    expect(t).toContain('verouderd')
  })

  it('zet meerdere lijsten in één zin', () => {
    const t = laadGevolg([
      { wat: 'projecten', aantalLokaal: 3, fout: null },
      { wat: 'artikelen', aantalLokaal: 40, fout: null },
      { wat: 'machines', aantalLokaal: 5, fout: null },
    ])
    expect(t).toContain('projecten, artikelen en machines.')
  })

  // Zonder kopie is er niets te tonen, en dan is "niet gevonden" misleidend.
  it('waarschuwt dat "niet gevonden" niet klopt als er ook geen kopie is', () => {
    const t = laadGevolg([{ wat: 'projecten', aantalLokaal: 0, fout: null }])
    expect(t).toContain('bestaat mogelijk wél')
    expect(t).not.toContain('bewaarde kopie')
  })
})
