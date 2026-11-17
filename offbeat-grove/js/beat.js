// js/beat.js — play along to your own music file: find its tempo and where the beats fall, and remember
// the last file in IndexedDB so it is still there next time (also offline).
//
// Analysis: the track is mixed to mono and decimated to ~11 kHz and split into a low (< 150 Hz), a mid and a
// high band, every ~11.6 ms.
//  - tempo: autocorrelation of the onsets (rises in log energy), scored at 1, 2, 3 and 4 beats so the real
//    beat wins over a syncopated "dotted eighth" pulse, refined with a comb over the whole track. Other
//    likely tempi are returned as alternatives for a one-tap fix.
//  - beat phase and downbeat: a 16-step profile of the bar (low-band level, mid-band rises) is rotated until
//    it best matches "kick on 1 and 3, snare on 2 and 4" — the way a listener finds the beat.
// Works well for music with a steady tempo and a plain backbeat (pop, rock, dance). Very syncopated music
// can come out half a beat off (the "&" taken for the beat): the menu has a button to swap them, and a
// click track to check. A live recording that speeds up and slows down will drift.

export async function decodeFile(ctx, file) {
  const bytes = await file.arrayBuffer();
  return await new Promise((res, rej) => {
    const p = ctx.decodeAudioData(bytes, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}

export function analyze(buffer) {
  const sr = buffer.sampleRate;
  const c0 = buffer.getChannelData(0);
  const c1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : c0;
  const dec = Math.max(1, Math.round(sr / 11025));
  const fs = sr / dec;
  const n = Math.floor(c0.length / dec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * dec;
    for (let j = 0; j < dec; j++) s += c0[o + j] + c1[o + j];
    x[i] = s / (2 * dec);
  }
  // three bands from two one-pole low-passes: low < 150 Hz (kick, bass), mid 150–1500 Hz (snare body), high
  const hop = 128;
  const frames = Math.floor(n / hop);
  const eLo = new Float32Array(frames), eMid = new Float32Array(frames), eHi = new Float32Array(frames), eAll = new Float32Array(frames);
  const aLoL = new Float32Array(frames), aMidL = new Float32Array(frames); // linear amplitude, for the beat phase
  const aLo = 1 - Math.exp((-2 * Math.PI * 150) / fs);
  const aHi = 1 - Math.exp((-2 * Math.PI * 1500) / fs);
  let lo = 0, lp = 0;
  for (let f = 0; f < frames; f++) {
    let sl = 0, sm = 0, sh = 0, sa = 0;
    for (let k = 0; k < hop; k++) {
      const v = x[f * hop + k];
      lo += (v - lo) * aLo;
      lp += (v - lp) * aHi;
      const m = lp - lo, h = v - lp;
      sl += lo * lo; sm += m * m; sh += h * h; sa += v * v;
    }
    eLo[f] = Math.log(1 + 1000 * sl); eMid[f] = Math.log(1 + 1000 * sm); eHi[f] = Math.log(1 + 1000 * sh); eAll[f] = sa;
    aLoL[f] = Math.sqrt(sl / hop); aMidL[f] = Math.sqrt(sm / hop);
  }
  const fr = fs / hop; // frames per second (~86)
  const rise = (e) => { const o = new Float32Array(frames); for (let f = 1; f < frames; f++) o[f] = Math.max(0, e[f] - e[f - 1]); return o; };
  // log-energy rises find every note (good for the tempo); linear-amplitude rises weigh notes by loudness, so
  // a loud kick counts more than a soft bass note after a rest (good for the phase)
  const onLo = rise(eLo), onMid = rise(eMid), onHi = rise(eHi);
  const linMid = rise(aMidL);

  // remove the slowly varying mean (about half a second) so loud passages do not dominate
  const w = Math.round(fr * 0.5);
  const detrend = (a) => {
    const out = new Float32Array(frames);
    let acc = 0;
    for (let f = 0; f < frames; f++) {
      acc += a[f];
      if (f >= w) acc -= a[f - w];
      out[f] = Math.max(0, a[f] - (acc / Math.min(f + 1, w)) * 1.1);
    }
    return out;
  };
  const on = new Float32Array(frames);
  for (let f = 0; f < frames; f++) on[f] = onLo[f] * 1.2 + onMid[f] + onHi[f] * 0.8;
  const onD = detrend(on);

  // tempo: autocorrelation, scored at 1, 2, 3 and 4 beats so a syncopated "dotted eighth" pulse loses to the
  // real beat (the real beat repeats at every multiple, up to the bar)
  const lagMin = Math.floor((60 * fr) / 190), lagMax = Math.ceil((60 * fr) / 60);
  const maxL = Math.min(frames - 2, lagMax * 4 + 2);
  const ac = new Float32Array(maxL + 1);
  for (let l = Math.floor(lagMin / 2); l <= maxL; l++) {
    let s = 0;
    for (let f = 0; f + l < frames; f++) s += onD[f] * onD[f + l];
    ac[l] = s / (frames - l);
  }
  const acAt = (l) => { const i = Math.floor(l), a = l - i; return i + 1 > maxL ? 0 : ac[i] * (1 - a) + ac[i + 1] * a; };
  const score = (l) => acAt(l) + 0.8 * acAt(2 * l) + 0.6 * acAt(3 * l) + 0.8 * acAt(4 * l);
  let best = -1, bestLag = lagMin;
  const cand = [];
  for (let l = lagMin; l <= lagMax; l += 0.25) {
    const bpm = (60 * fr) / l;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 1.1) ** 2);
    const v = score(l) * prior;
    cand.push([bpm, v]);
    if (v > best) { best = v; bestLag = l; }
  }
  // refine on a fine grid with a comb over the whole track
  const comb = (bpm, sig) => {
    const P = (60 * fr) / bpm;
    let bestS = -1, bestPh = 0;
    for (let ph = 0; ph < P; ph += 0.5) {
      let s = 0;
      for (let k = ph; k < frames - 1; k += P) {
        const i = Math.floor(k), a = k - i;
        s += sig[i] * (1 - a) + sig[i + 1] * a;
      }
      if (s > bestS) { bestS = s; bestPh = ph; }
    }
    return { s: bestS / (frames / P), ph: bestPh, P };
  };
  const coarse = (60 * fr) / bestLag;
  let ref = { bpm: coarse, ...comb(coarse, onD) };
  for (let b = coarse - 1.5; b <= coarse + 1.5; b += 0.05) {
    const r = comb(b, onD);
    if (r.s > ref.s) ref = { bpm: b, ...r };
  }
  const bpm = Math.round(ref.bpm * 10) / 10;
  const P = (60 * fr) / bpm;
  // beat phase and downbeat: average the low band (kick, bass) and the mid band (snare) over the 16 steps
  // of a bar, then rotate that profile until it best matches "kick on 1 (and 3), snare on 2 and 4" —
  // the way a listener finds the beat. A plain comb would lock onto offbeat bass notes or hi-hats.
  const ph0 = comb(bpm, onD).ph;
  const q = P / 4;
  const prof = (sig, win) => {
    const p16 = new Float32Array(16), cnt = new Float32Array(16);
    for (let k = 0, t = ph0; t < frames - win - 1; k++, t += q) {
      const i = Math.round(t);
      let m = 0;
      for (let j = -1; j <= win; j++) m = Math.max(m, sig[i + j] || 0);
      p16[k % 16] += m; cnt[k % 16]++;
    }
    let mx = 1e-9, mn = Infinity;
    for (let j = 0; j < 16; j++) { p16[j] /= cnt[j] || 1; mx = Math.max(mx, p16[j]); mn = Math.min(mn, p16[j]); }
    for (let j = 0; j < 16; j++) p16[j] = (p16[j] - mn) / (mx - mn || 1);
    return p16;
  };
  // low band: the level right after each step (kick and bass together are loudest on the beat);
  // snare: the crack on 2 and 4
  const pLo = prof(aLoL, Math.max(1, Math.round(fr * 0.05))), pMid = prof(linMid, 1);
  const KICK = [1, 0, 0, 0, 0.35, 0, 0, 0, 0.8, 0, 0, 0, 0.35, 0, 0, 0];
  const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  let bestS = -1, rot = 0;
  for (let r = 0; r < 16; r++) {
    let sc = 0;
    for (let j = 0; j < 16; j++) sc += pLo[(j + r) % 16] * KICK[j] + pMid[(j + r) % 16] * SNARE[j] * 0.9;
    if (sc > bestS + 1e-6) { bestS = sc; rot = r; }
  }
  let t0 = (ph0 + rot * q) / fr;
  const spb = 60 / bpm;
  while (t0 - spb * 4 >= 0) t0 -= spb * 4;
  // other likely tempi (local maxima clearly apart from the chosen one), for one-tap fixes in the menu
  const alts = [];
  for (let i = 1; i < cand.length - 1; i++) {
    const [b, v] = cand[i];
    if (v < cand[i - 1][1] || v < cand[i + 1][1] || v < best * 0.55) continue;
    if ([bpm, ...alts].some((x) => Math.abs(Math.log2(x / b)) < 0.06)) continue;
    alts.push(Math.round(b * 10) / 10);
  }
  alts.sort((a, b2) => Math.abs(Math.log2(a / bpm)) - Math.abs(Math.log2(b2 / bpm)));
  return { bpm, t0, alts: alts.slice(0, 3), energy: eAll, fr };
}

// bars with an energy level 0..3 from the loudness of each bar, smoothed over 4-bar phrases
export function trackBars(an, duration, bpm, t0) {
  const spb = 60 / bpm, barDur = spb * 4;
  const nb = Math.max(0, Math.floor((duration - t0) / barDur));
  const rms = [];
  for (let b = 0; b < nb; b++) {
    const f0 = Math.floor((t0 + b * barDur) * an.fr), f1 = Math.floor((t0 + (b + 1) * barDur) * an.fr);
    let s = 0;
    for (let f = f0; f < f1 && f < an.energy.length; f++) s += an.energy[f];
    rms.push(Math.sqrt(s / Math.max(1, f1 - f0)));
  }
  const phr = [];
  for (let p = 0; p < nb; p += 4) {
    const seg = rms.slice(p, p + 4);
    phr.push(seg.reduce((a, b) => a + b, 0) / seg.length);
  }
  const sorted = [...phr].sort((a, b) => a - b);
  const q = (v) => sorted[Math.min(sorted.length - 1, Math.floor(v * sorted.length))];
  const lv = (v) => (v <= q(0.15) ? 0 : v <= q(0.45) ? 1 : v <= q(0.8) ? 2 : 3);
  const bars = [];
  for (let b = 0; b < nb; b++) {
    const p = Math.floor(b / 4);
    const e = lv(phr[p]);
    bars.push({ gi: b, sec: 'track', e, bi: b % 4, bn: 4, first: b % 4 === 0, last: b % 4 === 3, nextE: p + 1 < phr.length ? lv(phr[p + 1]) : -1 });
  }
  return bars;
}

// ---- IndexedDB: remember the last file ----
const DB = 'offbeat-grove';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveTrack(rec) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const tx = d.transaction('tracks', 'readwrite'); tx.objectStore('tracks').put(rec, 'last'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('could not keep the track', e); }
}
export async function loadTrack() {
  try {
    const d = await db();
    return await new Promise((res) => { const tx = d.transaction('tracks', 'readonly'); const r = tx.objectStore('tracks').get('last'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch { return null; }
}
export async function clearTrack() {
  try { const d = await db(); d.transaction('tracks', 'readwrite').objectStore('tracks').delete('last'); } catch { /* nothing kept */ }
}
