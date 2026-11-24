// js/vrui.js — what you see inside VR besides the world: the menu panel (B / Y), the wrist display on your
// left hand (height, speed, place), laser pointers, a toast line, and the comfort vignette.
import * as THREE from 'three';
import { MODES, SPEEDS } from './flight.js';

export const FONT = '"Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", system-ui, sans-serif';
const C = { glass: 'rgba(10,24,38,0.88)', line: 'rgba(255,255,255,0.16)', ink: '#f3f6fb', muted: '#a9bbcd', accent: '#7fd3ff', btn: 'rgba(255,255,255,0.08)', sel: '#7fd3ff', selInk: '#06203a', warn: '#ffcf6b' };

export function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

export class Panel {
  constructor(wPx, hPx, wM) {
    this.w = wPx; this.h = hPx; this.ppm = wPx / wM;
    this.canvas = document.createElement('canvas');
    this.canvas.width = wPx; this.canvas.height = hPx;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hPx / this.ppm), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: false, fog: false }));
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    this.buttons = [];
    this.hover = null;
    this.visible = false;
    this.mesh.visible = false;
  }
  show(on) { this.visible = on; this.mesh.visible = on; if (on) this.redraw(); }
  redraw() {
    this.buttons = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.draw(this.ctx);
    this.tex.needsUpdate = true;
  }
  draw() {}
  bg(x, r = 30) {
    x.fillStyle = C.glass;
    roundRect(x, 4, 4, this.w - 8, this.h - 8, r);
    x.fill();
    x.strokeStyle = C.line;
    x.lineWidth = 3;
    x.stroke();
  }
  text(x, s, px, py, size, color = C.ink, weight = 700, align = 'left', maxW) {
    x.font = `${weight} ${size}px ${FONT}`;
    x.fillStyle = color;
    x.textAlign = align;
    x.textBaseline = 'middle';
    x.fillText(s, px, py, maxW);
  }
  button(x, id, bx, by, bw, bh, label, { sel = false, sub = '', onClick, disabled = false } = {}) {
    if (!disabled) this.buttons.push({ id, x: bx, y: by, w: bw, h: bh, onClick });
    const hov = this.hover === id && !disabled;
    x.fillStyle = sel ? C.sel : hov ? 'rgba(255,255,255,0.2)' : C.btn;
    roundRect(x, bx, by, bw, bh, 16);
    x.fill();
    if (hov) { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 4; x.stroke(); }
    const ink = disabled ? 'rgba(255,255,255,0.35)' : sel ? C.selInk : C.ink;
    if (sub) {
      this.text(x, label, bx + 20, by + bh * 0.36, 30, ink, 800, 'left', bw - 36);
      this.text(x, sub, bx + 20, by + bh * 0.72, 20, sel ? 'rgba(6,32,58,0.75)' : C.muted, 500, 'left', bw - 36);
    } else this.text(x, label, bx + bw / 2, by + bh / 2 + 2, 28, ink, 800, 'center', bw - 16);
  }
  // world ray → { distance, point, button }
  pick(o, d) {
    if (!this.visible) return null;
    const m = this.mesh;
    m.updateWorldMatrix(true, false);
    const inv = m.matrixWorld.clone().invert();
    const lo = o.clone().applyMatrix4(inv), ld = d.clone().transformDirection(inv);
    if (Math.abs(ld.z) < 1e-6) return null;
    const t = -lo.z / ld.z;
    if (t < 0) return null;
    const p = lo.addScaledVector(ld, t);
    const W = this.w / this.ppm, H = this.h / this.ppm;
    const px = (p.x + W / 2) * this.ppm, py = (H / 2 - p.y) * this.ppm;
    if (px < 0 || py < 0 || px > this.w || py > this.h) return null;
    const point = p.applyMatrix4(m.matrixWorld);
    const button = this.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
    return { distance: point.distanceTo(o), point, button };
  }
  setHover(id) { if (id !== this.hover) { this.hover = id; this.redraw(); } }
}

