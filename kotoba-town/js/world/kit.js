// World-building kit shared by every scene: materials, canvas textures, signs, and common props.
// Everything is procedural (no downloads) and kept cheap enough for Quest 2.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const JP_FONT = '"M PLUS Rounded 1c", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

const matCache = new Map();
/** Cached MeshStandardMaterial. opts: rough, metal, map, emissive, emissiveIntensity, transparent, opacity, side */
export function mat(color, opts = {}) {
  const key = JSON.stringify([color, { ...opts, map: opts.map?.uuid }]);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0,
    map: opts.map || null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent || (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  matCache.set(key, m);
  return m;
}

export const glassMat = () => mat('#cfe6ee', { rough: 0.05, metal: 0.1, opacity: 0.22 });

// ---------------------------------------------------------------- textures
const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  const k = `${key}|${repeat}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  texCache.set(k, t);
  return t;
}

/** Deterministic pseudo-random (so every visit looks the same). */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

export function woodTex(base = '#b98b5e', repeat = [1, 1], planks = 6) {
  return canvasTex(`wood${base}${planks}`, 512, 512, (g, w, h) => {
    const r = rng(7);
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = shade(base, 0.86 + r() * 0.22);
      g.fillRect(0, i * ph, w, ph);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(60,35,15,${0.05 + r() * 0.08})`;
        g.lineWidth = 1 + r() * 2;
        const y = i * ph + r() * ph;
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.7, y + (r() - 0.5) * 8, w, y + (r() - 0.5) * 6);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,25,10,0.35)';
      g.fillRect(0, i * ph, w, 2);
      const x = r() * w;
      g.fillRect(x, i * ph, 2, ph);
    }
  }, repeat);
}

export function tileTex(c1 = '#e9e4da', c2 = '#d9d2c4', n = 8, repeat = [1, 1], grout = '#bdb5a6') {
  return canvasTex(`tile${c1}${c2}${n}${grout}`, 512, 512, (g, w) => {
    const s = w / n; const r = rng(3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? c1 : c2;
      g.fillRect(x * s, y * s, s, s);
      g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
      g.fillRect(x * s, y * s, s, s);
    }
    g.strokeStyle = grout; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, w); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  }, repeat);
}

export function noiseTex(base = '#999999', amount = 0.08, repeat = [1, 1], key = 'n') {
  return canvasTex(`noise${base}${amount}${key}`, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 5000; i++) {
      const v = r() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${r() * amount})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  }, repeat);
}

export function carpetTex(base = '#6c7a89', repeat = [4, 4]) {
  return canvasTex(`carpet${base}`, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.04)`;
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  }, repeat);
}

export function tatamiTex(repeat = [1, 1]) {
  return canvasTex('tatami', 256, 512, (g, w, h) => {
    g.fillStyle = '#c9c48a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(90,90,30,${0.06 + (y % 6 ? 0 : 0.05)})`; g.fillRect(0, y, w, 1); }
    g.fillStyle = '#3b4a3a'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
  }, repeat);
}

// ------------------------------------------------------------ mesh helpers
export function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true, parent } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  parent?.add(m);
  return m;
}

/** Box whose bottom sits at y. */
export function box(w, h, d, material, o = {}) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, { ...o, y: (o.y ?? 0) + h / 2 });
}

export function rbox(w, h, d, r, material, o = {}) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), material, { ...o, y: (o.y ?? 0) + h / 2 });
}

export function cyl(rt, rb, h, material, o = {}, seg = 20) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, { ...o, y: (o.y ?? 0) + h / 2 });
}

