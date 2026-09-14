import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stockmanager/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    // Luister op alle netwerkkaarten, niet alleen localhost. Zonder dit meldt
    // Vite "Network: use --host to expose" en weigert een andere pc op het LAN
    // de verbinding — gemeten 2026-09-14: localhost gaf 200, het LAN-adres niets.
    // De werkvloer-pc draait de terminal in een browser en moet erbij kunnen,
    // ook als de app met `npm run dev` draait in plaats van gebouwd.
    // Past bij de opzet van deze app: LAN-only, geen wachtwoorden (01-architecture.md).
    host: true,
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
})
