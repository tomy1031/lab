#!/usr/bin/env node
// site/build.mjs — assemble the GitHub Pages site: the lab link page plus every project, from their branches.
//
//   node site/build.mjs [outDir]          (default: .site at the repository root)
//
// Where each project comes from (git refs; override with environment variables):
//   YOKOHAMA_REF  ハマころ！ (yokohama-roll/)                 default: HEAD
//   FILMS_REF     NEXTMAKE Films (nextmake-mv/output)          default: origin/claude/nextmake-investment-video-jaigyl
//   AIC_REF       NEXTMAKE AI COMPANY (ai-company/)            default: origin/claude/ai-employee-3d-visualization-bgkso0
//   UNDOKAI_REF   運動会 絆 reel (undokai-reel/output)         default: origin/claude/ecstatic-thompson-v7ve2u (then FILMS_REF)
//   STARLIGHT_REF Starlight Lake (starlight-lake/)              default: origin/claude/jolly-faraday-yhmee4 (then FILMS_REF)
//   STARWEAVER_REF STAR WEAVER (star-weaver/)                  default: origin/claude/upbeat-wozniak-itsh33 (then FILMS_REF)
//   AETHERWALK_REF AETHERWALK (aetherwalk/)                    default: origin/claude/determined-newton-ki8tfm (then FILMS_REF)
//   KOTOBA_REF    ことばタウン (kotoba-town/)                   default: HEAD if it has kotoba-town/, else origin/claude/vr-japanese-practice-app-qqna1o
//   OFFBEAT_REF   OFFBEAT GROVE (offbeat-grove/)              default: HEAD
//   DREAMDRIFT_REF DREAM DRIFT (dream-drift/)                  default: HEAD if it has dream-drift/, else origin/claude/happy-turing-uknqds
//   RALLY_REF     RALLY COURT (rally-court/)                   default: HEAD if it has rally-court/, else origin/claude/ecstatic-euler-zw060e
//   ISLAND_REF    ひとつだけ島 (island-survival/)               default: HEAD if it has island-survival/, else origin/claude/deserted-island-survival-game-7tg6jw
//   SKYATLAS_REF  SKY ATLAS (sky-atlas/)                      default: HEAD if it has sky-atlas/, else origin/claude/nifty-hamilton-jfagze
//   ANAKATA_REF   ANAKATA (anakata/)                           default: HEAD if it has anakata/, else origin/claude/determined-turing-o80o1n
//   POWDER_REF    POWDER LINE (powder-line/)                   default: HEAD if it has powder-line/, else origin/claude/stoic-maxwell-eaq1nw
//   KOTEI_REF     KOTEI DUEL (kotei-duel/)                      default: HEAD if it has kotei-duel/, else origin/claude/it-manufacturing-card-game-2qkhxb
//   SELFINTRO_REF じこしょうかい (self-intro/output)               default: HEAD if it has self-intro/, else origin/claude/great-sagan-2ophg4
// The site pages themselves (site/*.html, site/img) are taken from the working tree.
// SKIP_AIC=1 skips the AI COMPANY build (it needs `npm ci`), leaving a page that links to GitHub.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sh = (cmd, opts = {}) => (execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', ...opts }) ?? '').trim();
const root = sh('git rev-parse --show-toplevel');
const siteSrc = path.join(root, 'site');
const out = path.resolve(process.argv[2] || path.join(root, '.site'));
const refs = {
  yokohama: process.env.YOKOHAMA_REF || 'HEAD',
  films: process.env.FILMS_REF || 'origin/claude/nextmake-investment-video-jaigyl',
  aic: process.env.AIC_REF || 'origin/claude/ai-employee-3d-visualization-bgkso0',
  undokai: process.env.UNDOKAI_REF || 'origin/claude/ecstatic-thompson-v7ve2u',
  starlight: process.env.STARLIGHT_REF || 'origin/claude/jolly-faraday-yhmee4',
  starweaver: process.env.STARWEAVER_REF || 'origin/claude/upbeat-wozniak-itsh33',
  aetherwalk: process.env.AETHERWALK_REF || 'origin/claude/determined-newton-ki8tfm',
  kotoba: process.env.KOTOBA_REF || 'HEAD',
  offbeat: process.env.OFFBEAT_REF || 'HEAD',
  dreamdrift: process.env.DREAMDRIFT_REF || 'HEAD',
  rally: process.env.RALLY_REF || 'HEAD',
  island: process.env.ISLAND_REF || 'HEAD',
  skyatlas: process.env.SKYATLAS_REF || 'HEAD',
  anakata: process.env.ANAKATA_REF || 'HEAD',
  powder: process.env.POWDER_REF || 'HEAD',
  kotei: process.env.KOTEI_REF || 'HEAD',
  selfintro: process.env.SELFINTRO_REF || 'HEAD',
  khmergt: process.env.KHMERGT_REF || 'HEAD',
  matrixcosmos: process.env.MATRIX_COSMOS_REF || 'HEAD',
};
// once the reel's branch is merged and deleted, take it from the films branch it was merged into
const hasRef = (ref) => { try { sh(`git -C "${root}" rev-parse --verify --quiet "${ref}^{commit}"`); return true; } catch { return false; } };
if (!process.env.UNDOKAI_REF && !hasRef(refs.undokai)) refs.undokai = refs.films;
if (!process.env.STARLIGHT_REF && !hasRef(refs.starlight)) refs.starlight = refs.films;
if (!process.env.STARWEAVER_REF && !hasRef(refs.starweaver)) refs.starweaver = refs.films;
if (!process.env.AETHERWALK_REF && !hasRef(refs.aetherwalk)) refs.aetherwalk = refs.films;
const hasDir = (ref, dir) => { try { sh(`git -C "${root}" cat-file -e "${ref}:${dir}"`); return true; } catch { return false; } };
if (!process.env.KOTOBA_REF && !hasDir(refs.kotoba, 'kotoba-town')) refs.kotoba = 'origin/claude/vr-japanese-practice-app-qqna1o';
if (!process.env.DREAMDRIFT_REF && !hasDir(refs.dreamdrift, 'dream-drift')) refs.dreamdrift = 'origin/claude/happy-turing-uknqds';
if (!process.env.RALLY_REF && !hasDir(refs.rally, 'rally-court')) refs.rally = 'origin/claude/ecstatic-euler-zw060e';
if (!process.env.ISLAND_REF && !hasDir(refs.island, 'island-survival')) refs.island = 'origin/claude/deserted-island-survival-game-7tg6jw';
if (!process.env.SKYATLAS_REF && !hasDir(refs.skyatlas, 'sky-atlas')) refs.skyatlas = 'origin/claude/nifty-hamilton-jfagze';
if (!process.env.ANAKATA_REF && !hasDir(refs.anakata, 'anakata')) refs.anakata = 'origin/claude/determined-turing-o80o1n';
if (!process.env.POWDER_REF && !hasDir(refs.powder, 'powder-line')) refs.powder = 'origin/claude/stoic-maxwell-eaq1nw';
if (!process.env.KOTEI_REF && !hasDir(refs.kotei, 'kotei-duel')) refs.kotei = 'origin/claude/it-manufacturing-card-game-2qkhxb';
if (!process.env.SELFINTRO_REF && !hasDir(refs.selfintro, 'self-intro')) refs.selfintro = 'origin/claude/great-sagan-2ophg4';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-site-'));
// extract <dir> of <ref> into a fresh temp folder and return its path
function exportDir(ref, dir) {
  const dest = fs.mkdtempSync(path.join(tmp, 'x-'));
  sh(`git -C "${root}" archive --format=tar "${ref}" "${dir}" | tar -x -C "${dest}"`, { shell: '/bin/bash' });
  return path.join(dest, dir);
}
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// link page
copy(path.join(siteSrc, 'index.html'), path.join(out, 'index.html'));
copy(path.join(siteSrc, 'img'), path.join(out, 'img'));

