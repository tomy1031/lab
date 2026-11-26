// tools/youtube.mjs — the YouTube song, with a stand-in for YouTube's player (no real video is fetched):
// the song needs the tap calibration before it starts; 16 taps on the beat give the beat grid (including
// how late the taps come); play follows the video's clock, pause stops the video and resume rewinds it;
// offline, the song is refused with a message instead.
//   node tools/youtube.mjs
import { browser, serveApp } from './pw.mjs';

// a fake YouTube IFrame API: a video clock that reports its time in 250 ms steps, like the real player
// (which only hears from its frame a few times a second), and takes 0.3 s to start after play()
const FAKE_API = `
window.__fakeYT = { plays: 0, pauses: 0, seeks: [] };
window.YT = { Player: class {
  constructor(id, o) {
    this.o = o; this.state = -1; this.v = 0; this.at = performance.now(); this.rep = 0; this.repAt = -1;
    window.__fakeYT.player = this;
    setTimeout(() => o.events.onReady({ target: this }), 50);
    setInterval(() => { this.rep = this.now(); }, 250);
  }
  now() { return this.state === 1 ? Math.min(283, this.v + (performance.now() - this.at) / 1000) : this.v; }
  set(state) { this.v = this.now(); this.at = performance.now(); this.state = state; this.rep = this.v; this.o.events.onStateChange({ data: state }); }
  playVideo() { window.__fakeYT.plays++; clearTimeout(this.t); this.set(3); this.t = setTimeout(() => this.set(1), 300); }
  pauseVideo() { window.__fakeYT.pauses++; clearTimeout(this.t); this.set(2); }
  seekTo(t) { window.__fakeYT.seeks.push(+t.toFixed(3)); this.v = t; this.at = performance.now(); this.rep = t; }
  getCurrentTime() { return this.rep; }
  getDuration() { return 283; }
  getPlaybackRate() { return 1; }
  getPlayerState() { return this.state; }
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
let apiRequests = 0;
await ctx.route('https://www.youtube.com/iframe_api', (r) => { apiRequests++; r.fulfill({ contentType: 'text/javascript', body: FAKE_API }); });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(base + '?quality=low&song=yt-hachigatsu&mode=off&diff=normal&guide=on&seed=5', { waitUntil: 'load' });
await until(() => window.__app && document.getElementById('loading').classList.contains('hidden'));
await until(() => window.__app.yt && window.__app.yt.ready);
check(apiRequests === 1, 'the YouTube player API is loaded only when the YouTube song is chosen');
check(await page.isVisible('#yt-box') && await page.isVisible('#yt-dock'), 'the YouTube box and the docked player show');
check((await page.textContent('#yt-status')).includes('まだ'), `status: ${await page.textContent('#yt-status')}`);

// 1. no calibration yet: the song does not start, and says why
await page.click('#btn-auto');
await page.waitForTimeout(400);
const blocked = await page.evaluate(() => ({ state: window.__app.state, msg: window.__app.menuMsg }));
check(blocked.state === 'menu' && blocked.msg.includes('拍あわせ'), `before the calibration it asks for it: 「${blocked.msg}」`);

// 2. tap along: beats of the video at 1.234 s + k·(60/220); the taps come 40 ms late (the sound's delay),
// with ±12 ms of human wobble, on every other beat (the kicks) — 16 taps
const T0 = 1.234, P = 60 / 220, LAG = 0.04;
await page.click('#yt-calib');
await until(() => window.__fakeYT.player.state === 1);
await page.evaluate(({ T0, P, LAG }) => new Promise((done) => {
  const yt = window.__app.yt;
  const wobble = [5, -12, 8, 0, -6, 11, -3, 7, -9, 2, 12, -11, 4, -2, 9, -7];
  let k = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    const target = T0 + (4 + 2 * k) * P + LAG + wobble[k] / 1000;
    const v = yt.time(now);
    if (v >= target) {
      // the tap's event time: when the video was at the target time
      window.__app.dom.ytTap({ timeStamp: now - (v - target) * 1000 });
      if (++k >= 16) { clearInterval(timer); done(); }
    }
  }, 2);
}), { T0, P, LAG });
const sync = await page.evaluate(() => window.__app.store.data.ytSync.Vs5NViM8TSY);
const phaseErr = ((((sync.t0 - (T0 + LAG)) % P) + P * 1.5) % P) - P / 2;
check(sync && Math.abs(phaseErr) < 0.03, `tap calibration: first beat ${sync.t0.toFixed(3)} s (expected ${(T0 + LAG).toFixed(3)} + k·${P.toFixed(3)}, off by ${(phaseErr * 1000).toFixed(0)} ms)`);
check(await page.evaluate(() => window.__fakeYT.player.state === 2), 'the video pauses when the 16 taps are in');
check(await page.evaluate(() => window.__app.menuMsg === '' || !window.__app.ytBlocker(window.__app.yt.song)), 'nothing blocks the start any more');

// 3. play: autoplay boxes to the video's clock
await page.click('#btn-auto');
await until(() => window.__app.state === 'play' && window.__app.player.kind === 'youtube');
check(await page.evaluate(() => window.__fakeYT.seeks.at(-1) === 0), 'the video starts from the beginning');
const first = await page.evaluate(() => { const s = window.__app.session; return { t: s.notes[0].t, t0: s.player.grid.t0, bpm: s.player.grid.bpm, bars: s.player.bars.length, n: s.notes.length }; });
check(first.bpm === 110 && Math.abs(first.t0 - sync.t0) < 1e-6, `grid: BPM ${first.bpm} from ${first.t0.toFixed(3)} s, ${first.bars} bars, ${first.n} notes`);
check(first.t >= first.t0 - 1e-6, `the first note (${first.t.toFixed(2)} s) comes after the first downbeat`);
await until((t) => window.__app.songT > t + 6, first.t, 60000);
const mid = await page.evaluate(() => {
  const now = performance.now();
  return { songT: window.__app.player.songTime(now), video: window.__fakeYT.player.now(), hits: window.__app.session.hits };
});
check(Math.abs(mid.songT - mid.video) < 0.04, `song time follows the video's clock (${mid.songT.toFixed(3)} vs ${mid.video.toFixed(3)} s, ${((mid.songT - mid.video) * 1000).toFixed(0)} ms)`);
check(mid.hits > 4, `autoplay hits the targets on the video's beat: ${mid.hits} hits`);

