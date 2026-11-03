import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const API = process.env.API_ORIGIN ?? 'http://localhost:8787'

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'client/index.html'),
        world: resolve(import.meta.dirname, 'client/world-preview.html'),
      },
    },
  },
})
