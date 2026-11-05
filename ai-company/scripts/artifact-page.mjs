// アーティファクト版の仕上げ：dist-artifact/index.html から、claude.ai に公開するページの本文（page.html）と、
// 一緒に公開するファイルの一覧（publish.json）を作る。
// - claude.ai は <!doctype>・<html>・<head>・<body> を自分で付けるので、ページは中身だけにする
// - 実在の会社のロゴ（nextmake-*）は公開しない
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = join(import.meta.dirname, '..', 'dist-artifact')
const html = readFileSync(join(DIST, 'index.html'), 'utf8')

const pick = (re) => [...html.matchAll(re)].map((m) => m[0])
const fonts = pick(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g)
const styles = pick(/<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\/[^"]+"[^>]*>/g)
const preloads = pick(/<link[^>]+rel="modulepreload"[^>]*>/g)
const scripts = pick(/<script[^>]+type="module"[^>]*><\/script>/g)

const page = `<title>AI オフィス</title>
<meta name="description" content="日本とカンボジアの 3D オフィスで、AI社員と人間が一緒に働く。仕事は承認する人の Claude で動く">
${fonts.join('\n')}
${styles.join('\n')}
${preloads.join('\n')}
<style>html,body{height:100%;margin:0;background:#dceefe;color:#16243d}</style>
<div id="app"></div>
${scripts.join('\n')}
`
writeFileSync(join(DIST, 'page.html'), page)

const files = {}
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else {
      const rel = relative(DIST, p).split('\\').join('/')
      if (rel === 'index.html' || rel === 'page.html' || rel === 'publish.json' || rel === 'favicon.svg' || /nextmake-/.test(rel)) continue
      files[rel] = `dist-artifact/${rel}`
    }
  }
}
walk(DIST)
writeFileSync(join(DIST, 'publish.json'), JSON.stringify(files, null, 1))
const size = Object.values(files).reduce((s, f) => s + statSync(join(DIST, '..', f)).size, 0)
console.log(`page.html と ${Object.keys(files).length} ファイル（${(size / 1024 / 1024).toFixed(1)} MB）を用意しました`)