// 4. pause and resume: the video pauses; resuming rewinds it one bar (the song is the count-in)
await page.click('#pausebtn');
await until(() => window.__app.state === 'menu');
check(await page.evaluate(() => window.__fakeYT.player.state === 2), 'leaving autoplay pauses the video');
await page.click('#btn-pc');
await until(() => window.__app.state === 'play' && window.__app.songT > 4, null, 60000);
await page.keyboard.press('Escape');
await until(() => window.__app.state === 'paused');
const tp = await page.evaluate(() => ({ t: window.__app.pausedAt, st: window.__fakeYT.player.state }));
check(tp.st === 2, `Esc pauses the video at ${tp.t.toFixed(2)} s`);
await page.click('#p-resume');
await until(() => window.__app.state === 'play');
const seek = await page.evaluate(() => window.__fakeYT.seeks.at(-1));
check(Math.abs(seek - Math.max(0, tp.t - 4 * 60 / 110)) < 0.05, `resume seeks one bar back (${seek.toFixed(2)} s) and plays on`);
await until((t) => window.__app.songT > t + 0.5, tp.t, 20000);
await page.keyboard.press('Escape');
await until(() => window.__app.state === 'paused');
await page.click('#p-menu');
await until(() => window.__app.state === 'menu');

// 5. offline: refused with a message (the other songs still play)
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
await page.click('#btn-auto');
await page.waitForTimeout(400);
const off = await page.evaluate(() => ({ state: window.__app.state, msg: window.__app.menuMsg, status: document.getElementById('yt-status').textContent }));
check(off.state === 'menu' && off.msg.includes('インターネット'), `offline: 「${off.msg}」`);
await page.evaluate(() => window.__app.choose({ song: 'night' }));
await page.click('#btn-auto');
await until(() => window.__app.state === 'play' && window.__app.songT > 3, null, 60000);
check(await page.evaluate(() => window.__app.player.kind === 'gen' && window.__app.player.grid.bpm === 110), 'offline, the original 110 BPM song (夏夜ラン) plays');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