// app must provide: areaChoices() → [{ id, name, sub, offline }], currentAreaId, flight, settings, actions
export class MenuPanel extends Panel {
  constructor(app) { super(1400, 940, 1.5); this.app = app; this.page = 0; }
  draw(x) {
    const a = this.app, f = a.flight, s = a.settings;
    this.bg(x);
    this.text(x, 'SKY ATLAS', 44, 60, 50, C.ink, 900);
    this.text(x, a.area ? `いま：${a.area.name}` : '', 360, 64, 28, C.accent, 700, 'left', 700);
    this.text(x, 'トリガーで選ぶ・B / Y で閉じる', this.w - 44, 62, 21, C.muted, 500, 'right');
    // places
    const list = a.areaChoices();
    const per = 10, pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.text(x, a.online ? '場所（★ = ダウンロード済み・オフラインで飛べる）' : '場所（ダウンロード済み）', 44, 128, 24, C.muted, 700);
    list.slice(this.page * per, this.page * per + per).forEach((c, i) => {
      const bx = 40 + (i % 2) * 330, by = 152 + Math.floor(i / 2) * 92;
      this.button(x, 'area:' + c.id, bx, by, 320, 82, (c.offline ? '★ ' : '') + c.name, { sel: c.id === a.currentId, sub: c.sub, onClick: () => a.flyTo(c.key) });
    });
    if (!list.length) this.text(x, 'まだありません。画面のメニューでダウンロードしてください', 44, 200, 24, C.warn, 600);
    if (pages > 1) {
      this.button(x, 'pg:prev', 40, 620, 150, 60, '◀ 前', { disabled: this.page === 0, onClick: () => { this.page--; this.redraw(); } });
      this.text(x, `${this.page + 1} / ${pages}`, 355, 650, 24, C.muted, 700, 'center');
      this.button(x, 'pg:next', 520, 620, 150, 60, '次 ▶', { disabled: this.page >= pages - 1, onClick: () => { this.page++; this.redraw(); } });
    }
    // options
    const X = 730, W = 630;
    const row = (label, y, opts) => {
      this.text(x, label, X, y, 24, C.muted, 700);
      const n = opts.length, bw = (W - (n - 1) * 8) / n;
      opts.forEach(([id, l, sel, fn, sub], i) => this.button(x, id, X + i * (bw + 8), y + 22, bw, sub ? 82 : 64, l, { sel, sub, onClick: fn }));
    };
    row('飛び方', 128, Object.entries(MODES).map(([k, m]) => ['mode:' + k, m.name, f.mode === k, () => a.setSetting('mode', k), m.sub]));
    row('最高速度', 262, Object.entries(SPEEDS).map(([k, m]) => ['speed:' + k, m.name, f.speedSetting === k, () => a.setSetting('speed', k)]));
    row('酔いどめ（動くと視野のまわりを暗く）', 378, [['vig:on', 'あり', s.vignette, () => a.setSetting('vignette', true)], ['vig:off', 'なし', !s.vignette, () => a.setSetting('vignette', false)]]);
    row('右スティックの回転', 494, [['snap:30', '30° ずつ', s.snap, () => a.setSetting('snap', true)], ['snap:smooth', 'なめらか', !s.snap, () => a.setSetting('snap', false)]]);
    this.button(x, 'home', X, 640, W / 2 - 4, 70, 'スタート地点へ', { onClick: () => a.respawn() });
    this.button(x, 'close', X + W / 2 + 4, 640, W / 2 - 4, 70, '閉じる', { onClick: () => a.toggleMenu(false) });
    this.button(x, 'exit', X, 724, W, 70, 'VR を終わる', { onClick: () => a.exitVR() });
    // help
    this.text(x, 'スーパーマン：トリガーを引くと手の向きへ飛ぶ（両手で速く）', 44, 740, 22, C.muted, 500, 'left', 670);
    this.text(x, 'つばさ：腕を広げ、傾けて曲がる・下げて急降下・上げて上昇', 44, 776, 22, C.muted, 500, 'left', 670);
    this.text(x, '左スティック：見ている方へ移動　右スティック：上下と回転　A / X：ブレーキ', 44, 812, 22, C.muted, 500, 'left', 670);
    const cr = a.creditsShort();
    this.text(x, cr, 44, 880, 17, 'rgba(255,255,255,0.45)', 500, 'left', this.w - 88);
  }
}

