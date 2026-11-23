// courses/khmer.js — shared pieces for the Cambodia cup: lotus-bud temple towers (prangs), stepped terraces,
// tiered palace roofs with spires, bell stupas, seven-headed naga fans, the serene four-faced towers of the
// Bayon, sugar and coconut palms, flags and simple townhouses. Everything is stylised and toy-like.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, merge, canvasTexture } from '../engine/util.js';

// ---- lotus-bud tower: a body, then ever smaller rounded tiers up to a point (lathe, 8 sides)
export function prangGeometry({ tiers = 6, sides = 8, color = '#b9a98a', band = null } = {}) {
  const pts = [new THREE.Vector2(1.0, 0), new THREE.Vector2(1.0, 0.24), new THREE.Vector2(0.86, 0.27)];
  const y0 = 0.27, y1 = 0.95;
  for (let i = 0; i < tiers; i++) {
    const a = y0 + ((y1 - y0) * i) / tiers, b = y0 + ((y1 - y0) * (i + 1)) / tiers;
    const t = i / tiers, r = 0.86 * (1 - Math.pow(t, 1.25) * 0.82);
    const r2 = 0.86 * (1 - Math.pow((i + 1) / tiers, 1.25) * 0.82);
    pts.push(new THREE.Vector2(r * 1.06, a + (b - a) * 0.2), new THREE.Vector2(r * 1.0, a + (b - a) * 0.75), new THREE.Vector2(r2 * 0.92, b));
  }
  pts.push(new THREE.Vector2(0.07, 0.97), new THREE.Vector2(0.0, 1.0));
  const g = new THREE.LatheGeometry(pts, sides);
  g.rotateY(Math.PI / sides);
  if (band) paintBands(g, color, band);
  return g;
}

// vertex colours: the main colour with a second colour on the tier lips (where the radius steps out)
function paintBands(g, color, band) {
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(color), b = new THREE.Color(band);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
    const lip = y > 0.25 && y < 0.96 && ((y - 0.27) / (0.68 / 6)) % 1 < 0.22;
    const c = lip && r > 0.05 ? b : a;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---- bell stupa (Wat Phnom style): stepped base, bell, rings, spire
export function stupaGeometry({ sides = 16 } = {}) {
  const p = [[1, 0], [1, 0.08], [0.85, 0.08], [0.85, 0.16], [0.72, 0.16], [0.72, 0.24], [0.62, 0.26], [0.66, 0.34], [0.6, 0.46], [0.46, 0.55], [0.3, 0.6], [0.24, 0.62],
    [0.24, 0.66], [0.2, 0.66], [0.2, 0.7], [0.17, 0.72], [0.15, 0.74], [0.13, 0.78], [0.11, 0.8], [0.08, 0.86], [0.05, 0.93], [0.02, 0.99], [0, 1]];
  return new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), sides);
}

// ---- gabled roof prism (along z), pitch given by height; with curling finials at the ends
export function gableGeometry(w, d, h, color = '#d8582a', trim = '#e8b84a') {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(0, h); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const parts = [part(g, color)];
  const horn = new THREE.ConeGeometry(0.12 * w / 4, 0.7 * h, 6);
  for (const z of [-d / 2, d / 2]) {
    parts.push(part(horn, trim, [0, h + 0.28 * h, z], [z > 0 ? 0.5 : -0.5, 0, 0]));
    for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.06 * w, 0.06 * w, Math.hypot(w / 2, h)), trim, [s * w * 0.25, h * 0.5, z], [0, 0, 0]));
  }
  return merge(parts);
}

// tiered palace roof: stacked gables, each narrower and higher, crossed by a second set (cruciform plan)
export function palaceRoof({ w = 10, d = 24, tiers = 3, roof = '#d8582a', trim = '#f0c040', cross = true } = {}) {
  const parts = [];
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.18, y = i * w * 0.32;
    const g = gableGeometry(w * s, d * (1 - i * 0.22), w * 0.42 * s, i % 2 ? '#2f7a4a' : roof, trim);
    g.translate(0, y, 0);
    parts.push(g);
    if (cross) { const c = gableGeometry(w * s, d * 0.62 * (1 - i * 0.2), w * 0.42 * s, i % 2 ? '#2f7a4a' : roof, trim); c.rotateY(Math.PI / 2); c.translate(0, y + 0.02, 0); parts.push(c); }
  }
  return merge(parts);
}

