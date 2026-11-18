// js/vrmenu.js — the settings panel inside VR: the same items as the PC menu, drawn on a canvas, pointed at with
// either controller's ray and pressed with the trigger (sliders can be dragged, or nudged with − / +).
import * as THREE from 'three';
import { GROUPS, SETTINGS, formatValue } from './config.js';
import { CanvasPanel } from './hud.js';

const FONT = '"Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic",system-ui,sans-serif';
const W = 1024, Hh = 1280;

/** the items shown in a tab (move items only for the move mode they belong to) */
export function visibleItems(group, moveMode) {
  return SETTINGS.filter((s) => s.group === group && (!s.modes || s.modes.includes(moveMode)));
}

export class VrMenu {
  constructor(scene, settings, actions) {
    this.settings = settings;
    this.actions = actions;     // { resume, restart, recenter }
    this.panel = new CanvasPanel(W, Hh, 0.8, 1.0, { transparent: true });
    this.panel.mesh.renderOrder = 20;
    this.panel.mesh.visible = false;
    scene.add(this.panel.mesh);
    this.tab = 'play';
    this.widgets = [];
    this.hover = null; this.drag = null; this.helpKey = null;
    this.open = false;
    // pointer: a laser and a dot
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fffd4, transparent: true, opacity: 0.8 }));
    this.laser.visible = false;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.dot.visible = false;
    scene.add(this.laser, this.dot);
    this.ray = new THREE.Raycaster();
    this.version = 0;
    settings.onChange(() => { this.version++; });
  }

  show(camera) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    camera.getWorldPosition(p); camera.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; f.normalize();
    this.panel.mesh.position.copy(p).addScaledVector(f, 0.85); this.panel.mesh.position.y = p.y - 0.12;
    this.panel.mesh.lookAt(p.x, this.panel.mesh.position.y, p.z);
    this.panel.mesh.visible = true;
    this.open = true;
    this.dirty = false;
    this.snapshot = JSON.stringify(['mode', 'level', 'sets', 'games', 'surface', 'noAd', 'firstServe', 'hand'].map((k) => this.settings.get(k)));
    this.redraw(true);
  }
  hide() {
    this.panel.mesh.visible = false; this.laser.visible = false; this.dot.visible = false;
    this.open = false;
    const now = JSON.stringify(['mode', 'level', 'sets', 'games', 'surface', 'noAd', 'firstServe', 'hand'].map((k) => this.settings.get(k)));
    return now !== this.snapshot;   // the session should restart
  }

  redraw(force) {
    const key = [this.tab, this.version, this.hover && this.hover.id, this.helpKey, force ? Math.random() : 0].join('|');
    this.panel.draw(key, (g) => this.paint(g));
  }

  paint(g) {
    const S = this.settings;
    const ws = (this.widgets = []);
    let id = 0;
    const wdg = (x, y, w, h, kind, extra = {}) => { const o = { id: id++, x, y, w, h, kind, ...extra }; ws.push(o); return o; };
    const hov = (o) => this.hover && this.hover.id === o.id;
    g.clearRect(0, 0, W, Hh);
    rr(g, 0, 0, W, Hh, 36); g.fillStyle = 'rgba(9,16,28,0.94)'; g.fill();
    g.strokeStyle = 'rgba(127,255,212,0.45)'; g.lineWidth = 4; g.stroke();
    g.textBaseline = 'middle';
    g.font = `900 46px ${FONT}`; g.fillStyle = '#ffffff'; g.textAlign = 'left';
    g.fillText('RALLY COURT　設定', 36, 52);
    // tabs
    const tw = (W - 40) / GROUPS.length;
    GROUPS.forEach(([k, label], i) => {
      const o = wdg(20 + i * tw, 92, tw - 8, 64, 'tab', { value: k });
      rr(g, o.x, o.y, o.w, o.h, 14);
      g.fillStyle = this.tab === k ? '#7fffd4' : hov(o) ? '#2b3c58' : '#18243a'; g.fill();
      g.fillStyle = this.tab === k ? '#0a1422' : '#d9e6f7'; g.font = `800 32px ${FONT}`; g.textAlign = 'center';
      g.fillText(label, o.x + o.w / 2, o.y + o.h / 2);
    });
    // rows
    const items = visibleItems(this.tab, S.get('moveMode'));
    const rowH = Math.min(78, 900 / Math.max(1, items.length));
    let y = 176;
    for (const s of items) {
      const v = S.get(s.key);
      const rowHover = this.hover && this.hover.key === s.key;
      if (rowHover || this.helpKey === s.key) { g.fillStyle = 'rgba(127,255,212,0.07)'; g.fillRect(16, y, W - 32, rowH - 6); }
      g.textAlign = 'left'; g.font = `700 ${rowH > 64 ? 31 : 27}px ${FONT}`; g.fillStyle = S.isDefault(s.key) ? '#e8f1ff' : '#ffd23f';
      g.fillText(s.label, 32, y + rowH / 2 - 3, 440);
      const cx = 480, cw = W - cx - 30, cy = y + 8, ch = rowH - 22;
      if (s.type === 'choice') {
        const n = s.options.length, bw = cw / n;
        s.options.forEach(([ov, ol], i) => {
          const o = wdg(cx + i * bw, cy, bw - 6, ch, 'choice', { key: s.key, value: ov });
          rr(g, o.x, o.y, o.w, o.h, 10);
          g.fillStyle = ov === v ? '#7fffd4' : hov(o) ? '#2b3c58' : '#18243a'; g.fill();
          g.fillStyle = ov === v ? '#0a1422' : '#d9e6f7'; g.textAlign = 'center';
          const fs = ol.length > 6 ? 22 : ol.length > 4 ? 25 : 28;
          g.font = `700 ${fs}px ${FONT}`; g.fillText(ol, o.x + o.w / 2, o.y + o.h / 2, o.w - 8);
        });
      } else if (s.type === 'toggle') {
        const o = wdg(cx + cw - 130, cy, 130, ch, 'toggle', { key: s.key });
        rr(g, o.x, o.y, o.w, o.h, o.h / 2); g.fillStyle = v ? '#2fbf8f' : '#3a465a'; g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(v ? o.x + o.w - o.h / 2 : o.x + o.h / 2, o.y + o.h / 2, o.h / 2 - 6, 0, Math.PI * 2); g.fill();
        g.textAlign = 'right'; g.font = `700 28px ${FONT}`; g.fillStyle = '#d9e6f7'; g.fillText(v ? 'オン' : 'オフ', o.x - 16, o.y + o.h / 2);
      } else {
        const minus = wdg(cx, cy, 56, ch, 'step', { key: s.key, dir: -1 });
        const plus = wdg(cx + 330, cy, 56, ch, 'step', { key: s.key, dir: 1 });
        for (const [o, t] of [[minus, '−'], [plus, '+']]) {
          rr(g, o.x, o.y, o.w, o.h, 10); g.fillStyle = hov(o) ? '#2b3c58' : '#18243a'; g.fill();
          g.fillStyle = '#ffffff'; g.font = `800 34px ${FONT}`; g.textAlign = 'center'; g.fillText(t, o.x + o.w / 2, o.y + o.h / 2);
        }
        const tr = wdg(cx + 66, cy, 254, ch, 'slider', { key: s.key, min: s.min, max: s.max, step: s.step });
        const k = (v - s.min) / (s.max - s.min);
        const ty = tr.y + tr.h / 2;
        g.fillStyle = '#26344d'; rr(g, tr.x, ty - 6, tr.w, 12, 6); g.fill();
        g.fillStyle = '#7fffd4'; rr(g, tr.x, ty - 6, tr.w * k, 12, 6); g.fill();
        const dk = (s.def - s.min) / (s.max - s.min);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(tr.x + tr.w * dk - 2, ty - 16, 4, 32);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(tr.x + tr.w * k, ty, 16, 0, Math.PI * 2); g.fill();
        g.textAlign = 'right'; g.font = `800 28px ${FONT}`; g.fillStyle = S.isDefault(s.key) ? '#ffffff' : '#ffd23f';
        g.fillText(formatValue(s, v), W - 30, ty, cw - 400);
      }
      y += rowH;
    }
    // help
    const hk = this.helpKey || (this.hover && this.hover.key);
    const hs = SETTINGS.find((s) => s.key === hk);
    g.textAlign = 'left'; g.font = `500 25px ${FONT}`; g.fillStyle = '#b8c7dc';
    const helpText = hs ? (hs.help || hs.label) + `（初期値 ${formatValue(hs, hs.def)}）` : '項目を指すと説明が出ます。黄色は初期値から変えた項目、白い目盛りは初期値です。';
    wrap(g, helpText, 32, 1092, W - 64, 32, 3);
    // footer
    const btns = [['resume', '再開（B / Y）'], ['restart', '最初から'], ['recenter', '向きリセット'], ['reset', 'このタブを初期値に']];
    const bw = (W - 40) / btns.length;
    btns.forEach(([k, label], i) => {
      const o = wdg(20 + i * bw, 1196, bw - 10, 64, 'action', { value: k });
      rr(g, o.x, o.y, o.w, o.h, 14);
      g.fillStyle = k === 'resume' ? '#2fbf8f' : hov(o) ? '#2b3c58' : '#18243a'; g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = `800 27px ${FONT}`; g.fillText(label, o.x + o.w / 2, o.y + o.h / 2, o.w - 10);
    });
  }

  /** hands: input.hands. Returns true if the panel used the input this frame */
  update(input) {
    if (!this.open) return false;
    let best = null;
    for (const side of ['right', 'left']) {
      const h = input.hands[side];
      if (!h.tracked) continue;
      const o = h.ray.position, d = new THREE.Vector3(0, 0, -1).applyQuaternion(h.ray.quaternion);
      this.ray.set(o, d);
      const hit = this.ray.intersectObject(this.panel.mesh, false)[0];
      if (hit && (!best || h.trigger > 0.5 || (this.activeSide === side))) best = { side, hit, h, o };
      if (hit && h.pressed.trigger) this.activeSide = side;
    }
    if (!best) { this.laser.visible = this.dot.visible = false; if (this.hover) { this.hover = null; this.redraw(); } return true; }
    const { hit, h, o } = best;
    this.laser.visible = this.dot.visible = true;
    this.laser.position.copy(o); this.laser.quaternion.copy(h.ray.quaternion); this.laser.scale.set(1, 1, hit.distance);
    this.dot.position.copy(hit.point);
    const px = hit.uv.x * W, py = (1 - hit.uv.y) * Hh;
    this.pointer(px, py, h.pressed.trigger, h.trigger > 0.5, h.released.trigger);
    return true;
  }

  /** pointer at canvas (px, py): down/held/up of the button */
  pointer(px, py, down, held, up) {
    const w = this.widgets.find((o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) || null;
    if ((w && w.id) !== (this.hover && this.hover.id)) { this.hover = w; if (w && w.key) this.helpKey = w.key; this.redraw(); }
    if (this.drag && held) { this.setSlider(this.drag, px); return; }
    if (up) this.drag = null;
    if (!down || !w) return;
    const S = this.settings;
    if (w.kind === 'tab') { this.tab = w.value; this.helpKey = null; }
    else if (w.kind === 'choice') S.set(w.key, w.value);
    else if (w.kind === 'toggle') S.set(w.key, !S.get(w.key));
    else if (w.kind === 'step') { const s = SETTINGS.find((x) => x.key === w.key); S.set(w.key, round(S.get(w.key) + w.dir * s.step, s.step)); }
    else if (w.kind === 'slider') { this.drag = w; this.setSlider(w, px); }
    else if (w.kind === 'action') {
      if (w.value === 'reset') S.reset(this.tab);
      else this.actions[w.value] && this.actions[w.value]();
    }
    this.redraw(true);
  }
  setSlider(w, px) {
    const k = Math.min(1, Math.max(0, (px - w.x) / w.w));
    const v = round(w.min + k * (w.max - w.min), w.step);
    if (v !== this.settings.get(w.key)) { this.settings.set(w.key, v); this.redraw(true); }
  }
}

function round(v, step) { const r = Math.round(v / step) * step; return Number(r.toFixed(4)); }
function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
  }
  lines.slice(0, maxLines).forEach((l, i) => g.fillText(i === maxLines - 1 && lines.length > maxLines ? l.slice(0, -1) + '…' : l, x, y + i * lh));
}
