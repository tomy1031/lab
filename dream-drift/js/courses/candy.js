// courses/candy.js — COURSE 1 「わたぐも キャンディ・スカイウェイ」
// A wafer road floating over a sea of sunset clouds: candy-cane arches, giant lollipops, gumdrop islands,
// cotton-candy trees, drifting donuts and hot-air balloons under a rainbow.
import * as THREE from 'three';
import { part, merge, toyMaterial, canvasTexture, hsl } from '../engine/util.js';

const S = new THREE.SphereGeometry(1, 10, 8);
const SLO = new THREE.SphereGeometry(1, 8, 6);

function puffGeometry(rng, n = 7, tint = '#ffe6f2', G = S) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 0.55 + rng.next() * 0.35;
    const s = 0.55 + rng.next() * 0.45;
    parts.push(part(G, i % 3 ? '#ffffff' : tint, [Math.cos(a) * r, rng.next() * 0.25, Math.sin(a) * r], [0, 0, 0], [s, s * 0.8, s]));
  }
  parts.push(part(G, '#ffffff', [0, 0.35, 0], [0, 0, 0], [0.9, 0.75, 0.9]));
  return merge(parts);
}

function swirlTexture(a, b) {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, s, s);
    ctx.translate(s / 2, s / 2);
    ctx.strokeStyle = b; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let t = 0; t < 60; t++) {
        const ang = t * 0.22 + (k * Math.PI * 2) / 3, r = t * (s * 0.0082);
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }, { repeat: false });
}

function stripeTexture(a, b, n = 8) {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = b;
    for (let i = -n; i < n * 2; i++) {
      ctx.beginPath();
      const w = s / n;
      ctx.moveTo(i * w, 0); ctx.lineTo(i * w + w / 2, 0); ctx.lineTo(i * w + w / 2 + s, s); ctx.lineTo(i * w + s, s); ctx.fill();
    }
  });
}

