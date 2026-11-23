// courses/bokor.js — CAMBODIA 3 「ボコー山 きりの高原」
// A misty loop round Bokor mountain: from the plateau by the old Bokor Palace hotel and the lonely stone church,
// down the cliff road high above the sea and a sea of clouds, round the hairpin on the cape of Wat Sampov Pram's
// boulders, past the waterfall in the jungle valley and back up the switchbacks.
import * as THREE from 'three';
import { part, merge, canvasTexture } from '../engine/util.js';
import { palaceRoof, stupaGeometry } from './khmer.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// weathered colonial stucco with stains and orange lichen, rows of arched openings
function hotelTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#cdbf9e'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(${90 + Math.random() * 40},${80 + Math.random() * 30},60,${0.08 + Math.random() * 0.12})`; ctx.fillRect(Math.random() * s, Math.random() * s * 0.3, 6 + Math.random() * 20, s * (0.3 + Math.random() * 0.6)); }
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(230,${120 + Math.random() * 50},40,${0.25 + Math.random() * 0.3})`; ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 6 + Math.random() * 18, 4 + Math.random() * 10, 0, 0, 7); ctx.fill(); }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const x = c * (s / 8) + 10, y = r * (s / 4) + 22, w = s / 8 - 20, h = s / 4 - 44;
      ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.fill();
    }
    ctx.fillStyle = 'rgba(60,50,40,0.35)'; for (let r = 1; r < 4; r++) ctx.fillRect(0, r * (s / 4) - 4, s, 6);
  });
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + 0.35 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 2) + 0.12 * Math.sin(y * 5 + seed);
    p.setXYZ(i, x * n, y * n * 0.8, z * n);
  }
  g.computeVertexNormals();
  return g;
}

export default {
  id: 'bokor',
  name: 'ボコー山 きりの高原',
  nameEn: 'Bokor Mountain Mist',
  tagline: '霧の 高原の 旧ホテルから、海と 雲海を 見下ろす 崖の 道へ。滝の 谷を ぬけて 山を 一周',
  seed: 71,
  points: [[0, 40, -150], [70, 39, -140], [118, 37, -112], [148, 33, -68], [168, 29, -10], [155, 24, 55], [112, 20, 108], [62, 17, 140], [28, 15, 188], [2, 14, 222], [-28, 13, 220], [-42, 12, 185], [-72, 10, 148], [-118, 8, 105], [-150, 9, 45], [-158, 13, -20], [-128, 19, -62], [-118, 25, -105], [-82, 31, -145], [-40, 37, -158]],
  itemRows: [0.15, 0.4, 0.68],
  boosts: [{ at: 0.05, d: -0.3 }, { at: 0.44, d: 0.3 }, { at: 0.77, d: 0 }],
  jumps: [{ at: 0.86 }],
  theme: {
    sky: { top: '#7f9cc0', horizon: '#dfe6ea', bottom: '#eef2f4', sunDir: [0.35, 0.42, 0.84], sunColor: '#fff6e0', sunSize: 0.004, sunGlow: 0.55, horizonSharp: 0.55 },
    fog: { color: '#d3dbe0', near: 30, far: 340 },
    hemi: { sky: '#e2ecf6', ground: '#7a8a6a', intensity: 1.35 },
    sun: { color: '#fff1d8', intensity: 1.9, dir: [0.35, 0.8, 0.5] },
    envIntensity: 0.6,
    bloom: { strength: 0.32, radius: 0.45, threshold: 2.2 },
    dust: '#a8a090', mapColor: '#5fc08a',
  },
  road: {
    width: 16, curb: 0.9, shoulder: 4.5, bank: 6,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#5a5c60'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2200; i++) { ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; const r = Math.random() * 2 + 0.5; ctx.fillRect(Math.random() * s, Math.random() * s, r, r); }
      // patches and cracks of an old mountain road
      for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(40,40,44,0.14)'; ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 30 + Math.random() * 40, 20 + Math.random() * 30, Math.random() * 3, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(20,20,20,0.4)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { let x = Math.random() * s, y = Math.random() * s; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 40; y += 14; ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(s * 0.025, 0, s * 0.016, s); ctx.fillRect(s * 0.959, 0, s * 0.016, s);
      ctx.fillStyle = 'rgba(255,205,60,0.85)'; ctx.fillRect(s * 0.488, 0, s * 0.01, s); ctx.fillRect(s * 0.502, 0, s * 0.01, s);
    },
    roadRoughness: 0.85,
    curbColors: ['#ffd23b', '#2a2a2a'], curbLength: 3,
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#6f7a5a'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) { ctx.fillStyle = ['rgba(100,120,80,0.6)', 'rgba(60,60,55,0.4)', 'rgba(150,150,130,0.35)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    },
    shoulderRoughness: 0.95,
    wall: { color: '#e4e2da', height: 0.95, thickness: 0.6, roughness: 0.8,
      map(ctx, s) { ctx.fillStyle = '#e8e6de'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#d23a32'; for (let x = 0; x < s; x += s / 2) ctx.fillRect(x, 0, s / 4, s); ctx.fillStyle = 'rgba(80,110,60,0.35)'; ctx.fillRect(0, s * 0.8, s, s * 0.2); } },
    skirt: { color: '#77705f', depth: 2.2 },
  },
  music: {
    bpm: 132, root: 60, scale: 'dorian', progression: [0, 3, 6, 4], seed: 57,
    style: { lead: 'triangle', leadVoice: 'bell', drums: 'soft', bass: 'walk', arpType: 'sine', swing: 0.1, rhythm: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0] },
  },

  build({ track, props, rng, add, onUpdate }) {
    const N = track.N, P = track.P;
    const wallW = track.halfWidth + track.curb + track.shoulder;
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const time = { value: 0 };
    onUpdate((dt, t) => { time.value = t; });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const toy = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...o });
    const nearK = (pred, f0 = 0, f1 = 1) => { let best = 0, bd = Infinity; for (let k = Math.floor(f0 * N); k < f1 * N; k++) { const v = pred(P[k]); if (v < bd) { bd = v; best = k; } } return best; };

    // places to flatten for buildings: [x, z, radius, height]
    const kHotel = 0, kChurch = nearK((p) => Math.abs(p.x - 95) + Math.abs(p.z + 128), 0, 0.2), kFall = Math.round(0.69 * N), kCape = nearK((p) => -p.z, 0.4, 0.6);
    const pt = (k, d) => track.pointAt(k, d);
    const hotelP = pt(kHotel, -(wallW + 30)), churchP = pt(kChurch, wallW + 22);
    const capeP = pt(kCape, -(wallW + 18));
    const flats = [[hotelP.x, hotelP.z, 46, P[kHotel].y - 0.5], [churchP.x, churchP.z, 22, P[kChurch].y - 0.5], [c.x, c.z, 26, 92], [capeP.x, capeP.z, 26, P[kCape].y - 0.5]];

    // ---- terrain: the mountain rises inside the loop; outside, gentle jungle slopes to the north and west
    // and sheer cliffs above the sea to the south
    const size = 900, res = 170;
    const g = new THREE.PlaneGeometry(size, size, res, res);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const cc = new THREE.Color(), grass = new THREE.Color('#6a8a4a'), jungle = new THREE.Color('#2f5a32'), rock = new THREE.Color('#7d7a70'), heath = new THREE.Color('#8f9a64');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + c.x, z = pos.getZ(i) + c.z;
      let bd = Infinity, bk = 0;
      for (let k = 0; k < N; k += 2) { const p = P[k]; const d2 = (x - p.x) ** 2 + (z - p.z) ** 2; if (d2 < bd) { bd = d2; bk = k; } }
      const dist = Math.sqrt(bd), R = track.R[bk], p0 = P[bk];
      const lat = ((x - p0.x) * R.x + (z - p0.z) * R.z) / (R.x * R.x + R.z * R.z);
      const by = p0.y + R.y * Math.max(-wallW - 2, Math.min(wallW + 2, lat)) - 0.5;
      const n = props.fbm2(x * 0.013, z * 0.013);
      let y;
      const cliff = sm(10, 90, z - c.z);
      if (lat > 0) y = by + sm(wallW + 3, wallW + 95, dist) * 52 + n * 12 * sm(wallW + 3, wallW + 40, dist);
      else y = by - sm(wallW + 2, wallW + 16, dist) * cliff * 105 - sm(wallW + 2, wallW + 110, dist) * (1 - cliff) * 26 + n * 6 * (1 - cliff) * sm(wallW, wallW + 30, dist);
      for (const [fx, fz, fr, fy] of flats) { const d = Math.hypot(x - fx, z - fz); if (d < fr) y += (fy - y) * sm(fr, fr * 0.55, d); }
      pos.setY(i, y);
      const steep = lat < 0 ? cliff * sm(wallW + 2, wallW + 8, dist) : 0;
      cc.copy(dist < wallW + 3 ? heath : grass).lerp(jungle, sm(0.4, 0.75, n) * sm(wallW + 4, wallW + 30, dist)).lerp(rock, Math.max(steep, sm(60, 85, y) * 0.6));
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(c.x, 0, c.z);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true; add(ground);
    const seg = size / res, x0 = c.x - size / 2, z0 = c.z - size / 2, nn = res + 1;
    const H = (x, z) => {
      const fx = (x - x0) / seg, fz = (z - z0) / seg;
      const ix = Math.max(0, Math.min(res - 1, Math.floor(fx))), iz = Math.max(0, Math.min(res - 1, Math.floor(fz)));
      const tx = clamp01(fx - ix), tz = clamp01(fz - iz);
      const y00 = pos.getY(iz * nn + ix), y10 = pos.getY(iz * nn + ix + 1), y01 = pos.getY((iz + 1) * nn + ix), y11 = pos.getY((iz + 1) * nn + ix + 1);
      return (y00 * (1 - tx) + y10 * tx) * (1 - tz) + (y01 * (1 - tx) + y11 * tx) * tz;
    };

    // ---- the sea far below, islands, and a sea of clouds under the cliffs
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#6f93a8', roughness: 0.3, metalness: 0.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(c.x, -72, c.z + 600); add(sea);
    const isl = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    add(props.inst(isl, new THREE.MeshStandardMaterial({ color: '#5f7a6a', roughness: 1 }), [[-300, 700, 160, 30], [250, 900, 220, 40], [700, 600, 120, 24]].map(([x, z, r, h]) => ({ x: c.x + x, y: -72, z: c.z + z, s: [r, h, r * 0.6] }))));
    const puff = merge([0, 1, 2, 3, 4, 5].map((i) => part(new THREE.SphereGeometry(1, 9, 7), '#ffffff', [Math.cos(i) * 0.7, (i % 2) * 0.2, Math.sin(i * 1.3) * 0.6], [0, 0, 0], 0.6 + (i % 3) * 0.15)));
    const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#e8eef4', emissiveIntensity: 0.35, transparent: true, opacity: 0.92 });
    const clouds = [];
    for (let i = 0; i < 90; i++) {
      const a = -0.3 + rng.next() * (Math.PI + 0.6), r = 220 + rng.next() * 380;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r * 1.1 + 40;
      if (z < c.z + 40) continue;
      const s = 25 + rng.next() * 40;
      clouds.push({ x, y: -38 + rng.next() * 24, z, s: [s, s * 0.35, s * 0.8], ry: rng.next() * 6 });
    }
    // a few drifting cloud banks level with the cape road (outside the walls)
    for (let i = 0; i < 14; i++) {
      const k = Math.round((0.38 + rng.next() * 0.3) * N), v = pt(k, -(wallW + 30 + rng.next() * 60));
      const s = 12 + rng.next() * 14;
      clouds.push({ x: v.x, y: P[k].y - 14 + rng.next() * 8, z: v.z, s: [s, s * 0.4, s * 0.8], ry: rng.next() * 6 });
    }
    add(props.inst(puff, cloudMat, clouds));

    // ---- Bokor Palace: the long four-storey hotel, abandoned and lichen-stained, beside the start
    const hotelMat = new THREE.MeshStandardMaterial({ map: hotelTexture(), roughness: 0.95 });
    const plain = new THREE.MeshStandardMaterial({ color: '#c2b493', roughness: 0.95 });
    {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(unit, [plain, plain, plain, plain, hotelMat, hotelMat]); body.scale.set(58, 17, 15); body.position.y = 8.5; body.castShadow = true; grp.add(body);
      const wing = new THREE.Mesh(unit, [hotelMat, hotelMat, plain, plain, plain, plain]); wing.scale.set(14, 13, 30); wing.position.set(-30, 6.5, -6); wing.castShadow = true; grp.add(wing);
      const tower = new THREE.Mesh(unit, [hotelMat, hotelMat, plain, plain, hotelMat, hotelMat]); tower.scale.set(10, 22, 10); tower.position.set(18, 11, 2); tower.castShadow = true; grp.add(tower);
      const parapet = new THREE.Mesh(unit, plain); parapet.scale.set(59, 1, 16); parapet.position.y = 17.4; grp.add(parapet);
      const terrace = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: '#9a917c', roughness: 0.95 })); terrace.scale.set(70, 1, 30); terrace.position.set(-4, 0, 6); terrace.receiveShadow = true; grp.add(terrace);
      grp.position.set(hotelP.x, P[kHotel].y - 1, hotelP.z);
      grp.lookAt(P[kHotel].x, grp.position.y, P[kHotel].z);
      add(grp);
      // a sign by the road
      const signTex = canvasTexture(512, (ctx, s) => {
        ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, 0, s, s / 2);
        ctx.fillStyle = '#f3e6c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 64px "M PLUS Rounded 1c", sans-serif'; ctx.fillText('BOKOR', s / 2, s * 0.15);
        ctx.font = '800 34px "M PLUS Rounded 1c", sans-serif'; ctx.fillText('ボコー国立公園  1079 m', s / 2, s * 0.34);
      }, { repeat: false, w: 512, h: 256 });
      const sg = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.3), [plain, plain, plain, plain, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }), plain]);
      board.position.y = 3.6; board.rotation.y = Math.PI; sg.add(board);
      for (const x of [-2.8, 2.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.5, 6), new THREE.MeshStandardMaterial({ color: '#4a3020' })); p.position.set(x, 1.75, 0); sg.add(p); }
      track.placeOn(sg, 12, -(wallW + 3), 0); add(sg);
    }

    // ---- the old stone church with its square bell tower
    {
      const stone = new THREE.MeshStandardMaterial({ map: canvasTexture(128, (ctx, s) => {
        ctx.fillStyle = '#8f8a7c'; ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? 12 : 0; x < s; x += 24) { ctx.fillStyle = `rgb(${120 + Math.random() * 30},${115 + Math.random() * 30},${100 + Math.random() * 25})`; ctx.fillRect(x + 1, y + 1, 22, 14); }
        for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(220,140,40,0.35)'; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 4, 0, 7); ctx.fill(); }
      }), roughness: 0.95 });
      const grp = new THREE.Group();
      const nave = new THREE.Mesh(unit, stone); nave.scale.set(9, 7, 18); nave.position.y = 3.5; nave.castShadow = true; grp.add(nave);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.6, 4, 4, 1), new THREE.MeshStandardMaterial({ color: '#6a3a2a', roughness: 0.8 })); roof.scale.set(1, 1, 2.1); roof.rotation.y = Math.PI / 4; roof.position.y = 9; grp.add(roof);
      const tow = new THREE.Mesh(unit, stone); tow.scale.set(5, 15, 5); tow.position.set(0, 7.5, 10.5); tow.castShadow = true; grp.add(tow);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.9, 5, 4), new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.8 })); cap.rotation.y = Math.PI / 4; cap.position.set(0, 17.5, 10.5); grp.add(cap);
      const cross = merge([part(unit, '#d8d0c0', [0, 0, 0], [0, 0, 0], [0.3, 2, 0.3]), part(unit, '#d8d0c0', [0, 0.4, 0], [0, 0, 0], [1.2, 0.3, 0.3])]);
      const cr = new THREE.Mesh(cross, toy()); cr.position.set(0, 21, 10.5); grp.add(cr);
      grp.position.set(churchP.x, P[kChurch].y - 0.6, churchP.z);
      grp.lookAt(P[kChurch].x, grp.position.y, P[kChurch].z); grp.rotateY(Math.PI / 2);
      add(grp);
    }

    // ---- the summit: a radio mast
    {
      const mast = new THREE.Group();
      const leg = new THREE.CylinderGeometry(0.25, 0.25, 60, 6);
      for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) { const l = new THREE.Mesh(leg, new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 0.5, roughness: 0.4 })); l.position.set(x * (1 - 0), 30, z); l.rotation.set(-z * 0.03, 0, x * 0.03); mast.add(l); }
      for (let y = 8; y < 60; y += 8) { const r = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 4.2), new THREE.MeshStandardMaterial({ color: '#d23a32' })); r.position.y = y; mast.add(r); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), props.glow('#ff4030', 2.2)); lamp.position.y = 61; mast.add(lamp);
      mast.position.set(c.x, H(c.x, c.z), c.z); add(mast);
    }

    // ---- Wat Sampov Pram on the cape: great boulders, a small pagoda and stupas at the cliff's edge
    {
      const v = capeP, y = H(v.x, v.z);
      const rocks = [];
      for (let i = 0; i < 9; i++) rocks.push({ x: v.x + (rng.next() - 0.5) * 30, y: y + 2, z: v.z + (rng.next() - 0.5) * 18, s: [5 + rng.next() * 6, 4 + rng.next() * 5, 7 + rng.next() * 7], ry: rng.next() * 6 });
      add(props.inst(rockGeometry(3), new THREE.MeshStandardMaterial({ color: '#8d877a', roughness: 1, flatShading: true }), rocks, { cast: true }));
      const hall = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: '#f1e6cf', roughness: 0.7 })); hall.scale.set(7, 4, 11); hall.position.set(v.x + 6, H(v.x + 6, v.z + 10) + 2, v.z + 10); hall.castShadow = true; add(hall);
      const roof = new THREE.Mesh(palaceRoof({ w: 8, d: 12, tiers: 2, roof: '#e0702a', trim: '#f2c14e' }), toy({ roughness: 0.5 })); roof.position.set(hall.position.x, hall.position.y + 2, hall.position.z); add(roof);
      add(props.inst(stupaGeometry(), new THREE.MeshStandardMaterial({ color: '#f2eee4', roughness: 0.6 }), [[-8, -6], [-12, 4]].map(([dx, dz]) => ({ x: v.x + dx, y: H(v.x + dx, v.z + dz), z: v.z + dz, s: [1.8, 6, 1.8] })), { cast: true }));
    }

    // ---- the waterfall in the valley: a rock face, falling water, a pool and spray
    {
      const k = kFall, v = pt(k, wallW + 16), base = H(v.x, v.z);
      const faceDir = new THREE.Vector3().subVectors(P[k], v).setY(0).normalize();
      const rocks = [];
      for (let i = 0; i < 16; i++) {
        const side = (rng.next() - 0.5) * 30, up = rng.next() * 26;
        rocks.push({ x: v.x - faceDir.x * 6 + -faceDir.z * side, y: base + up, z: v.z - faceDir.z * 6 + faceDir.x * side, s: [8 + rng.next() * 6, 7 + rng.next() * 5, 7], ry: rng.next() * 6 });
      }
      add(props.inst(rockGeometry(7), new THREE.MeshStandardMaterial({ color: '#6d6a60', roughness: 1, flatShading: true }), rocks, { cast: true }));
      const fallTex = canvasTexture(128, (ctx, s) => {
        ctx.fillStyle = 'rgba(220,235,245,0.55)'; ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.5})`; ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 18 + Math.random() * 40); }
      });
      fallTex.repeat.set(2, 3);
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 30), new THREE.MeshStandardMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.3, emissive: '#cfe6f2', emissiveIntensity: 0.25, side: THREE.DoubleSide }));
      fall.position.set(v.x - faceDir.x * 1, base + 15, v.z - faceDir.z * 1);
      fall.lookAt(fall.position.x + faceDir.x, fall.position.y, fall.position.z + faceDir.z);
      add(fall);
      onUpdate((dt) => { fallTex.offset.y += dt * 1.4; });
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshStandardMaterial({ color: '#5f8ea6', roughness: 0.15, metalness: 0.4 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(v.x + faceDir.x * 5, base + 0.15, v.z + faceDir.z * 5); add(pool);
      const spray = props.motes(120, { center: new THREE.Vector3(v.x + faceDir.x * 4, 0, v.z + faceDir.z * 4), spread: [16, 8, 16], yBase: base + 0.5, size: 0.5, colors: ['#ffffff', '#dff2ff'], speed: 0.9, blink: 0.2, rise: 1.2, glow: 0.9 }, rng);
      add(spray); onUpdate((dt, t) => spray.userData.update(dt, t));
    }

    // ---- trees: jungle on the slopes, low heath shrubs on the plateau, mossy boulders
    const canopy = merge([part(new THREE.SphereGeometry(1, 8, 6), '#2f6a3a', [0, 0, 0], [0, 0, 0], [1, 0.75, 1]), part(new THREE.SphereGeometry(1, 8, 6), '#3a7a44', [0.55, 0.25, 0.2], [0, 0, 0], [0.65, 0.55, 0.65]), part(new THREE.SphereGeometry(1, 8, 6), '#24562f', [-0.5, 0.2, -0.35], [0, 0, 0], [0.7, 0.55, 0.7])]);
    const trunkG = new THREE.CylinderGeometry(0.06, 0.1, 1, 6); trunkG.translate(0, 0.5, 0);
    const treeMat = toy({ roughness: 0.95 }), trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 1 });
    const trunks = [], crowns = [], shrubs = [], stones = [];
    const tryTree = (x, z) => {
      if (!track.clearOfRoad(x, z, 4)) return;
      for (const [fx, fz, fr] of flats) if (Math.hypot(x - fx, z - fz) < fr) return;
      const y = H(x, z);
      if (y < -20) return;
      const plateau = y > 32 && Math.hypot(x - c.x, z - c.z) > 120;
      if (plateau && rng.next() < 0.7) { const s = 1.2 + rng.next() * 1.4; shrubs.push({ x, y: y + s * 0.3, z, s: [s, s * 0.7, s], c: rng.next() < 0.5 ? '#7a8a4a' : '#9a8a5a' }); return; }
      const h = 9 + rng.next() * 12, s = 4 + rng.next() * 4;
      trunks.push({ x, y: y - 0.5, z, s: [h * 0.9, h, h * 0.9] });
      crowns.push({ x, y: y + h, z, s: [s, s, s], ry: rng.next() * 6 });
    };
    for (const p of props.beside(track, rng, 260, { min: 3, max: 70, margin: 3 })) tryTree(p.x, p.z);
    for (const p of props.around(track, rng, 260, { rMin: 0, rMax: 330, margin: 12 })) tryTree(p.x, p.z);
    for (const p of props.beside(track, rng, 60, { min: 1, max: 12, margin: 1 })) { const s = 0.8 + rng.next() * 1.8; stones.push({ x: p.x, y: H(p.x, p.z) + s * 0.3, z: p.z, s: [s, s * 0.8, s], ry: rng.next() * 6 }); }
    add(props.inst(trunkG, trunkMat, trunks, { cast: true }));
    add(props.inst(canopy, treeMat, crowns, { cast: true }));
    add(props.inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), shrubs));
    add(props.inst(rockGeometry(11), new THREE.MeshStandardMaterial({ color: '#7f8a6a', roughness: 1, flatShading: true }), stones, { cast: true }));

    // ---- yellow hairpin warning signs
    const warn = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#ffd23b'; ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68); ctx.restore();
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 0.38, s * 0.72); ctx.lineTo(s * 0.38, s * 0.45); ctx.arc(s * 0.5, s * 0.45, s * 0.12, Math.PI, 0); ctx.lineTo(s * 0.62, s * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.55, s * 0.55); ctx.lineTo(s * 0.62, s * 0.64); ctx.lineTo(s * 0.69, s * 0.55); ctx.stroke();
    }, { repeat: false });
    const warnMat = new THREE.MeshStandardMaterial({ map: warn, transparent: true, alphaTest: 0.5, roughness: 0.6 });
    for (const f of [0.45, 0.62, 0.8]) {
      const sg = new THREE.Group();
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), warnMat); pl.position.y = 2.6; pl.rotation.y = Math.PI; sg.add(pl);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#888' })); pole.position.y = 1.2; sg.add(pole);
      track.placeOn(sg, Math.round(f * N), wallW + 1.6, 0); add(sg);
    }

    // ---- drifting mist motes and the start gate
    const mist = props.motes(260, { center: c, spread: [560, 40, 560], yBase: 2, size: 1.4, colors: ['#ffffff', '#eef4f8'], speed: 0.25, blink: 0, glow: 0.45 }, rng);
    add(mist); onUpdate((dt, t) => mist.userData.update(dt, t));
    add(props.startGate(track, { pillar: '#e8e2d4', accent: '#3a8a5a', banner: '#3a2a1a', lights: '#ffe08a', text: 'BOKOR' }));
  },
};
