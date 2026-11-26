// js/targets.js — what flies at you, designed to be read at a glance:
//   colour         which hand: teal = left, coral = right (the gloves have the same colours)
//   face icon      how to punch: ◎ bullseye = straight, curved arrow = hook (swing in from the side),
//                  up arrow = uppercut (from below)
//   tag on top     when it lands: "1"–"4" on the beat (表拍), "ウラ" halfway between beats (裏拍),
//                  "16ウラ" on the sixteenth offbeats
//   closing ring   shrinks onto the orb and touches it exactly on the beat
//   branch         a mossy branch at head height: duck under it (always on a downbeat)
// Plus the hit zones: two faint rings floating where straight punches meet the targets.
import * as THREE from 'three';
import { canvasTexture, FONT, roundRect } from './util.js';

export const HAND_COLOR = { L: '#1fd1bd', R: '#ff6f4a' };
export const SUB_COLOR = { on: '#ffffff', and: '#ffc94a', six: '#ff8fdc' };
export const BADGE = { on: null, and: 'ウラ', six: '16ウラ' };

const ICONS = ['straight', 'hookL', 'hookR', 'upper'];

// short explanations that ride on the first few targets of each kind (js/game.js decides when)
export const HINTS = {
  straightL: '左手（青緑）でまっすぐ打つ',
  straightR: '右手（オレンジ）でまっすぐ打つ',
  hookL: '左フック：左から横に振る',
  hookR: '右フック：右から横に振る',
  upperL: '左アッパー：下から上へ',
  upperR: '右アッパー：下から上へ',
  on: '数字＝その拍ちょうどで打つ',
  and: 'ウラ＝拍と拍のまん中で打つ',
  six: '16ウラ＝もっと細かいウラ',
  duck: 'しゃがんでくぐる',
  ring: '外の輪が重なった瞬間に！',
};
const HINT_KEYS = Object.keys(HINTS);
function hintAtlas() {
  const W = 1024, H = 128;
  const { ctx, tex } = canvasTexture(W, H * 16);
  HINT_KEYS.forEach((k, i) => {
    const y = i * H + H / 2;
    ctx.font = `800 64px ${FONT}`;
    const w = Math.min(W - 16, ctx.measureText(HINTS[k]).width + 80);
    ctx.fillStyle = 'rgba(10,24,20,0.82)';
    roundRect(ctx, W / 2 - w / 2, y - 48, w, 96, 48);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(HINTS[k], W / 2, y + 3);
  });
  return tex;
}

// ---- textures, drawn once on canvases ----
export function drawIcon(x, kind, cx, cy, s) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s); // the drawing spans about ±42 units
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const stroke = (w, c) => { x.lineWidth = w; x.strokeStyle = c; x.stroke(); };
  const both = () => { stroke(17, 'rgba(8,20,30,0.55)'); stroke(9, '#ffffff'); };
  if (kind === 'straight') {
    x.beginPath(); x.arc(0, 0, 34, 0, Math.PI * 2); both();
    x.beginPath(); x.arc(0, 0, 15, 0, Math.PI * 2); x.fillStyle = 'rgba(8,20,30,0.45)'; x.fill();
    x.beginPath(); x.arc(0, 0, 11, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
  } else if (kind === 'hookL' || kind === 'hookR') {
    const s2 = kind === 'hookL' ? 1 : -1; // left hand swings to the right
    x.scale(s2, 1);
    x.beginPath(); x.moveTo(-36, 20); x.quadraticCurveTo(-30, -30, 22, -22); both();
    x.beginPath(); x.moveTo(40, -18); x.lineTo(14, -38); x.lineTo(16, -6); x.closePath();
    x.lineWidth = 8; x.strokeStyle = 'rgba(8,20,30,0.55)'; x.stroke(); x.fillStyle = '#ffffff'; x.fill();
  } else if (kind === 'upper') {
    x.beginPath(); x.moveTo(0, 38); x.lineTo(0, -12); both();
    x.beginPath(); x.moveTo(0, -42); x.lineTo(-22, -10); x.lineTo(22, -10); x.closePath();
    x.lineWidth = 8; x.strokeStyle = 'rgba(8,20,30,0.55)'; x.stroke(); x.fillStyle = '#ffffff'; x.fill();
  }
  x.restore();
}

