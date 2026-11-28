// js/ui.js — the menu page: choose a place (famous places, search, the map), download it for offline play,
// manage what is saved, settings, and the on-screen display while flying on a screen.
import { PRESETS, CATS, downloadArea, deleteArea, storageInfo, fmtBytes, normArea } from './areas.js';
import { Plan, RADII } from './plan.js';
import { S2_YEARS, NOMINATIM, aerialFor } from './sources.js';
import { MapPicker } from './map.js';
import { MODES, MODE_ORDER } from './modes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const near = (a, b) => Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;

export class UI {
  constructor(app) {
    this.app = app;
    this.dl = null; // the running download
    this.results = [];
    this.picked = null; // a place chosen on the map / by coordinates
    this.xr = false;
    this.wantReload = false;
    this.cat = 'all'; // the famous places shown: all | city | sight | nature
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { this.xr = ok; this.render(); }).catch(() => {});
    }
    this.map = new MapPicker($('map'), (lat, lon) => {
      this.picked = { name: '地図でえらんだ場所', sub: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, buildings: true };
      this.render();
    });
    this.bind();
    this.render();
    this.refreshStorage();
  }

  areaFromPreset(p, extra = {}) {
    const s = this.app.settings;
    return normArea({ ...p, r: s.radius, year: s.year, hires: s.hires, buildings: s.buildings && !!p.buildings, ...extra });
  }
  savedFor(p) { return this.app.store.list.find((a) => near(a, p)) || null; }

  bind() {
    document.body.addEventListener('click', (e) => {
      this.app.sound.start(); // browsers let sound start only after a click
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.dataset.act, arg = b.dataset.arg;
      this.act(act, arg, b);
    });
    $('search').addEventListener('submit', (e) => { e.preventDefault(); this.search($('q').value.trim()); });
    $('coord').addEventListener('submit', (e) => {
      e.preventDefault();
      const m = $('ll').value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
      if (!m) { this.toast('「35.36, 138.73」のように 緯度, 経度 を入れてください'); return; }
      const lat = +m[1], lon = +m[2];
      if (Math.abs(lat) > 84 || Math.abs(lon) > 180) { this.toast('緯度は ±84°、経度は ±180° までです'); return; }
      this.picked = { name: '座標でえらんだ場所', sub: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, buildings: true };
      this.map.center(lat, lon, 9);
      this.render();
    });
    $('year').addEventListener('change', (e) => this.app.setSetting('year', +e.target.value));
    for (const [id, key] of [['hires', 'hires'], ['bld', 'buildings'], ['clouds', 'clouds'], ['sound', 'sound']]) {
      $(id).addEventListener('change', (e) => this.app.setSetting(key, e.target.checked));
    }
    // touch buttons while flying on a phone / tablet
    for (const el of document.querySelectorAll('[data-touch]')) {
      const k = el.dataset.touch;
      const on = (e) => { e.preventDefault(); this.app.sin.touch[k] = 1; };
      const off = () => { this.app.sin.touch[k] = 0; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    }
  }

  // the area object for a list entry: kind = saved | preset | result | picked
  entry(kind, i) {
    if (kind === 'saved') return this.app.store.list[i];
    if (kind === 'preset') { const p = PRESETS[i]; return this.savedFor(p) || this.areaFromPreset(p); }
    if (kind === 'result') { const r = this.results[i]; return this.savedFor(r) || this.areaFromPreset(r); }
    if (kind === 'picked') return this.savedFor(this.picked) || this.areaFromPreset(this.picked);
    return null;
  }

  act(act, arg) {
    const app = this.app;
    const [kind, i] = (arg || '').split(':');
    const area = kind ? this.entry(kind, +i) : null;
    // offline, only downloaded areas can be flown
    const target = ['vr', 'screen'].includes(act) ? area || app.area || app.defaultArea() : area;
    if (['vr', 'screen', 'fly', 'view'].includes(act) && !app.online && target && !app.isSaved(target)) {
      this.toast('オフラインでは、ダウンロード済みのエリアだけ飛べます');
      return;
    }
    switch (act) {
      case 'vr': app.startVR(target); break;
      case 'screen': app.startScreen(target); break;
      case 'fly': if (this.xr) app.startVR(area); else app.startScreen(area); break;
      case 'view': app.loadArea(area); this.toast(`${area.name} を表示しています`); break;
      case 'dl': this.download(area); break;
      case 'stop-dl': this.dl?.ac.abort(); break;
      case 'del': this.remove(area); break;
      case 'radius': app.setSetting('radius', +arg); break;
      case 'cat': this.cat = arg; this.render(); break;
      case 'quality': app.setSetting('quality', arg); break;
      case 'mode': app.setSetting('mode', arg); break;
      case 'speed': app.setSetting('speed', arg); break;
      case 'menu': app.stop(); break;
      case 'zoom-in': this.map.zoomBy(1); break;
      case 'zoom-out': this.map.zoomBy(-1); break;
      case 'update': this.wantReload = true; this.updateFn?.(); break;
      default: break;
    }
  }

  async download(area) {
    if (this.dl) return;
    const app = this.app;
    if (!app.online) { this.toast('ネットにつながっていません。ダウンロードはネットのある所で'); return; }
    const ac = new AbortController();
    this.dl = { id: area.id, ac, p: { done: 0, total: 1, bytes: 0, phase: 'tiles' } };
    this.render();
    const rec = { ...normArea(area), done: false, bytes: 0, tiles: 0, failed: 0, date: Date.now() };
    try {
      const res = await downloadArea(area, { signal: ac.signal, onProgress: (p) => { this.dl.p = p; this.progress(); } });
      Object.assign(rec, { done: res.failed === 0, failed: res.failed, bytes: res.bytes, tiles: res.total, bcount: res.buildings || 0, wcount: res.walls || 0 });
      app.store.put(rec);
      this.toast(res.failed ? `${area.name}：${res.failed} 個 取れませんでした。「つづきから」でもう一度` : `${area.name} をダウンロードしました（${fmtBytes(res.bytes)}）。オフラインで飛べます`, 6000);
      if (res.buildingsError) this.toast(`建物を取れませんでした：${res.buildingsError}`, 6000);
    } catch (e) {
      Object.assign(rec, { bytes: this.dl.p.bytes, tiles: this.dl.p.total });
      app.store.put(rec);
      this.toast(e.name === 'AbortError' ? 'ダウンロードを中止しました（「つづきから」で再開できます）' : `ダウンロードできませんでした：${e.message || e}`, 6000);
    } finally {
      this.dl = null;
      this.render();
      this.refreshStorage();
    }
  }

  async remove(area) {
    if (!confirm(`「${area.name}」のダウンロードを削除しますか？`)) return;
    const n = await deleteArea(this.app.store, area.id);
    this.toast(`削除しました（${n} 個のタイル）`);
    this.render();
    this.refreshStorage();
  }

  async search(q) {
    if (!q) return;
    if (!this.app.online) { this.toast('検索にはネットが必要です'); return; }
    $('results').innerHTML = '<p class="note">さがしています…</p>';
    try {
      const res = await fetch(NOMINATIM(q), { headers: { 'Accept-Language': 'ja' } });
      const list = await res.json();
      this.results = list.map((r) => {
        const parts = String(r.display_name || '').split(',').map((s) => s.trim());
        return { name: r.name || parts[0], sub: parts.slice(1, 4).join('・'), lat: +r.lat, lon: +r.lon, buildings: true };
      });
      if (!this.results.length) $('results').innerHTML = '<p class="note">見つかりませんでした</p>';
      else { this.render(); this.map.center(this.results[0].lat, this.results[0].lon, 9); }
    } catch (e) {
      $('results').innerHTML = `<p class="note">検索できませんでした（${esc(e.message || e)}）</p>`;
    }
  }

  async refreshStorage() {
    const s = await storageInfo();
    const saved = this.app.store.list.reduce((a, r) => a + (r.bytes || 0), 0);
    $('storage').textContent = s
      ? `保存したエリア：${fmtBytes(saved)}　ブラウザ全体：${fmtBytes(s.usage)} / ${fmtBytes(s.quota)}${s.persisted ? '（消されにくい設定）' : ''}`
      : `保存したエリア：${fmtBytes(saved)}`;
  }

  // one place card. kind: saved | preset | result | picked
  card(kind, i, area, title, sub) {
    const app = this.app;
    const saved = kind === 'saved' ? area : this.savedFor(area);
    const plan = new Plan(saved || this.areaFromPreset(area));
    if (!this.estCache) this.estCache = new Map();
    if (!this.estCache.has(plan.area.id)) this.estCache.set(plan.area.id, plan.estimate());
    const est = this.estCache.get(plan.area.id);
    const dl = this.dl && this.dl.id === plan.area.id ? this.dl : null;
    const aerial = plan.aerial ? `・高精細写真（${plan.aerial.id === 'gsi' ? '国土地理院' : plan.aerial.name}）` : '';
    const arg = `${kind}:${i}`;
    let meta, buttons = '';
    const flyLabel = this.xr ? 'VR で飛ぶ' : '飛ぶ';
    if (saved && saved.done) {
      meta = `★ ダウンロード済み・半径 ${saved.r} km・${fmtBytes(saved.bytes || 0)}${saved.bcount ? `・建物 ${saved.bcount.toLocaleString()} 棟` : ''}${saved.wcount ? '・城壁' : ''}`;
      buttons = `<button class="go" data-act="fly" data-arg="${arg}">${flyLabel}</button>`
        + (this.xr ? `<button data-act="screen" data-arg="${arg}">画面で</button>` : '')
        + `<button data-act="view" data-arg="${arg}">背景に表示</button>`
        + `<button class="del" data-act="del" data-arg="${arg}">削除</button>`;
    } else {
      meta = saved ? `途中まで（${fmtBytes(saved.bytes || 0)}）・半径 ${plan.area.r} km` : `半径 ${plan.area.r} km${aerial}${plan.buildings ? '・建物' : ''}・約 ${fmtBytes(est.bytes)}`;
      buttons = `<button class="go" data-act="dl" data-arg="${arg}" ${this.dl || !app.online ? 'disabled' : ''}>${saved ? 'つづきから' : 'ダウンロード'}</button>`
        + `<button data-act="fly" data-arg="${arg}" ${app.online ? '' : 'disabled'}>オンラインで${this.xr ? ' VR' : '飛ぶ'}</button>`
        + `<button data-act="view" data-arg="${arg}" ${app.online ? '' : 'disabled'}>背景に表示</button>`
        + (saved ? `<button class="del" data-act="del" data-arg="${arg}">削除</button>` : '');
    }
    const prog = dl ? `<div class="prog"><div class="bar"><i style="width:${Math.round((dl.p.done / Math.max(1, dl.p.total)) * 100)}%"></i></div><span id="prog-text"></span><button data-act="stop-dl">中止</button></div>` : '';
    const cur = app.area && app.area.id === plan.area.id ? ' current' : '';
    return `<article class="place${cur}"><div class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></div><p class="meta">${esc(meta)}</p>${prog}<div class="acts">${buttons}</div></article>`;
  }

  progress() {
    const el = $('prog-text');
    if (!this.dl || !el) return;
    const p = this.dl.p;
    el.textContent = p.phase === 'buildings' ? '建物を取得中…（OpenStreetMap）' : `${p.done} / ${p.total}・${fmtBytes(p.bytes)}${p.failed ? `・失敗 ${p.failed}` : ''}`;
    const bar = el.parentElement.querySelector('.bar i');
    if (bar) bar.style.width = `${Math.round((p.done / Math.max(1, p.total)) * 100)}%`;
  }

  render() {
    const app = this.app, s = app.settings;
    // play buttons
    $('btn-vr').disabled = !this.xr;
    $('vr-note').textContent = this.xr
      ? 'Quest のコントローラーで飛びます。メニューは B / Y ボタン。'
      : 'VR は Meta Quest のブラウザで開くと使えます。この画面では「画面で飛ぶ」でどうぞ。';
    $('net').textContent = app.online ? 'オンライン' : 'オフライン';
    $('net').className = 'net ' + (app.online ? 'on' : 'off');
    $('now').innerHTML = app.area ? `表示中：<b>${esc(app.area.name)}</b>` : '';
    // saved
    const saved = app.store.list;
    $('saved').innerHTML = saved.length
      ? saved.map((a, i) => this.card('saved', i, a, a.name, a.sub)).join('')
      : '<p class="note">まだありません。下の「世界の名所」や検索から、ネットのある所でダウンロードしてください。</p>';
    $('cats').innerHTML = [['all', 'すべて'], ...Object.entries(CATS)].map(([k, n]) => `<button class="chip" data-act="cat" data-arg="${k}" aria-pressed="${this.cat === k}">${n}<small>${k === 'all' ? PRESETS.length : PRESETS.filter((p) => p.cat === k).length} か所</small></button>`).join('');
    $('presets').innerHTML = PRESETS.map((p, i) => (this.cat === 'all' || p.cat === this.cat ? this.card('preset', i, p, p.name, p.sub) : '')).join('');
    $('results').innerHTML = this.results.map((r, i) => this.card('result', i, r, r.name, r.sub)).join('');
    $('picked').innerHTML = this.picked ? this.card('picked', 0, this.picked, this.picked.name, this.picked.sub) : '';
    // settings
    $('radius').innerHTML = RADII.map((r) => `<button class="chip" data-act="radius" data-arg="${r}" aria-pressed="${s.radius === r}">${r} km</button>`).join('');
    $('year').innerHTML = S2_YEARS.map((y) => `<option value="${y}" ${s.year === y ? 'selected' : ''}>${y} 年${y === 2016 ? '（CC BY・商用可）' : ''}</option>`).join('');
    $('hires').checked = s.hires;
    $('bld').checked = s.buildings;
    $('clouds').checked = s.clouds;
    $('quality').innerHTML = [['low', '軽い'], ['normal', 'ふつう'], ['high', 'きれい']].map(([k, n]) => `<button class="chip" data-act="quality" data-arg="${k}" aria-pressed="${s.quality === k}">${n}</button>`).join('');
    $('modes').innerHTML = MODE_ORDER.map((k) => `<button class="chip" data-act="mode" data-arg="${k}" aria-pressed="${s.mode === k}">${MODES[k].name}<small>${MODES[k].sub}</small></button>`).join('');
    const M = MODES[s.mode] || MODES.point;
    $('mode-help').innerHTML = `<b>VR</b>：${esc(M.vr)}<br><b>画面</b>：${esc(M.keys)}`;
    $('sound').checked = s.sound;
    $('speeds').innerHTML = [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'ジェット']].map(([k, n]) => `<button class="chip" data-act="speed" data-arg="${k}" aria-pressed="${s.speed === k}">${n}</button>`).join('');
    const credits = app.credits();
    $('credits-now').innerHTML = credits.length ? credits.map((c) => `<li>${esc(c)}</li>`).join('') : '<li>（場所を表示すると、ここに出典が出ます）</li>';
    $('hud-credit').textContent = app.creditsShort();
    this.progress();
    this.map.setAreas(app.store.list, app.area);
  }

  showSheet(on) {
    $('menu').classList.toggle('hidden', !on);
    $('hud').classList.toggle('hidden', on || this.app.state !== 'screen');
    $('touch').classList.toggle('hidden', on || this.app.state !== 'screen' || !matchMedia('(pointer: coarse)').matches);
    if (on) this.render();
  }

  hud(d, st) {
    const el = $('hud');
    if (el.classList.contains('hidden')) return;
    const k = `${d.name}|${d.kmh}|${d.alt}|${d.agl}|${d.dir}|${d.msg}|${st.loading}|${d.mode}|${d.info}`;
    if (k === this.hudKey) return;
    this.hudKey = k;
    $('hud-name').textContent = d.name;
    $('hud-kmh').textContent = d.kmh;
    $('hud-alt').textContent = d.alt.toLocaleString();
    $('hud-agl').textContent = d.agl.toLocaleString();
    $('hud-dir').textContent = d.dir;
    $('hud-info').textContent = `${d.mode}${d.info ? '・' + d.info : ''}`;
    const keys = (MODES[this.app.flight.mode] || MODES.point).keys;
    if ($('hud-keys').textContent !== keys) $('hud-keys').textContent = keys;
    $('hud-msg').textContent = d.msg || (st.loading > 0 ? `読み込み中 ${st.loading}` : '');
  }

  toast(msg, ms = 4000) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.tt);
    this.tt = setTimeout(() => t.classList.remove('show'), ms);
  }

  swState(st, fn) {
    const el = $('offline');
    if (st === 'ok') { el.className = 'offline ok'; el.textContent = 'このページはオフラインでも開けます（ホーム画面に追加すると便利）'; }
    else if (st === 'update') { el.className = 'offline'; el.innerHTML = '新しいバージョンがあります <button data-act="update">更新</button>'; this.updateFn = fn; }
    else if (st === 'dev') { el.className = 'offline'; el.textContent = '開発版（オフライン用のキャッシュなし）'; }
    else { el.className = 'offline'; el.textContent = 'オフライン用のキャッシュを使えません'; }
  }
}

export { aerialFor };