// thin stacked spire (gilded), height 1
export function spireGeometry(color = '#f2c14e') {
  const p = [[0.5, 0], [0.5, 0.06], [0.42, 0.08], [0.44, 0.14], [0.34, 0.18], [0.36, 0.24], [0.27, 0.28], [0.29, 0.34], [0.2, 0.4], [0.22, 0.46], [0.14, 0.52], [0.15, 0.58], [0.09, 0.66], [0.07, 0.78], [0.04, 0.9], [0.0, 1]];
  return part(new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), 8), color);
}

// ---- the seven-headed naga fan that ends a balustrade (local +z faces outwards)
export function nagaGeometry(body = '#7d7462', hood = '#8d846f') {
  const parts = [];
  const neck = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 10);
  parts.push(part(neck, body, [0, 1.1, 0], [0.25, 0, 0]));
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.32;
    const head = new THREE.SphereGeometry(0.42, 10, 8);
    parts.push(part(head, hood, [Math.sin(a) * 1.25, 2.5 + Math.cos(a) * 1.0 - 0.6, 0.35], [0, 0, 0], [0.7, 1.0, 0.85]));
    parts.push(part(new THREE.ConeGeometry(0.25, 0.6, 8), hood, [Math.sin(a) * 1.25, 2.5 + Math.cos(a) * 1.0 - 0.15, 0.55], [Math.PI / 2.4, 0, 0]));
  }
  parts.push(part(new THREE.CircleGeometry(1.6, 18, 0, Math.PI), hood, [0, 2.0, 0.1], [0, 0, 0]));
  return merge(parts);
}

// ---- a serene face (the Bayon towers), optionally with neon eyes and lips. Square canvas
export function faceTexture({ stone = '#9d9378', dark = '#5e5544', neon = null } = {}) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = stone; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    // block courses
    ctx.strokeStyle = 'rgba(40,30,20,0.25)'; ctx.lineWidth = 2;
    for (let y = s / 8; y < s; y += s / 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    const line = neon || dark;
    ctx.strokeStyle = line; ctx.fillStyle = line; ctx.lineCap = 'round';
    ctx.lineWidth = neon ? 7 : 6;
    if (neon) { ctx.shadowColor = neon; ctx.shadowBlur = 14; }
    // crown band
    ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.2); ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.82, s * 0.2); ctx.stroke();
    // brows
    for (const x of [0.34, 0.66]) { ctx.beginPath(); ctx.arc(s * x, s * 0.44, s * 0.12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    // closed eyes (downcast arcs)
    for (const x of [0.34, 0.66]) { ctx.beginPath(); ctx.arc(s * x, s * 0.43, s * 0.08, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    // nose
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.45); ctx.lineTo(s * 0.46, s * 0.63); ctx.quadraticCurveTo(s * 0.5, s * 0.67, s * 0.54, s * 0.63); ctx.stroke();
    // the smile
    ctx.lineWidth = neon ? 8 : 7;
    ctx.beginPath(); ctx.moveTo(s * 0.36, s * 0.74); ctx.quadraticCurveTo(s * 0.5, s * 0.84, s * 0.64, s * 0.74); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.75); ctx.quadraticCurveTo(s * 0.5, s * 0.72, s * 0.6, s * 0.75); ctx.stroke();
    // ears
    for (const x of [0.08, 0.92]) { ctx.beginPath(); ctx.ellipse(s * x, s * 0.55, s * 0.04, s * 0.16, 0, 0, Math.PI * 2); ctx.stroke(); }
  }, { repeat: false });
}

