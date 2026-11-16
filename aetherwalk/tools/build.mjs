#!/usr/bin/env node
// tools/build.mjs — the published, offline-capable build of AETHERWALK.
//
//   node tools/build.mjs <outDir> [--build <id>]
//
// Layout of <outDir>:
//   index.html              the page, pointing at v/<build>/ (the only file that changes URL-free)
//   v/<build>/js, fonts     code and fonts in a folder named after their content hash, so browsers and
//                           the service worker can keep them forever and never run stale code
//   img/, manifest.webmanifest   icons and the PWA manifest
//   sw.js                   the service worker, filled in with the build id and every file to store
//                           (plus three.js and the addons the game imports, from the CDN), so one online
//                           visit makes the app work offline
//   version.json            { build } — a running page checks it to offer updates
// Missing folders or files are skipped with a warning, so the script also runs on a half-built game.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--build');
const out = path.resolve(outArg || path.join(src, 'dist'));
const forced = args.includes('--build') ? args[args.indexOf('--build') + 1] : null;
const warn = (...a) => console.warn('[build] warning:', ...a);

// every file under dir (sorted, recursive); an empty list when the folder does not exist
const list = (dir) => {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  };
  walk(dir);
  return files;
};
const rel = (from, p) => path.relative(from, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(p);

// content hash of everything that ships
const hash = crypto.createHash('sha1');
const shipped = [...list(path.join(src, 'js')), ...list(path.join(src, 'fonts')), ...list(path.join(src, 'img')),
  path.join(src, 'index.html'), path.join(src, 'sw.js'), path.join(src, 'manifest.webmanifest')].filter(exists);
for (const f of shipped) { hash.update(rel(src, f)); hash.update(fs.readFileSync(f)); }
const build = forced || hash.digest('hex').slice(0, 12);

fs.rmSync(path.join(out, 'v'), { recursive: true, force: true });
const vdir = path.join(out, 'v', build);
fs.mkdirSync(vdir, { recursive: true });
if (exists(path.join(src, 'js'))) fs.cpSync(path.join(src, 'js'), path.join(vdir, 'js'), { recursive: true });
else warn('js/ folder missing');
if (exists(path.join(src, 'fonts'))) fs.cpSync(path.join(src, 'fonts'), path.join(vdir, 'fonts'), { recursive: true });
if (exists(path.join(src, 'img'))) fs.cpSync(path.join(src, 'img'), path.join(out, 'img'), { recursive: true });
else warn('img/ folder missing (run tools/icons.py)');
if (exists(path.join(src, 'manifest.webmanifest'))) fs.copyFileSync(path.join(src, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));

// index.html → this build's folder. A page cached from before a deploy points at a folder that is gone,
// so its module script falls back to fetching the page afresh (onerror reload).
let html = exists(path.join(src, 'index.html')) ? fs.readFileSync(path.join(src, 'index.html'), 'utf8') : '';
if (!html) warn('index.html missing: writing an empty page');
const mainTag = /<script\s+type="module"\s+src="js\/main\.js"\s*><\/script>/;
if (mainTag.test(html)) {
  html = html.replace(mainTag,
    `<script>window.AW_BUILD = '${build}';</script>\n` +
    `<script type="module" src="v/${build}/js/main.js" onerror="location.replace(location.pathname + '?r=' + Date.now())"></script>`);
} else if (html) warn('index.html: <script type="module" src="js/main.js"> not found');
// local stylesheets under fonts/ move into the build folder too
html = html.replace(/href="fonts\//g, `href="v/${build}/fonts/`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ build }) + '\n');

// three.js: the import map gives "three" (the module) and "three/addons/" (example modules).
// three.module.js imports ./three.core.js, so that file is stored too.
const cdn = [];
const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (mapMatch) {
  const imports = JSON.parse(mapMatch[1]).imports || {};
  const three = imports.three;
  const addonsBase = imports['three/addons/'];
  if (three) {
    cdn.push(three);
    cdn.push(three.replace(/three\.module\.js$/, 'three.core.js'));
  } else warn('import map has no "three" entry');
  // every three/addons/... module the game imports, found by scanning js/
  if (addonsBase) {
    const found = new Set();
    const re = /(?:from|import)\s*\(?\s*['"]three\/addons\/([^'"]+)['"]/g;
    for (const f of list(path.join(src, 'js'))) {
      if (!f.endsWith('.js')) continue;
      const code = fs.readFileSync(f, 'utf8');
      for (const m of code.matchAll(re)) found.add(m[1]);
    }
    for (const name of [...found].sort()) cdn.push(addonsBase + name);
    if (!found.size) warn('no three/addons imports found in js/');
  }
  // other CDN assets the game fetches at run time (e.g. the hand model): full https://cdn.jsdelivr.net/… literals in js/
  const assets = new Set();
  for (const f of list(path.join(src, 'js'))) {
    if (!f.endsWith('.js')) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"](https:\/\/cdn\.jsdelivr\.net\/npm\/[^'"\s]+\.(?:glb|gltf|bin|ktx2))['"]/g)) assets.add(m[1]);
  }
  for (const u of [...assets].sort()) cdn.push(u);
} else warn('no import map in index.html; three.js is not stored offline');

// everything in the output folder is stored, except the three files that are never cached, and fonts' .txt licences
const precache = ['./', ...list(out).map((f) => rel(out, f))
  .filter((f) => !['index.html', 'version.json', 'sw.js'].includes(f) && !f.endsWith('.txt')), ...cdn];
const swTemplate = exists(path.join(src, 'sw.js')) ? fs.readFileSync(path.join(src, 'sw.js'), 'utf8') : null;
if (!swTemplate) warn('sw.js template missing');
const sw = (swTemplate || '')
  .replace("'__BUILD__'", `'${build}'`)
  .replace('__PRECACHE__', JSON.stringify(precache));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
console.log(`aetherwalk build ${build}: ${precache.length} files to store offline → ${out}`);
console.log(build);
