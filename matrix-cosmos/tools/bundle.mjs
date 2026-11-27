#!/usr/bin/env node
// tools/bundle.mjs — copy static app files and inject build hash + precache list into sw.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function bundle(srcDir, outDir, buildId) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const copyEntries = ['index.html', 'manifest.webmanifest', 'js'];
  for (const name of copyEntries) {
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

  const hash = buildId || crypto.createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 12);

  // Inject build flag into index.html so sw.js registers in published builds
  const idxPath = path.join(outDir, 'index.html');
  let html = fs.readFileSync(idxPath, 'utf8');
  html = html.replace(
    '<script type="module" src="js/main.js"></script>',
    `<script>window.MATRIX_COSMOS_BUILD = '${hash}';</script>\n<script type="module" src="js/main.js"></script>`
  );
  fs.writeFileSync(idxPath, html);

  const swPath = path.join(srcDir, 'sw.js');
  if (fs.existsSync(swPath)) {
    const precache = ['./', ...files.filter((f) => f !== 'index.html')];
    const sw = fs.readFileSync(swPath, 'utf8')
      .replace("'__BUILD__'", `'${hash}'`)
      .replace('__PRECACHE__', JSON.stringify(precache));
    fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
  }

  return { build: hash, files: files.length + 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.resolve(process.argv[2] || path.join(src, 'dist'));
  const res = bundle(src, out);
  console.log(`matrix-cosmos bundled (${res.build}): ${res.files} files -> ${out}`);
}
