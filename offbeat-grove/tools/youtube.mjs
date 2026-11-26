// tools/youtube.mjs — the YouTube song, with stand-ins for YouTube's player and for the microphone
// (no real video is fetched, nothing is recorded):
//   - with headphones (the microphone hears nothing) the automatic beat sync says so within seconds;
//   - pressing START the first time listens to the song by itself (no tapping), finds the beat — through a
//     simulated speaker→microphone delay — and then the game starts on the video's clock;
//   - pause stops the video, resume rewinds it one bar; the manual tap fallback still works;
//   - offline, the song is refused with a message, and the same-tempo original song plays.
//   node tools/youtube.mjs
import { browser, serveApp } from './pw.mjs';

// the song in the fake video: drums from MUSIC seconds on, kick on every other beat of 220 BPM starting at
// KICK0, snare between, hi-hat on the eighths
const SONG = { MUSIC: 1.8, KICK0: 1.8 + 0.021, BPM: 220 };

// a fake YouTube IFrame API: a video clock that reports its time in 250 ms steps, like the real player
// (which only hears from its frame a few times a second), takes 0.3 s to start after play(), and — for the
// fake microphone — "sounds" its drums at the moments they are heard
const FAKE_API = `
window.__fakeYT = { plays: 0, pauses: 0, seeks: [] };
window.YT = { Player: class {
  constructor(id, o) {
    this.o = o; this.state = -1; this.v = 0; this.at = performance.now(); this.rep = 0; this.k = null;
    window.__fakeYT.player = this;
    setTimeout(() => o.events.onReady({ target: this }), 50);
    setInterval(() => { this.rep = this.now(); }, 250);
    setInterval(() => this.drums(), 40);
  }
  now() { return this.state === 1 ? Math.min(283, this.v + (performance.now() - this.at) / 1000) : this.v; }
  set(state) { this.v = this.now(); this.at = performance.now(); this.state = state; this.rep = this.v; this.k = null; this.o.events.onStateChange({ data: state }); }
  playVideo() { window.__fakeYT.plays++; clearTimeout(this.t); this.set(3); this.t = setTimeout(() => this.set(1), 300); }
  pauseVideo() { window.__fakeYT.pauses++; clearTimeout(this.t); this.set(2); }
  seekTo(t) { window.__fakeYT.seeks.push(+t.toFixed(3)); this.v = t; this.at = performance.now(); this.rep = t; this.k = null; }
  getCurrentTime() { return this.rep; }
  getDuration() { return 283; }
  getPlaybackRate() { return 1; }
  getPlayerState() { return this.state; }
  drums() {
    const mic = window.__mic;
    if (!mic || this.state !== 1) return;
    const S = window.__song, P = 60 / S.BPM / 2; // eighths of 220
    const pNow = performance.now(), vNow = this.now();
    const a = window.__app.audio, hNow = a.heard(pNow, false);
    if (this.k === null) this.k = Math.max(0, Math.ceil((vNow - S.KICK0) / P));
    for (;;) {
      const v = S.KICK0 + this.k * P;
      if (v > vNow + 0.4) break;
      const kind = this.k % 4 === 0 ? 'kick' : this.k % 4 === 2 ? 'snare' : 'hat';
      this.k++;
      if (v < S.MUSIC || v < vNow) continue;
      const c = hNow + (v - vNow); // heard when the video's clock reads v
      window.__hit(mic.bus, c, kind);
    }
  }
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

// a fake microphone: whatever the page sends to the speakers, plus the fake video's drums, comes back after
// a delay (speaker → air → microphone), with a little room noise. window.__micMuted = headphones on.
const MIC_DELAY = Number(process.env.MIC_DELAY || 0.045); // speaker → microphone (0.25 ≈ Bluetooth)
const FAKE_MIC = (song) => `
window.__song = ${JSON.stringify(song)};
window.__micMuted = false;
const connect0 = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dest, ...rest) {
  const r = connect0.call(this, dest, ...rest);
  if (dest instanceof AudioDestinationNode && window.__mic && dest.context === window.__mic.ctx && this !== window.__mic.keep) connect0.call(this, window.__mic.bus);
  return r;
};
window.__hit = (bus, t, kind) => {
  const ctx = bus.context;
  const g = ctx.createGain();
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); o.start(t); o.stop(t + 0.2);
  } else {
    const n = ctx.createBufferSource();
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const peak = kind === 'hat' ? 0.12 : 0.5, len = kind === 'hat' ? 0.04 : 0.1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.12);
  }
  g.connect(bus);
};
navigator.mediaDevices.getUserMedia = async () => {
  const ctx = window.__app.audio.ctx;
  const bus = ctx.createGain();
  const delay = ctx.createDelay(1); delay.delayTime.value = ${MIC_DELAY}; // speaker → microphone
  const muted = ctx.createGain(); muted.gain.value = window.__micMuted ? 0 : 1;
  const noise = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.002;
  noise.buffer = nb; noise.loop = true;
  const out = ctx.createMediaStreamDestination();
  // small speakers: little bass (SPEAKER_HP=250 cuts below 250 Hz)
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = ${Number(process.env.SPEAKER_HP || 20)}; hp.Q.value = 0.7;
  bus.connect(hp); hp.connect(muted); muted.connect(delay); delay.connect(out); noise.connect(out); noise.start();
  window.__mic = { ctx, bus, keep: null };
  return out.stream;
};
`;

const { srv, base } = await serveApp();
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
let apiRequests = 0;
await ctx.route('https://www.youtube.com/iframe_api', (r) => { apiRequests++; r.fulfill({ contentType: 'text/javascript', body: FAKE_API }); });
await ctx.addInitScript(FAKE_MIC(SONG));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'ok ' : 'BAD'} ${msg}`); ok = ok && !!cond; };
const until = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const P = 60 / SONG.BPM;
// distance between a found beat and the true one, on the 2-beat (kick to kick) circle
const kickErr = (t) => { const d = ((((t - SONG.KICK0) % (2 * P)) + 2 * P) % (2 * P)); return d > P ? d - 2 * P : d; };