export default {
  id: 'candy',
  name: 'わたぐも キャンディ・スカイウェイ',
  nameEn: 'Candy Cloud Skyway',
  tagline: '夕焼けの 雲の海に うかぶ ウエハースの 道。キャンディの アーチを くぐって 走ろう',
  seed: 11,
  points: [[0, 0, 80], [0, 0, 0], [0, 2, -80], [25, 6, -150], [85, 10, -185], [150, 12, -170], [185, 10, -115], [175, 6, -50, 1.1], [130, 4, -20], [105, 4, 30], [135, 6, 85], [200, 10, 110], [235, 12, 170], [205, 10, 235], [135, 6, 255], [60, 2, 240], [20, 0, 180]],
  itemRows: [0.17, 0.47, 0.8],
  boosts: [{ at: 0.1, d: -0.4 }, { at: 0.43, d: 0.35 }, { at: 0.88, d: 0 }],
  jumps: [{ at: 0.6 }],
  theme: {
    sky: { top: '#4f9dff', horizon: '#ffd0e6', bottom: '#fff4fa', sunDir: [-0.35, 0.22, -0.9], sunColor: '#fff0c0', sunSize: 0.004, sunGlow: 0.9, horizonSharp: 0.55 },
    fog: { color: '#ffd8ea', near: 170, far: 950 },
    hemi: { sky: '#d6e9ff', ground: '#ffc4dd', intensity: 1.3 },
    sun: { color: '#fff1d6', intensity: 2.4, dir: [-0.45, 0.8, -0.45] },
    envIntensity: 0.75,
    bloom: { strength: 0.4, radius: 0.4, threshold: 2.2 },
    dust: '#fff6fb', mapColor: '#ff5fa2',
  },
  road: {
    width: 17, curb: 0.9, shoulder: 5, bank: 5,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#e9b277'; ctx.fillRect(0, 0, s, s);
      // waffle pattern
      ctx.strokeStyle = 'rgba(160, 96, 40, 0.28)'; ctx.lineWidth = 6;
      for (let i = -4; i < 12; i++) {
        ctx.beginPath(); ctx.moveTo(i * s / 6, 0); ctx.lineTo(i * s / 6 + s, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * s / 6, s); ctx.lineTo(i * s / 6 + s, 0); ctx.stroke();
      }
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(120,60,20,0.08)'; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
      // icing edges with drips
      ctx.fillStyle = '#ffffff';
      for (const x of [s * 0.02, s * 0.955]) {
        ctx.fillRect(x, 0, s * 0.025, s);
        for (let y = 0; y < s; y += s / 8) { ctx.beginPath(); ctx.arc(x + (x < s / 2 ? s * 0.03 : -0.005 * s), y + s / 16, s * 0.012, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = 'rgba(255, 95, 162, 0.75)';
      ctx.fillRect(s * 0.493, 0, s * 0.014, s * 0.42);
    },
    roadRoughness: 0.75,
    curbColors: ['#ff3d6e', '#ffffff'],
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#fff3f8'; ctx.fillRect(0, 0, s, s);
      const cols = ['#ff5fa2', '#4fc3ff', '#ffd93b', '#5ee26a', '#a07bff', '#ff8a1f'];
      // fewer, bigger sprinkles: tiny high-contrast specks shimmer while the camera moves
      for (let i = 0; i < 150; i++) {
        ctx.save(); ctx.translate(Math.random() * s, Math.random() * s); ctx.rotate(Math.random() * Math.PI);
        ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-7, -2, 14, 4); ctx.restore();
      }
    },
    shoulderRoughness: 0.9,
    wall: { color: '#ffc6e2', height: 1.0, thickness: 0.7, roughness: 0.35, glow: '#ffffff', glowIntensity: 1.3 },
    skirt: { color: '#7a4127', depth: 3.2, trim: '#ff8fc8', trimIntensity: 1.6 },
  },
  music: {
    bpm: 150, root: 64, scale: 'major', progression: [0, 5, 3, 4], seed: 3,
    style: { lead: 'square', drums: 'pop', bass: 'octave', arpType: 'triangle', rhythm: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0] },
  },

  build({ scene, track, props, rng, add, onUpdate }) {
    const N = track.N;
    // ---- sea of clouds below
    const puffs = [puffGeometry(rng, 7, '#ffe0f0'), puffGeometry(rng, 9, '#fff0d8'), puffGeometry(rng, 6, '#ffe8f6')];
    const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffd6e8', emissiveIntensity: 0.35 });
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const seaPuffs = [puffGeometry(rng, 6, '#ffe0f0', SLO), puffGeometry(rng, 7, '#fff0d8', SLO), puffGeometry(rng, 6, '#ffe8f6', SLO)];
    seaPuffs.forEach((g, gi) => {
      const list = [];
      for (let i = 0; i < 48; i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * 900;
        const s = 22 + rng.next() * 34;
        list.push({ x: c.x + Math.cos(a) * r, y: -48 + rng.next() * 14 - (gi * 4), z: c.z + Math.sin(a) * r, ry: rng.next() * 6, s: [s, s * 0.45, s] });
      }
      add(props.inst(g, cloudMat, list));
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1600, 48), new THREE.MeshBasicMaterial({ color: '#ffe4f1' }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(c.x, -46, c.z);
    add(floor);

    // ---- cloud islands beside the road, some with candy on top
    const islands = props.beside(track, rng, 34, { min: 6, max: 46, margin: 4 });
    const islandList = islands.map((p) => { const s = 7 + rng.next() * 9; return { ...p, s }; });
    add(props.inst(puffs[0], cloudMat, islandList.map((p) => ({ x: p.x, y: p.y - 4.5, z: p.z, ry: rng.next() * 6, s: [p.s, p.s * 0.42, p.s] }))));

    // gumdrops on islands and low beside the road
    const gum = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const gumMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.06 });
    const gums = [];
    for (const p of islandList) {
      const n = 2 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, r = rng.next() * p.s * 0.5, s = 1.4 + rng.next() * 2.4;
        gums.push({ x: p.x + Math.cos(a) * r, y: p.y - 3.2 + p.s * 0.3, z: p.z + Math.sin(a) * r, s: [s, s * 1.15, s], c: hsl(rng.next(), 0.85, 0.62) });
      }
    }
    add(props.inst(gum, gumMat, gums, { cast: true }));

    // ---- lollipops
    const pops = [['#ff5fa2', '#ffffff'], ['#4fc3ff', '#ffffff'], ['#ffd93b', '#ff8a1f'], ['#a07bff', '#ffe0ff'], ['#5ee26a', '#ffffff']].map(([a, bb]) => {
      const t = swirlTexture(a, bb);
      return [new THREE.MeshStandardMaterial({ color: a, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 })];
    });
    const disc = new THREE.CylinderGeometry(1, 1, 0.25, 40);
    disc.rotateX(Math.PI / 2);
    const stick = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    const stickMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    for (const p of props.beside(track, rng, 16, { min: 3, max: 18, margin: 3 })) {
      const g = new THREE.Group();
      const h = 9 + rng.next() * 9, r = 3 + rng.next() * 2.5;
      const st = new THREE.Mesh(stick, stickMat); st.scale.set(r * 2, h, r * 2); st.position.y = h / 2; st.castShadow = true;
      const d = new THREE.Mesh(disc, pops[Math.floor(rng.next() * pops.length)]); d.scale.set(r, r, r * 2); d.position.y = h + r * 0.8; d.castShadow = true;
      g.add(st, d);
      g.position.set(p.x, p.y - 4, p.z);
      g.rotation.y = rng.next() * Math.PI * 2;
      g.rotation.z = (rng.next() - 0.5) * 0.25;
      add(g);
      const cloud = new THREE.Mesh(puffs[1], cloudMat); cloud.scale.set(5, 2.2, 5); cloud.position.set(p.x, p.y - 4.5, p.z); add(cloud);
      onUpdate((dt, t) => { d.rotation.z = Math.sin(t * 0.5 + p.x) * 0.15; });
    }

    // ---- candy-cane arches over the road
    // wide stripes: thin ones shimmer (moiré) when the camera flies under the arches
    const caneTex = stripeTexture('#ffffff', '#ff3d6e', 3);
    caneTex.repeat.set(9, 1);
    const caneMat = new THREE.MeshStandardMaterial({ map: caneTex, roughness: 0.3 });
    for (const f of [0.05, 0.27, 0.52, 0.74, 0.95]) {
      const p = f * N;
      const R = track.wallD(Math.floor(p)) + 1.2;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 12, 64, Math.PI), caneMat);
      arch.castShadow = true;
      const holder = new THREE.Group(); holder.add(arch);
      track.placeOn(holder, p, 0, -0.5);
      add(holder);
      // sparkle bulbs along the arch
      for (let i = 1; i < 10; i++) {
        const a = (i / 10) * Math.PI;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), props.glow(i % 2 ? '#fff6b0' : '#ffb0e0', 1.9));
        bulb.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.95);
        holder.add(bulb);
      }
    }

    // ---- cotton candy trees
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 1, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#ffffff', '#ffb6d9', 3), roughness: 0.6 });
    const fluffMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.12 });
    const trees = props.beside(track, rng, 60, { min: 1.5, max: 14, margin: 1.5 });
    const trunks = [], fluffs = [];
    for (const p of trees) {
      const h = 4 + rng.next() * 4;
      trunks.push({ x: p.x, y: p.y - 0.5 + h / 2, z: p.z, s: [1, h, 1] });
      const col = hsl([0.92, 0.55, 0.78, 0.12][Math.floor(rng.next() * 4)], 0.8, 0.82);
      const s = 2.2 + rng.next() * 1.6;
      fluffs.push({ x: p.x, y: p.y - 0.5 + h + s * 0.4, z: p.z, s: [s, s * 0.9, s], ry: rng.next() * 6, c: col });
    }
    add(props.inst(trunk, trunkMat, trunks, { cast: true }));
    const fluffGeo = puffGeometry(rng, 6, '#ffffff');
    add(props.inst(fluffGeo, fluffMat, fluffs, { cast: true }));
    // a soft cloud under each tree so nothing floats on air
    add(props.inst(puffs[2], cloudMat, trees.map((p) => ({ x: p.x, y: p.y - 1.6, z: p.z, s: [3.2, 1.3, 3.2], ry: rng.next() * 6 }))));

    // ---- donuts drifting in the sky
    const icings = ['#ff8fc8', '#7a4127', '#8fdcff', '#fff36b'];
    const donuts = [];
    for (const p of props.around(track, rng, 14, { rMin: 80, rMax: 320, yMin: 18, yMax: 60 })) {
      const g = merge([part(new THREE.TorusGeometry(1, 0.48, 14, 30), '#e2a560'), part(new THREE.TorusGeometry(1, 0.42, 12, 30), icings[donuts.length % 4], [0, 0, 0.22], [0, 0, 0], [1, 1, 0.8])]);
      const m = new THREE.Mesh(g, toyMaterial({ roughness: 0.45 }));
      const s = 5 + rng.next() * 6;
      m.scale.setScalar(s); m.position.set(p.x, p.y, p.z);
      m.rotation.set(rng.next() * 3, rng.next() * 3, 0);
      add(m);
      donuts.push({ m, sp: 0.1 + rng.next() * 0.2, y: p.y, ph: rng.next() * 6 });
    }
    onUpdate((dt, t) => { for (const d of donuts) { d.m.rotation.y += d.sp * dt; d.m.rotation.x += d.sp * 0.5 * dt; d.m.position.y = d.y + Math.sin(t * 0.4 + d.ph) * 3; } });

    // ---- hot-air balloons
    const balloons = [];
    for (const p of props.around(track, rng, 9, { rMin: 120, rMax: 420, yMin: 25, yMax: 80 })) {
      const parts = [];
      const cols = [hsl(rng.next(), 0.85, 0.6), hsl(rng.next(), 0.85, 0.75), '#ffffff'];
      for (let i = 0; i < 8; i++) {
        const seg = new THREE.SphereGeometry(1, 6, 14, (i / 8) * Math.PI * 2, Math.PI / 4);
        parts.push(part(seg, cols[i % 3], [0, 0, 0], [0, 0, 0], [1, 1.15, 1]));
      }
      parts.push(part(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 10), '#a0703a', [0, -1.6, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.42, 0.18, 0.6, 12), cols[0], [0, -1.05, 0]));
      const m = new THREE.Mesh(merge(parts), toyMaterial({ roughness: 0.6 }));
      const s = 7 + rng.next() * 5;
      m.scale.setScalar(s); m.position.set(p.x, p.y, p.z);
      add(m);
      balloons.push({ m, y: p.y, ph: rng.next() * 6 });
    }
    onUpdate((dt, t) => { for (const bl of balloons) { bl.m.position.y = bl.y + Math.sin(t * 0.3 + bl.ph) * 4; bl.m.rotation.y += dt * 0.05; } });

    // ---- rainbow
    const ring = new THREE.RingGeometry(330, 400, 96, 7, 0, Math.PI);
    const pos = ring.attributes.position, col = new Float32Array(pos.count * 3);
    const bands = ['#ff4f6a', '#ff9a3d', '#ffe14d', '#5ee26a', '#4fb8ff', '#6a6bff', '#b06bff'];
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      const k = Math.min(6, Math.max(0, Math.floor(((400 - r) / 70) * 7)));
      cc.set(bands[k]); col.set([cc.r, cc.g, cc.b], i * 3);
    }
    ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const rainbow = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    rainbow.position.set(c.x + 260, -70, c.z - 620);
    rainbow.rotation.y = -0.35;
    add(rainbow);

    // ---- sugar sparkles in the air
    const sp = props.motes(380, { center: c, spread: [520, 40, 520], yBase: -6, size: 0.5, colors: ['#fff6b0', '#ffc0e6', '#c8f0ff'], speed: 0.4, blink: 0.5, glow: 1.1 }, rng);
    add(sp);
    onUpdate((dt, t) => sp.userData.update(dt, t));

    // ---- start gate: a giant candy gate
    add(props.startGate(track, { pillar: '#ffffff', accent: '#ff5fa2', banner: '#ff5fa2', lights: '#fff36b' }));
  },
};
