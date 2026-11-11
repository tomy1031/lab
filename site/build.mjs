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
// The site pages themselves (site/*.html, site/img) are taken from the working tree.
// SKIP_AIC=1 skips the AI COMPANY build (it needs `npm ci`), leaving a page that links to GitHub.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
};
// once the reel's branch is merged and deleted, take it from the films branch it was merged into
const hasRef = (ref) => { try { sh(`git -C "${root}" rev-parse --verify --quiet "${ref}^{commit}"`); return true; } catch { return false; } };
if (!process.env.UNDOKAI_REF && !hasRef(refs.undokai)) refs.undokai = refs.films;
if (!process.env.STARLIGHT_REF && !hasRef(refs.starlight)) refs.starlight = refs.films;
if (!process.env.STARWEAVER_REF && !hasRef(refs.starweaver)) refs.starweaver = refs.films;
if (!process.env.AETHERWALK_REF && !hasRef(refs.aetherwalk)) refs.aetherwalk = refs.films;

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
  const precache = ['./', ...files.filter((f) => f !== 'version.json' && f !== 'index.html')];
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

fs.rmSync(tmp, { recursive: true, force: true });
const size = sh(`du -sh "${out}" | cut -f1`, { shell: '/bin/bash' });
console.log(`site built in ${out} (${size}) from yokohama=${refs.yokohama} films=${refs.films} aic=${refs.aic} undokai=${refs.undokai} starlight=${refs.starlight} starweaver=${refs.starweaver} aetherwalk=${refs.aetherwalk}`);