// ---- palms (merged, vertex coloured; height ~1 unit before scaling by the caller)
export function sugarPalmGeometry(rng) {
  const parts = [part(new THREE.CylinderGeometry(0.018, 0.026, 1, 6), '#5a4a3a', [0, 0.5, 0])];
  // a round crown of fan leaves
  const fan = new THREE.CircleGeometry(0.11, 9, -1.2, 2.4);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, up = 0.35 + rng.next() * 0.9;
    const g = fan.clone();
    g.rotateZ(Math.PI / 2); g.rotateX(-up); g.translate(0, 0, 0.11);
    g.rotateY(a);
    parts.push(part(g, i % 3 ? '#3f7a3a' : '#5a8f3c', [0, 1.0, 0]));
  }
  parts.push(part(new THREE.SphereGeometry(0.06, 8, 6), '#4a3a28', [0, 0.99, 0]));
  return merge(parts);
}

export function coconutPalmGeometry(rng, lean = 0.12) {
  const parts = [];
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, y = t, x = Math.pow(t, 2) * lean;
    parts.push(part(new THREE.CylinderGeometry(0.022, 0.028, 1 / segs + 0.01, 6), i % 2 ? '#7a6248' : '#8a7154', [x, y + 0.5 / segs, 0], [0, 0, -lean * 2 * t]));
  }
  const frond = new THREE.PlaneGeometry(0.06, 0.42, 1, 4);
  frond.translate(0, 0.21, 0);
  { const p = frond.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -Math.pow(y / 0.42, 2) * 0.16); } }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.next() * 0.3;
    const g = frond.clone();
    g.rotateX(-1.1 - rng.next() * 0.5); g.rotateY(a);
    parts.push(part(g, i % 2 ? '#3d8a3a' : '#2f7232', [lean, 1, 0]));
  }
  parts.push(part(new THREE.SphereGeometry(0.035, 6, 5), '#6a5a2a', [lean + 0.02, 0.97, 0.02]));
  return merge(parts);
}

// fluttering flag texture
export function flagTexture(kind) {
  return canvasTexture(128, (ctx, s) => {
    const h = s;
    if (kind === 'kh') {
      ctx.fillStyle = '#032ea1'; ctx.fillRect(0, 0, s, h);
      ctx.fillStyle = '#e00025'; ctx.fillRect(0, h * 0.25, s, h * 0.5);
      // a white three-towered temple silhouette
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s * 0.3, h * 0.6, s * 0.4, h * 0.06);
      for (const [x, t] of [[0.36, 0.42], [0.5, 0.33], [0.64, 0.42]]) { ctx.beginPath(); ctx.moveTo(s * (x - 0.05), h * 0.6); ctx.lineTo(s * x, h * t); ctx.lineTo(s * (x + 0.05), h * 0.6); ctx.fill(); }
    } else {
      const cols = [['#d62828', '#ffffff'], ['#1d3557', '#f1faee', '#e63946'], ['#2a9d8f', '#e9c46a'], ['#ffb703', '#023047'], ['#06d6a0', '#ffffff', '#ef476f']][kind % 5];
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, (i * h) / cols.length, s, h / cols.length + 1); });
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(s * 0.3, h * 0.5, s * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }, { repeat: false });
}

// sandstone with carved relief bands; pass the tint
export function sandstoneTexture(base = '#b4a184', { relief = true } = {}) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)', 'rgba(90,110,60,0.08)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = 2;
    for (let y = 0; y < s; y += s / 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      for (let x = ((y / (s / 8)) % 2) * (s / 8); x < s; x += s / 4) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s / 8); ctx.stroke(); }
    }
    if (relief) {
      ctx.strokeStyle = 'rgba(40,30,20,0.28)'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) * (s / 6); ctx.beginPath(); ctx.ellipse(x, s * 0.56, s * 0.03, s * 0.07, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, s * 0.63); ctx.lineTo(x, s * 0.72); ctx.stroke(); }
    }
  });
}

