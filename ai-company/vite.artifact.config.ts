// アーティファクト版の書き出し（npm run build:artifact）：claude.ai のページとして公開できる形にする。
// - 画面・3D はサーバー版と同じ。client/src/api.ts の代わりに client/src/artifact/api.ts を使う
// - パスは相対（./assets/…）。続けて scripts/artifact-page.mjs が、公開するページの本文（page.html）とファイルの一覧を作る
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'

const ROOT = import.meta.dirname

/** main.ts の import './api' を、アーティファクト版に差し替える */
function artifactApi(): Plugin {
  return {
    name: 'artifact-api',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './api' && importer && resolve(importer) === resolve(ROOT, 'client/src/main.ts')) return resolve(ROOT, 'client/src/artifact/api.ts')
      return null
    },
  }
}

export default defineConfig({
  root: 'client',
  base: './',
  publicDir: 'public',
  plugins: [artifactApi()],
  define: {
    'import.meta.env.VITE_TARGET': JSON.stringify('artifact'),
  },
  build: {
    outDir: '../dist-artifact',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { main: resolve(ROOT, 'client/index.html') },
    },
  },
})