// 01 ハマころ！ — the game is static files: page + ES modules (three.js comes from the CDN).
// Cache-proof publishing: the code goes into v/<build>/ (a new folder for every change, so browsers can
// keep it forever and never run stale code), index.html points there, version.json names the build,
// and sw.js (service worker) is filled in with the build and its file list for the installable PWA.
{
  const src = exportDir(refs.yokohama, 'yokohama-roll');
  const dest = path.join(out, 'yokohama-roll');
  fs.mkdirSync(dest, { recursive: true });
  const build = sh(`git -C "${root}" rev-parse "${refs.yokohama}:yokohama-roll"`).slice(0, 12); // content hash of the game folder
  const vdir = path.join(dest, 'v', build);
  fs.mkdirSync(vdir, { recursive: true });
  copy(path.join(src, 'js'), path.join(vdir, 'js'));
  if (fs.existsSync(path.join(src, 'img'))) copy(path.join(src, 'img'), path.join(dest, 'img'));
  // the NexMax 3D model download page (nexmax/: viewer, nexmax.glb, preview.png) — not part of the game
  if (fs.existsSync(path.join(src, 'nexmax'))) copy(path.join(src, 'nexmax'), path.join(dest, 'nexmax'));
  let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  const tag = '<script type="module" src="js/main.js"></script>';
  if (!html.includes(tag)) throw new Error('yokohama-roll/index.html: main.js script tag not found');
  html = html.replace(tag,
    `<script>window.HAMAKORO_BUILD = '${build}';</script>\n` +
    // a page cached from before a deploy points at a folder that is gone: fetch the page afresh
    `<script type="module" src="v/${build}/js/main.js" onerror="location.replace(location.pathname + '?r=' + Date.now())"></script>`);
  fs.writeFileSync(path.join(dest, 'index.html'), html);
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ build }) + '\n');
  for (const f of ['manifest.webmanifest']) if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dest, f));
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(dest, p).split(path.sep).join('/')); } };
  walk(dest);
  // the model download is not needed to play: keep its 1+ MB out of the game's offline cache
  const precache = ['./', ...files.filter((f) => f !== 'version.json' && f !== 'index.html' && !f.startsWith('nexmax/'))];
  if (fs.existsSync(path.join(src, 'sw.js'))) {
    const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${build}'`).replace('__PRECACHE__', JSON.stringify(precache));
    fs.writeFileSync(path.join(dest, 'sw.js'), sw);
  }
  console.log(`yokohama-roll build ${build}: ${files.length} files`);
}