// a row of colonial shophouses (one block): returns a merged, vertex coloured geometry, width along x
export function shophouseRow(rng, n = 4, { w = 5, h = 9, d = 9 } = {}) {
  const parts = [];
  const walls = ['#e8c872', '#f0e2b6', '#e3a25a', '#cfe0d2', '#f2c6b4', '#d8d4c8'];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * w, hh = h * (0.85 + rng.next() * 0.35), c = walls[Math.floor(rng.next() * walls.length)];
    parts.push(part(new THREE.BoxGeometry(w * 0.98, hh, d), c, [x, hh / 2, 0]));
    // shutters / windows on the front (+z), a balcony slab and a parapet
    for (const fy of [0.45, 0.75]) for (const fx of [-0.25, 0.25]) parts.push(part(new THREE.BoxGeometry(w * 0.22, hh * 0.16, 0.12), rng.next() < 0.5 ? '#2f6f6a' : '#6b4a2e', [x + fx * w, hh * fy, d / 2 + 0.05]));
    parts.push(part(new THREE.BoxGeometry(w * 0.98, 0.25, 1.4), '#cfc8b8', [x, hh * 0.33, d / 2 + 0.7]));
    parts.push(part(new THREE.BoxGeometry(w * 0.98, 0.6, d + 0.2), '#efe8d8', [x, hh + 0.3, 0]));
    // shop front
    parts.push(part(new THREE.BoxGeometry(w * 0.7, hh * 0.24, 0.1), rng.next() < 0.5 ? '#3b3b44' : '#5c4033', [x, hh * 0.13, d / 2 + 0.06]));
  }
  return merge(parts);
}

// ---- images (Khmer sandstone and an apsara relief band, from NEXMAX CHRONICLE)
const texCache = new Map();
export function khmerTexture(name, repeat = [1, 1]) {
  const key = name + repeat.join(',');
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(`img/khmer/${name}.webp`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

// ---- elephants carrying a saddle and baskets, walking slowly back and forth along a path
// (the shapes follow NEXMAX CHRONICLE's procedural elephant; here without the rideable deck)
const LEG_LEN = 1.35, HIPS = [[-0.5, -0.85], [0.5, -0.85], [-0.5, 0.95], [0.5, 0.95]], LEG_PHASE = [0.25, 0.75, 0, 0.5];
function elephantParts() {
  const skin = '#8f8a86', dark = '#7c7672', pink = '#c8a49a';
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
    return g;
  };
  const p = (g, c) => part(g, c);
  const body = [
    p(at(new THREE.SphereGeometry(1, 18, 12), 0, 1.78, 0.05, 0, 0, 0, 0.86, 0.78, 1.42), skin),
    p(at(new THREE.SphereGeometry(0.7, 12, 8), 0, 2.15, -0.55, 0, 0, 0, 1, 0.75, 1), skin),
    p(at(new THREE.SphereGeometry(0.75, 12, 8), 0, 2.05, 0.75, 0, 0, 0, 1, 0.7, 1), skin),
    p(at(new THREE.SphereGeometry(0.62, 14, 10), 0, 2.28, -1.55, 0, 0, 0, 1, 1.05, 0.95), skin),
    p(at(new THREE.SphereGeometry(0.3, 10, 8), -0.2, 2.72, -1.62), dark),
    p(at(new THREE.SphereGeometry(0.3, 10, 8), 0.2, 2.72, -1.62), dark),
    p(at(new THREE.SphereGeometry(0.06, 6, 5), -0.42, 2.35, -1.92), '#1a1410'),
    p(at(new THREE.SphereGeometry(0.06, 6, 5), 0.42, 2.35, -1.92), '#1a1410'),
    p(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 2.0, 1.4), new THREE.Vector3(0, 1.6, 1.62), new THREE.Vector3(0, 1.05, 1.55)), 6, 0.05, 5, false), dark),
    // saddle cloth (red and gold), a seat and baskets
    p(at(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, 1.98, 0.08, 0, 0, 0, 0.92, 0.82, 1.08), '#b8322c'),
    p(at(new THREE.TorusGeometry(0.88, 0.035, 5, 28), 0, 2.36, 0.08, Math.PI / 2, 0, 0, 1.03, 1.2, 1), '#e8b84a'),
    p(at(new THREE.BoxGeometry(1.25, 0.14, 1.9), 0, 2.68, 0.1), '#8a6440'),
    p(at(new THREE.BoxGeometry(1.3, 0.3, 0.12), 0, 2.5, -0.86), '#5c4128'),
    p(at(new THREE.BoxGeometry(1.3, 0.3, 0.12), 0, 2.5, 1.06), '#5c4128'),
  ];
  for (const s of [-1, 1]) {
    body.push(p(at(new THREE.CircleGeometry(0.62, 16), s * 0.62, 2.18, -1.25, 0, s * 1.25, 0.12 * s, 0.85, 1.05, 1), dark));
    body.push(p(at(new THREE.CircleGeometry(0.62, 16), s * 0.6, 2.18, -1.25, 0, s * 1.25 + Math.PI, 0.12 * s, 0.85, 1.05, 1), pink));
    body.push(p(at(new THREE.ConeGeometry(0.06, 0.42, 6), s * 0.2, 1.78, -2.02, -1.9, 0, 0), '#f2ece0'));
    body.push(p(at(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 10), s * 0.98, 1.95, -0.2), '#c9a467'));
    body.push(p(at(new THREE.SphereGeometry(0.34, 10, 8), s * 0.92, 2.42, 0.15, 0, 0, 0, 1, 0.8, 1.3), s > 0 ? '#2d5fae' : '#2f8a4a'));
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.45, -0.22), new THREE.Vector3(0, -1.0, -0.26), new THREE.Vector3(0, -1.42, -0.1), new THREE.Vector3(0, -1.58, -0.28)]);
  const trunk = new THREE.TubeGeometry(curve, 14, 0.15, 8, false);
  const tp = trunk.attributes.position, tuv = trunk.attributes.uv;
  for (let i = 0; i < tp.count; i++) {
    const t = tuv.getX(i), c = curve.getPointAt(Math.min(1, t)), k = 1 - t * 0.55;
    tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * k, c.y + (tp.getY(i) - c.y) * k, c.z + (tp.getZ(i) - c.z) * k);
  }
  trunk.computeVertexNormals();
  const leg = merge([p(at(new THREE.CylinderGeometry(0.26, 0.23, LEG_LEN, 10), 0, -LEG_LEN / 2, 0), skin), p(at(new THREE.CylinderGeometry(0.25, 0.27, 0.12, 10), 0, -LEG_LEN + 0.06, 0), '#d8d0c4')]);
  return { body: merge(body), trunk: part(trunk, skin), leg };
}

