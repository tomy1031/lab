// js/paddlemesh.js — the paddle you see: a shakehand blade (5-ply wood, 5.8 mm) with its real outline, a flared
// (FL) handle with a lacquered grain and a contrasting laminate stripe, two rubbers (sponge + top sheet, 4 mm each;
// red and black, or any rubber type — short pips and long pips show their pimples), edge tape, and a printed logo.
// Everything is drawn from the same outline the collision uses (paddle.js). Textures are painted on canvases.
import * as THREE from 'three';
import { BLADE, HALF_T, headPoint } from './paddle.js';

const tex = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

let _wood = null;
/** a light hinoki / limba grain */
function woodTexture() {
  if (_wood) return _wood;
  const c = canvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#d9b27c'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 256, w = 0.6 + Math.random() * 2.2;
    g.strokeStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},${30 + Math.random() * 20},${0.10 + Math.random() * 0.22})`;
    g.lineWidth = w;
    g.beginPath();
    for (let y = 0; y <= 512; y += 16) g.lineTo(x + Math.sin(y * 0.012 + i) * 4 + Math.sin(y * 0.05 + i * 3) * 1.2, y);
    g.stroke();
  }
  _wood = tex(c);
  return _wood;
}

let _noise = null;
/** fine grain for the top sheet's surface (a normal map) */
function grainNormal() {
  if (_noise) return _noise;
  const c = canvas(256, 256), g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i * 4] = 128 + n; img.data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 30; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _noise = tex(c, false);
  _noise.repeat.set(6, 6);
  return _noise;
}

/** pimples (short / long pips) as a normal map */
function pipsNormal(long) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 256, 256);
  const step = long ? 21 : 18;
  for (let y = 0; y < 256 + step; y += step) {
    for (let x = 0; x < 256 + step; x += step) {
      const ox = (Math.floor(y / step) % 2) * step / 2;
      const r = long ? 6 : 7.5;
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, 'rgb(128,128,255)'); gr.addColorStop(0.7, 'rgb(150,150,235)'); gr.addColorStop(1, 'rgb(90,90,235)');
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = tex(c, false);
  t.repeat.set(8, 8);
  return t;
}

/** the printed logo on a rubber sheet (a transparent decal) */
function rubberLogo(color, rubberName) {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 900 78px "Arial Black", Arial, sans-serif';
  g.fillText('VORTEX', 256, 92);
  g.font = 'bold 40px Arial, sans-serif';
  g.fillText(rubberName, 256, 160);
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText('SPIN TABLE  ·  MAX 2.1', 256, 210);
  return tex(c);
}

let _handle = null;
/** the handle's grain with a dark laminate stripe along both narrow sides */
function handleTexture() {
  if (_handle) return _handle;
  const src = woodTexture().image;
  const c = canvas(512, 256), g = c.getContext('2d');
  g.save(); g.translate(512, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0, 256, 512); g.restore();
  g.fillStyle = 'rgba(255,240,220,0.18)'; g.fillRect(0, 0, 512, 256);
  for (const u of [0, 0.5, 1]) {
    const x = u * 512;
    g.fillStyle = '#3d2212'; g.fillRect(x - 5, 0, 10, 256);
    g.fillStyle = '#e9d2a8'; g.fillRect(x - 9, 0, 3, 256); g.fillRect(x + 6, 0, 3, 256);
  }
  _handle = tex(c);
  _handle.wrapS = THREE.ClampToEdgeWrapping;
  return _handle;
}

function handleLogo() {
  const c = canvas(256, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#f6e3a1'); gr.addColorStop(0.5, '#c79b3b'); gr.addColorStop(1, '#8a6420');
  g.fillStyle = '#111'; g.beginPath(); g.ellipse(128, 64, 124, 60, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = gr; g.lineWidth = 6; g.beginPath(); g.ellipse(128, 64, 116, 53, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = gr; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 900 44px Arial, sans-serif'; g.fillText('SPIN', 128, 50);
  g.font = 'bold 22px Arial, sans-serif'; g.fillText('5-PLY  OFF', 128, 88);
  return tex(c);
}

// ── outlines (paddle frame, metres) ──

const NECK_W = 0.0155;        // half-width of the blade where it enters the handle
/** t on the head outline where its half-width equals w (near the bottom) */
function tAtHalfWidth(w) {
  let lo = Math.PI / 2, hi = Math.PI;
  const p = { x: 0, y: 0 };
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; headPoint(m, 0, p); if (p.x > w) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** the blade: head + a smooth shoulder into the handle (the part inside the handle is hidden) */
function bladeShape() {
  const s = new THREE.Shape();
  const t0 = tAtHalfWidth(0.036);
  const p = { x: 0, y: 0 };
  headPoint(t0, 0, p);
  const yb = p.y;
  s.moveTo(NECK_W * 0.9, BLADE.butt + 0.01);
  s.lineTo(NECK_W, BLADE.shoulderY - 0.01);
  s.bezierCurveTo(NECK_W, BLADE.shoulderY + 0.006, p.x - 0.006, yb - 0.004, p.x, yb);
  const N = 96;
  for (let i = 1; i < N; i++) { headPoint(t0 - (2 * t0) * (i / N), 0, p); s.lineTo(p.x, p.y); }
  headPoint(-t0, 0, p);
  s.lineTo(p.x, p.y);
  s.bezierCurveTo(p.x + 0.006, yb - 0.004, -NECK_W, BLADE.shoulderY + 0.006, -NECK_W, BLADE.shoulderY - 0.01);
  s.lineTo(-NECK_W * 0.9, BLADE.butt + 0.01);
  s.closePath();
  return s;
}

/** a rubber sheet: the head outline down to a concave cut above the handle */
function rubberShape(inset = 0.0004) {
  const s = new THREE.Shape();
  const t0 = tAtHalfWidth(0.047);
  const p = { x: 0, y: 0 };
  headPoint(t0, -inset, p);
  const yb = p.y, xb = p.x;
  s.moveTo(xb, yb);
  const N = 96;
  for (let i = 1; i <= N; i++) { headPoint(t0 - (2 * t0) * (i / N), -inset, p); s.lineTo(p.x, p.y); }
  // the cut: an arc bulging up toward the head centre
  s.quadraticCurveTo(0, yb + 0.022, xb, yb);
  return { shape: s, t0 };
}

function shapeUV(geo, scaleX = 1 / (2 * BLADE.b), scaleY = 1 / (2 * BLADE.a), oy = BLADE.yc) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) * scaleX, 0.5 + (pos.getY(i) - oy) * scaleY);
  uv.needsUpdate = true;
}

/** the flared handle: rings of rounded-rectangle sections along y */
function handleGeometry() {
  const B = BLADE;
  const y0 = B.butt, y1 = B.shoulderY + 0.004;
  const NS = 28, NR = 36;
  const halfW = (y) => {
    const k = (y - y0) / (y1 - y0);                               // 0 at the butt, 1 at the shoulder
    const flare = Math.pow(1 - Math.min(1, k / 0.55), 2) * 0.0035; // the FL flare at the butt
    return 0.0128 + flare + 0.0022 * Math.pow(Math.max(0, k - 0.6) / 0.4, 2);
  };
  const halfT = (y) => {
    const k = (y - y0) / (y1 - y0);
    const base = 0.0108 + Math.pow(1 - Math.min(1, k / 0.5), 2) * 0.0016;
    const u = Math.max(0, Math.min(1, (k - 0.82) / 0.18)), sm = u * u * (3 - 2 * u);   // the cheeks taper into the blade
    return base + (0.0036 - base) * sm;
  };
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const y = y0 + (y1 - y0) * (i / NS);
    const w = halfW(y), t = halfT(y);
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a), e = 2 / 3.2;
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), e) * w, y, Math.sign(s) * Math.pow(Math.abs(s), e) * t);
      uv.push(j / NR, i / NS);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + NR + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // the butt cap
  const base = pos.length / 3;
  pos.push(0, y0 - 0.0006, 0); uv.push(0.5, 0);
  for (let j = 0; j < NR; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, halfW, halfT };
}

/** edge tape around the head: a band following the outline, a little wider than the paddle is thick */
function tapeGeometry(t0) {
  const pos = [], idx = [], nrm = [];
  const N = 140, p = { x: 0, y: 0 }, q = { x: 0, y: 0 };
  const hz = HALF_T + 0.0003;
  for (let i = 0; i <= N; i++) {
    const t = t0 - (2 * t0) * (i / N);
    headPoint(t, 0.0005, p);
    headPoint(t + 0.002, 0.0005, q);
    const tx = p.x - q.x, ty = p.y - q.y, tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl;                  // outward normal (the outline runs counter-clockwise)
    pos.push(p.x, p.y, -hz, p.x, p.y, hz);
    nrm.push(nx, ny, 0, nx, ny, 0);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export const RUBBER_COLORS = {
  red: { top: 0xb0121f, edge: 0x7c0c16, logo: 'rgba(255,214,120,0.9)' },
  black: { top: 0x121214, edge: 0x050506, logo: 'rgba(230,230,230,0.85)' },
  blue: { top: 0x1a4fb4, edge: 0x10306e, logo: 'rgba(255,255,255,0.85)' },
  green: { top: 0x1c8a3c, edge: 0x10521f, logo: 'rgba(255,255,255,0.85)' },
  pink: { top: 0xe0559a, edge: 0x9a2d63, logo: 'rgba(255,255,255,0.85)' },
};
const RUBBER_NAMES = { inverted: 'TENSION 05', tacky: 'TACK 39', short: 'SHORT P1', long: 'LONG L3', anti: 'ANTI 0' };

/**
 * Build a paddle. opts: { fhColor, bhColor ('red' | 'black' | …), fh, bh (rubber keys), tape (hex), lite }.
 * Returns a THREE.Group in the paddle frame, with .userData.vibrate(amount) for the hit "buzz".
 */
export function buildPaddle(opts = {}) {
  const g = new THREE.Group();
  g.name = 'paddle';
  const inner = new THREE.Group();          // what vibrates
  g.add(inner);
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 });
  // blade
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape(), { depth: BLADE.bladeT, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 48 });
  bladeGeo.translate(0, 0, -BLADE.bladeT / 2);
  shapeUV(bladeGeo, 1.2, 1.2, 0);
  const blade = new THREE.Mesh(bladeGeo, wood);
  inner.add(blade);
  // rubbers: sponge + top sheet on each side
  const { shape: rs, t0 } = rubberShape();
  const sponge = new THREE.MeshStandardMaterial({ color: 0xf0b04a, roughness: 0.95 });
  const sideOf = (sign, colorKey, rubKey) => {
    const col = RUBBER_COLORS[colorKey] || RUBBER_COLORS.red;
    const pips = rubKey === 'short' || rubKey === 'long';
    const spongeT = rubKey === 'long' ? 0.0008 : rubKey === 'anti' ? 0.0018 : 0.0021;
    const topT = BLADE.rubberT - spongeT;
    const sg = new THREE.ExtrudeGeometry(rs, { depth: spongeT, bevelEnabled: false, curveSegments: 48 });
    const sm = new THREE.Mesh(sg, sponge);
    const tg = new THREE.ExtrudeGeometry(rs, { depth: topT, bevelEnabled: false, curveSegments: 48 });
    shapeUV(tg);
    const topMat = new THREE.MeshPhysicalMaterial({
      color: col.top, roughness: rubKey === 'tacky' ? 0.28 : pips ? 0.62 : 0.4, metalness: 0,
      clearcoat: rubKey === 'tacky' ? 0.6 : pips ? 0 : 0.25, clearcoatRoughness: 0.45,
      normalMap: pips ? pipsNormal(rubKey === 'long') : grainNormal(), normalScale: new THREE.Vector2(pips ? 1.4 : 0.25, pips ? 1.4 : 0.25),
    });
    const edgeMat = new THREE.MeshStandardMaterial({ color: col.edge, roughness: 0.8 });
    const tm = new THREE.Mesh(tg, [topMat, edgeMat]);
    // logo decal near the bottom of the sheet
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.0375), new THREE.MeshBasicMaterial({ map: rubberLogo(col.logo, RUBBER_NAMES[rubKey] || ''), transparent: true, depthWrite: false, toneMapped: false }));
    logo.position.set(0, BLADE.yc - BLADE.a + 0.042, 0);
    const z0 = BLADE.bladeT / 2;
    if (sign > 0) {
      sm.position.z = z0; tm.position.z = z0 + spongeT;
      logo.position.z = z0 + BLADE.rubberT + 0.0002;
    } else {
      sm.position.z = -z0 - spongeT; tm.position.z = -z0 - BLADE.rubberT;
      logo.position.z = -z0 - BLADE.rubberT - 0.0002; logo.rotation.y = Math.PI;
    }
    logo.material.opacity = 0.95;
    inner.add(sm, tm, logo);
    return tm;
  };
  const fhMesh = sideOf(1, opts.fhColor || 'red', opts.fh || 'inverted');
  const bhMesh = sideOf(-1, opts.bhColor || 'black', opts.bh || 'inverted');
  // edge tape
  const tape = new THREE.Mesh(tapeGeometry(tAtHalfWidth(0.047)), new THREE.MeshStandardMaterial({ color: opts.tape ?? 0x16181d, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }));
  inner.add(tape);
  void t0;
  // handle: two cheeks around the blade, a contrasting laminate stripe through the middle
  const { geo: hg, halfW } = handleGeometry();
  const handle = new THREE.Mesh(hg, new THREE.MeshPhysicalMaterial({ map: handleTexture(), roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35 }));
  inner.add(handle);
  // logo badges on both sides of the handle
  const lg = handleLogo();
  for (const s of [1, -1]) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.013), new THREE.MeshStandardMaterial({ map: lg, roughness: 0.3, metalness: 0.3, transparent: true }));
    badge.position.set(0, 0.018, s * 0.0109);
    badge.rotation.z = Math.PI / 2;
    if (s < 0) badge.rotation.y = Math.PI;
    inner.add(badge);
  }
  void halfW;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !opts.lite; o.receiveShadow = false; } });
  // the hit buzz: a quick damped wobble (render only — the physics paddle does not move)
  let amp = 0, ph = 0;
  g.userData.vibrate = (a) => { amp = Math.min(1, amp + a); ph = 0; };
  g.userData.tick = (dt) => {
    if (amp < 0.002) { inner.rotation.set(0, 0, 0); inner.position.set(0, 0, 0); return; }
    ph += dt * 2 * Math.PI * 38;
    const s = Math.sin(ph) * amp;
    inner.rotation.x = s * 0.02; inner.rotation.y = s * 0.012;
    inner.position.z = s * 0.0012;
    amp *= Math.exp(-dt * 22);
  };
  g.userData.faces = { fh: fhMesh, bh: bhMesh };
  return g;
}
