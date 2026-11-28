#!/usr/bin/env node
// tools/bundle.mjs — copy what ships (page, manifest, js incl. the vendored three.js) and fill sw.js with the build
// id and the file list, so the published game works offline. site/build.mjs calls bundle(src, dest, build).
//   node tools/bundle.mjs [outDir]      (default: dist/)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function bundle(srcDir, outDir, buildId) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of ['index.html', 'manifest.webmanifest', 'js']) {
    const p = path.join(srcDir, name);
    if (fs.existsSync(p)) fs.cpSync(p, path.join(outDir, name), { recursive: true });
  }
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(path.relative(outDir, full).split(path.sep).join('/'));
    }
  };
  walk(outDir);
  const hash = buildId || crypto.createHash('sha1').update(files.map((f) => f + fs.statSync(path.join(outDir, f)).size).join('\n')).digest('hex').slice(0, 12);
  const idx = path.join(outDir, 'index.html');
  const tag = '<script type="module" src="js/main.js"></script>';
  let html = fs.readFileSync(idx, 'utf8');
  if (!html.includes(tag)) throw new Error('spin-table/index.html: main.js script tag not found');
  html = html.replace(tag, `<script>window.SPIN_TABLE_BUILD = '${hash}';</script>\n${tag}`);
  fs.writeFileSync(idx, html);
  const precache = ['./', ...files.filter((f) => f !== 'index.html' && !f.endsWith('.LICENSE'))];
  const sw = fs.readFileSync(path.join(srcDir, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${hash}'`).replace('__PRECACHE__', JSON.stringify(precache));
  fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
  return { build: hash, files: files.length + 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.resolve(process.argv[2] || path.join(src, 'dist'));
  const r = bundle(src, out);
  console.log(`spin-table bundled (${r.build}): ${r.files} files -> ${out}`);
}
