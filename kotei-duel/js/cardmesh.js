// js/cardmesh.js — a card as a three.js object: a thin rounded slab with the face drawn on a canvas
// (frame colour by type, name with furigana, cost, the art drawn in code, the text, the numbers) and a shared back.
// Faces are cached per card id + options, so 40 cards on the table cost 40 small textures at most.
import * as THREE from 'three';
import { canvasTex } from './board.js';
import { FONT, layout, drawLines, fit, plain } from './text.js';
import { drawArt } from './art.js';

export const CARD_W = 0.063 * 1.6; // metres on the table (a bit bigger than a real card so it reads in VR)
export const CARD_H = 0.088 * 1.6;
const PX_W = 512, PX_H = 716;

// rounded-rectangle shape for the card slab
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

let shared = null;
function sharedGeo() {
  if (shared) return shared;
  const shape = roundedRect(CARD_W, CARD_H, 0.006);
  const face = new THREE.ShapeGeometry(shape, 6);
  // uv from position
  const pos = face.attributes.position, uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  const edge = new THREE.ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: false, curveSegments: 6 });
  edge.translate(0, 0, -0.0008);
  shared = { face, edge, edgeMat: new THREE.MeshStandardMaterial({ color: '#d9dde8', roughness: 0.7 }), back: null };
  return shared;
}

// the back of every card: a dark-blue V (the V-model) on a circuit pattern
function backTexture() {
  const g = sharedGeo();
  if (g.back) return g.back;
  const { ctx: c, tex } = canvasTex(PX_W, PX_H);
  const grd = c.createLinearGradient(0, 0, PX_W, PX_H);
  grd.addColorStop(0, '#13265c'); grd.addColorStop(1, '#0a1433');
  c.fillStyle = grd; c.fillRect(0, 0, PX_W, PX_H);
  c.strokeStyle = 'rgba(120,180,255,0.18)'; c.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % PX_W, y = (i * 173) % PX_H;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 60, y); c.lineTo(x + 90, y + 30); c.lineTo(x + 90, y + 90); c.stroke();
    c.beginPath(); c.arc(x + 90, y + 94, 5, 0, Math.PI * 2); c.stroke();
  }
  c.strokeStyle = '#ffcf3f'; c.lineWidth = 10;
  c.beginPath(); c.roundRect(18, 18, PX_W - 36, PX_H - 36, 26); c.stroke();
  // the V
  c.lineWidth = 34; c.lineCap = 'round'; c.lineJoin = 'round';
  const v = c.createLinearGradient(0, 200, 0, 520);
  v.addColorStop(0, '#7fe3ff'); v.addColorStop(1, '#ffcf3f');
  c.strokeStyle = v;
  c.beginPath(); c.moveTo(130, 230); c.lineTo(256, 500); c.lineTo(382, 230); c.stroke();
  c.fillStyle = '#ffffff'; c.font = `900 50px ${FONT}`; c.textAlign = 'center';
  c.fillText('KOTEI', PX_W / 2, 150); c.fillText('DUEL', PX_W / 2, 610);
  g.back = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  return g.back;
}

// frame colours per card type (the design can add more)
export const TYPE_STYLE = {
  unit: { frame: '#2f6fe0', frame2: '#1b3f8f', label: 'ユニット' },
  skill: { frame: '#18a77a', frame2: '#0e6a4d', label: 'スキル' },
  guard: { frame: '#c2407a', frame2: '#7d2150', label: 'ガード' },
  doc: { frame: '#c98a1b', frame2: '#7d540c', label: 'ドキュメント' },
  enemy: { frame: '#7a3fd0', frame2: '#4a2287', label: 'トラブル' },
  event: { frame: '#d4541f', frame2: '#86300c', label: 'イベント' },
  bug: { frame: '#b8202a', frame2: '#6d0f15', label: 'バグ' },
  lesson: { frame: '#e8b53a', frame2: '#8a6411', label: '教訓' },
};

const faceCache = new Map();