await page.goto(base + '?quality=low&song=yt-hachigatsu&mode=off&diff=normal&guide=on&seed=5', { waitUntil: 'load' });
await until(() => window.__app && document.getElementById('loading').classList.contains('hidden'));
await until(() => window.__app.yt && window.__app.yt.ready);
check(apiRequests === 1, 'the YouTube player API is loaded only when the YouTube song is chosen');
check(await page.isVisible('#yt-box') && await page.isVisible('#yt-dock') && await page.isVisible('#yt-auto'), 'the YouTube box, the docked player and the 「自動で拍あわせ」 button show');
check(!(await page.isVisible('#yt-calib')), 'tapping is tucked away under 「うまくいかないとき」');

// 1. headphones: the microphone hears nothing → a clear message within seconds
await page.evaluate(() => { window.__micMuted = true; });
const t1 = Date.now();
await page.click('#yt-auto');
await until(() => !window.__app.syncing && window.__app.menuMsg, null, 30000);
const hp = await page.evaluate(() => window.__app.menuMsg);
check(hp.includes('ヘッドホン') && Date.now() - t1 < 12000, `headphones: 「${hp}」 after ${((Date.now() - t1) / 1000).toFixed(1)} s`);
check(await page.evaluate(() => !window.__app.ytSync(window.__app.yt.song)), 'nothing is remembered from a failed try');