/** Interior room: floor, ceiling, 4 inward walls (any wall can be skipped/replaced by windows). */
export function room({ w, d, h = 2.8, floor, wall, ceiling, skip = [] }) {
  const g = new THREE.Group();
  const f = mesh(new THREE.PlaneGeometry(w, d, Math.ceil(w / 2), Math.ceil(d / 2)), floor, { rx: -Math.PI / 2, cast: false });
  g.add(f);
  if (ceiling) g.add(mesh(new THREE.PlaneGeometry(w, d, Math.ceil(w / 3), Math.ceil(d / 3)), ceiling, { rx: Math.PI / 2, y: h, cast: false }));
  const walls = {
    north: [w, 0, h / 2, -d / 2, 0], south: [w, 0, h / 2, d / 2, Math.PI],
    west: [d, -w / 2, h / 2, 0, Math.PI / 2], east: [d, w / 2, h / 2, 0, -Math.PI / 2],
  };
  for (const [k, [len, x, y, z, ry]] of Object.entries(walls)) {
    if (skip.includes(k)) continue;
    g.add(mesh(new THREE.PlaneGeometry(len, h), wall, { x, y, z, ry, cast: false }));
  }
  return g;
}

// --------------------------------------------------------------- text & signs
/**
 * A flat sign with text. lines: string | string[]; returns a Mesh (plane) of size w×h metres.
 * opts: bg, fg, font weight, size (px at 256px/m), align, border, radius, emissive (lit signs)
 */
export function sign(lines, w, h, opts = {}) {
  const px = opts.ppm ?? 320;
  const cw = Math.max(32, Math.round(w * px)); const ch = Math.max(32, Math.round(h * px));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const r = (opts.radius ?? 0.08) * Math.min(cw, ch);
  if (opts.bg !== null) {
    g.fillStyle = opts.bg ?? '#ffffff';
    roundRect(g, 0, 0, cw, ch, r); g.fill();
    if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = Math.max(4, ch * 0.05); roundRect(g, g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth, r); g.stroke(); }
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = (opts.size ?? 0.5) * ch / Math.max(1, arr.length * 0.9);
  g.fillStyle = opts.fg ?? '#333333';
  g.textBaseline = 'middle';
  g.textAlign = opts.align ?? 'center';
  arr.forEach((line, i) => {
    const l = typeof line === 'string' ? { t: line } : line;
    let s = size * (l.scale ?? 1);
    g.font = `${l.weight ?? opts.weight ?? 700} ${s}px ${JP_FONT}`;
    g.fillStyle = l.color ?? opts.fg ?? '#333333';
    const x = g.textAlign === 'left' ? cw * 0.06 : g.textAlign === 'right' ? cw * 0.94 : cw / 2;
    const y = ch * (i + 0.5) / arr.length;
    const txt = l.t;
    while (g.measureText(txt).width > cw * 0.92 && s > 8) { g.font = `${l.weight ?? opts.weight ?? 700} ${(s *= 0.92)}px ${JP_FONT}`; }
    g.fillText(txt, x, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const material = opts.emissive
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.userData.redraw = () => { tex.needsUpdate = true; };
  return m;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Analog wall clock showing hh:mm (from setup time). */
export function clock(radius = 0.18, hh = 10, mm = 10) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.04, 32), mat('#f4f1ea'), { rx: Math.PI / 2 }));
  g.add(mesh(new THREE.TorusGeometry(radius, 0.012, 8, 40), mat('#444'), {}));
  const face = sign([' '], radius * 2, radius * 2, { bg: null, radius: 0.5 });
  face.position.z = 0.021;
  g.add(face);
  const tick = new THREE.BoxGeometry(0.008, radius * 0.14, 0.005);
  for (let i = 0; i < 12; i++) {
    const t = mesh(tick, mat('#333'), { cast: false });
    const a = i / 12 * Math.PI * 2;
    t.position.set(Math.sin(a) * radius * 0.84, Math.cos(a) * radius * 0.84, 0.024);
    t.rotation.z = -a;
    g.add(t);
  }
  const hand = (len, wdt, ang) => {
    const h = mesh(new THREE.BoxGeometry(wdt, len, 0.006), mat('#222'), { cast: false });
    h.geometry.translate(0, len / 2, 0);
    h.position.z = 0.03; h.rotation.z = -ang;
    g.add(h);
  };
  hand(radius * 0.5, 0.014, ((hh % 12) + mm / 60) / 12 * Math.PI * 2);
  hand(radius * 0.75, 0.009, mm / 60 * Math.PI * 2);
  return g;
}