// draw the face of a card into a canvas. card: { id, name, en, type, cost, text, stats: [{label, value, color}], art, phase }
export function drawFace(c, card, opts = {}) {
  const W = PX_W, H = PX_H;
  const st = TYPE_STYLE[card.type] || TYPE_STYLE.unit;
  const ruby = opts.ruby !== false;
  c.clearRect(0, 0, W, H);
  // frame
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, st.frame); g.addColorStop(1, st.frame2);
  c.fillStyle = g;
  c.beginPath(); c.roundRect(0, 0, W, H, 30); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 6;
  c.beginPath(); c.roundRect(10, 10, W - 20, H - 20, 24); c.stroke();
  // name bar
  c.fillStyle = 'rgba(255,255,255,0.93)';
  c.beginPath(); c.roundRect(22, 22, W - 44, 96, 16); c.fill();
  const nameW = W - 44 - 24 - (card.cost != null ? 74 : 0);
  const L = fit(c, card.name, nameW, 88, 42, { ruby, weight: 900, minSize: 22 });
  const nh = L.length * L.lineH;
  drawLines(c, L, 34, 22 + (96 - nh) / 2, { color: '#121a30', rubyColor: '#3b4a72' });
  // cost gem
  if (card.cost != null) {
    const cx = W - 62, cy = 70;
    const cg = c.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 40);
    cg.addColorStop(0, '#fff6c9'); cg.addColorStop(1, '#e0a619');
    c.fillStyle = cg;
    c.beginPath(); c.arc(cx, cy, 34, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7d540c'; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#3a2500'; c.font = `900 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(card.cost), cx, cy + 2);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  // type / phase line
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.roundRect(22, 126, W - 44, 38, 12); c.fill();
  c.fillStyle = '#ffffff'; c.font = `800 24px ${FONT}`;
  c.fillText(`${card.typeLabel || st.label}${card.phaseLabel ? '　' + plain(card.phaseLabel) : ''}`, 36, 154);
  if (card.en) { c.textAlign = 'right'; c.font = `italic 600 20px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText(card.en, W - 36, 153); c.textAlign = 'left'; }
  // art
  const ax = 30, ay = 172, aw = W - 60, ah = 250;
  c.save();
  c.beginPath(); c.roundRect(ax, ay, aw, ah, 14); c.clip();
  drawArt(c, card.art || {}, ax, ay, aw, ah, st);
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3;
  c.beginPath(); c.roundRect(ax, ay, aw, ah, 14); c.stroke();
  // text box
  const tx = 26, ty = 432, tw = W - 52, th = (card.stats && card.stats.length ? 196 : 258);
  c.fillStyle = 'rgba(250,247,238,0.96)';
  c.beginPath(); c.roundRect(tx, ty, tw, th, 14); c.fill();
  const body = card.text || '';
  const TL = fit(c, body, tw - 26, th - 16, 27, { ruby, minSize: 15 });
  drawLines(c, TL, tx + 13, ty + 8, { color: '#1b1f2c', rubyColor: '#56607a', bold: '#a23a00' });
  // stats
  if (card.stats && card.stats.length) {
    const n = card.stats.length;
    const sw = (W - 52 - (n - 1) * 10) / n;
    card.stats.forEach((s, i) => {
      const x = 26 + i * (sw + 10), y = H - 76;
      c.fillStyle = s.bg || 'rgba(0,0,0,0.45)';
      c.beginPath(); c.roundRect(x, y, sw, 54, 14); c.fill();
      c.fillStyle = s.color || '#ffffff';
      c.font = `800 22px ${FONT}`; c.textBaseline = 'middle';
      c.fillText(plain(s.label), x + 12, y + 28);
      c.font = `900 36px ${FONT}`; c.textAlign = 'right';
      c.fillText(String(s.value), x + sw - 12, y + 29);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    });
  }
}

export function faceTexture(card, opts = {}) {
  const key = `${card.id}|${opts.ruby !== false}|${card.faceKey || ''}`;
  let t = faceCache.get(key);
  if (t) return t;
  const { ctx, tex } = canvasTex(PX_W, PX_H);
  drawFace(ctx, card, opts);
  t = tex;
  faceCache.set(key, t);
  return t;
}
export function clearFaceCache() { for (const t of faceCache.values()) t.dispose(); faceCache.clear(); }

// a card object: front face (+z), back face (−z), edge. userData.hit is set by the caller.
export class CardMesh extends THREE.Group {
  constructor(card, opts = {}) {
    super();
    const g = sharedGeo();
    this.card = card;
    this.front = new THREE.Mesh(g.face, new THREE.MeshStandardMaterial({ map: faceTexture(card, opts), roughness: 0.45, metalness: 0.0 }));
    this.front.position.z = 0.00085;
    this.back = new THREE.Mesh(g.face, backTexture());
    this.back.rotation.y = Math.PI;
    this.back.position.z = -0.00085;
    this.edge = new THREE.Mesh(g.edge, g.edgeMat);
    this.add(this.edge, this.front, this.back);
    // glow outline for selection / playable
    const glowShape = roundedRect(CARD_W + 0.012, CARD_H + 0.012, 0.01);
    this.glow = new THREE.Mesh(new THREE.ShapeGeometry(glowShape, 6), new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.0, depthWrite: false }));
    this.glow.position.z = -0.0012;
    this.glow.renderOrder = -1;
    this.add(this.glow);
    this.target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };
    this.glowColor = null;
  }
  setCard(card, opts = {}) {
    this.card = card;
    this.front.material.map = faceTexture(card, opts);
    this.front.material.needsUpdate = true;
  }
  setGlow(color, strength = 0.85) {
    if (!color) { this.glow.material.opacity = 0; this.glowColor = null; return; }
    this.glow.material.color.set(color);
    this.glow.material.opacity = strength;
    this.glowColor = color;
  }
  // ease toward the target pose
  tick(dt, k = 10) {
    const a = 1 - Math.exp(-k * dt);
    this.position.lerp(this.target.pos, a);
    this.quaternion.slerp(this.target.quat, a);
    const s = this.scale.x + (this.target.scale - this.scale.x) * a;
    this.scale.setScalar(s);
    if (this.glowColor) this.glow.material.opacity = 0.55 + 0.35 * Math.sin(performance.now() / 260);
  }
  snap() { this.position.copy(this.target.pos); this.quaternion.copy(this.target.quat); this.scale.setScalar(this.target.scale); }
}
