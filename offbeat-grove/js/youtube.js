// js/youtube.js — songs played from YouTube (needs the internet; the video is never stored).
//
// The page cannot hear a YouTube video (it plays in YouTube's own frame), so the beat cannot be found
// automatically. Instead you tap along once ("拍あわせ"): from your taps the game learns where the beats
// are on the video's clock — including how late the sound reaches your ears — and keeps that per video.
// Song time = the video's playback time, read from the player every frame and smoothed into a steady clock.

// the song's own tempo (songBpm) and the tempo the punches follow (bpm): 220 BPM rock is boxed at half
// time, 110 — kicks on the beats, snares on the ウラ
export const YT_SONGS = [
  {
    id: 'yt-hachigatsu', video: 'Vs5NViM8TSY', title: '八月、某、月明かり', artist: 'ヨルシカ', channel: 'ヨルシカ / n-buna Official',
    songBpm: 220, bpm: 110, genre: 'YouTube・公式 MV',
    tip: 'ヨルシカの公式 MV（YouTube）を流しながら遊びます。BPM 220 の曲を半分の 110 で打つので、キック「ドン」が拍、スネア「タン」がウラ。インターネットが必要です。',
  },
];
export const ytById = (id) => YT_SONGS.find((s) => s.id === id) || null;

let apiPromise = null;
export function loadYouTubeAPI(timeoutMs = 15000) {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube に接続できません')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { apiPromise = null; reject(new Error('YouTube の読み込みが時間切れです')); } }, timeoutMs);
  });
  return apiPromise;
}

// one YouTube player in a page element, with a smooth clock on the video's time
export class YouTubeSong {
  constructor(song, elementId) {
    this.song = song;
    this.elementId = elementId;
    this.player = null;
    this.ready = false;
    this.state = -1;
    this.error = null;
    this.base = null; // { v: video time, p: performance time } while playing
    this.listeners = new Set();
  }

  onChange(f) { this.listeners.add(f); }
  emit() { for (const f of this.listeners) f(this); }

  async load() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      const YT = await loadYouTubeAPI();
      await new Promise((resolve, reject) => {
        this.player = new YT.Player(this.elementId, {
          videoId: this.song.video,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, controls: 1, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => {
              this.ready = true;
              // read the player's time every 15 ms, not only once per drawn frame: its reports come a few
              // times a second, and the sooner a fresh one is seen the less the clock trails the sound
              this.poll = setInterval(() => { if (this.playing) this.sample(); }, 15);
              this.emit();
              resolve();
            },
            onStateChange: (e) => { this.state = e.data; if (e.data !== 1) this.base = null; this.emit(); },
            onError: (e) => {
              this.error = e.data === 101 || e.data === 150 ? 'この動画は埋め込みで再生できません' : `YouTube のエラー（${e.data}）`;
              this.emit();
              reject(new Error(this.error));
            },
          },
        });
      });
    })();
    this.readyPromise.catch(() => { this.readyPromise = null; });
    return this.readyPromise;
  }

  get playing() { return this.state === 1; }
  duration() { return this.player && this.player.getDuration ? this.player.getDuration() || 0 : 0; }
  play() { if (this.player) this.player.playVideo(); }
  pause() { if (this.player) this.player.pauseVideo(); this.base = null; }
  seek(t) { if (this.player) this.player.seekTo(Math.max(0, t), true); this.base = null; }

  // call every frame: follow the player's reported time with a steady clock
  sample(perfMs = performance.now()) {
    if (!this.player || !this.player.getCurrentTime) return;
    const v = this.player.getCurrentTime();
    this.lastV = v;
    if (!this.playing) { this.base = null; return; }
    const rate = (this.player.getPlaybackRate && this.player.getPlaybackRate()) || 1;
    if (!this.base) { this.base = { v, p: perfMs, raw: v, rate }; return; }
    const pred = this.base.v + ((perfMs - this.base.p) / 1000) * rate;
    if (Math.abs(v - pred) > 0.3) { this.base = { v, p: perfMs, raw: v, rate }; return; }
    if (v !== this.base.raw) { // a fresh report: nudge the clock toward it
      this.base = { v: pred + (v - pred) * 0.15, p: perfMs, raw: v, rate };
    }
  }

  // video time at performance-clock time perfMs
  time(perfMs = performance.now()) {
    if (this.base) return this.base.v + ((perfMs - this.base.p) / 1000) * this.base.rate;
    return this.lastV ?? (this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0);
  }
}

// from tap times (video time, seconds) at a known tempo: the beat phase, how consistent the taps were
// (0..1), and the first beat at or before the first tap (taken as the first bar's downbeat)
export function fitTaps(taps, songBpm) {
  const P = 60 / songBpm;
  let sx = 0, sy = 0;
  for (const t of taps) { const a = ((t % P) / P) * Math.PI * 2; sx += Math.cos(a); sy += Math.sin(a); }
  const n = taps.length;
  const R = Math.hypot(sx, sy) / n;
  let phase = (Math.atan2(sy, sx) / (Math.PI * 2)) * P;
  if (phase < 0) phase += P;
  const first = Math.min(...taps);
  const k = Math.round((first - phase) / P);
  return { phase, consistency: R, t0: Math.max(0, phase + k * P) };
}

// the bars of a YouTube song (for js/chart.js): from the first downbeat to the end of the video
export function ytBars(duration, t0, bpm) {
  const barDur = (60 / bpm) * 4;
  const nb = Math.max(0, Math.floor((duration - t0 - 4) / barDur));
  const bars = [];
  for (let b = 0; b < nb; b++) {
    const p = Math.floor(b / 4);
    const e = p === 0 ? 0 : b >= nb - 4 ? 1 : Math.floor((p - 1) / 2) % 2 === 0 ? 1 : 2;
    bars.push({ gi: b, sec: 'youtube', e, bi: b % 4, bn: 4, first: b % 4 === 0, last: b % 4 === 3, nextE: 1 });
  }
  return bars;
}