/** Potted plant (leafy). */
export function plant(scale = 1, seed = 3) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(cyl(0.16 * scale, 0.12 * scale, 0.3 * scale, mat('#d8cfc0', { rough: 0.9 })));
  g.add(cyl(0.15 * scale, 0.15 * scale, 0.02, mat('#4a3a2a'), { y: 0.28 * scale }));
  const leaf = new THREE.SphereGeometry(0.12 * scale, 8, 6);
  const greens = ['#4f7a4a', '#5f8f55', '#3f6a3e', '#6a9a5a'];
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2; const rad = r() * 0.18 * scale; const y = (0.45 + r() * 0.7) * scale;
    const l = mesh(leaf, mat(greens[i % 4], { rough: 0.8 }), { x: Math.cos(a) * rad, y, z: Math.sin(a) * rad });
    l.scale.set(1, 0.55 + r() * 0.5, 1);
    g.add(l);
  }
  return g;
}

/** A painted outdoor view for windows: kind 'city' | 'street' | 'garden' | 'night'. */
export function viewTex(kind = 'city', time = 'noon') {
  return canvasTex(`view${kind}${time}`, 1024, 512, (g, w, h) => {
    const sky = {
      morning: ['#bfe3f7', '#fbe9d0'], noon: ['#8ec9ef', '#dff1fb'], evening: ['#f3a96b', '#fde0b8'], night: ['#0d1b33', '#2a3b5c'],
    }[time] || ['#8ec9ef', '#dff1fb'];
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(kind.length * 13);
    const night = time === 'night';
    if (kind === 'city' || kind === 'night' || kind === 'street') {
      for (let layer = 0; layer < 3; layer++) {
        let x = -20;
        while (x < w) {
          const bw = 40 + r() * 90; const bh = (kind === 'street' ? 0.15 : 0.25) * h + r() * h * (0.45 - layer * 0.1);
          const base = night ? 30 + layer * 15 : 150 + layer * 30 + r() * 30;
          g.fillStyle = `rgb(${base},${base + 8},${base + 18})`;
          g.fillRect(x, h - bh - layer * 6, bw, bh);
          for (let wy = h - bh + 8; wy < h - 10; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
            g.fillStyle = night ? (r() > 0.5 ? 'rgba(255,220,140,0.85)' : 'rgba(40,50,70,0.8)') : 'rgba(210,230,245,0.55)';
            g.fillRect(wx, wy, 6, 8);
          }
          x += bw + 4;
        }
      }
    } else {
      g.fillStyle = night ? '#1e2b1e' : '#7aa86a';
      g.fillRect(0, h * 0.62, w, h);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = night ? '#162416' : ['#4e7d47', '#5f9150', '#3f6b3a'][i % 3];
        g.beginPath(); g.arc(r() * w, h * (0.5 + r() * 0.2), 30 + r() * 50, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

/** A window (frame + glass + painted view behind). Facing +z. */
export function windowPane(w, h, kind = 'city', time = 'noon') {
  const g = new THREE.Group();
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: viewTex(kind, time), toneMapped: false }));
  view.position.z = -0.06;
  g.add(view);
  g.add(mesh(new THREE.PlaneGeometry(w, h), glassMat(), { cast: false, receive: false }));
  const fm = mat('#e8e6e0', { rough: 0.5 });
  const t = 0.05;
  g.add(mesh(new THREE.BoxGeometry(w + t, t, 0.08), fm, { y: h / 2 }));
  g.add(mesh(new THREE.BoxGeometry(w + t, t, 0.08), fm, { y: -h / 2 }));
  g.add(mesh(new THREE.BoxGeometry(t, h, 0.08), fm, { x: -w / 2 }));
  g.add(mesh(new THREE.BoxGeometry(t, h, 0.08), fm, { x: w / 2 }));
  g.add(mesh(new THREE.BoxGeometry(0.03, h, 0.05), fm, {}));
  return g;
}

/** Rectangular ceiling light panel (emissive) + optional real light. */
export function ceilingPanel(w = 1.2, d = 0.3, color = '#fffaf0') {
  return mesh(new THREE.BoxGeometry(w, 0.03, d), new THREE.MeshBasicMaterial({ color, toneMapped: false }), { cast: false, receive: false });
}

/** Simple chair facing +z. */
export function chair(color = '#7a5a3c', seatColor = null) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.6 });
  g.add(box(0.44, 0.04, 0.42, seatColor ? mat(seatColor) : m, { y: 0.44 }));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) g.add(box(0.035, 0.44, 0.035, m, { x, z }));
  g.add(box(0.44, 0.42, 0.035, m, { y: 0.48, z: -0.2 }));
  return g;
}

