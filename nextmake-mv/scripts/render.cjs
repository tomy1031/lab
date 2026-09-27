#!/usr/bin/env node
/* Render src/index.html frame-by-frame with headless Chromium and encode with ffmpeg.
 *
 *   node render.cjs --page invest/index.html --stills 1.5,33,65 --out dir          # PNG stills for review
 *   node render.cjs --page ceo/index.html --video out.mp4 --audio bgm.wav --duration 144
 *   node render.cjs --page ceo/index.html --video part.mp4 --from 51 --to 57           # one section only
 *
 * Needs: playwright (NODE_PATH=$(npm root -g) works with the global install) and ffmpeg on PATH.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const SRC = path.resolve(__dirname, '..', 'src');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const WORKERS = +opt('workers', 4);
const PAGE = opt('page', 'invest/index.html');
const FPS = 30;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.css': 'text/css' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(SRC, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(SRC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${port}/${PAGE}?render=1`, { waitUntil: 'load' });
  await page.evaluate(() => window.MV.ready());
  return page;
}

async function frame(page, t) {
  await page.evaluate(t => window.MV.seek(t), t);
  return page.screenshot({ type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

async function stills(browser, port) {
  const out = opt('out', 'stills');
  fs.mkdirSync(out, { recursive: true });
  const page = await openPage(browser, port);
  for (const t of opt('stills').split(',').map(Number)) {
    await page.evaluate(t => window.MV.seek(t), t);
    await page.screenshot({ path: path.join(out, `t${t.toFixed(2).padStart(6, '0')}.png`) });
  }
}

async function video(browser, port) {
  const outFile = path.resolve(opt('video'));
  const audio = opt('audio');
  const tmp = fs.mkdtempSync(path.join(path.dirname(outFile), '.segments-'));
  // optional --from/--to (seconds) render a sub-range, e.g. to re-render and splice one section
  const f0 = Math.round(+opt('from', 0) * FPS);
  const f1 = Math.round(+opt('to', opt('duration', 100)) * FPS);
  const total = f1 - f0;
  const per = Math.ceil(total / WORKERS);
  const started = Date.now();
  let done = 0;
  const jobs = Array.from({ length: WORKERS }, (_, w) => (async () => {
    const a = f0 + w * per, b = Math.min(f1, a + per);
    const page = await openPage(browser, port);
    const seg = path.join(tmp, `seg${w}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = a; f < b; f++) {
      const buf = await frame(page, f / FPS);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      done++;
      if (done % 150 === 0) console.log(`${done}/${total} frames  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    return seg;
  })());
  const segs = await Promise.all(jobs);
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (audio) ffArgs.push('-i', audio);
  ffArgs.push('-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '20'), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-profile:v', 'high', '-tune', 'animation');
  if (audio) ffArgs.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  ffArgs.push(outFile);
  await new Promise((res, rej) => spawn('ffmpeg', ffArgs, { stdio: 'inherit' }).on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${outFile} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (opt('stills')) await stills(browser, port);
    else if (opt('video')) await video(browser, port);
    else console.log('pass --stills t1,t2 or --video out.mp4');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
