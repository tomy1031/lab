#!/usr/bin/env node
// tools/build.mjs — the published, offline-capable build of STAR WEAVER (used by the lab site's build).
//
//   node tools/build.mjs <outDir> [--build <id>]
//
// Layout of <outDir>:
//   index.html              the page, pointing at v/<build>/ (the only file that changes URL-free)
//   v/<build>/js, fonts     code and fonts in a folder named after their content hash, so browsers and
//                           the service worker can keep them forever and never run stale code
//   img/, manifest.webmanifest   icons and the PWA manifest
//   sw.js                   the service worker, filled in with the build id and every file to store
//                           (plus three.js from the CDN), so one online visit makes the app work offline
//   version.json            { build } — a running page checks it to offer updates
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--build') || path.join(src, 'dist'));
const forced = args.includes('--build') ? args[args.indexOf('--build') + 1] : null;

const list = (dir) => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  return files;
};
const rel = (from, p) => path.relative(from, p).split(path.sep).join('/');

// content hash of everything that ships
const hash = crypto.createHash('sha1');
const shipped = [...list(path.join(src, 'js')), ...list(path.join(src, 'fonts')), ...list(path.join(src, 'img')),
  path.join(src, 'index.html'), path.join(src, 'sw.js'), path.join(src, 'manifest.webmanifest')];
for (const f of shipped) { hash.update(rel(src, f)); hash.update(fs.readFileSync(f)); }
const build = forced || hash.digest('hex').slice(0, 12);

fs.rmSync(path.join(out, 'v'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'v', build), { recursive: true });
const vdir = path.join(out, 'v', build);
fs.cpSync(path.join(src, 'js'), path.join(vdir, 'js'), { recursive: true });
fs.cpSync(path.join(src, 'fonts'), path.join(vdir, 'fonts'), { recursive: true });
fs.cpSync(path.join(src, 'img'), path.join(out, 'img'), { recursive: true });
fs.copyFileSync(path.join(src, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));

// index.html → this build's folder (a page cached from before a deploy points at a folder that is gone:
// then fetch the page afresh)
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const tag = '<script type="module" src="js/main.js"></script>';
const css = '<link rel="stylesheet" href="fonts/fonts.css">';
if (!html.includes(tag) || !html.includes(css)) throw new Error('index.html: main.js or fonts.css reference not found');
html = html.replace(css, `<link rel="stylesheet" href="v/${build}/fonts/fonts.css">`).replace(tag,
  `<script>window.STARWEAVER_BUILD = '${build}';</script>\n` +
  `<script type="module" src="v/${build}/js/main.js" onerror="location.replace(location.pathname + '?r=' + Date.now())"></script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ build }) + '\n');

// three.js from the import map (and the core file it imports) is stored too
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
const three = map.imports.three;
const cdn = [three, three.replace(/three\.module\.js$/, 'three.core.js')];

const precache = ['./', ...list(out).map((f) => rel(out, f)).filter((f) => !['index.html', 'version.json', 'sw.js'].includes(f) && !f.endsWith('.txt')), ...cdn];
const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${build}'`).replace('__PRECACHE__', JSON.stringify(precache, null, 0));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
console.log(`star-weaver build ${build}: ${precache.length} files to store offline → ${out}`);