// on the back of the left hand: height, speed, place, compass
export class WristHud extends Panel {
  constructor() {
    super(512, 256, 0.16);
    this.mesh.material.depthTest = true;
    this.data = {};
    this.visible = true;
    this.mesh.visible = true;
  }
  set(d) {
    const k = `${d.alt}|${d.agl}|${d.kmh}|${d.name}|${d.dir}|${d.msg}`;
    if (k === this.key) return;
    this.key = k;
    this.data = d;
    this.redraw();
  }
  draw(x) {
    const d = this.data;
    this.bg(x, 26);
    this.text(x, d.name || '', 24, 38, 26, C.accent, 800, 'left', 380);
    this.text(x, d.dir || '', 488, 38, 26, C.ink, 800, 'right');
    this.text(x, `${d.kmh ?? 0}`, 24, 120, 74, C.ink, 900);
    this.text(x, 'km/h', 24 + (String(d.kmh ?? 0).length * 42) + 8, 132, 24, C.muted, 700);
    this.text(x, `標高 ${d.alt ?? 0} m`, 488, 102, 30, C.ink, 800, 'right');
    this.text(x, `地面から ${d.agl ?? 0} m`, 488, 146, 24, C.muted, 700, 'right');
    if (d.msg) this.text(x, d.msg, 24, 210, 24, C.warn, 800, 'left', 464);
  }
}

// a ring that darkens the edge of your view while you turn or speed up (reduces VR sickness)
export class Vignette {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, fog: false,
      uniforms: { uK: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uK; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0; float inner = mix(1.2, 0.42, uK);
          float a = smoothstep(inner, inner + 0.28, r) * min(1.0, uK * 1.6); gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), this.mat);
    this.mesh.position.set(0, 0, -0.3);
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
    this.k = 0;
  }
  update(dt, target, on) {
    const t = on ? Math.min(1, target) : 0;
    this.k += (t - this.k) * (1 - Math.exp(-dt * (t > this.k ? 8 : 3)));
    this.mat.uniforms.uK.value = this.k;
    this.mesh.visible = this.k > 0.01;
  }
}

export class Pointers {
  constructor(parent) {
    this.items = {};
    for (const s of ['L', 'R']) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.8, depthTest: false, fog: false }));
      line.renderOrder = 25;
      line.frustumCulled = false;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, fog: false }));
      dot.renderOrder = 26;
      parent.add(line, dot);
      line.visible = dot.visible = false;
      this.items[s] = { line, dot };
    }
  }
  // o, d: rig space ray; hit: { distance, pointLocal } | null
  set(side, on, o, d, len, hitLocal) {
    const P = this.items[side];
    P.line.visible = on;
    P.dot.visible = on && !!hitLocal;
    if (!on) return;
    P.line.position.copy(o);
    P.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
    P.line.scale.set(1, 1, len);
    if (hitLocal) P.dot.position.copy(hitLocal);
  }
}

// simple hands: a glove-ish shape, with wings that unfold in つばさ mode
export function makeHand(side) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), new THREE.MeshBasicMaterial({ color: side === 'L' ? 0x7fd3ff : 0xffb36b, fog: false }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wingShape = new THREE.Shape();
  const sx = side === 'L' ? -1 : 1;
  wingShape.moveTo(0, 0.02);
  wingShape.lineTo(sx * 0.55, 0.06);
  wingShape.lineTo(sx * 0.62, -0.02);
  wingShape.lineTo(sx * 0.25, -0.12);
  wingShape.lineTo(0, -0.08);
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  wing.rotation.x = -Math.PI / 2;
  wing.position.y = 0.01;
  g.add(wing);
  g.userData.wing = wing;
  return g;
}