/** Table (top at height h). */
export function table(w = 1.2, d = 0.7, h = 0.72, topMat = mat('#c9a77c', { rough: 0.5 }), legMat = mat('#444')) {
  const g = new THREE.Group();
  g.add(box(w, 0.04, d, topMat, { y: h - 0.04 }));
  const lx = w / 2 - 0.06; const lz = d / 2 - 0.06;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) g.add(box(0.04, h - 0.04, 0.04, legMat, { x, z }));
  return g;
}

/** Shelf unit filled with products. palette: array of colours. Facing +z. */
export function shelf(w = 1.2, h = 1.6, d = 0.4, palette = ['#e84c3d', '#f1c40f', '#3498db', '#2ecc71', '#ecf0f1'], seed = 1, kind = 'box') {
  const g = new THREE.Group();
  const frame = mat('#d9d9d9', { rough: 0.4, metal: 0.3 });
  g.add(box(w, h, 0.02, mat('#eeeeee'), { z: -d / 2 + 0.01 }));
  g.add(box(0.03, h, d, frame, { x: -w / 2 }));
  g.add(box(0.03, h, d, frame, { x: w / 2 }));
  const levels = Math.max(2, Math.round(h / 0.38));
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < levels; i++) {
    const y = 0.08 + i * (h - 0.1) / levels;
    g.add(box(w, 0.025, d, frame, { y }));
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      const iw = kind === 'bottle' ? 0.08 : 0.07 + r() * 0.1;
      const ih = kind === 'bottle' ? 0.26 : 0.1 + r() * 0.16;
      items.push({ x: x + iw / 2, y: y + 0.025, w: iw, h: ih, c: palette[Math.floor(r() * palette.length)] });
      x += iw + 0.012;
    }
  }
  // instanced per colour
  const byColor = new Map();
  for (const it of items) { if (!byColor.has(it.c)) byColor.set(it.c, []); byColor.get(it.c).push(it); }
  const geo = kind === 'bottle' ? new THREE.CylinderGeometry(0.035, 0.035, 1, 10) : new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  for (const [c, list] of byColor) {
    const im = new THREE.InstancedMesh(geo, mat(c, { rough: 0.5 }), list.length);
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y + it.h / 2, 0);
      dummy.scale.set(kind === 'bottle' ? 1 : it.w, it.h, kind === 'bottle' ? 1 : d * 0.7);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true; im.receiveShadow = true;
    g.add(im);
  }
  return g;
}

/** Interior door (closed) facing +z, width 0.9. */
export function door(color = '#8a6a4a', w = 0.9, h = 2.05) {
  const g = new THREE.Group();
  g.add(box(w + 0.12, h + 0.06, 0.06, mat('#dedad2'), { z: -0.03 }));
  g.add(box(w, h, 0.05, mat(color, { rough: 0.55 }), {}));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), mat('#c0c0c0', { metal: 0.8, rough: 0.3 }), { x: w / 2 - 0.1, y: 1.0, z: 0.05, rz: Math.PI / 2 }));
  return g;
}

/** Wrap a prop for the scenario system: an anchor Object3D with a label (for focus/point). */
export function prop(id, obj, { labelJa, labelEn } = {}) {
  obj.name = `prop:${id}`;
  obj.userData.propId = id;
  if (labelJa) obj.userData.labelJa = labelJa;
  if (labelEn) obj.userData.labelEn = labelEn;
  return obj;
}

