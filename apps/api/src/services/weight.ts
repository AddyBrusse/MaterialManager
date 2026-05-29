type Dimensions = Record<string, number>

function volumeM3(formula: string, dims: Dimensions, lengthMm: number): number {
  const L = lengthMm / 1000
  switch (formula) {
    case 'round': {
      const r = dims.diameter / 1000 / 2
      return Math.PI * r * r * L
    }
    case 'square': {
      const s = dims.side / 1000
      return s * s * L
    }
    case 'flat':
      return (dims.width / 1000) * (dims.height / 1000) * L
    case 'tube': {
      const ro = dims.outerDiameter / 1000 / 2
      const ri = dims.innerDiameter / 1000 / 2
      return Math.PI * (ro * ro - ri * ri) * L
    }
    default:
      return 0
  }
}

export function calcWeightKg(
  formula: string,
  dimensions: Dimensions,
  lengthMm: number,
  densityKgM3: number
): number {
  return volumeM3(formula, dimensions, Number(lengthMm)) * densityKgM3
}
