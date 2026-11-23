// courses/phnompenh.js — CAMBODIA 2 「プノンペン・リバーサイド」
// Sunset in the capital: up the riverside promenade (palms, the flags of many nations, food stalls) past the
// Royal Palace, over the river on the Japanese Friendship Bridge, round the Chroy Changvar peninsula and back on
// the new arch bridge, round the hill of Wat Phnom, down the boulevard past the Independence Monument.
import * as THREE from 'three';
import { part, merge, canvasTexture, hsl } from '../engine/util.js';
import { prangGeometry, stupaGeometry, palaceRoof, spireGeometry, nagaGeometry, faceTexture, coconutPalmGeometry, flagTexture, shophouseRow, khmerTexture, worldMapped, ElephantWalk } from './khmer.js';

const RIVER_W = 75, RIVER_E = 195;
const GOLD = '#f2c14e';

// big window cells (tiny bright specks would shimmer as you drive past)
function windowsTexture(base, lit) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const on = Math.random() < 0.4;
      ctx.fillStyle = on ? lit : 'rgba(40,55,80,0.9)'; ctx.fillRect(x * 64 + 10, y * 32 + 6, 44, 20);
    }
  });
}

function tuktukGeometry(color) {
  return merge([
    part(new THREE.BoxGeometry(1.5, 0.15, 2.0), '#3a3a3a', [0, 0.55, -0.2]),
    part(new THREE.BoxGeometry(1.4, 0.7, 1.3), color, [0, 0.95, -0.4]),
    part(new THREE.BoxGeometry(1.55, 0.08, 1.7), '#2a2a2a', [0, 1.95, -0.35]),
    ...[[-0.7, -0.9], [0.7, -0.9], [-0.7, 0.3], [0.7, 0.3]].map(([x, z]) => part(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), '#c0c0c0', [x, 1.25, z - 0.35])),
    part(new THREE.BoxGeometry(0.35, 0.45, 1.1), '#b02a2a', [0, 0.75, 1.1]),
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), '#c0c0c0', [0, 1.15, 1.45], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), '#1a1a1a', [0, 0.3, 1.5], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 12), '#1a1a1a', [-0.75, 0.33, -0.6], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 12), '#1a1a1a', [0.75, 0.33, -0.6], [0, 0, Math.PI / 2]),
  ]);
}

function boatGeometry(hull, roof, len = 18) {
  const h = new THREE.CylinderGeometry(1, 1, len, 16, 1, false, Math.PI, Math.PI);
  h.rotateX(Math.PI / 2); h.scale(1.8, 1.1, 1);
  return merge([
    part(h, hull, [0, 0.9, 0]),
    part(new THREE.BoxGeometry(3.0, 0.2, len * 0.95), '#c8a878', [0, 0.9, 0]),
    part(new THREE.BoxGeometry(2.6, 1.6, len * 0.6), '#f4ead8', [0, 1.8, -len * 0.05]),
    part(new THREE.BoxGeometry(3.2, 0.2, len * 0.68), roof, [0, 2.7, -len * 0.05]),
    part(new THREE.ConeGeometry(0.5, 1.6, 6), roof, [0, 1.6, len * 0.48], [Math.PI / 2.4, 0, 0]),
  ]);
}

