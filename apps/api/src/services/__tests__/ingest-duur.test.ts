import { describe, it, expect } from 'vitest'
import { schatDuur, type Meting } from '../ingest-duur'

const m = (duurMs: number, bytes = 100_000): Meting => ({ bytes, duurMs })

describe('schatDuur', () => {
  it('belooft niets bij te weinig metingen', () => {
    expect(schatDuur([m(40_000), m(50_000)], 100_000).verwachtSeconden).toBeNull()
  })

  it('neemt de mediaan, niet het gemiddelde — één uitschieter mag niet sturen', () => {
    const uit = schatDuur([m(40_000), m(45_000), m(50_000), m(600_000)], 100_000)
    expect(uit.verwachtSeconden).toBe(48)
  })

  it('geeft een spreiding mee in plaats van één hard getal', () => {
    const uit = schatDuur([m(30_000), m(40_000), m(50_000), m(60_000), m(70_000)], 100_000)
    expect(uit.ondergrensSeconden).toBeLessThan(uit.verwachtSeconden!)
    expect(uit.bovengrensSeconden).toBeGreaterThan(uit.verwachtSeconden!)
  })

  it('gebruikt mails van vergelijkbare grootte als die er genoeg zijn', () => {
    const metingen = [
      m(20_000, 50_000), m(22_000, 60_000), m(21_000, 55_000),   // kleine mails
      m(90_000, 5_000_000), m(95_000, 6_000_000), m(92_000, 5_500_000), // grote
    ]
    expect(schatDuur(metingen, 55_000).verwachtSeconden).toBe(21)
    expect(schatDuur(metingen, 5_500_000).verwachtSeconden).toBe(92)
  })

  it('valt terug op alles als er maar één gelijkende meting is', () => {
    const metingen = [m(20_000, 50_000), m(40_000, 900_000), m(60_000, 950_000), m(80_000, 980_000)]
    expect(schatDuur(metingen, 50_000).gebaseerdOp).toBe(4)
  })

  it('gebruikt twee gelijkende metingen liever dan vijf van een ander soort', () => {
    // Gemeten geval: een grote mail vol scans kreeg de mediaan van kleine
    // tekstmails toegeschoven — 44 s, terwijl vergelijkbare runs 88-96 s deden.
    const metingen = [
      m(38_000, 166_912), m(44_000, 180_000), m(41_000, 172_000),
      m(96_000, 5_200_000), m(88_000, 5_600_000),
    ]
    expect(schatDuur(metingen, 5_400_000).verwachtSeconden).toBe(92)
  })

  it('rondt nooit naar nul af', () => {
    expect(schatDuur([m(100), m(200), m(300)], 100_000).verwachtSeconden).toBe(1)
  })
})