// 2. START the first time: it listens by itself, then the game starts
await page.evaluate(() => { window.__micMuted = false; });
const t2 = Date.now();
await page.click('#btn-auto');
await until(() => window.__app.syncing, null, 5000);
check(await page.isVisible('#yt-bar'), `while listening: 「${await page.textContent('#yt-status')}」`);
try {
  await until(() => window.__app.state === 'play' && window.__app.player && window.__app.player.kind === 'youtube', null, 60000);
} catch (e) {
  console.log('DEBUG', await page.evaluate(() => ({ detail: window.__app.lastSyncError && window.__app.lastSyncError.detail, msg: window.__app.menuMsg, syncing: window.__app.syncing, prog: window.__app.syncProgress, state: window.__app.state, yt: window.__fakeYT.player.state, v: window.__fakeYT.player.now() })));
  throw e;
}
const sync = await page.evaluate(() => window.__app.store.data.ytSync.Vs5NViM8TSY);
const err = kickErr(sync.t0);
check(sync.how === 'mic' && Math.abs(err) < 0.03, `found the beat by listening: first "1" at ${sync.t0.toFixed(3)} s (true kicks at ${SONG.KICK0.toFixed(3)} + k·${(2 * P).toFixed(3)}; off by ${(err * 1000).toFixed(1)} ms; through a ${Math.round(MIC_DELAY * 1000)} ms speaker→mic delay)`);
check(sync.t0 >= SONG.MUSIC - 0.1 && sync.t0 < SONG.MUSIC + 2 * P + 0.05, `bar 1 starts where the music starts (${SONG.MUSIC} s)`);
check((Date.now() - t2) / 1000 < 40, `listening took ${((Date.now() - t2) / 1000).toFixed(0)} s, then the game started by itself`);
check(await page.evaluate(() => window.__fakeYT.seeks.at(-1) === 0), 'the video starts again from the beginning for the game');
const first = await page.evaluate(() => { const s = window.__app.session; return { t: s.notes[0].t, t0: s.player.grid.t0, bpm: s.player.grid.bpm, bars: s.player.bars.length, n: s.notes.length }; });
check(first.bpm === 110 && Math.abs(first.t0 - sync.t0) < 1e-6, `grid: BPM ${first.bpm} from ${first.t0.toFixed(3)} s, ${first.bars} bars, ${first.n} notes`);
await until((t) => window.__app.songT > t + 6, first.t, 60000);
const mid = await page.evaluate(() => {
  const now = performance.now();
  return { songT: window.__app.player.songTime(now), video: window.__fakeYT.player.now(), hits: window.__app.session.hits };
});
check(Math.abs(mid.songT - mid.video) < 0.04, `song time follows the video's clock (${mid.songT.toFixed(3)} vs ${mid.video.toFixed(3)} s, ${((mid.songT - mid.video) * 1000).toFixed(0)} ms)`);
// what matters: a target reaches you when its kick is heard (the found beat and the game clock share any lag)
const seen = err - (mid.songT - mid.video);
check(Math.abs(seen) < 0.015, `targets arrive with the kicks you hear: ${(seen * 1000).toFixed(1)} ms apart`);
check(mid.hits > 4, `autoplay hits the targets on the video's beat: ${mid.hits} hits`);

// 3. pause and resume: the video pauses; resuming rewinds it one bar (the song is the count-in)
await page.click('#pausebtn');
await until(() => window.__app.state === 'menu');
check(await page.evaluate(() => window.__fakeYT.player.state === 2), 'leaving autoplay pauses the video');
await page.click('#btn-pc');
await until(() => window.__app.state === 'play' && window.__app.songT > 4, null, 60000);
check(await page.evaluate(() => !window.__app.syncing), 'the second time it starts at once (the beat is remembered)');
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

// 4. the manual fallback: 16 taps (40 ms late, ±12 ms wobble, on the kicks) give the same beat
await page.click('.yt-manual summary');
await page.click('#yt-calib');
await until(() => window.__fakeYT.player.state === 1);
await page.evaluate(({ K, P }) => new Promise((done) => {
  const yt = window.__app.yt;
  const wobble = [5, -12, 8, 0, -6, 11, -3, 7, -9, 2, 12, -11, 4, -2, 9, -7];
  let k = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    const target = K + (4 + 2 * k) * P + 0.04 + wobble[k] / 1000;
    const v = yt.time(now);
    if (v >= target) {
      window.__app.dom.ytTap({ timeStamp: now - (v - target) * 1000 });
      if (++k >= 16) { clearInterval(timer); done(); }
    }
  }, 2);
}), { K: SONG.KICK0, P });
const tap = await page.evaluate(() => window.__app.store.data.ytSync.Vs5NViM8TSY);
const tapErr = kickErr(tap.t0 - 0.04);
check(tap.how === 'tap' && Math.abs(tapErr) < 0.03, `manual taps: first beat ${tap.t0.toFixed(3)} s (the 40 ms of lateness included, off by ${(tapErr * 1000).toFixed(0)} ms)`);
check(await page.evaluate(() => window.__fakeYT.player.state === 2), 'the video pauses when the 16 taps are in');

// 5. offline: refused with a message (the other songs still play)
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
await page.click('#btn-auto');
await page.waitForTimeout(400);
const off = await page.evaluate(() => ({ state: window.__app.state, msg: window.__app.menuMsg }));
check(off.state === 'menu' && off.msg.includes('インターネット'), `offline: 「${off.msg}」`);
await page.evaluate(() => window.__app.choose({ song: 'night' }));
await page.click('#btn-auto');
await until(() => window.__app.state === 'play' && window.__app.songT > 3, null, 60000);
check(await page.evaluate(() => window.__app.player.kind === 'gen' && window.__app.player.grid.bpm === 110), 'offline, the original 110 BPM song (夏夜ラン) plays');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
