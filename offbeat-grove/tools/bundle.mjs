// tools/bundle.mjs — the publishable copy of the game: copies the files the game needs, writes the build id
// into index.html, fills sw.js with the build id and the full file list (so the service worker can cache
// everything for offline play), and writes version.json.
//   node tools/bundle.mjs [dest=dist] [build]
// site/build.mjs (the lab site) imports bundle() from here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const INCLUDE = ['index.html', 'manifest.webmanifest', 'js', 'img'];

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// build id from the content of the files that ship
export function contentHash(src) {
  const h = crypto.createHash('sha1');
  for (const top of [...INCLUDE, 'sw.js']) {
    const p = path.join(src, top);
    if (!fs.existsSync(p)) continue;
    const files = fs.statSync(p).isDirectory() ? walk(p, src) : [top];
    for (const f of files.sort()) { h.update(f); h.update(fs.readFileSync(path.join(src, f))); }
  }
  return h.digest('hex').slice(0, 12);
}

export function bundle(src, dest, build = contentHash(src)) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const top of INCLUDE) fs.cpSync(path.join(src, top), path.join(dest, top), { recursive: true });
  let html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
  const tag = '<script type="module" src="js/main.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html: main.js script tag not found');
  html = html.replace(tag, `<script>window.OG_BUILD = '${build}';</script>\n${tag}`);
  fs.writeFileSync(path.join(dest, 'index.html'), html);
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ build }) + '\n');
  const files = walk(dest).filter((f) => f !== 'version.json' && !f.endsWith('.LICENSE'));
  const precache = ['./', ...files];
  const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${build}'`).replace('__PRECACHE__', JSON.stringify(precache));
  if (sw.includes('__PRECACHE__') || sw.includes('__BUILD__')) throw new Error('sw.js: placeholders not filled');
  fs.writeFileSync(path.join(dest, 'sw.js'), sw);
  return { build, files: precache.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dest = path.resolve(process.argv[2] || path.join(src, 'dist'));
  const r = bundle(src, dest, process.argv[3]);
  console.log(`offbeat-grove build ${r.build}: ${r.files} files → ${dest}`);
}
