#!/usr/bin/env node
// site/build.mjs — assemble the GitHub Pages site: the lab link page plus every project, from their branches.
//
//   node site/build.mjs [outDir]          (default: .site at the repository root)
//
// Where each project comes from (git refs; override with environment variables):
//   YOKOHAMA_REF  ハマころ！ (yokohama-roll/)                 default: HEAD
//   FILMS_REF     NEXTMAKE Films (nextmake-mv/output)          default: origin/claude/nextmake-investment-video-jaigyl
//   AIC_REF       NEXTMAKE AI COMPANY (ai-company/)            default: origin/claude/ai-employee-3d-visualization-bgkso0
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
};

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

// 01 ハマころ！ — the game is static files: page + ES modules (three.js comes from the CDN)
{
  const src = exportDir(refs.yokohama, 'yokohama-roll');
  const dest = path.join(out, 'yokohama-roll');
  fs.mkdirSync(dest, { recursive: true });
  copy(path.join(src, 'index.html'), path.join(dest, 'index.html'));
  copy(path.join(src, 'js'), path.join(dest, 'js'));
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

fs.rmSync(tmp, { recursive: true, force: true });
const size = sh(`du -sh "${out}" | cut -f1`, { shell: '/bin/bash' });
console.log(`site built in ${out} (${size}) from yokohama=${refs.yokohama} films=${refs.films} aic=${refs.aic}`);
