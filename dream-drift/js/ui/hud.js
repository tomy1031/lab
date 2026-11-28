// ui/hud.js — the race overlay. Item slot + roulette (top left) with the ranking under it, time, pause and
// minimap (top right), lap (bottom left), place (bottom right); centre messages, the wrong-way warning and the
// hand-camera preview. The middle of the screen stays clear for the road.
import { ITEM_ICONS, ITEM_IDS, ITEMS } from '../race/items.js';

const $ = (id) => document.getElementById(id);
export const fmtTime = (t) => {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

export class Hud {
  constructor(portraits) {
    this.portraits = portraits;
    this.el = $('hud');
    this.item = $('h-item'); this.itemUse = $('h-itemuse');
    this.lapEl = $('h-lap'); this.lapBox = $('h-lapbox'); this.timeEl = $('h-time');
    this.pos = $('h-pos'); this.posN = this.pos.querySelector('.n'); this.posU = this.pos.querySelector('.u');
    this.rank = $('h-rank');
    this.msg = $('h-msg');
    this.banner = $('h-banner');
    this.warn = $('h-warn');
    this.cam = $('h-cam'); this.camCv = $('h-camcv');
    this.speedfx = $('h-speed');
    this.map = $('h-map'); this.mctx = this.map.getContext('2d');
    this.last = {};
    this.rouletteT = 0;
  }

  show(on) { this.el.classList.toggle('show', on); }

  setup(race, me, course, handMode) {
    this.race = race; this.me = me;
    this.last = {};
    // minimap: fit the track into the canvas
    const tr = race.track, W = this.map.width;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const p of tr.P) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
    const pad = 26, sc = (W - pad * 2) / Math.max(maxx - minx, maxz - minz);
    const ox = pad + ((W - pad * 2) - (maxx - minx) * sc) / 2, oz = pad + ((W - pad * 2) - (maxz - minz) * sc) / 2;
    this.mapT = (x, z) => [ox + (x - minx) * sc, oz + (z - minz) * sc];
    const bg = document.createElement('canvas'); bg.width = bg.height = W;
    const c = bg.getContext('2d');
    const path = () => { c.beginPath(); tr.P.forEach((p, i) => { const [x, y] = this.mapT(p.x, p.z); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    c.lineJoin = 'round';
    path(); c.strokeStyle = 'rgba(20,8,50,0.75)'; c.lineWidth = 26; c.stroke();
    path(); c.strokeStyle = '#ffffff'; c.lineWidth = 15; c.stroke();
    path(); c.strokeStyle = course.theme.mapColor || '#8a5cff'; c.lineWidth = 9; c.stroke();
    const [sx, sy] = this.mapT(tr.P[0].x, tr.P[0].z);
    c.fillStyle = '#111'; c.fillRect(sx - 7, sy - 7, 14, 14);
    c.fillStyle = '#fff'; c.fillRect(sx - 7, sy - 7, 7, 7); c.fillRect(sx, sy, 7, 7);
    this.mapBg = bg;
    // ranking list
    this.rank.innerHTML = '';
    this.rows = new Map();
    race.karts.forEach((k) => {
      const d = document.createElement('div');
      d.innerHTML = `<span class="p"></span><img alt="${k.char.name}" title="${k.char.name}" src="${this.portraits.get(k.char.id) || ''}" style="--c:${k.char.kart}">`;
      if (k === me) d.classList.add('me');
      this.rank.appendChild(d);
      this.rows.set(k, d);
    });
    this.cam.classList.toggle('on', !!handMode);
    this.el.classList.toggle('cam', !!handMode);
    this.lastId = null;
    this.setItem(null, 0, false);
    this.warn.classList.remove('on');
  }

  setItem(id, count, spinning) {
    const key = `${id}|${count}|${spinning}`;
    if (key === this.last.item) return;
    this.last.item = key;
    const svg = id ? ITEM_ICONS[id] : '';
    this.item.innerHTML = svg + (count > 1 ? `<span class="cnt">×${count}</span>` : '') + `<span class="use">${id && !spinning ? ITEMS[id].name : ''}</span>`;
    const it = this.item.classList;
    it.toggle('spin', !!spinning);
    it.toggle('empty', !id);
    // a pop when the roulette starts and when it lands; the name shows for a moment under the box
    const now = spinning ? 'spin' : id;
    if (now && now !== this.lastId) { it.remove('got'); void this.item.offsetWidth; it.add('got'); }
    if (id && !spinning && now !== this.lastId) { it.add('named'); clearTimeout(this.nameT); this.nameT = setTimeout(() => it.remove('named'), 1800); }
    if (!id) it.remove('named');
    this.lastId = now;
  }

  flash(text, cls = '', dur = 1.2) {
    const m = this.msg;
    m.className = 'h-msg outline ' + cls;
    m.textContent = text;
    void m.offsetWidth;
    m.classList.add('on');
    m.style.animationDuration = dur + 's';
  }

  showBanner(sub, title, on = true) {
    $('h-bs').textContent = sub; $('h-bt').textContent = title;
    this.banner.classList.toggle('on', on);
  }

  update(dt, race, me, hands, audio) {
    // item slot / roulette
    if (me.roulette > 0) {
      this.rouletteT -= dt;
      if (this.rouletteT <= 0) {
        this.rouletteT = 0.07;
        this.rouletteIdx = ((this.rouletteIdx || 0) + 1) % ITEM_IDS.length;
        this.last.item = '';
        this.setItem(ITEM_IDS[this.rouletteIdx], 0, true);
        audio?.play('tick');
      }
    } else this.setItem(me.item, me.itemCount, false);

    const lap = `${Math.min(race.laps, me.lap)}/${race.laps}`;
    if (lap !== this.last.lap) {
      this.lapEl.textContent = lap; this.last.lap = lap;
      this.lapBox.classList.toggle('final', race.laps > 1 && me.lap >= race.laps);
      if (me.lap > 1) this.lapBox.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    const t = me.finished && !me.estimated ? me.finishTime : race.started ? race.raceTime : 0;
    this.timeEl.textContent = fmtTime(t);
    // a place must hold for a moment before the big number changes, so a close battle doesn't make it flicker
    if (me.place !== this.pendPlace) { this.pendPlace = me.place; this.pendT = 0; }
    this.pendT += dt;
    const showPlace = this.last.place === undefined || this.pendT > 0.3 || me.finished ? this.pendPlace : this.last.place;
    if (showPlace !== this.last.place) {
      this.last.place = showPlace;
      this.posN.textContent = showPlace;
      this.pos.className = 'h-pos' + (showPlace <= 3 ? ' p' + showPlace : '');
      this.pos.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    // ranking list order (only when it changes)
    const order = race.standings();
    const key = order.map((k) => k.index).join(',');
    if (key !== this.pendOrder) { this.pendOrder = key; this.orderT = 0; }
    this.orderT = (this.orderT || 0) + dt;
    if (key !== this.last.order && (this.orderT > 0.3 || this.last.order === undefined)) {
      this.last.order = key;
      order.forEach((k, i) => {
        const d = this.rows.get(k);
        d.querySelector('.p').textContent = i + 1;
        d.style.order = i;
      });
      this.rank.replaceChildren(...order.map((k) => this.rows.get(k)));
    }
    this.warn.classList.toggle('on', me.wrongWay > 1.2 && !me.finished);
    this.speedfx.classList.toggle('on', me.boost > 0.25 || me.comet > 0);

    // minimap
    const c = this.mctx, W = this.map.width;
    c.clearRect(0, 0, W, W);
    c.drawImage(this.mapBg, 0, 0);
    for (const k of [...race.karts].reverse()) {
      if (k === me) continue;
      const [x, y] = this.mapT(k.pos.x, k.pos.z);
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2);
      c.fillStyle = k.char.kart; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    }
    for (const s of race.items.shots) {
      const [x, y] = this.mapT(s.pos.x, s.pos.z);
      c.fillStyle = s.kind === 'homing' ? '#f4ff6e' : '#7fe3ff';
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
    }
    const [mx, my] = this.mapT(me.pos.x, me.pos.z);
    c.save(); c.translate(mx, my); c.rotate(-me.heading + Math.PI);
    c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 11); c.lineTo(-11, 11); c.closePath();
    c.fillStyle = '#ffd93b'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#2a1b5e'; c.stroke();
    c.restore();

    // camera preview
    if (hands && hands.ready && this.cam.classList.contains('on')) {
      this.camT = (this.camT || 0) + dt;
      if (this.camT > 1 / 20) { this.camT = 0; hands.drawPreview(this.camCv, hands.ctl.steer); }
      this.cam.classList.toggle('nohands', hands.hands.length === 0 && race.started);
    }
  }
}