// 02 NEXTMAKE Films — the 720p share versions and posters
{
  const src = exportDir(refs.films, 'nextmake-mv/output');
  const dest = path.join(out, 'nextmake-mv');
  fs.mkdirSync(path.join(dest, 'media'), { recursive: true });
  copy(path.join(siteSrc, 'films.html'), path.join(dest, 'index.html'));
  for (const f of fs.readdirSync(src)) {
    if (/_720p\.mp4$/.test(f) || /_poster\.jpg$/.test(f)) copy(path.join(src, f), path.join(dest, 'media', f));
  }
  copy(path.join(src, '01_poster.jpg'), path.join(out, 'img', 'films.jpg'));
}

// 03 NEXTMAKE AI COMPANY — only the server-free 3D office demo (client/world-preview.html) can run on Pages
{
  const dest = path.join(out, 'ai-company');
  fs.mkdirSync(dest, { recursive: true });
  const src = exportDir(refs.aic, 'ai-company');
  copy(path.join(src, 'docs', 'img', 'space_all.jpg'), path.join(out, 'img', 'ai-company.jpg'));
  let built = false;
  if (!process.env.SKIP_AIC) {
    try {
      sh('npm ci --no-audit --no-fund --ignore-scripts', { cwd: src, stdio: ['ignore', 'ignore', 'inherit'] });
      sh('npx vite build --base ./ --logLevel warn', { cwd: src, stdio: ['ignore', 'ignore', 'inherit'] });
      copy(path.join(src, 'dist'), dest);
      fs.rmSync(path.join(dest, 'index.html')); // the full app needs its server; serve the demo as the folder's page
      fs.renameSync(path.join(dest, 'world-preview.html'), path.join(dest, 'index.html'));
      built = true;
    } catch (e) {
      console.warn('ai-company demo build failed; publishing a link page instead:', e.message);
    }
  }
  if (!built) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NEXTMAKE AI COMPANY</title>' +
      '<p style="font-family:sans-serif;padding:24px">3D オフィスのデモは準備中です。<a href="https://github.com/tomy1031/lab/tree/claude/ai-employee-3d-visualization-bgkso0/ai-company">ソースコード</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 04 運動会 絆 — the Instagram reel (720p to play, 1080p to download for posting) and its cover frames
{
  const dest = path.join(out, 'undokai-reel');
  fs.mkdirSync(path.join(dest, 'media'), { recursive: true });
  try {
    const src = exportDir(refs.undokai, 'undokai-reel/output');
    copy(path.join(siteSrc, 'undokai.html'), path.join(dest, 'index.html'));
    for (const f of ['undokai_2026_reel.mp4', 'undokai_2026_reel_720p.mp4', 'cover_hook.jpg', 'cover_japan.jpg', 'cover_info.jpg']) {
      if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dest, 'media', f));
    }
  } catch (e) {
    console.warn(`undokai reel not found at ${refs.undokai}; publishing a link page instead:`, e.message);
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>運動会 絆 リール</title>' +
      '<p style="font-family:sans-serif;padding:24px">映像は準備中です。<a href="https://github.com/tomy1031/lab/pull/3">プルリクエスト #3</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 05 Starlight Lake — WebXR vision training; static files (page + ES modules + docs, three.js from the CDN)
{
  const dest = path.join(out, 'starlight-lake');
  try {
    const src = exportDir(refs.starlight, 'starlight-lake');
    copy(src, dest);
    copy(path.join(src, 'docs', 'preview.jpg'), path.join(out, 'img', 'starlight-lake.jpg'));
  } catch (e) {
    console.warn(`starlight-lake not found at ${refs.starlight}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Starlight Lake</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="https://github.com/tomy1031/lab/pull/5">プルリクエスト #5</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 06 STAR WEAVER — WebXR rhythm fitness. Its own tools/build.mjs makes the published build: an installable,
// offline-capable PWA (code and fonts in v/<content hash>/, version.json, a service worker that stores
// everything incl. three.js). Trees from before that script are copied as plain static files.
{
  const dest = path.join(out, 'star-weaver');
  try {
    const src = exportDir(refs.starweaver, 'star-weaver');
    fs.mkdirSync(dest, { recursive: true });
    if (fs.existsSync(path.join(src, 'tools', 'build.mjs'))) {
      sh(`node "${path.join(src, 'tools', 'build.mjs')}" "${dest}"`, { stdio: ['ignore', 'inherit', 'inherit'] });
    } else {
      copy(path.join(src, 'index.html'), path.join(dest, 'index.html'));
      copy(path.join(src, 'js'), path.join(dest, 'js'));
    }
    copy(path.join(src, 'docs', 'preview.jpg'), path.join(out, 'img', 'star-weaver.jpg'));
  } catch (e) {
    console.warn(`star-weaver not found at ${refs.starweaver}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>STAR WEAVER</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="https://github.com/tomy1031/lab/pull/4">プルリクエスト #4</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 07 AETHERWALK — WebXR open-world fitness (walk by stepping in place). Like STAR WEAVER, its own
// tools/build.mjs makes the published build: an installable, offline-capable PWA.
{
  const dest = path.join(out, 'aetherwalk');
  try {
    const src = exportDir(refs.aetherwalk, 'aetherwalk');
    fs.mkdirSync(dest, { recursive: true });
    sh(`node "${path.join(src, 'tools', 'build.mjs')}" "${dest}"`, { stdio: ['ignore', 'inherit', 'inherit'] });
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'aetherwalk.jpg'));
    else console.warn('aetherwalk: docs/preview.jpg not found; the lab page card has no picture');
  } catch (e) {
    console.warn(`aetherwalk not found at ${refs.aetherwalk}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AETHERWALK</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="https://github.com/tomy1031/lab/pull/8">プルリクエスト #8</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 08 ことばタウン — WebXR Japanese conversation practice with Gemini Live. Static files: the page, ES modules,
// lesson data and the pre-made voices (three.js comes from the CDN).
{
  const dest = path.join(out, 'kotoba-town');
  try {
    const src = exportDir(refs.kotoba, 'kotoba-town');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of ['index.html', 'js', 'data', 'audio']) if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dest, f));
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'kotoba-town.jpg'));
  } catch (e) {
    console.warn(`kotoba-town not found at ${refs.kotoba}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ことばタウン</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 09 OFFBEAT GROVE — WebXR offbeat boxercise; static files plus an offline service worker. The game's own
// tools/bundle.mjs copies what ships and fills sw.js with the build id (the folder's content hash) and the
// list of files to cache, so the published game works with no network once opened.
{
  const dest = path.join(out, 'offbeat-grove');
  try {
    const src = exportDir(refs.offbeat, 'offbeat-grove');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.offbeat}:offbeat-grove"`).slice(0, 12);
    const r = bundle(src, dest, build);
    copy(path.join(src, 'docs', 'preview.jpg'), path.join(out, 'img', 'offbeat-grove.jpg'));
    console.log(`offbeat-grove build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`offbeat-grove not found at ${refs.offbeat}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OFFBEAT GROVE</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="https://github.com/tomy1031/lab">リポジトリ</a>・<a href="../">lab にもどる</a></p>');
  }
}

// 10 DREAM DRIFT — kart racing (gamepad / keyboard / touch / hand gestures). Static files: the page, ES modules
// and images (three.js and MediaPipe come from the CDN).
{
  const dest = path.join(out, 'dream-drift');
  try {
    const src = exportDir(refs.dreamdrift, 'dream-drift');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of ['index.html', 'js', 'img']) if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dest, f));
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'dream-drift.jpg'));
  } catch (e) {
    console.warn(`dream-drift not found at ${refs.dreamdrift}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DREAM DRIFT</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 11 RALLY COURT — WebXR tennis. Static files: the page and ES modules (three.js comes from the CDN).
{
  const dest = path.join(out, 'rally-court');
  try {
    const src = exportDir(refs.rally, 'rally-court');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of ['index.html', 'js']) copy(path.join(src, f), path.join(dest, f));
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'rally-court.jpg'));
  } catch (e) {
    console.warn(`rally-court not found at ${refs.rally}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RALLY COURT</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 12 ひとつだけ島 — first-person island survival (three.js, MediaPipe, Gemini Live; WebXR). Offline PWA: the game's
// own tools/bundle.mjs copies what ships (no tests / tools / dev pages) and fills sw.js with the build id and the
// files to cache, so the published game works with no network once opened (also in a VR headset).
// Older refs without tools/bundle.mjs are copied as plain static files.
{
  const dest = path.join(out, 'island-survival');
  try {
    const src = exportDir(refs.island, 'island-survival');
    if (fs.existsSync(path.join(src, 'tools', 'bundle.mjs'))) {
      const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
      const build = sh(`git -C "${root}" rev-parse "${refs.island}:island-survival"`).slice(0, 12);
      const r = bundle(src, dest, build);
      console.log(`island-survival build ${r.build}: ${r.files} files (${r.mb} MB to cache)`);
    } else {
      const skip = new Set(['tests', 'tools', 'dev']);
      fs.cpSync(src, dest, { recursive: true, filter: (p) => !skip.has(path.relative(src, p).split(path.sep)[0]) });
    }
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'island-survival.jpg'));
  } catch (e) {
    console.warn(`island-survival not found at ${refs.island}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ひとつだけ島</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 13 SKY ATLAS — fly over the real world in VR (three.js / WebXR, open map data). Static files plus an offline
// service worker, filled in by the game's own tools/bundle.mjs (like OFFBEAT GROVE). The map tiles are not
// part of the site: each player downloads the areas they want into their own browser.
{
  const dest = path.join(out, 'sky-atlas');
  try {
    const src = exportDir(refs.skyatlas, 'sky-atlas');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.skyatlas}:sky-atlas"`).slice(0, 12);
    const r = bundle(src, dest, build);
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'sky-atlas.jpg'));
    console.log(`sky-atlas build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`sky-atlas not found at ${refs.skyatlas}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SKY ATLAS</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 14 ANAKATA — WebXR: feel the 4th and 5th dimensions (Interstellar's bulk). Like OFFBEAT GROVE, its own
// tools/bundle.mjs copies what ships and fills sw.js with the build id and the file list, so the published
// experience works with no network once opened.
{
  const dest = path.join(out, 'anakata');
  try {
    const src = exportDir(refs.anakata, 'anakata');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.anakata}:anakata"`).slice(0, 12);
    const r = bundle(src, dest, build);
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'anakata.jpg'));
    console.log(`anakata build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`anakata not found at ${refs.anakata}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ANAKATA</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 15 POWDER LINE — WebXR snowboarding ridden with the body. Like ANAKATA, its own tools/bundle.mjs copies what
// ships and fills sw.js with the build id and the file list, so the published game works with no network once opened.
{
  const dest = path.join(out, 'powder-line');
  try {
    const src = exportDir(refs.powder, 'powder-line');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.powder}:powder-line"`).slice(0, 12);
    const r = bundle(src, dest, build);
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'powder-line.jpg'));
    console.log(`powder-line build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`powder-line not found at ${refs.powder}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>POWDER LINE</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 16 KOTEI DUEL — a duel card game about how systems are built at Japanese IT companies (PC and WebXR). Like the
// ones above, its own tools/bundle.mjs copies what ships and fills sw.js, so the published game works offline.
{
  const dest = path.join(out, 'kotei-duel');
  try {
    const src = exportDir(refs.kotei, 'kotei-duel');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.kotei}:kotei-duel"`).slice(0, 12);
    const r = bundle(src, dest, build);
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'kotei-duel.jpg'));
    console.log(`kotei-duel build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`kotei-duel not found at ${refs.kotei}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KOTEI DUEL</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 17 じこしょうかい — 11 students' self-introduction speeches cut to ~27 s each; the page gets the 720p video,
// the poster and the face thumbnails for its chapter buttons
{
  const dest = path.join(out, 'self-intro');
  fs.mkdirSync(path.join(dest, 'media'), { recursive: true });
  try {
    const src = exportDir(refs.selfintro, 'self-intro/output');
    copy(path.join(siteSrc, 'self-intro.html'), path.join(dest, 'index.html'));
    for (const f of ['self_intro_720p.mp4', 'poster.jpg']) copy(path.join(src, f), path.join(dest, 'media', f));
    copy(path.join(src, 'faces'), path.join(dest, 'media', 'faces'));
    copy(path.join(src, 'poster.jpg'), path.join(out, 'img', 'self-intro.jpg'));
  } catch (e) {
    console.warn(`self-intro not found at ${refs.selfintro}; publishing a link page instead:`, e.message);
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>じこしょうかい</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 18 KHMER GT — Gran Turismo inspired Cambodia VR & hand-gesture racing (three.js / WebXR / MediaPipe).
{
  const dest = path.join(out, 'khmer-gt');
  try {
    const src = exportDir(refs.khmergt, 'khmer-gt');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of ['index.html', 'css', 'js', 'img']) if (fs.existsSync(path.join(src, f))) copy(path.join(src, f), path.join(dest, f));
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'khmer-gt.jpg'));
  } catch (e) {
    console.warn(`khmer-gt not found at ${refs.khmergt}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KHMER GT</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

// 19 THE MATRIX : COSMOS — Matrix-styled WebXR VR physics sensory lab (Relativity, Quantum, Gravity, Higher Dimensions, Superstrings).
{
  const dest = path.join(out, 'matrix-cosmos');
  try {
    const src = exportDir(refs.matrixcosmos, 'matrix-cosmos');
    const { bundle } = await import(pathToFileURL(path.join(src, 'tools', 'bundle.mjs')).href);
    const build = sh(`git -C "${root}" rev-parse "${refs.matrixcosmos}:matrix-cosmos"`).slice(0, 12);
    const r = bundle(src, dest, build);
    const preview = path.join(src, 'docs', 'preview.jpg');
    if (fs.existsSync(preview)) copy(preview, path.join(out, 'img', 'matrix-cosmos.jpg'));
    console.log(`matrix-cosmos build ${r.build}: ${r.files} files`);
  } catch (e) {
    console.warn(`matrix-cosmos not found at ${refs.matrixcosmos}; publishing a link page instead:`, e.message);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>THE MATRIX : COSMOS</title>' +
      '<p style="font-family:sans-serif;padding:24px">準備中です。<a href="../">lab にもどる</a></p>');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
const size = sh(`du -sh "${out}" | cut -f1`, { shell: '/bin/bash' });
console.log(`site built in ${out} (${size}) from yokohama=${refs.yokohama} films=${refs.films} aic=${refs.aic} undokai=${refs.undokai} starlight=${refs.starlight} starweaver=${refs.starweaver} aetherwalk=${refs.aetherwalk} kotoba=${refs.kotoba} offbeat=${refs.offbeat} dreamdrift=${refs.dreamdrift} rally=${refs.rally} island=${refs.island} skyatlas=${refs.skyatlas} anakata=${refs.anakata} powder=${refs.powder} kotei=${refs.kotei} selfintro=${refs.selfintro} khmergt=${refs.khmergt} matrixcosmos=${refs.matrixcosmos}`);