// path: [[x, z], …] walked back and forth; ground(x, z) gives the height; scale ~1.4 reads well beside a kart
export class ElephantWalk {
  constructor({ paths, ground, scale = 1.4, speed = 1.1, rng = Math.random }) {
    const parts = elephantParts();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.group = new THREE.Group(); this.group.name = 'elephants';
    this.list = paths.map((path, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(parts.body, mat); body.castShadow = true; g.add(body);
      const trunk = new THREE.Mesh(parts.trunk, mat); trunk.position.set(0, 2.05, -2.0); trunk.castShadow = true; g.add(trunk);
      const legs = HIPS.map(([x, z]) => { const l = new THREE.Mesh(parts.leg, mat); l.position.set(x, LEG_LEN, z); l.castShadow = true; g.add(l); return l; });
      g.scale.setScalar(scale);
      this.group.add(g);
      const lens = []; let total = 0;
      for (let j = 0; j + 1 < path.length; j++) { const d = Math.hypot(path[j + 1][0] - path[j][0], path[j + 1][1] - path[j][1]); lens.push(d); total += d; }
      return { g, trunk, legs, path, lens, total, s: rng() * total, dir: 1, yaw: 0, gait: 0, pause: 0, t: rng() * 10, first: true };
    });
    this.ground = ground; this.speed = speed; this.scale = scale;
    this.update(0);
  }

