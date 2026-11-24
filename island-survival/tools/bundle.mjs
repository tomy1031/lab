// tools/bundle.mjs — the publishable copy of ひとつだけ島: copies the files the game needs (no tests / tools / dev
// pages), writes the build id into index.html, fills sw.js with the build id and the full file list (so the
// service worker caches everything for offline play), and writes version.json.
// The hand-gesture pack (vendor/mediapipe, ~19 MB) is left out of the install and cached on first use.
//   node tools/bundle.mjs [dest=dist] [build]
// site/build.mjs (the lab site) imports bundle() from here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const INCLUDE = ['index.html', 'manifest.webmanifest', 'js', 'css', 'img', 'assets', 'vendor'];
const LAZY = (f) => f.startsWith('vendor/mediapipe/');
export const EXTRA_FILES = ['vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'vendor/mediapipe/hand_landmarker.task'];

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
  html = html.replace(tag, `<script>window.ISLE_BUILD = '${build}';</script>\n${tag}`);
  fs.writeFileSync(path.join(dest, 'index.html'), html);
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ build }) + '\n');
  const files = walk(dest).filter((f) => f !== 'version.json' && !/LICENSE|README/.test(f) && !LAZY(f));
  const precache = ['./', ...files];
  const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${build}'`).replace('__PRECACHE__', JSON.stringify(precache));
  if (sw.includes('__PRECACHE__') || sw.includes("'__BUILD__'")) throw new Error('sw.js: placeholders not filled');
  fs.writeFileSync(path.join(dest, 'sw.js'), sw);
  const bytes = files.reduce((a, f) => a + fs.statSync(path.join(dest, f)).size, 0);
  return { build, files: precache.length, mb: +(bytes / 1048576).toFixed(1) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dest = path.resolve(process.argv[2] || path.join(src, 'dist'));
  const r = bundle(src, dest, process.argv[3]);
  console.log(`island-survival build ${r.build}: ${r.files} files (${r.mb} MB to cache) → ${dest}`);
}