// a rounded tag with the count: "1"–"4" white, "ウラ" gold, "16ウラ" pink
export function drawBadge(x, label, sub, cx, cy, h) {
  const col = SUB_COLOR[sub];
  x.font = `900 ${Math.round(h * 0.7)}px ${FONT}`;
  const w = Math.max(h * 1.25, x.measureText(label).width + h * 0.7);
  x.fillStyle = 'rgba(8,20,30,0.55)';
  roundRect(x, cx - w / 2 - 4, cy - h / 2 - 4, w + 8, h + 8, (h + 8) / 2);
  x.fill();
  x.fillStyle = col;
  roundRect(x, cx - w / 2, cy - h / 2, w, h, h / 2);
  x.fill();
  x.fillStyle = '#10231b';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, cx, cy + h * 0.04);
}

function iconAtlas() {
  const C = 256;
  const { ctx, tex } = canvasTexture(C * 4, C);
  ICONS.forEach((k, i) => drawIcon(ctx, k, i * C + C / 2, C / 2, 2.1));
  return tex;
}

export const BADGES = [['1', 'on'], ['2', 'on'], ['3', 'on'], ['4', 'on'], ['ウラ', 'and'], ['16ウラ', 'six']];
function badgeAtlas() {
  const W = 256, H = 128;
  const { ctx, tex } = canvasTexture(W * 2, H * 4);
  BADGES.forEach(([l, s], i) => drawBadge(ctx, l, s, (i % 2) * W + W / 2, Math.floor(i / 2) * H + H / 2, 84));
  return tex;
}