  pointAt(e, s, out) {
    let j = 0;
    while (j < e.lens.length - 1 && s > e.lens[j]) { s -= e.lens[j]; j++; }
    const a = e.path[j], b = e.path[j + 1], f = Math.min(1, Math.max(0, s / e.lens[j]));
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f;
    return out;
  }

  update(dt) {
    const p = [0, 0], q = [0, 0];
    for (const e of this.list) {
      e.t += dt;
      let moving = 0;
      if (e.pause > 0) e.pause -= dt;
      else {
        e.s += e.dir * this.speed * dt;
        if (e.s > e.total || e.s < 0) { e.s = Math.max(0, Math.min(e.total, e.s)); e.dir = -e.dir; e.pause = 2.5; }
        moving = 1;
      }
      this.pointAt(e, e.s, p); this.pointAt(e, Math.max(0, Math.min(e.total, e.s + e.dir * 0.5)), q);
      const want = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])); // the model faces −z
      let d = want - e.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      e.yaw = e.first ? want : e.yaw + Math.sign(d) * Math.min(Math.abs(d), dt * 0.8);
      e.first = false;
      e.gait += dt * moving * this.speed * 0.62 / this.scale;
      const bob = Math.abs(Math.sin(e.gait * Math.PI * 2)) * 0.035 * moving;
      e.g.position.set(p[0], this.ground(p[0], p[1]) + bob * this.scale, p[1]);
      e.g.rotation.y = e.yaw;
      e.trunk.rotation.x = Math.sin(e.t * 0.9) * 0.12 + 0.05; e.trunk.rotation.z = Math.sin(e.t * 0.6 + 1) * 0.08;
      e.legs.forEach((l, i) => { const ph = (e.gait + LEG_PHASE[i]) * Math.PI * 2; l.rotation.x = Math.sin(ph) * 0.32 * moving; l.position.y = LEG_LEN + Math.max(0, Math.cos(ph)) * 0.06 * moving - bob; });
    }
  }
}

// map a material's texture by world position (seen from the side it faces), so one stone texture tiles evenly
// over boxes of any size; metresPerTile = how much wall one copy of the image covers
export function worldMapped(mat, metresPerTile = 6) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: 1 / metresPerTile };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { mat4 wm = modelMatrix;
          #ifdef USE_INSTANCING
            wm = modelMatrix * instanceMatrix;
          #endif
          vWP = (wm * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(wm) * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uTile;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec3 bw = pow(abs(normalize(vWN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec4 sampledDiffuseColor = texture2D(map, vWP.zy * uTile) * bw.x + texture2D(map, vWP.xz * uTile) * bw.y + texture2D(map, vWP.xy * uTile) * bw.z;
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'world-mapped-' + metresPerTile;
  return mat;
}

// merge static meshes that share a material into one mesh each (world transforms baked in), so a course full
// of separate stone blocks, towers and statues costs a handful of draw calls instead of hundreds
export function mergeStatic(roots) {
  const buckets = new Map();
  const put = (mat, geo, m) => {
    let b = buckets.get(mat);
    if (!b) buckets.set(mat, (b = { mat, geos: [], cast: false, receive: false }));
    b.geos.push(geo); b.cast ||= m.castShadow; b.receive ||= m.receiveShadow;
  };
  const meshes = [];
  for (const r of roots) { r.updateMatrixWorld(true); r.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); }); }
  for (const m of meshes) {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (Array.isArray(m.material)) {
      const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const gr of groups) {
        const sub = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(g.attributes)) sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, Math.min(a.count, gr.start + gr.count) * a.itemSize), a.itemSize));
        put(m.material[gr.materialIndex], sub, m);
      }
    } else put(m.material, g, m);
  }
  const out = [];
  for (const b of buckets.values()) {
    const keep = ['position', 'normal', 'uv', 'color'].filter((n) => b.geos.every((g) => g.attributes[n]));
    for (const g of b.geos) for (const n of Object.keys(g.attributes)) if (!keep.includes(n)) g.deleteAttribute(n);
    const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat);
    for (const g of b.geos) g.dispose();
    mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
    out.push(mesh);
  }
  return out;
}