export default {
  id: 'phnompenh',
  name: 'プノンペン・リバーサイド',
  nameEn: 'Phnom Penh Riverside',
  tagline: '夕焼けの 川沿いを 走り、王宮・日本橋・ワット・プノンの 丘を めぐる 都の コース',
  seed: 61,
  points: [[45, 0, 60], [47, 0, 0], [50, 0, -55], [60, 0, -95], [95, 3, -118], [140, 7, -122], [185, 7, -122], [225, 3, -128], [252, 0, -155], [246, 0, -192], [215, 3, -198], [170, 7, -194], [115, 7, -194], [72, 3, -197], [32, 0, -208], [5, 0, -252], [-40, 0, -278], [-82, 0, -258], [-90, 0, -210], [-86, 0, -130], [-82, 0, -55], [-74, 0, 5], [-80, 0, 55], [-62, 0, 95], [-12, 0, 108], [32, 0, 98]],
  itemRows: [0.11, 0.33, 0.6, 0.86],
  boosts: [{ at: 0.04, d: -0.3 }, { at: 0.41, d: 0.3 }, { at: 0.77, d: 0 }],
  jumps: [{ at: 0.445 }],
  theme: {
    sky: { top: '#3c4f9a', horizon: '#ffad6a', bottom: '#ffd9a8', sunDir: [-0.92, 0.1, 0.25], sunColor: '#fff0c8', sunSize: 0.005, sunGlow: 0.45, horizonSharp: 0.42 },
    fog: { color: '#f4b98a', near: 150, far: 900 },
    hemi: { sky: '#bcd0ff', ground: '#d8a07a', intensity: 1.15 },
    sun: { color: '#ffd2a0', intensity: 2.5, dir: [-0.85, 0.42, 0.3] },
    envIntensity: 0.7,
    bloom: { strength: 0.38, radius: 0.4, threshold: 1.9 },
    dust: '#c8b49a', mapColor: '#ff9d3a',
  },
  road: {
    width: 17, curb: 0.9, shoulder: 5, bank: 4,
    roadColor: '#4c4e58', roadLine: 'rgba(255,255,255,0.9)', centerDash: 'rgba(255,214,90,0.85)',
    roadRoughness: 0.8,
    curbColors: ['#d92b2b', '#ffffff'],
    paintShoulder(ctx, s) { // pavement tiles
      ctx.fillStyle = '#b9b0a2'; ctx.fillRect(0, 0, s, s);
      const n = 8;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#c9bfae' : '#a99f90'; ctx.fillRect((x * s) / n + 1, (y * s) / n + 1, s / n - 2, s / n - 2);
      }
      for (let i = 0; i < 500; i++) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    },
    shoulderRoughness: 0.85,
    wall: { color: '#f3ead8', height: 1.05, thickness: 0.6, roughness: 0.6,
      map(ctx, s) { ctx.fillStyle = '#f3ead8'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#d8c79f'; for (let x = 0; x < s; x += s / 4) ctx.fillRect(x, 0, s / 16, s); ctx.fillStyle = GOLD; ctx.fillRect(0, 0, s, s / 10); } },
    skirt: { color: '#9ea4ae', depth: 1.8 },
  },
  music: {
    bpm: 138, root: 62, scale: 'mixolydian', progression: [0, 4, 6, 3], seed: 31,
    style: { lead: 'square', leadVoice: 'bell', drums: 'pop', bass: 'walk', arpType: 'triangle', swing: 0.08, rhythm: [1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0] },
  },

  build({ track, props, rng, add, onUpdate }) {
    const N = track.N, P = track.P;
    const wallW = track.halfWidth + track.curb + track.shoulder;
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const time = { value: 0 };
    onUpdate((dt, t) => { time.value = t; });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const toy = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...o });
    const box = (mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(unit, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; add(m); return m; };
    const onLand = (x) => x < RIVER_W - 2 || x > RIVER_E + 2;
    const nearK = (pred, f0 = 0, f1 = 1) => { let best = 0, bd = Infinity; for (let k = Math.floor(f0 * N); k < f1 * N; k++) { const v = pred(P[k]); if (v < bd) { bd = v; best = k; } } return best; };

    // ---- the city ground, the peninsula and the river between (banks of stone)
    const groundTex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#8f9a6e'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1500; i++) { ctx.fillStyle = ['rgba(120,140,80,0.5)', 'rgba(170,150,110,0.35)', 'rgba(60,70,40,0.3)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4); }
    });
    groundTex.repeat.set(40, 40);
    const gm = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
    const bank = new THREE.MeshStandardMaterial({ color: '#a89a82', roughness: 0.9 });
    const west = new THREE.Mesh(unit, [bank, bank, gm, bank, bank, bank]); west.scale.set(800, 4, 1400); west.position.set(RIVER_W - 400, -2.3, c.z); west.receiveShadow = true; add(west);
    const east = new THREE.Mesh(unit, [bank, bank, gm, bank, bank, bank]); east.scale.set(600, 4, 1400); east.position.set(RIVER_E + 300, -2.3, c.z); east.receiveShadow = true; add(east);
    // the river: warm sunset sparkles drifting downstream
    const water = new THREE.MeshStandardMaterial({ color: '#5a6e86', roughness: 0.18, metalness: 0.55 });
    water.onBeforeCompile = (sh) => {
      sh.uniforms.uT = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vMW; uniform float uT;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 q = vec2(vMW.x * 0.25, vMW.z * 0.06 + uT * 0.35);
          float w = n2(q) * n2(q * 2.3 + 7.0);
          totalEmissiveRadiance += vec3(1.0, 0.62, 0.3) * smoothstep(0.42, 0.62, w) * 0.55 + vec3(0.25, 0.18, 0.12) * n2(vMW.xz * 0.02);`);
    };
    water.customProgramCacheKey = () => 'pp-river';
    const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_E - RIVER_W + 4, 1400), water);
    river.rotation.x = -Math.PI / 2; river.position.set((RIVER_W + RIVER_E) / 2, -2.0, c.z); add(river);

    // ---- bridges: piers under the decks over the water; the Japanese bridge in pale concrete, the new one with red arches
    const isDeck = (k) => P[k].y > 1.2;
    const pierMat = new THREE.MeshStandardMaterial({ color: '#c9c4b8', roughness: 0.85 });
    const piers = [];
    for (let k = 0; k < N; k += 10) {
      if (!isDeck(k)) continue;
      const R = track.R[k], base = onLand(P[k].x) ? -0.3 : -2.2, h = P[k].y - 1.8 - base;
      if (h < 0.3) continue;
      for (const d of [-6, 6]) piers.push({ x: P[k].x + R.x * d, y: base + h / 2, z: P[k].z + R.z * d, s: [2.2, h, 3.4], ry: Math.atan2(track.T[k].x, track.T[k].z) });
    }
    add(props.inst(unit, pierMat, piers, { cast: true }));
    const bridgeOut = nearK((p) => Math.abs(p.x - 135) + Math.abs(p.z + 122), 0.1, 0.3);
    const bridgeBack = nearK((p) => Math.abs(p.x - 135) + Math.abs(p.z + 194), 0.35, 0.5);
    // lamp posts along both decks
    const lampPost = merge([part(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), '#4a5a6a', [0, 3.5, 0]), part(new THREE.BoxGeometry(1.6, 0.12, 0.2), '#4a5a6a', [-0.7, 7, 0])]);
    const lampMat = toy({ roughness: 0.5, metalness: 0.4 });
    const bulbs = [], posts = [];
    for (let k = 0; k < N; k += 8) {
      if (!isDeck(k)) continue;
      for (const s of [-1, 1]) {
        // the arm (local −x) leans out over the road
        const v = track.pointAt(k, s * (wallW + 0.3)), h = Math.atan2(track.T[k].x, track.T[k].z);
        posts.push({ x: v.x, y: v.y, z: v.z, ry: s > 0 ? h + Math.PI : h });
        const lb = track.pointAt(k, s * (wallW - 1.1));
        bulbs.push({ x: lb.x, y: v.y + 6.85, z: lb.z, s: 0.35 });
      }
    }
    add(props.inst(lampPost, lampMat, posts, { cast: true }));
    add(props.inst(new THREE.SphereGeometry(1, 8, 6), props.glow('#ffe2a8', 1.6), bulbs));
    // the new bridge's tied arches (one each side), with hangers
    {
      const k0 = bridgeBack - 26, k1 = bridgeBack + 26;
      const archMat = new THREE.MeshStandardMaterial({ color: '#d2452f', roughness: 0.45, metalness: 0.3 });
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const k = k0 + ((k1 - k0) * i) / 24, u = i / 24;
          const v = track.pointAt(k, s * (wallW + 1.2)); v.y += 1 + Math.sin(u * Math.PI) * 18;
          pts.push(v);
        }
        add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.7, 8), archMat));
        const hang = [];
        for (let i = 2; i < 23; i += 2) {
          const k = k0 + ((k1 - k0) * i) / 24, u = i / 24, v = track.pointAt(k, s * (wallW + 1.2)), h = Math.sin(u * Math.PI) * 18;
          hang.push({ x: v.x, y: v.y + 1 + h / 2, z: v.z, s: [0.12, h, 0.12] });
        }
        add(props.inst(unit, archMat, hang));
      }
    }
    // a friendship plaque with both flags at the west end of the Japanese bridge
    {
      const k = nearK((p) => Math.abs(p.x - 78) + Math.abs(p.z + 120), 0.08, 0.22);
      const sign = canvasTexture(512, (ctx, s) => {
        ctx.fillStyle = '#1d3b6e'; ctx.fillRect(0, 0, s, s / 2);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 46px "M PLUS Rounded 1c", sans-serif'; ctx.fillText('日本カンボジア友好橋', s / 2, s * 0.14);
        ctx.font = '700 30px sans-serif'; ctx.fillText('CAMBODIA – JAPAN FRIENDSHIP BRIDGE', s / 2, s * 0.32);
        ctx.strokeStyle = GOLD; ctx.lineWidth = 8; ctx.strokeRect(6, 6, s - 12, s / 2 - 12);
      }, { repeat: false, w: 512, h: 256 });
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.25 }));
      board.position.y = 5; board.rotation.y = Math.PI; g.add(board);
      for (const x of [-4, 4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 8), pierMat); p.position.set(x, 3.5, 0.1); g.add(p); }
      track.placeOn(g, k, -(wallW + 5), 0); add(g);
      // the two flags
      const jp = canvasTexture(128, (ctx, s) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.24, 0, Math.PI * 2); ctx.fill(); }, { repeat: false });
      [[jp, -(wallW + 11)], [flagTexture('kh'), (wallW + 4)]].forEach(([tex, d], i) => {
        const fg = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 8), pierMat); pole.position.y = 5; fg.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4, 6, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
        flag.position.set(1.9, 8.6, 0); fg.add(flag);
        track.placeOn(fg, k + 4 + i * 3, d, 0); add(fg);
        flutter(flag, i);
      });
    }

    // ---- the riverside promenade: palms, the row of flags, lamps, food stalls with string lights
    const palmGeo = coconutPalmGeometry(rng, 0.16);
    const palmMat = toy({ roughness: 0.85 });
    const palms = [], flagPoles = [];
    const flagMats = [0, 1, 2, 3, 4].map((i) => new THREE.MeshStandardMaterial({ map: flagTexture(i), side: THREE.DoubleSide, roughness: 0.8 }));
    const khFlag = new THREE.MeshStandardMaterial({ map: flagTexture('kh'), side: THREE.DoubleSide, roughness: 0.8 });
    const flags = [];
    const flagGeo = new THREE.PlaneGeometry(2.6, 1.7, 6, 1); flagGeo.translate(1.35, 0, 0);
    const kRiverEnd = nearK((p) => Math.abs(p.z + 90), 0, 0.12);
    for (let k = N - 30; k < N + kRiverEnd; k += 3) {
      const kk = k % N;
      const v = track.pointAt(kk, wallW + 3.5);
      if (v.x > RIVER_W - 3) continue;
      if (kk % 9 === 0) palms.push({ x: v.x + 3, y: -0.3, z: v.z, s: [12 + rng.next() * 4, 12 + rng.next() * 4, 12 + rng.next() * 4], ry: rng.next() * 6 });
      if (kk % 6 === 3) {
        flagPoles.push({ x: v.x, y: 4, z: v.z, s: [0.09, 8.6, 0.09] });
        const f = new THREE.Mesh(flagGeo, (kk / 6) % 3 === 0 ? khFlag : flagMats[Math.floor(kk / 6) % 5]);
        f.position.set(v.x, 7.4, v.z); add(f); flags.push(f);
      }
    }
    add(props.inst(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.4, metalness: 0.5 }), flagPoles));
    flags.forEach((f, i) => flutter(f, i));
    function flutter(mesh, i) {
      const pos = mesh.geometry.attributes.position;
      if (!mesh.geometry.userData.base) { mesh.geometry = mesh.geometry.clone(); mesh.geometry.userData.base = Float32Array.from(mesh.geometry.attributes.position.array); }
      const base = mesh.geometry.userData.base, p2 = mesh.geometry.attributes.position;
      onUpdate((dt, t) => {
        if (!mesh.visible) return;
        for (let j = 0; j < p2.count; j++) { const x = base[j * 3]; p2.setZ(j, Math.sin(x * 2.2 - t * 5 + i) * 0.18 * Math.max(0, x) / 2.6); }
        p2.needsUpdate = true;
      });
      mesh.rotation.y = Math.PI / 2 + 0.2;
      return pos;
    }
    // food stalls with string lights along the start straight
    const stallGeo = merge([part(new THREE.BoxGeometry(3, 1.1, 2), '#b57a42', [0, 0.55, 0]), part(new THREE.BoxGeometry(3.4, 0.12, 2.6), '#d84a3a', [0, 2.4, 0]), ...[[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]].map(([x, z]) => part(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), '#6a5a4a', [x, 1.2, z]))]);
    const stalls = [], bulbList = [];
    for (let k = 12; k < kRiverEnd - 10; k += 7) {
      const v = track.pointAt(k, wallW + 7.5);
      if (v.x > RIVER_W - 4) continue;
      stalls.push({ x: v.x, y: -0.3, z: v.z, ry: Math.atan2(track.T[k].x, track.T[k].z) });
      for (let i = 0; i < 6; i++) bulbList.push({ x: v.x - 1.5 + i * 0.6, y: 2.6 + Math.sin(i) * 0.1, z: v.z, s: 0.12, c: hsl(i / 6, 0.9, 0.65).multiplyScalar(1.8) });
    }
    add(props.inst(stallGeo, toy(), stalls, { cast: true }));
    add(props.inst(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbList));

    // ---- the Royal Palace: yellow walls, the Throne Hall with its tall spire, the Silver Pagoda, a riverside pavilion
    const PX0 = -58, PX1 = 20, PZ0 = -25, PZ1 = 70;
    const palaceWall = new THREE.MeshStandardMaterial({ color: '#f1d98a', roughness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: '#f6efe0', roughness: 0.6 });
    for (const [x, z, sx, sz] of [[(PX0 + PX1) / 2, PZ0, PX1 - PX0, 1.2], [(PX0 + PX1) / 2, PZ1, PX1 - PX0, 1.2], [PX0, (PZ0 + PZ1) / 2, 1.2, PZ1 - PZ0], [PX1, (PZ0 + PZ1) / 2, 1.2, PZ1 - PZ0]]) {
      box(palaceWall, x, 2.2, z, sx, 4.4, sz);
      box(new THREE.MeshStandardMaterial({ color: '#e0b84a', roughness: 0.5 }), x, 4.55, z, sx + 0.4, 0.3, sz + 0.4);
    }
    const roofMat = toy({ roughness: 0.45, metalness: 0.15 });
    const hall = (x, z, w, d, h, tiers, spire = 0, faces = false) => {
      box(white, x, h / 2, z, w, h, d);
      box(palaceWall, x, 0.6, z, w + 3, 1.2, d + 3);
      const r = new THREE.Mesh(palaceRoof({ w: w + 2, d: d + 2, tiers, roof: '#e0702a', trim: GOLD }), roofMat);
      r.position.set(x, h, z); r.castShadow = true; add(r);
      if (spire) {
        const top = h + (w + 2) * 0.32 * (tiers - 1) + (w + 2) * 0.42 * (1 - (tiers - 1) * 0.18);
        if (faces) {
          const ft = faceTexture({ stone: '#e9c766', dark: '#8a6a1a' });
          const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.5, metalness: 0.3 });
          const fb = new THREE.Mesh(unit, fm); fb.scale.set(3.4, 3.8, 3.4); fb.position.set(x, top + 1.3, z); add(fb);
        }
        const sp = new THREE.Mesh(spireGeometry(GOLD), toy({ roughness: 0.3, metalness: 0.6 }));
        sp.scale.set(3.4, spire, 3.4); sp.position.set(x, top + (faces ? 3.2 : 0), z); sp.castShadow = true; add(sp);
      }
    };
    hall(-20, 22, 14, 34, 7, 3, 24, true);   // Throne Hall
    hall(-22, 56, 11, 20, 5.5, 2, 10);        // Silver Pagoda
    hall(-46, 4, 8, 14, 4.5, 2, 0);
    // Chanchhaya pavilion on the east wall, facing the river
    {
      const x = PX1 - 6, z = 18;
      for (const [px, pz] of [[-4, -6], [4, -6], [-4, 6], [4, 6]]) box(white, x + px, 3.5, z + pz, 0.8, 7, 0.8);
      box(palaceWall, x, 4.8, z, 10, 0.6, 14);
      const r = new THREE.Mesh(palaceRoof({ w: 11, d: 15, tiers: 2, roof: '#e0702a', trim: GOLD }), roofMat); r.position.set(x, 5.1, z); r.rotation.y = Math.PI / 2; add(r);
    }
    // stupas in the pagoda's yard
    const stupaGeo = stupaGeometry();
    const stupaMat = new THREE.MeshStandardMaterial({ color: '#f2eee4', roughness: 0.6 });
    add(props.inst(stupaGeo, stupaMat, [[-40, 60], [-4, 60], [-40, 40], [-4, 40]].map(([x, z]) => ({ x, y: 0, z, s: [2.4, 7, 2.4] })), { cast: true }));

    // ---- Wat Phnom: the hill with its white stupa and temple, naga stairs, trees
    const WX = -40, WZ = -228;
    {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5f8a4a', roughness: 1 }));
      hill.scale.y = 0.48; hill.position.set(WX, -0.5, WZ); hill.receiveShadow = true; add(hill);
      const st = new THREE.Mesh(stupaGeo, stupaMat); st.scale.set(6, 24, 6); st.position.set(WX + 3, 13.6, WZ); st.castShadow = true; add(st);
      const gilt = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), toy({ roughness: 0.3, metalness: 0.7 })); gilt.position.set(WX + 3, 37.8, WZ); add(gilt);
      box(white, WX - 8, 15.5, WZ, 10, 4, 7);
      const r = new THREE.Mesh(palaceRoof({ w: 9, d: 12, tiers: 2, roof: '#e0702a', trim: GOLD, cross: false }), roofMat); r.position.set(WX - 8, 17.5, WZ); r.rotation.y = Math.PI / 2; add(r);
      // stairs down the east side with a naga on each side
      const stairs = box(new THREE.MeshStandardMaterial({ color: '#d8cfbd', roughness: 0.8 }), WX + 22, 6, WZ, 18, 1, 6);
      stairs.rotation.z = -0.62;
      const nagaGeo = nagaGeometry('#3f8a4a', '#4fa05a');
      for (const s of [-1, 1]) { const n = new THREE.Mesh(nagaGeo, toy()); n.scale.setScalar(1.3); n.position.set(WX + 31, -0.3, WZ + s * 3.6); n.rotation.y = Math.PI / 2; add(n); }
      const trees = [];
      for (let i = 0; i < 26; i++) {
        const a = rng.next() * Math.PI * 2, r = 10 + rng.next() * 18;
        const x = WX + Math.cos(a) * r, z = WZ + Math.sin(a) * r, y = -0.5 + 14.4 * Math.sqrt(Math.max(0, 1 - (r / 30) ** 2));
        if (Math.abs(z - WZ) < 5 && x > WX + 8) continue;
        const s = 4 + rng.next() * 3;
        trees.push({ x, y: y + s * 0.6, z, s: [s, s * 0.9, s] });
      }
      add(props.inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.9, flatShading: true }), trees, { cast: true }));
    }

    // an elephant walking round the foot of the hill
    {
      const arc = []; for (let a = 1.9; a <= 4.2; a += 0.25) arc.push([WX + Math.cos(a) * 34, WZ + Math.sin(a) * 34]);
      const herd = new ElephantWalk({ paths: [arc], ground: () => -0.3, scale: 1.4, speed: 0.9, rng: () => rng.next() });
      add(herd.group); onUpdate((dt) => herd.update(dt));
    }

    // ---- Independence Monument: a lotus tower of naga heads on a square plinth
    {
      const IX = -112, IZ = 5;
      const sand = worldMapped(new THREE.MeshStandardMaterial({ map: khmerTexture('sandstone'), color: '#e09a78', roughness: 0.8 }), 5);
      box(sand, IX, 1, IZ, 22, 2, 22);
      box(sand, IX, 3.5, IZ, 14, 3, 14);
      const tower = new THREE.Mesh(prangGeometry({ tiers: 5, sides: 4, color: '#d08a5e', band: '#f0c070' }), toy({ roughness: 0.7 }));
      tower.scale.set(7, 30, 7); tower.position.set(IX, 5, IZ); tower.castShadow = true; add(tower);
      const nagaGeo = nagaGeometry('#d08a5e', '#e09a6a');
      for (let i = 0; i < 4; i++) {
        for (const y of [6, 11, 16]) {
          const n = new THREE.Mesh(nagaGeo, toy()); const a = (i * Math.PI) / 2 + Math.PI / 4, r = 6.4 - (y - 6) * 0.22;
          n.scale.setScalar(0.75); n.position.set(IX + Math.cos(a) * r, y, IZ + Math.sin(a) * r); n.rotation.y = -a + Math.PI / 2; add(n);
        }
      }
      // fountains around it
      const jets = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; jets.push({ x: IX + Math.cos(a) * 12.5, y: 1.5, z: IZ + Math.sin(a) * 12.5, s: [0.4, 3, 0.4] }); }
      add(props.inst(new THREE.CylinderGeometry(0.4, 1, 1, 8), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.6, roughness: 0.1 }), jets));
    }

    // ---- the city: shophouse rows along the streets, towers beyond (lit windows at sunset)
    const houseMat = toy({ roughness: 0.8 });
    const placeRow = (k, side, n) => {
      const kk = ((k % N) + N) % N, v = track.pointAt(kk, side * (wallW + 10));
      if (!onLand(v.x) || v.x > RIVER_W - 28 || !track.clearOfRoad(v.x, v.z, 4)) return; // the riverside is a promenade
      if (v.x > PX0 - 12 && v.x < PX1 + 12 && v.z > PZ0 - 12 && v.z < PZ1 + 12) return;
      if (Math.hypot(v.x - WX, v.z - WZ) < 44 || Math.hypot(v.x + 112, v.z - 5) < 30) return;
      const m = new THREE.Mesh(shophouseRow(rng, n), houseMat);
      m.position.set(v.x, -0.3, v.z); m.rotation.y = Math.atan2(track.T[kk].x, track.T[kk].z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2); // front to the road
      m.castShadow = true; m.receiveShadow = true; add(m);
    };
    for (let k = 0; k < N; k += 12) { placeRow(k, -1, 4); placeRow(k + 6, 1, 3); }
    const towerMats = [windowsTexture('#7f8fa8', 'rgba(255,214,140,0.95)'), windowsTexture('#a8a294', 'rgba(255,200,120,0.9)'), windowsTexture('#5d7088', 'rgba(255,230,170,0.95)')].map((t) => { t.repeat.set(1, 2); return t; }).map((t) => new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.2 }));
    for (const p of props.around(track, rng, 60, { rMin: 120, rMax: 380, margin: 30 })) {
      if (!onLand(p.x) || p.x > RIVER_W) continue;
      const h = 20 + rng.next() * 50, w = 12 + rng.next() * 12;
      box(towerMats[Math.floor(rng.next() * 3)], p.x, h / 2 - 0.3, p.z, w, h, w * (0.7 + rng.next() * 0.6), rng.next());
    }
    // the dragon tower: a tall tower whose top curls forward
    {
      const x = -230, z = -60, h = 110;
      box(towerMats[2], x, h / 2, z, 26, h, 26);
      const curl = new THREE.Mesh(new THREE.TorusGeometry(14, 6, 10, 20, Math.PI), towerMats[2]);
      curl.position.set(x, h - 2, z + 2); curl.rotation.y = Math.PI / 2; add(curl);
    }
    // the peninsula: palms and a few pavilions
    for (const p of props.beside(track, rng, 40, { min: 4, max: 40, margin: 3 })) if (p.x > RIVER_E + 3) palms.push({ x: p.x, y: -0.3, z: p.z, s: [11 + rng.next() * 5, 11 + rng.next() * 5, 11 + rng.next() * 5], ry: rng.next() * 6 });
    for (const p of props.beside(track, rng, 50, { min: 3, max: 24, margin: 3 })) if (onLand(p.x) && p.x < RIVER_W && !(p.x > PX0 - 6 && p.x < PX1 + 6 && p.z > PZ0 - 6 && p.z < PZ1 + 6) && Math.hypot(p.x - WX, p.z - WZ) > 36) palms.push({ x: p.x, y: -0.3, z: p.z, s: [10 + rng.next() * 5, 10 + rng.next() * 5, 10 + rng.next() * 5], ry: rng.next() * 6 });
    add(props.inst(palmGeo, palmMat, palms, { cast: true }));

    // ---- tuk-tuks parked along the kerb (outside the walls)
    const tuk = [tuktukGeometry('#2f8fd8'), tuktukGeometry('#e8b02a'), tuktukGeometry('#3aa05a')];
    tuk.forEach((g, i) => {
      const list = [];
      for (let k = i * 11; k < N; k += 37) {
        const s = k % 2 ? 1 : -1, v = track.pointAt(k, s * (wallW + 2.2));
        if (!onLand(v.x) || P[k].y > 0.5) continue;
        list.push({ x: v.x, y: -0.3, z: v.z, ry: Math.atan2(track.T[k].x, track.T[k].z) + (rng.next() < 0.5 ? 0 : Math.PI) });
      }
      add(props.inst(g, toy({ roughness: 0.5 }), list, { cast: true }));
    });

    // ---- boats on the river
    const boats = [];
    [['#2f4f8f', '#d84a3a', 18], ['#8a3a2a', '#2a6a4a', 24], ['#f0f0f0', '#2a4aa0', 14]].forEach(([hull, roof, len], i) => {
      const m = new THREE.Mesh(boatGeometry(hull, roof, len), toy({ roughness: 0.6 }));
      m.castShadow = true; add(m);
      boats.push({ m, x: RIVER_W + 25 + i * 35, z0: -400 + i * 260, sp: (i % 2 ? -1 : 1) * (3 + i), len });
    });
    onUpdate((dt, t) => {
      for (const bt of boats) {
        let z = bt.z0 + t * bt.sp;
        z = ((z + 600) % 1200 + 1200) % 1200 - 600;
        bt.m.position.set(bt.x, -2.0 + Math.sin(t * 1.3 + bt.x) * 0.08, c.z + z);
        bt.m.rotation.y = bt.sp > 0 ? 0 : Math.PI;
      }
    });

    // ---- warm dust motes and the start gate
    const motes = props.motes(220, { center: c, spread: [520, 26, 560], yBase: 1, size: 0.4, colors: ['#ffe6b0', '#ffd090'], speed: 0.4, blink: 0.4, glow: 1.0 }, rng);
    add(motes); onUpdate((dt, t) => motes.userData.update(dt, t));
    add(props.startGate(track, { pillar: '#f6efe0', accent: GOLD, banner: '#1d3b6e', lights: '#ffe08a', text: 'PHNOM PENH' }));
  },
};