function softTex(draw, size = 128) {
  const { ctx, tex } = canvasTexture(size, size);
  draw(ctx, size);
  return tex;
}
const glowTex = () => softTex((x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
});
export const ringTex = () => softTex((x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, s * 0.36, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
}, 256);
const trailTex = () => softTex((x, s) => {
  const g = x.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const h = x.createLinearGradient(0, 0, s, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = h; x.fillRect(0, 0, s, s);
}, 64);

// glossy glowing orb: soft key light from above-left, bright rim (fresnel), colour per hand
function orbMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uNear: { value: 0 }, uDim: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uNear, uDim;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        vec3 l = normalize(vec3(-0.45, 0.75, 0.55));
        float dif = 0.5 + 0.5 * max(dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(-l, n), v), 0.0), 28.0);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 2.2);
        vec3 c = uColor * (0.45 + 0.65 * dif) + vec3(1.0) * spec * 0.55;
        c += mix(uColor, vec3(1.0), 0.45) * fres * (0.75 + 0.9 * uNear);
        c += uColor * uNear * 0.35;
        c = mix(c, vec3(dot(c, vec3(0.33))) * 0.6, uDim);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class Targets {
  constructor(parent) {
    this.parent = parent;
    this.icons = iconAtlas();
    this.badges = badgeAtlas();
    this.glowT = glowTex();
    this.ringT = ringTex();
    this.trailT = trailTex();
    this.orbGeo = new THREE.IcosahedronGeometry(0.1, 4);
    this.rimGeo = new THREE.TorusGeometry(0.118, 0.008, 8, 64);
    this.iconGeo = new THREE.PlaneGeometry(0.15, 0.15);
    this.badgeGeo = new THREE.PlaneGeometry(0.13, 0.065);
    this.glowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    this.ringGeo = new THREE.PlaneGeometry(0.3, 0.3);
    this.trailGeo = new THREE.PlaneGeometry(0.15, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2); // lies flat, extends toward -z (behind)
    this.shadowGeo = new THREE.CircleGeometry(0.1, 24).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false });
    this.rimMat = {};
    for (const k of Object.keys(SUB_COLOR)) this.rimMat[k] = new THREE.MeshBasicMaterial({ color: SUB_COLOR[k], toneMapped: false });
    // branch to duck under
    this.logGeo = new THREE.CylinderGeometry(0.07, 0.085, 2.2, 10).rotateZ(Math.PI / 2);
    this.logMat = new THREE.MeshLambertMaterial({ color: '#7a5634', flatShading: true });
    this.leafGeo = new THREE.IcosahedronGeometry(0.13, 0);
    this.leafMat = new THREE.MeshLambertMaterial({ color: '#5f9a3a', flatShading: true });
    this.warnMat = new THREE.MeshBasicMaterial({ color: '#ff5d3a', transparent: true, opacity: 0.4, depthWrite: false });
    this.pool = [];
    this.logPool = [];
    this.zones = this._zones();
    this.hintAtlas = hintAtlas();
    this.hintGeo = new THREE.PlaneGeometry(0.48, 0.06);
    this.hints = [];
  }

  // put an explanation above a target (key from HINTS)
  hint(t, key) {
    let h = this.hints.find((x) => !x.visible);
    if (!h) {
      const tex = this.hintAtlas.clone();
      tex.repeat.set(1, 1 / 16);
      h = new THREE.Mesh(this.hintGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      h.renderOrder = 12;
      this.hints.push(h);
    }
    h.material.map.offset.set(0, 1 - (HINT_KEYS.indexOf(key) + 1) / 16);
    h.position.set(0, t.log ? 0.24 : 0.25, 0.03);
    h.visible = true;
    t.g.add(h);
    t.hint = h;
  }

  _add(mat, geo, order) {
    const m = new THREE.Mesh(geo, mat);
    if (order) m.renderOrder = order;
    return m;
  }

  _make() {
    const g = new THREE.Group();
    const orb = this._add(orbMaterial(), this.orbGeo);
    const rim = this._add(this.rimMat.on, this.rimGeo);
    rim.position.z = 0.01;
    const additive = (tex, color) => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const glow = this._add(additive(this.glowT, '#ffffff'), this.glowGeo, 4);
    glow.position.z = -0.02;
    const iconTex = this.icons.clone();
    iconTex.repeat.set(1 / 4, 1);
    const icon = this._add(new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false, toneMapped: false }), this.iconGeo, 6);
    icon.position.z = 0.1;
    const badgeTex = this.badges.clone();
    badgeTex.repeat.set(1 / 2, 1 / 4);
    const badge = this._add(new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, depthWrite: false, toneMapped: false }), this.badgeGeo, 6);
    badge.position.set(0, 0.155, 0.02);
    const ring = this._add(additive(this.ringT, '#ffffff'), this.ringGeo, 5);
    ring.position.z = 0.04;
    const trail = this._add(additive(this.trailT, '#ffffff'), this.trailGeo, 3);
    trail.position.z = -0.06;
    g.add(trail, glow, orb, rim, icon, badge, ring);
    const shadow = this._add(this.shadowMat, this.shadowGeo, 1);
    this.parent.add(g, shadow);
    return { g, orb, rim, glow, icon, badge, ring, trail, shadow, iconTex, badgeTex, note: null };
  }

  spawn(note) {
    if (note.kind === 'duck') return this._spawnLog(note);
    const t = this.pool.find((p) => !p.note) || (this.pool.push(this._make()), this.pool[this.pool.length - 1]);
    t.note = note;
    note.obj = t;
    const col = new THREE.Color(HAND_COLOR[note.hand]);
    t.orb.material.uniforms.uColor.value.copy(col);
    t.orb.material.uniforms.uNear.value = 0;
    t.orb.material.uniforms.uDim.value = 0;
    t.glow.material.color.copy(col);
    t.trail.material.color.copy(col);
    t.rim.material = this.rimMat[note.sub];
    t.ring.material.color.set(SUB_COLOR[note.sub]);
    const kind = note.kind === 'hook' ? (note.hand === 'L' ? 'hookL' : 'hookR') : note.kind === 'upper' ? 'upper' : 'straight';
    t.iconTex.offset.set(ICONS.indexOf(kind) / 4, 0);
    const bi = note.sub === 'on' ? Number(note.label) - 1 : note.sub === 'and' ? 4 : 5;
    t.badgeTex.offset.set((bi % 2) / 2, 1 - (Math.floor(bi / 2) + 1) / 4);
    t.g.visible = t.shadow.visible = true;
    t.g.scale.setScalar(0.01);
    t.g.rotation.set(0, 0, 0);
    for (const m of [t.ring, t.glow, t.trail, t.icon, t.badge]) m.visible = true;
    return t;
  }

  // per frame: where it is, how far from its beat (tau, s), how long since it appeared (age, s), speed (m/s)
  place(t, p, tau, age, speed, songT) {
    t.g.position.copy(p);
    t.shadow.position.set(p.x, 0.013, p.z);
    if (t.log) return;
    const near = 1 - Math.min(1, Math.max(0, tau) / 0.6);
    t.g.scale.setScalar(Math.min(1, 0.05 + age * 4));
    t.orb.material.uniforms.uNear.value = near;
    t.orb.rotation.y = songT * 1.3;
    t.glow.material.opacity = 0.35 + near * 0.5;
    t.glow.scale.setScalar(0.8 + near * 0.45);
    t.ring.visible = tau > -0.03 && tau < 0.75;
    const rs = 1 + Math.max(0, tau) * 3.2;
    t.ring.scale.setScalar(rs * 0.82);
    t.ring.material.opacity = Math.min(1, (0.75 - tau) * 3) * 0.9;
    t.trail.scale.set(1, Math.min(1.6, speed * 0.12), 1);
    t.trail.material.opacity = Math.min(0.55, speed * 0.05);
  }

  miss(t) {
    t.orb.material.uniforms.uDim.value = 1;
    t.orb.material.uniforms.uNear.value = 0;
    for (const m of [t.ring, t.glow, t.trail, t.icon, t.badge]) m.visible = false;
  }

  _spawnLog(note) {
    let t = this.logPool.find((p) => !p.note);
    if (!t) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.logGeo, this.logMat));
      for (const [x, y, z, s] of [[-0.75, 0.06, 0.03, 1], [-0.2, 0.08, -0.02, 0.8], [0.4, 0.07, 0.04, 1.1], [0.9, 0.05, 0, 0.7], [0.05, -0.06, 0.05, 0.6]]) {
        const l = new THREE.Mesh(this.leafGeo, this.leafMat);
        l.position.set(x, y, z);
        l.scale.setScalar(s);
        g.add(l);
      }
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.32).rotateX(-Math.PI / 2), this.warnMat);
      warn.renderOrder = 1;
      this.parent.add(g, warn);
      t = { g, shadow: warn, note: null, log: true };
      this.logPool.push(t);
    }
    t.note = note;
    note.obj = t;
    t.g.visible = true;
    t.shadow.visible = true;
    t.g.scale.setScalar(1);
    return t;
  }

  release(t) {
    t.note = null;
    t.g.visible = false;
    t.shadow.visible = false;
    if (t.hint) { t.hint.visible = false; t.hint = null; }
  }

  clear() {
    for (const t of [...this.pool, ...this.logPool]) if (t.note) { t.note.obj = null; this.release(t); }
    this.zones.group.visible = false;
  }

  // the two places in the air where straight punches meet the targets
  _zones() {
    const group = new THREE.Group();
    const rings = {};
    for (const s of ['L', 'R']) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ map: this.ringT, color: HAND_COLOR[s], transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.scale.setScalar(0.9);
      m.renderOrder = 2;
      group.add(m);
      rings[s] = m;
    }
    group.visible = false;
    this.parent.add(group);
    return { group, rings };
  }

  showZones(eyeY, pos) {
    this.zones.rings.L.position.set(-pos.x, eyeY + pos.y, pos.z);
    this.zones.rings.R.position.set(pos.x, eyeY + pos.y, pos.z);
    this.zones.group.visible = true;
  }

  pulseZones(pulse) {
    for (const s of ['L', 'R']) {
      const m = this.zones.rings[s];
      m.material.opacity = 0.07 + pulse * 0.13;
      m.scale.setScalar(0.8 + pulse * 0.05);
    }
  }
}
