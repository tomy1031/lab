// js/dom.js — the page around the 3D view: the menu (on PC/phone, and on Quest before entering VR),
// your own music file with its tempo tools, the timing calibration, PC/phone controls, pause and results,
// and the offline (service worker) status.
import { SONGS, songById } from './songs.js';
import { YT_SONGS, ytById, YouTubeSong, fitTaps } from './youtube.js';
import { MODES, DIFFS } from './chart.js';
import { decodeFile, analyze, trackBars, saveTrack, loadTrack, clearTrack } from './beat.js';
import { SUB_COLOR } from './targets.js';
import { drawLegend } from './vrui.js';
import { TrackPlayer } from './player.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class DomUI {
  constructor(app) {
    this.app = app;
    this.build();
    this.bind();
    this.sync();
  }

  build() {
    const seg = (el, items, key) => {
      $(el).innerHTML = items.map(([v, l]) => `<button class="chip" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('');
    };
    seg('modes', Object.entries(MODES).map(([k, m]) => [k, m.name]), 'mode');
    seg('diffs', Object.entries(DIFFS).map(([k, d]) => [k, d.name]), 'diff');
    seg('guides', [['on', 'あり'], ['fade', 'だんだん消える'], ['off', 'なし']], 'guide');
    seg('lengths', [['full', 'フル 約2分半'], ['short', 'ショート 約1分']], 'length');
    seg('quality', [['high', '標準'], ['low', '軽量']], 'quality');
    seg('hintsSeg', [['auto', '自動'], ['on', 'いつも'], ['off', 'なし']], 'hints');
    this.renderSongs();
  }

  renderSongs() {
    const s = this.app.store.data;
    const list = SONGS.map((g) => ({ id: g.id, title: g.title, sub: `${g.jp}・${g.genre}`, bpm: g.drill ? s.drillBpm : g.songBpm ? `${g.songBpm}（${g.bpm}で打つ）` : g.bpm }));
    for (const y of YT_SONGS) list.push({ id: y.id, title: `${y.title}`, sub: `${y.artist}・YouTube（インターネットが必要）`, bpm: `${y.songBpm}（${y.bpm}で打つ）` });
    const t = this.app.track;
    if (t) list.push({ id: 'track', title: t.name, sub: 'じぶんの曲', bpm: t.bpm });
    $('songs').innerHTML = list.map((g) => `<button class="song" data-song="${g.id}"><b>${esc(g.title)}</b><em>BPM ${g.bpm}</em><small>${esc(g.sub)}</small></button>`).join('');
  }

  bind() {
    const app = this.app, store = app.store;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.song) { app.audio.ensure(); app.choose({ song: b.dataset.song }); }
      else if (b.dataset.k) {
        app.audio.ensure();
        app.choose({ [b.dataset.k]: b.dataset.v });
        if (b.dataset.k === 'quality') this.toast('画質はページを開き直すと切りかわります');
      } else if (b.dataset.bpm) {
        app.audio.ensure();
        app.choose({ drillBpm: Math.max(60, Math.min(160, store.data.drillBpm + Number(b.dataset.bpm))) });
      } else if (b.dataset.yts) this.adjustYT(b.dataset.yts);
      else if (b.dataset.tb) this.adjustTrack({ tb: b.dataset.tb });
      else if (b.dataset.tset) this.adjustTrack({ set: Number(b.dataset.tset) });
      else if (b.dataset.to) this.adjustTrack({ to: b.dataset.to });
    });
    $('btn-vr').onclick = () => app.enterVR();
    $('btn-pc').onclick = () => app.startDesk(false);
    $('btn-auto').onclick = () => app.startDesk(true);
    $('pausebtn').onclick = () => (app.auto ? app.toMenu() : app.pause());
    $('p-resume').onclick = () => app.resume();
    $('p-retry').onclick = () => app.startDesk(app.auto);
    $('p-menu').onclick = () => app.toMenu();
    $('r-again').onclick = () => app.startDesk(app.auto);
    $('r-menu').onclick = () => app.toMenu();
    const press = (side, e) => {
      if (app.state !== 'play' || app.xr || app.auto || !app.session) return;
      app.session.press(side, app.player.songTime(e && e.timeStamp ? e.timeStamp : performance.now(), false));
    };
    for (const [id, side] of [['pad-l', 'L'], ['pad-r', 'R']]) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); press(side, e); });
    $('pad-d').addEventListener('pointerdown', (e) => { e.preventDefault(); app.duck(0.6); });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.calib) { if (e.code === 'Space') { e.preventDefault(); this.calibTap(e); } return; }
      if (this.ytCal) { if (e.code === 'Space') { e.preventDefault(); this.ytTap(e); } return; }
      if (app.state === 'play' && !app.xr) {
        if (e.code === 'KeyF' || e.code === 'KeyD' || e.code === 'ArrowLeft') { press('L', e); e.preventDefault(); }
        else if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'ArrowRight') { press('R', e); e.preventDefault(); }
        else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') { app.duck(0.6); e.preventDefault(); }
        else if (e.code === 'Escape' || e.code === 'KeyP') { if (app.auto) app.toMenu(); else app.pause(); }
      } else if (app.state === 'paused' && !app.xr && e.code === 'Escape') app.resume();
    });
    // settings
    const vol = (id, k) => {
      $(id).value = store.data.vol[k];
      $(id).oninput = () => { store.set({ vol: { ...store.data.vol, [k]: Number($(id).value) } }); app.audio.applyVolumes(); };
    };
    vol('vol-music', 'music'); vol('vol-guide', 'guide'); vol('vol-sfx', 'sfx');
    $('offset').value = store.data.offsetMs;
    $('offset').oninput = () => { store.set({ offsetMs: Number($('offset').value) }); this.sync(); };
    $('seated').checked = store.data.seated;
    $('seated').onchange = () => store.set({ seated: $('seated').checked });
    $('labels').checked = store.data.labels;
    $('labels').onchange = () => store.set({ labels: $('labels').checked });
    $('btn-calib').onclick = () => this.startCalib();
    $('yt-calib').onclick = () => this.startYTCalib();
    $('yt-auto').onclick = () => {
      const ys = ytById(app.store.data.song);
      if (!ys) return;
      const why = app.ytBlocker(ys);
      if (why && why !== 'sync') { this.toast(why, 5000); return; }
      app.ytAutoSync(ys);
    };
    $('yt-check').onclick = () => this.ytCheck();
    $('yt-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); this.ytTap(e); });
    window.addEventListener('online', () => this.sync());
    window.addEventListener('offline', () => this.sync());
    $('calib-close').onclick = () => this.endCalib();
    $('calib-pad').addEventListener('pointerdown', (e) => { e.preventDefault(); this.calibTap(e); });
    // your own music
    $('file').onchange = () => { const f = $('file').files[0]; if (f) this.loadFile(f); };
    $('track-use').onclick = () => app.choose({ song: 'track' });
    $('track-check').onclick = () => this.checkTrack();
    $('track-del').onclick = () => {
      clearTrack();
      app.track = null;
      if (store.data.song === 'track') app.choose({ song: 'skank' });
      $('track-box').classList.add('hidden');
      $('track-status').textContent = '消しました。';
      this.renderSongs();
      this.sync();
    };
  }

  // ---- state ----
  sync() {
    const s = this.app.store.data;
    if (s.song === 'track' && !this.app.track) s.song = 'skank';
    for (const b of document.querySelectorAll('.song')) b.setAttribute('aria-pressed', String(b.dataset.song === s.song));
    for (const b of document.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(s[b.dataset.k] === b.dataset.v));
    const ys = ytById(s.song);
    const song = s.song === 'track' || ys ? null : songById(s.song);
    $('song-tip').textContent = ys ? ys.tip : song ? song.tip : 'じぶんの曲：テンポと拍は自動で検出しました。ずれていたら下で調整できます。';
    $('yt-box').classList.toggle('hidden', !ys);
    if (ys) this.ensureYT(ys);
    this.ytStatus();
    this.dock();
    $('drill').classList.toggle('hidden', !(song && song.drill));
    $('drill-bpm').textContent = `BPM ${s.drillBpm}`;
    const bpmEm = document.querySelector('.song[data-song="drill"] em');
    if (bpmEm) bpmEm.textContent = `BPM ${s.drillBpm}`;
    $('mode-desc').textContent = MODES[s.mode].desc;
    $('offset-val').textContent = `${s.offsetMs > 0 ? '+' : ''}${s.offsetMs}ms`;
    $('offset').value = s.offsetMs;
  }

  onState() {
    const a = this.app, st = a.state, desk = !a.xr;
    this.dock();
    $('menu').classList.toggle('hidden', !(desk && st === 'menu'));
    $('playbar').classList.toggle('hidden', !(desk && (st === 'play' || st === 'paused')));
    $('pausebtn').classList.toggle('hidden', !(desk && st === 'play'));
    $('pausebtn').textContent = a.auto ? '✕ メニューへ' : 'II 一時停止';
    $('pause').classList.toggle('hidden', !(desk && st === 'paused'));
    $('results').classList.toggle('hidden', !(desk && st === 'results'));
    const touch = matchMedia('(pointer: coarse)').matches;
    for (const id of ['pad-l', 'pad-r', 'pad-d']) $(id).classList.toggle('hidden', a.auto || !touch);
    $('play-hint').textContent = a.auto ? 'オートプレイ中' : touch ? '' : 'F / D＝左　J / K＝右　Space＝くぐる　Esc＝一時停止';
    if (st === 'results' && desk && a.lastResults) this.showResults(a.lastResults);
    if (st === 'menu') { this.renderSongs(); this.sync(); }
  }

  showResults(r) {
    $('res-title').textContent = r.title;
    $('res-sub').textContent = `${MODES[r.mode].name}・${DIFFS[r.diff].name}${r.isBest ? '・ベスト更新！' : ''}`;
    $('res-rank').textContent = r.rank;
    $('res-score').textContent = r.score.toLocaleString();
    $('res-meta').textContent = `正確さ ${r.acc}%・最大コンボ ${r.maxCombo}・パンチ ${r.hits}/${r.punches}・枝 ${r.dodged}/${r.ducks}・${fmtTime(r.duration)}・目安 ${r.kcal} kcal`;
    const names = { on: '表拍「1 2 3 4」', and: '裏拍「ウラ」', six: '16ウラ' };
    $('res-cats').innerHTML = Object.entries(r.cat).filter(([, c]) => c.n).map(([k, c]) => {
      const m = Math.max(1, ...c.hist);
      return `<div class="cat"><b style="color:${SUB_COLOR[k]}">${names[k]}</b><span>${c.hit}/${c.n}・平均 ${c.mean > 0 ? '+' : ''}${c.mean}ms・ばらつき ±${c.sd}ms</span>
        <span class="small">早い ← → 遅い</span><div class="hist" style="color:${SUB_COLOR[k]}" aria-label="ずれの分布">${c.hist.map((v) => `<i style="height:${(v / m) * 100}%"></i>`).join('')}</div></div>`;
    }).join('');
    $('res-advice').textContent = r.advice;
  }

  toast(msg, ms = 3500) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), ms);
  }

  async ready() {
    $('loading').classList.add('hidden');
    const lc = $('legend');
    if (lc) drawLegend(lc.getContext('2d'), lc.width, lc.height);
    const note = $('vr-note');
    let vr = false;
    try { vr = !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))); } catch { vr = false; }
    $('btn-vr').disabled = !vr;
    note.textContent = vr ? 'Quest：ボタンを押すと VR が始まります。まわりに物がないか確認してください。'
      : !window.isSecureContext ? 'VR には HTTPS が必要です。PC・スマホではキーボードやタップで遊べます。'
      : 'このブラウザは VR 非対応です。Meta Quest のブラウザで開くと VR で遊べます。';
    this.restoreTrack();
    this.offline();
  }

  // ---- offline: service worker (only in the published build, where sw.js has its file list) ----
  offline() {
    const el = $('offline'), txt = $('offline-text');
    if (!('serviceWorker' in navigator) || !window.OG_BUILD) {
      txt.textContent = window.OG_BUILD ? 'このブラウザはオフライン保存に非対応です' : '開発版（オフライン保存は公開版で有効）';
      return;
    }
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const done = () => { el.classList.add('ok'); txt.textContent = `オフラインでも遊べます（版 ${window.OG_BUILD.slice(0, 7)}）`; };
      if (reg.active) done();
      navigator.serviceWorker.ready.then(done);
      const watch = (w) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            const b = $('update-btn');
            b.classList.remove('hidden');
            b.onclick = () => w.postMessage('SKIP_WAITING');
          }
        });
      };
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      if (reg.waiting && navigator.serviceWorker.controller) { const b = $('update-btn'); b.classList.remove('hidden'); b.onclick = () => reg.waiting.postMessage('SKIP_WAITING'); }
    }).catch((e) => { txt.textContent = 'オフライン保存に失敗しました：' + e.message; });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !navigator.serviceWorker.controller) return; if (this._hadController) { reloading = true; location.reload(); } });
    this._hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { this._hadController = true; });
  }

  // ---- your own music ----
  async loadFile(file) {
    const app = this.app;
    const ctx = app.audio.ensure();
    $('track-status').textContent = `「${file.name}」を読み込んでいます…`;
    try {
      const buffer = await decodeFile(ctx, file);
      $('track-status').textContent = 'テンポと拍を探しています…';
      await new Promise((r) => setTimeout(r, 30));
      const an = analyze(buffer);
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
      this.setTrack({ name, buffer, bpm: an.bpm, t0: an.t0, an, alts: an.alts });
      saveTrack({ blob: file, name, bpm: an.bpm, t0: an.t0, alts: an.alts, type: file.type });
      $('track-status').textContent = `見つけました：BPM ${an.bpm}。クリック付きで確認してみてください。`;
      app.choose({ song: 'track' });
    } catch (e) {
      console.error(e);
      $('track-status').textContent = 'このファイルは読み込めませんでした（' + e.message + '）';
    }
  }

  setTrack({ name, buffer, bpm, t0, an, alts = [] }) {
    const app = this.app;
    const t = { name, buffer, bpm, t0, an, alts };
    t.bars = an ? trackBars(an, buffer.duration, bpm, t0) : this.flatBars(buffer.duration, bpm, t0);
    app.track = t;
    $('track-box').classList.remove('hidden');
    $('track-name').textContent = name;
    $('track-bpm').textContent = `BPM ${bpm}・最初の「1」${t0.toFixed(3)}秒・${fmtTime(buffer.duration)}`;
    $('track-alts').innerHTML = alts.filter((b) => Math.abs(b - bpm) > 0.5).map((b) => `<button data-tset="${b}">BPM ${b} にする</button>`).join('');
    this.renderSongs();
    this.sync();
    app.menu.redraw();
  }

  flatBars(duration, bpm, t0) {
    const nb = Math.floor((duration - t0) / ((60 / bpm) * 4));
    return Array.from({ length: Math.max(0, nb) }, (_, b) => ({ gi: b, sec: 'track', e: b < 4 ? 1 : 2, bi: b % 4, bn: 4, first: b % 4 === 0, last: b % 4 === 3, nextE: 2 }));
  }

  adjustTrack({ tb, to, set }) {
    const t = this.app.track;
    if (!t) return;
    let { bpm, t0 } = t;
    const spb = 60 / bpm;
    if (set) bpm = set;
    else if (tb === 'half') bpm /= 2;
    else if (tb === 'double') bpm *= 2;
    else if (tb) bpm += Number(tb);
    if (to === 'beat') t0 += spb;
    else if (to === 'swap') t0 += spb / 2;
    else if (to) t0 += Number(to) / 1000;
    bpm = Math.round(Math.max(40, Math.min(240, bpm)) * 10) / 10;
    const bar = (60 / bpm) * 4;
    while (t0 >= bar) t0 -= bar;
    while (t0 < 0) t0 += 60 / bpm;
    this.setTrack({ ...t, bpm, t0 });
    loadTrack().then((rec) => rec && saveTrack({ ...rec, bpm, t0 }));
    this.app.stopPreview();
  }

  checkTrack() {
    const app = this.app, t = app.track;
    if (!t) return;
    app.audio.ensure();
    app.stopPreview();
    const p = new TrackPlayer(app.audio, t);
    const spb = 60 / t.bpm, bar = spb * 4;
    const from = t.t0 + Math.floor((t.buffer.duration * 0.25) / bar) * bar;
    p.start(app.audio.now() + 0.1, from, 0);
    for (let i = 0; i < 24; i++) app.audio.guideClick(p.seg, p.ctxTime(from + i * spb), i % 4 === 0 ? 'accent' : 'on', 1);
    app.preview = p;
    app.previewEnd = app.audio.now() + 24 * spb + 0.2;
  }

  async restoreTrack() {
    const rec = await loadTrack();
    if (!rec || !rec.blob) { this.sync(); return; }
    try {
      const ctx = this.app.audio.ensure();
      const buffer = await decodeFile(ctx, rec.blob);
      const an = analyze(buffer);
      this.setTrack({ name: rec.name, buffer, bpm: rec.bpm, t0: rec.t0, an, alts: rec.alts || [] });
      $('track-status').textContent = '前回の曲を読み込みました。';
    } catch (e) {
      console.warn('could not restore the last track', e);
    }
  }

  // ---- timing calibration: tap along to 16 clicks ----
  startCalib() {
    const a = this.app.audio;
    a.ensure();
    $('calib').classList.remove('hidden');
    const spb = 0.6, t0 = a.now() + 0.6;
    for (let i = 0; i < 16; i++) a.play(i % 4 === 0 ? 'blockAccent' : 'blockOn', t0 + i * spb, 0.6, a.guideBus);
    this.calib = { spb, t0, taps: [] };
    $('calib-out').textContent = '';
    $('calib-pad').focus();
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.finishCalib(), (16 * spb + 1.2) * 1000);
  }
  calibTap(e) {
    const c = this.calib;
    if (!c) return;
    const a = this.app.audio;
    const t = a.heard(e.timeStamp || performance.now(), false);
    const k = Math.round((t - c.t0) / c.spb);
    const pad = $('calib-pad');
    pad.classList.add('flash');
    setTimeout(() => pad.classList.remove('flash'), 90);
    if (k >= 4 && k < 16) c.taps.push(t - (c.t0 + k * c.spb));
    $('calib-out').textContent = `${c.taps.length} 回`;
  }
  finishCalib() {
    const c = this.calib;
    if (!c) return;
    if (c.taps.length < 6) { $('calib-out').textContent = 'タップが少なかったので、補正は変えませんでした。'; this.calib = null; return; }
    const s = [...c.taps].sort((x, y) => x - y);
    const med = s[Math.floor(s.length / 2)];
    const ms = Math.max(-150, Math.min(150, Math.round((med * 1000) / 5) * 5));
    this.app.store.set({ offsetMs: ms });
    this.sync();
    $('calib-out').textContent = `あなたのタップは平均 ${ms > 0 ? '+' : ''}${ms}ms。補正を ${ms > 0 ? '+' : ''}${ms}ms にしました。`;
    this.calib = null;
  }
  endCalib() {
    clearTimeout(this._ct);
    if (this.calib) this.finishCalib();
    $('calib').classList.add('hidden');
  }

  // ---- YouTube songs ----
  // the player sits in a small dock (YouTube asks that its player stays visible); hidden for other songs
  dock() {
    const a = this.app;
    const ys = ytById(a.store.data.song);
    const playingYT = a.player && a.player.kind === 'youtube' && (a.state === 'play' || a.state === 'paused');
    const on = !!(ys || playingYT) && navigator.onLine;
    $('yt-dock').classList.toggle('hidden', !on);
    document.body.classList.toggle('yt-on', on);
    document.body.classList.toggle('playing', a.state === 'play' || a.state === 'paused');
    if (ys) $('yt-cap').textContent = `YouTube：${ys.artist}「${ys.title}」（${ys.channel}）`;
  }

  ensureYT(ys) {
    const a = this.app;
    if (!navigator.onLine) return;
    if (a.yt && a.yt.song.id === ys.id) return;
    a.yt = new YouTubeSong(ys, 'yt-player');
    a.yt.onChange(() => this.ytStatus());
    a.yt.load().then(() => this.ytStatus(), (e) => { this.ytStatus(); this.toast(e.message, 5000); });
    this.ytStatus();
  }

  ytStatus() {
    const a = this.app;
    const ys = ytById(a.store.data.song);
    if (!ys) return;
    const el = $('yt-status');
    if (!navigator.onLine) { el.textContent = 'いまはオフラインです。YouTube の曲はインターネットにつながっているときだけ遊べます。'; return; }
    const yt = a.yt;
    const sync = a.ytSync(ys);
    const parts = [];
    parts.push(!yt || (!yt.ready && !yt.error) ? '動画を読み込んでいます…' : yt.error ? yt.error : '動画の準備OK');
    const sp = a.syncProgress;
    if (sp) parts.push(sp.text);
    else parts.push(sync ? `拍の位置：OK（${sync.how === 'mic' ? '自動' : '手動'}・最初の「1」は ${sync.t0.toFixed(2)} 秒）` : '拍の位置：まだ（下のボタンを押すか、START で自動で調べます）');
    if (this.ytCal) parts.push(`タップ ${this.ytCal.taps.length}/16`);
    el.textContent = parts.join('　/　');
    const btn = $('yt-auto');
    btn.disabled = !!a.syncing || !yt || !yt.ready;
    btn.textContent = a.syncing ? '🎤 曲を聞いています…（そのまま待ってください）' : sync ? '🎤 もう一度、自動で拍あわせ' : '🎤 自動で拍あわせ（待つだけ・約20秒）';
    $('yt-bar').classList.toggle('hidden', !sp);
    if (sp) $('yt-bar').firstElementChild.style.width = `${Math.round(sp.f * 100)}%`;
  }

  startYTCalib() {
    const a = this.app, yt = a.yt;
    const ys = ytById(a.store.data.song);
    if (!ys || !yt || !yt.ready) { this.toast('動画の準備ができてから、もう一度押してください'); return; }
    a.audio.ensure();
    this.ytCal = { taps: [], song: ys };
    yt.seek(0);
    yt.play();
    $('yt-tap').classList.remove('hidden');
    $('yt-tap').textContent = 'ドラムが入ったら、拍に合わせてここをタップ（Space）';
    $('yt-tap').focus();
    this.ytStatus();
  }

  ytTap(e) {
    const c = this.ytCal, yt = this.app.yt;
    if (!c || !yt || !yt.playing) return;
    c.taps.push(yt.time(e.timeStamp || performance.now()));
    const pad = $('yt-tap');
    pad.classList.add('flash');
    setTimeout(() => pad.classList.remove('flash'), 90);
    pad.textContent = `${c.taps.length} / 16`;
    this.ytStatus();
    if (c.taps.length >= 16) this.finishYTCalib();
  }

  finishYTCalib() {
    const a = this.app, c = this.ytCal;
    if (!c) return;
    this.ytCal = null;
    $('yt-tap').classList.add('hidden');
    a.yt.pause();
    const fit = fitTaps(c.taps, c.song.songBpm);
    if (fit.consistency < 0.55) {
      this.toast('タップのばらつきが大きかったので、覚えませんでした。もう一度どうぞ（ドラムの「ドン・タン」に合わせて）', 6000);
    } else {
      const all = { ...(a.store.data.ytSync || {}) };
      all[c.song.video] = { t0: +fit.t0.toFixed(3), songBpm: c.song.songBpm, how: 'tap' };
      a.store.set({ ytSync: all });
      this.toast('拍の位置を覚えました。「クリック付きで確認」で、クリックがドラムと重なるか聞いてみてください', 6000);
    }
    this.ytStatus();
    a.menu.redraw();
  }

  adjustYT(kind) {
    const a = this.app;
    const ys = ytById(a.store.data.song);
    const sync = ys && a.ytSync(ys);
    if (!sync) { this.toast('先に「🎤 自動で拍あわせ」をしてください'); return; }
    const P = 60 / sync.songBpm;
    let t0 = sync.t0;
    if (kind === 'swap') t0 = t0 - P >= 0 ? t0 - P : t0 + P; // the other 220 beat becomes the 110 beat: kicks and snares change places
    else if (kind === 'beat') t0 = t0 - 2 * P >= 0 ? t0 - 2 * P : t0 + 2 * P;
    else t0 = Math.max(0, t0 + Number(kind) / 1000);
    const all = { ...(a.store.data.ytSync || {}) };
    all[ys.video] = { ...sync, t0: +t0.toFixed(3) };
    a.store.set({ ytSync: all });
    this.ytStatus();
  }

  // play a stretch of the video with a click on every beat (high click on each bar's "1")
  ytCheck() {
    const a = this.app, yt = a.yt;
    const ys = ytById(a.store.data.song);
    const sync = ys && a.ytSync(ys);
    if (!sync || !yt || !yt.ready) { this.toast('先に「🎤 自動で拍あわせ」をしてください'); return; }
    a.audio.ensure();
    const spb = 60 / (sync.songBpm * (ys.bpm / ys.songBpm));
    const from = sync.t0 + spb * 4 * 4;
    yt.seek(from);
    yt.play();
    let next = 0;
    const until = from + spb * 24;
    const first = Math.ceil((from - sync.t0) / spb);
    const tick = () => {
      if (!yt.playing && next > 0 && yt.time() > until) return;
      const now = yt.time(performance.now());
      if (yt.playing) {
        for (;;) {
          const b = first + next;
          const tb = sync.t0 + b * spb;
          if (tb > now + 0.25) break;
          if (tb > now) a.audio.guideClick(null, a.audio.ctx.currentTime + (tb - now), b % 4 === 0 ? 'accent' : 'on', 1);
          next++;
        }
        if (now > until) { yt.pause(); return; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