/** Spot for a person: feet position + yaw (radians, 0 = facing -z … use faceYaw helper). */
export const spot = (x, z, yaw = 0, y = 0) => ({ pos: new THREE.Vector3(x, y, z), yaw });

/** Yaw that makes something at `from` face `to` (both Vector3 or {x,z}). */
export function faceYaw(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

// ------------------------------------------------------------- optimisation
/**
 * Finish a scene: turn every prop into a light anchor (its world-space centre), then merge all static
 * meshes that share a material into one mesh (Quest-friendly: a few dozen draw calls per scene).
 * Meshes under an object with userData.dynamic = true (moving trains, doors …) are left alone.
 * Returns the same `built` object with props replaced by anchors (anchor.userData keeps labels).
 */
export function finalize(built) {
  const root = built.group;
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // 1) anchors for props
  const anchors = {};
  for (const [id, obj] of Object.entries(built.props || {})) {
    const box3 = new THREE.Box3().setFromObject(obj);
    const a = new THREE.Object3D();
    a.name = `prop:${id}`;
    a.userData = { ...obj.userData, propId: id, size: box3.getSize(new THREE.Vector3()) };
    const c = box3.isEmpty() ? obj.getWorldPosition(new THREE.Vector3()) : box3.getCenter(new THREE.Vector3());
    a.position.copy(c).applyMatrix4(rootInv);
    anchors[id] = a;
  }
  // 2) merge static meshes by material
  const groups = new Map();
  const dynamic = new Set();
  root.traverse((o) => { if (o.userData?.dynamic) o.traverse((c) => dynamic.add(c)); });
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || dynamic.has(o) || Array.isArray(o.material)) return;
    const geo = o.geometry;
    if (!geo.attributes.position || !geo.attributes.normal) return;
    const key = `${o.material.uuid}|${geo.index ? 'i' : 'n'}|${geo.attributes.uv ? 'uv' : ''}|${o.castShadow ? 'c' : ''}${o.receiveShadow ? 'r' : ''}|${o.renderOrder}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder, list: [] });
    const g = geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
    groups.get(key).list.push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent?.remove(o);
  const merged = new THREE.Group();
  merged.name = 'static';
  for (const { material, cast, receive, order, list } of groups.values()) {
    const geo = list.length === 1 ? list[0] : mergeGeometries(list);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = order;
    merged.add(m);
  }
  root.add(merged);
  for (const a of Object.values(anchors)) root.add(a);
  // drop now-empty groups
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (!c.isMesh && !c.isLight && !c.children.length && !c.name.startsWith('prop:') && c.type === 'Group') o.remove(c); } };
  prune(root);
  built.props = anchors;
  return built;
}

/** Minimal mergeGeometries (same attributes, all indexed or all non-indexed). */
function mergeGeometries(list) {
  const indexed = !!list[0].index;
  const names = Object.keys(list[0].attributes);
  if (list.some((g) => !!g.index !== indexed || Object.keys(g.attributes).length !== names.length)) return null;
  const out = new THREE.BufferGeometry();
  let vCount = 0;
  for (const g of list) vCount += g.attributes.position.count;
  for (const n of names) {
    const size = list[0].attributes[n].itemSize;
    const arr = new Float32Array(vCount * size);
    let off = 0;
    for (const g of list) {
      const a = g.attributes[n];
      if (a.isInterleavedBufferAttribute || a.itemSize !== size) return null;
      arr.set(a.array.length === a.count * size ? a.array : Array.from({ length: a.count * size }, (_, i) => a.getComponent(Math.floor(i / size), i % size)), off);
      off += a.count * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  if (indexed) {
    let iCount = 0;
    for (const g of list) iCount += g.index.count;
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let off = 0; let base = 0;
    for (const g of list) {
      for (let i = 0; i < g.index.count; i++) idx[off + i] = g.index.array[i] + base;
      off += g.index.count;
      base += g.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}
