// js/autosync.js — find the beat of a YouTube video by listening to it (no tapping needed).
//
// The page cannot read the sound of a YouTube video (it plays in YouTube's own frame), but the
// microphone can hear it from the speakers. So:
//   1. a few short beeps of our own: how long sound takes from "played" to "recorded" on this device
//      (speaker → air → microphone → browser), measured instead of guessed;
//   2. the video plays from the start; the microphone records until the music has been going for a while;
//   3. every recorded moment is put on the video's clock (as it was heard), the drum hits are folded onto
//      one beat of the known tempo, and the strongest place is the beat. Where the low drum (kick) is
//      stronger decides which of two beats is the "1"; the first such beat once the music starts is bar 1.
// Only the beat position is kept; the recording is never stored or sent anywhere.

export class SyncError extends Error {
  constructor(code, message, detail = null) { super(message); this.code = code; this.detail = detail; }
}

const WORKLET = `
class ObgRec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096); this.n = 0; this.start = 0; this.on = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.flush(); this.on = false; } };
  }
  flush() {
    if (this.n) { this.port.postMessage({ start: this.start, data: this.buf.slice(0, this.n) }); this.n = 0; }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) { this.flush(); return this.on; }
    if (this.n === 0) this.start = currentFrame;
    if (this.n + ch.length > this.buf.length) { this.flush(); this.start = currentFrame; }
    this.buf.set(ch, this.n); this.n += ch.length;
    if (this.n >= this.buf.length) this.flush();
    return this.on;
  }
}
registerProcessor('obg-rec', ObgRec);
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(p, ms, err) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(err), ms); })]).finally(() => clearTimeout(t));
}

const workletReady = new WeakMap();
function loadWorklet(ctx) {
  if (!workletReady.has(ctx)) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    workletReady.set(ctx, ctx.audioWorklet.addModule(url));
  }
  return workletReady.get(ctx);
}

// a short, bright beep straight to the speakers (not through the game's volume or compressor)
function beep(ctx, t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 3000;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.6, t + 0.001);
  g.gain.setValueAtTime(0.6, t + 0.012);
  g.gain.linearRampToValueAtTime(0, t + 0.02);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.03);
}

// is the microphone already allowed? ('granted' | 'prompt' | 'denied' | 'unknown')
export async function micPermission() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    return p.state;
  } catch { return 'unknown'; }
}

// listen to the video and return { t0, songBpm, conf, rt, music } — or throw a SyncError with a message
// that says what to do. onProgress(text, fraction) reports what is happening.
export async function autoSync({ audio, yt, songBpm, onProgress = () => {}, maxListen = 45, needMusic = 9 }) {
  const ctx = audio.ensure();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.AudioWorkletNode) {
    throw new SyncError('nomic', 'このブラウザではマイクが使えないため、自動の拍あわせができません');
  }
  if (!yt || !yt.ready) throw new SyncError('noplayer', 'YouTube の動画がまだ準備できていません');
  onProgress('マイクの許可を待っています（「許可」を選んでください）', 0);
  let stream;
  try {
    stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }),
      60000, new SyncError('nomic', 'マイクの許可が得られませんでした'));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('nomic', 'マイクが使えませんでした（許可されなかったか、マイクがありません）');
  }
  const chunks = [];
  let node, src, mute;
  try {
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    await loadWorklet(ctx);
    src = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'obg-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    node.port.onmessage = (e) => chunks.push(e.data);

    // 1. beeps: the delay from playing a sound to recording it
    yt.pause();
    yt.seek(0);
    onProgress('スピーカーとマイクの遅れを測っています', 0.03);
    const c0 = ctx.currentTime + 0.6;
    const clicks = [0, 0.5, 1.0, 1.5, 2.0].map((d) => c0 + d);
    for (const c of clicks) beep(ctx, c);
    while (ctx.currentTime < c0 + 2.5) await sleep(20);
    await sleep(200); // the last recorded block arrives
    measureRT(signal(chunks), ctx.sampleRate, clicks); // no beeps heard (headphones?): say so now, not after the song

    // 2. the video from the start, until the music has played for needMusic seconds
    yt.play();
    const clock = [];
    const quiet = rmsBetween(chunks, ctx.sampleRate, c0 - 0.5, c0 - 0.05);
    let musicV = null;
    const startedAt = performance.now();
    for (;;) {
      await sleep(20);
      const p = performance.now();
      if (yt.playing && yt.base) clock.push([p, yt.time(p)]);
      const v = yt.time(p);
      if (!yt.playing && p - startedAt > 15000 && !clock.length) throw new SyncError('noplay', 'YouTube の動画が再生されませんでした');
      if (musicV === null && clock.length > 10 && v > 0.5) {
        // rough live check: is it loud compared with the room before the beeps?
        const r = rmsBetween(chunks, ctx.sampleRate, ctx.currentTime - 0.6, ctx.currentTime - 0.1);
        if (r > Math.max(quiet * 4, 0.003)) musicV = Math.max(0, v - 0.5);
      }
      const goal = musicV === null ? maxListen : Math.min(maxListen, musicV + needMusic);
      onProgress(musicV === null ? '曲を聞いています（曲が始まるのを待っています）' : '曲を聞いて、拍を探しています', Math.min(0.97, 0.08 + (0.9 * v) / goal));
      if (v >= goal) break;
      if ((p - startedAt) / 1000 > maxListen + 20) break;
    }
    yt.pause();
    node.port.postMessage('stop');
    await sleep(120);
    // ctx time → performance time of the moment it is heard (the game's own clock does the same)
    const pNow = performance.now();
    const hNow = audio.heard(pNow, false);
    const perfOfCtx = (c) => pNow + (c - hNow) * 1000;
    onProgress('拍の位置を計算しています', 0.98);
    const res = analyse({ chunks, sr: ctx.sampleRate, clicks, clock, perfOfCtx, songBpm });
    onProgress('拍あわせができました', 1);
    return res;
  } finally {
    for (const t of stream.getTracks()) t.stop();
    try { src && src.disconnect(); node && node.disconnect(); mute && mute.disconnect(); } catch { /* already gone */ }
  }
}

function rmsBetween(chunks, sr, a, b) {
  let s = 0, n = 0;
  for (const ch of chunks) {
    const t0 = ch.start / sr, t1 = t0 + ch.data.length / sr;
    if (t1 < a || t0 > b) continue;
    const i0 = Math.max(0, Math.floor((a - t0) * sr)), i1 = Math.min(ch.data.length, Math.ceil((b - t0) * sr));
    for (let i = i0; i < i1; i++) { s += ch.data[i] * ch.data[i]; n++; }
  }
  return n ? Math.sqrt(s / n) : 0;
}

// RBJ biquad over a whole signal
function biquad(x, sr, type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // bandpass
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// onset strength per hop: rise of log energy over a short window
function onsets(x, H) {
  const n = Math.floor(x.length / H);
  const e = new Float32Array(n);
  for (let j = 0; j < n; j++) { let s = 0; for (let i = j * H; i < (j + 1) * H; i++) s += x[i] * x[i]; e[j] = s; }
  const L = new Float32Array(n), o = new Float32Array(n);
  for (let j = 0; j < n; j++) L[j] = Math.log(1e-9 + e[j] + (j > 0 ? e[j - 1] : 0) + (j > 1 ? e[j - 2] : 0) + (j > 2 ? e[j - 3] : 0));
  for (let j = 3; j < n; j++) o[j] = Math.max(0, L[j] - L[j - 3]);
  return { e, o };
}

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

// the recorded blocks as one signal from the first recorded frame (gaps stay silent)
function signal(chunks) {
  if (!chunks.length) throw new SyncError('norec', 'マイクの音が録れませんでした');
  const f0 = chunks[0].start;
  const last = chunks[chunks.length - 1];
  const x = new Float32Array(last.start + last.data.length - f0);
  for (const ch of chunks) x.set(ch.data, ch.start - f0);
  return { x, f0 };
}

const H = 128; // analysis hop (2.7 ms at 48 kHz)

// beeps: the first sharp rise in the 3 kHz band after each one → the delay from playing to recording
function measureRT({ x, f0 }, sr, clicks) {
  const hopOfCtx = (c) => Math.round((c * sr - f0 - H / 2) / H);
  const ctxOfHop = (j) => (f0 + j * H + H / 2) / sr;
  const hi = onsets(biquad(x, sr, 'bandpass', 3000, 3), H).o;
  const rts = [], peaks = [];
  for (const c of clicks) {
    // up to 0.45 s late (Bluetooth speakers); the beeps are 0.5 s apart, so the next one is never mistaken
    const a = Math.max(3, hopOfCtx(c)), b = Math.min(hi.length - 1, hopOfCtx(c + 0.45));
    let best = -1;
    for (let j = a; j <= b; j++) best = Math.max(best, hi[j]);
    // the first clear rise (not the biggest: a later echo off a wall can be as loud)
    let bj = -1;
    for (let j = a; j <= b && bj < 0; j++) if (hi[j] >= best * 0.6 && hi[j] >= hi[j + 1]) bj = j;
    if (bj >= 0) { rts.push(ctxOfHop(bj) - c); peaks.push(best); }
  }
  const rt = median(rts);
  const spread = rts.length ? Math.max(...rts) - Math.min(...rts) : Infinity;
  if (rts.length < 4 || median(peaks) < 1.2 || spread > 0.03 || !(rt >= 0 && rt < 0.45)) {
    throw new SyncError('noloop', 'スピーカーの音がマイクに届きませんでした。ヘッドホン・イヤホンを外して、音量を上げてからもう一度', { rts, peaks, n: x.length });
  }
  return rt;
}

// the recording → the beat. Exported for the tests.
export function analyse({ chunks, sr, clicks, clock, perfOfCtx, songBpm }) {
  const sig = signal(chunks);
  const { x, f0 } = sig;
  const ctxOfHop = (j) => (f0 + j * H + H / 2) / sr;
  const rt = measureRT(sig, sr, clicks);

  // 2. every hop on the video's clock, as heard: recorded at ctx time c → heard at perfOfCtx(c) - rt
  if (clock.length < 20) throw new SyncError('noplay', 'YouTube の動画が再生されませんでした');
  const vOff = median(clock.map(([p, v]) => v - p / 1000));
  const videoOfHop = (j) => vOff + (perfOfCtx(ctxOfHop(j)) - rt * 1000) / 1000;

  const low = onsets(biquad(x, sr, 'lowpass', 200, 0.8), H);
  const mid = onsets(biquad(x, sr, 'bandpass', 800, 0.6), H);
  const top = onsets(biquad(x, sr, 'highpass', 3000), H);
  const all = onsets(x, H);
  const vMax = Math.max(...clock.map((k) => k[1]));
  // the music starts where the sound gets clearly louder than the room was before the beeps
  const quietHops = [];
  for (let j = 0; j < all.e.length; j++) if (ctxOfHop(j) < clicks[0] - 0.05) quietHops.push(all.e[j]);
  const quiet = median(quietHops) || 1e-9;
  const n = all.e.length;
  const smooth = new Float32Array(n);
  const W = Math.max(1, Math.round((0.2 * sr) / H));
  let acc = 0;
  for (let j = 0; j < n; j++) { acc += all.e[j]; if (j >= W) acc -= all.e[j - W]; smooth[j] = acc / Math.min(j + 1, W); }
  let music = null;
  const hold = Math.round((1.0 * sr) / H);
  for (let j = 0; j < n - hold && music === null; j++) {
    const v = videoOfHop(j);
    if (v < 0.05 || v > vMax) continue;
    let loud = true;
    for (let k = j; k < j + hold; k += 4) if (smooth[k] < quiet * 12) { loud = false; break; }
    if (loud) music = v;
  }
  if (music === null || vMax - music < 4) {
    throw new SyncError('nomusic', '曲の音がうまく聞き取れませんでした。音量を上げて、静かなところでもう一度');
  }

  // 3. fold the drum hits onto one beat (P) and onto two beats (2P)
  const P = 60 / songBpm, B = 96;
  const h1 = new Float64Array(B), lowA = new Float64Array(2), cnt = [0, 0];
  const hits = [];
  for (let j = 3; j < n; j++) {
    const v = videoOfHop(j);
    if (v < music + 0.2 || v > vMax) continue;
    const s = low.o[j] + mid.o[j] + top.o[j];
    hits.push([v, s, low.o[j], top.o[j]]);
    const ph = ((v % P) + P) % P;
    h1[Math.floor((ph / P) * B) % B] += s;
  }
  // smooth around the circle, take the peak, refine with a weighted circular mean nearby
  const sm = new Float64Array(B);
  for (let b = 0; b < B; b++) for (let d = -2; d <= 2; d++) sm[b] += h1[(b + d + B) % B] * (3 - Math.abs(d));
  let pb = 0;
  for (let b = 1; b < B; b++) if (sm[b] > sm[pb]) pb = b;
  let sx = 0, sy = 0;
  for (let d = -5; d <= 5; d++) {
    const b = (pb + d + B) % B, a = ((b + 0.5) / B) * Math.PI * 2;
    sx += h1[b] * Math.cos(a); sy += h1[b] * Math.sin(a);
  }
  let phase = (Math.atan2(sy, sx) / (Math.PI * 2)) * P;
  if (phase < 0) phase += P;
  const conf = (sm[pb] - median(sm)) / (median(sm) + 1e-9);
  if (!(conf > 0.35)) {
    throw new SyncError('nobeat', '拍がはっきり聞き取れませんでした。音量を上げて、静かなところでもう一度');
  }
  // which of the two beats in 2P is the kick: the one whose hits lean toward the bass (small speakers, like
  // the Quest's, play little bass, so compare bass against treble rather than bass alone; the snare is bright)
  const topA = new Float64Array(2);
  for (const [v, , l, t] of hits) {
    const d = (((v - phase) % (2 * P)) + 2 * P) % (2 * P);
    for (const k of [0, 1]) {
      const dist = Math.abs(d - k * P);
      if (Math.min(dist, 2 * P - dist) < 0.02) { lowA[k] += l; topA[k] += t; cnt[k]++; }
    }
  }
  const lean = (k) => (lowA[k] + 1e-6) / (topA[k] + 1e-6);
  const kick = lean(1) > lean(0) ? phase + P : phase;
  // bar 1: the first kick beat once the music has started
  let t0 = kick % (2 * P);
  while (t0 < music - 0.1) t0 += 2 * P;
  return { t0, songBpm, conf, rt, music, kickLean: lean(0) / lean(1) };
}
