# 34 — Grades & Profiles

## Grades (admin)

Material specs. Each grade has:
- `name` (e.g. S355, AISI 304, 7075-T6)
- `density_kg_m3` (e.g. 7850 for steel, 2700 for aluminum)

Admin manages list in Settings → Materiaalgrades.

## Profiles (admin)

Shapes of raw material. Admin can add new ones.

### Built-in volume formulas

| `volume_formula` | Inputs (dimension keys) | Formula |
|---|---|---|
| `round` | `diameter` | `π × (Ø/2)² × length` |
| `square` | `side` | `side² × length` |
| `flat` | `width`, `thickness` | `width × thickness × length` |
| `tube` | `outerDiameter`, `innerDiameter` | `π × ((OD/2)² − (ID/2)²) × length` |

### Schema example

```json
{
  "name": "Rond",
  "volume_formula": "round",
  "dimension_schema": [
    { "key": "diameter", "label": "Ø", "unit": "mm", "min": 1 }
  ]
}
```

```json
{
  "name": "Plat",
  "volume_formula": "flat",
  "dimension_schema": [
    { "key": "width", "label": "Breedte", "unit": "mm", "min": 1 },
    { "key": "thickness", "label": "Dikte", "unit": "mm", "min": 1 }
  ]
}
```

### Adding custom shapes

For v1, admin can pick name + one of the four built-in formulas + dimension schema. Custom formulas with user-supplied math are parked (security: evaluating arbitrary expressions server-side).

## Weight calculation service

Backend service `computeWeight(rawMaterial)`:
1. Load grade (density) and profile (formula + dimensions)
2. Plug `rawMaterial.dimensions` + `rawMaterial.length_mm` into the formula
3. Convert mm³ → m³ (÷ 1e9)
4. Multiply by density → kg
5. Round to 2 decimals

Exposed via `GET /api/raw-materials/:id` as a computed field on the response, not stored.
