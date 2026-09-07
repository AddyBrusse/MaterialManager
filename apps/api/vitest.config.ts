import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Alleen de bron testen. Zonder dit draait vitest ook de naar dist
    // gecompileerde kopieën van dezelfde tests, die als CommonJS falen.
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
