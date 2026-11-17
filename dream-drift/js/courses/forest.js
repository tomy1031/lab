// courses/forest.js — COURSE 2 「ほたる灯りの森」
// A moonlit stone path through an ancient night forest: glowing mushroom clusters, fireflies, paper lanterns
// rising into an aurora sky, lantern arches over the road and a tunnel through a giant hollow log.
import * as THREE from 'three';
import { part, merge, canvasTexture, mod } from '../engine/util.js';

const UP = new THREE.Vector3(0, 1, 0);
const GLOWS = ['#3df0ff', '#ff4fd8', '#9b6bff', '#7dff8e', '#ffb84d'];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// bilinear height lookup on the terrain grid made by props.terrain
function heightSampler(mesh) {
  const pos = mesh.geometry.attributes.position;
  const n = Math.round(Math.sqrt(pos.count));
  const x0 = pos.getX(0), z0 = pos.getZ(0), seg = pos.getX(1) - x0;
  return (x, z) => {
    const fx = (x - x0) / seg, fz = (z - z0) / seg;
    const ix = Math.max(0, Math.min(n - 2, Math.floor(fx))), iz = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const tx = clamp01(fx - ix), tz = clamp01(fz - iz);
    const y00 = pos.getY(iz * n + ix), y10 = pos.getY(iz * n + ix + 1), y01 = pos.getY((iz + 1) * n + ix), y11 = pos.getY((iz + 1) * n + ix + 1);
    return (y00 * (1 - tx) + y10 * tx) * (1 - tz) + (y01 * (1 - tx) + y11 * tx) * tz;
  };
}

function barkTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5b412f'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = (i / 22) * s + Math.random() * 6;
      ctx.strokeStyle = i % 2 ? 'rgba(30,18,10,0.55)' : 'rgba(140,105,75,0.35)';
      ctx.lineWidth = 3 + Math.random() * 5;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 5, y);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${60 + Math.random() * 40},${120 + Math.random() * 60},${70 + Math.random() * 40},0.45)`;
      ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 8 + Math.random() * 18, 5 + Math.random() * 10, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// a half tube that follows the road between lap fractions f0…f1 (the hollow log), inner + outer shell
function logShell(track, f0, f1, radiusAdd, squash) {
  const N = track.N, k0 = Math.round(f0 * N), k1 = Math.round(f1 * N);
  const M = 22, rows = k1 - k0 + 1;
  const pos = [], uv = [], idx = [];
  const v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    const k = mod(k0 + r, N);
    const P = track.P[k], R = track.R[k], rad = track.wallD(k) + radiusAdd;
    for (let j = 0; j <= M; j++) {
      const a = -0.14 + ((Math.PI + 0.28) * j) / M;
      v.copy(P).addScaledVector(R, Math.cos(a) * rad).addScaledVector(UP, Math.sin(a) * rad * squash - 0.8);
      pos.push(v.x, v.y, v.z);
      uv.push((j / M) * 4, (r * track.step) / 9);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let j = 0; j < M; j++) {
    const a = r * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, k0, k1, M, rows };
}

export default {
  id: 'forest',
  name: 'ほたる灯りの森',
  nameEn: 'Firefly Lantern Forest',
  tagline: '月とオーロラの 夜の森。光る キノコと ほたるの 灯りを たどって、大木の トンネルを ぬけよう',
  seed: 23,
  points: [[0, 0, 60], [0, 0, -30], [10, 2, -100], [60, 6, -140], [110, 8, -120], [120, 8, -60], [90, 6, -10], [100, 4, 50], [150, 4, 80], [200, 8, 40], [250, 12, -10], [300, 14, 20], [310, 12, 90], [260, 8, 140], [190, 6, 170], [140, 4, 210], [70, 2, 200], [20, 0, 140]],
  itemRows: [0.2, 0.39, 0.74],
  boosts: [{ at: 0.09, d: -0.35 }, { at: 0.47, d: 0 }, { at: 0.97, d: 0.3 }],
  jumps: [{ at: 0.785 }],
  theme: {
    sky: { top: '#060722', horizon: '#2c2b70', bottom: '#0d0f2a', sunDir: [0.28, 0.36, -0.89], sunColor: '#dfe6ff', sunSize: 0.0055, sunGlow: 0.5, stars: 1.3, aurora: 0.75, auroraColor: '#3dffb0', horizonSharp: 0.5 },
    fog: { color: '#1a1c48', near: 45, far: 430 },
    hemi: { sky: '#7d8cff', ground: '#21402f', intensity: 1.05 },
    sun: { color: '#b4c2ff', intensity: 1.35, dir: [0.3, 0.8, -0.5] },
    envIntensity: 0.35,
    bloom: { strength: 0.95, radius: 0.6, threshold: 0.72 },
    dust: '#4a6a4a', mapColor: '#3dd6c8',
  },
  road: {
    width: 16, curb: 0.9, shoulder: 4.5, bank: 5,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#3d4060'; ctx.fillRect(0, 0, s, s);
      // cobblestones
      const rows = 7;
      for (let r = 0; r < rows; r++) {
        const h = s / rows, off = (r % 2) * 0.5;
        for (let c = -1; c < 6; c++) {
          const w = s / 5.2;
          const x = (c + off) * w + 4, y = r * h + 3;
          const l = 46 + Math.random() * 18;
          ctx.fillStyle = `hsl(${232 + Math.random() * 20}, ${14 + Math.random() * 10}%, ${l * 0.62}%)`;
          ctx.beginPath(); ctx.roundRect(x, y, w - 8, h - 6, 14); ctx.fill();
        }
      }
      // moss specks
      for (let i = 0; i < 900; i++) { ctx.fillStyle = i % 3 ? 'rgba(90,150,90,0.25)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2); }
      // glowing edge lines
      ctx.fillStyle = '#6ff6ff';
      ctx.fillRect(s * 0.025, 0, s * 0.016, s);
      ctx.fillRect(s * (1 - 0.041), 0, s * 0.016, s);
      ctx.fillStyle = 'rgba(190, 160, 255, 0.85)';
      for (let y = 0; y < s; y += s / 4) ctx.fillRect(s * 0.494, y, s * 0.012, s * 0.1);
    },
    roadRoughness: 0.85,
    roadEmissive: '#b8c4ff', roadEmissiveIntensity: 0.32,
    curbColors: ['#22c9bb', '#7a5cff'], curbEmissive: 0.55, curbLength: 3,
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#25412f'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = ['rgba(60,110,70,0.6)', 'rgba(20,40,30,0.6)', 'rgba(120,170,90,0.35)'][i % 3];
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 5 + Math.random() * 6);
      }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#7dfff0', '#ffb8f0', '#fff3a0'][i % 3]; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 2.2, 0, Math.PI * 2); ctx.fill(); }
    },
    wall: {
      color: '#d9c2a6', height: 1.15, thickness: 0.7, roughness: 0.9, glow: '#ffb84d', glowIntensity: 1.6,
      map(ctx, s) {
        ctx.fillStyle = '#7a5a40'; ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 2; i++) {
          const x0 = (i * s) / 2;
          const g = ctx.createLinearGradient(x0, 0, x0 + s / 2, 0);
          g.addColorStop(0, '#3e2a1c'); g.addColorStop(0.25, '#8a6646'); g.addColorStop(0.6, '#7a5a40'); g.addColorStop(1, '#3e2a1c');
          ctx.fillStyle = g; ctx.fillRect(x0, 0, s / 2, s);
        }
        for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(40,25,15,0.4)'; ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 12 + Math.random() * 20); }
        for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(80,140,80,0.5)'; ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 10, 6, 0, 0, 7); ctx.fill(); }
      },
    },
  },
  music: {
    bpm: 120, root: 62, scale: 'dorian', progression: [0, 6, 3, 4], seed: 17,
    style: { lead: 'triangle', leadVoice: 'bell', drums: 'soft', bass: 'walk', swing: 0.15, arpType: 'sine', rhythm: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0] },
  },

  build({ track, props, rng, add, onUpdate }) {
    const N = track.N;
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const wall = track.halfWidth + track.curb + track.shoulder;

    // ---- terrain: forest floor rolling up into hills
    const ground = props.terrain(track, {
      size: 1100, res: 150, below: 0.45, hills: 34, flat: 5, rise: 75, noiseScale: 0.011,
      color: (x, y, z, dist, n) => {
        if (dist < wall + 3) return '#30402c';
        const t = clamp01((n - 0.3) * 1.6);
        const col = new THREE.Color('#1c3a2c').lerp(new THREE.Color('#2f5a3a'), t);
        if (props.noise2(x * 0.05, z * 0.05) > 0.72) col.lerp(new THREE.Color('#3a6a4a'), 0.6);
        return col;
      },
    });
    add(ground);
    const H = heightSampler(ground);

    // ---- distant mountain silhouettes
    const mount = new THREE.ConeGeometry(1, 1, 7);
    const mounts = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.next() * 0.2, r = 360 + rng.next() * 110;
      const w = 70 + rng.next() * 70, h = 70 + rng.next() * 90;
      mounts.push({ x: c.x + Math.cos(a) * r, y: h / 2 - 10, z: c.z + Math.sin(a) * r, s: [w, h, w], ry: rng.next() * 3 });
    }
    add(props.inst(mount, new THREE.MeshStandardMaterial({ color: '#141a3e', roughness: 1 }), mounts));

    // ---- giant ancient trees (near the road) and the forest beyond
    const bark = barkTexture();
    bark.repeat.set(2, 3);
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 10, 1, true);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark, color: '#c8a888', roughness: 0.95 });
    const canopyGeo = merge([
      part(new THREE.SphereGeometry(1, 9, 7), '#1d4a45', [0, 0, 0], [0, 0, 0], [1, 0.7, 1]),
      part(new THREE.SphereGeometry(1, 9, 7), '#235a4a', [0.7, 0.25, 0.2], [0, 0, 0], [0.7, 0.55, 0.7]),
      part(new THREE.SphereGeometry(1, 9, 7), '#18403f', [-0.6, 0.2, -0.4], [0, 0, 0], [0.75, 0.55, 0.75]),
      part(new THREE.SphereGeometry(1, 9, 7), '#2a6650', [0.1, 0.5, -0.6], [0, 0, 0], [0.6, 0.5, 0.6]),
      part(new THREE.SphereGeometry(1, 9, 7), '#1a4a4f', [-0.3, 0.45, 0.65], [0, 0, 0], [0.6, 0.45, 0.6]),
    ]);
    const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#082a26', emissiveIntensity: 1 });
    const rootGeo = new THREE.SphereGeometry(1, 6, 5);
    const near = props.beside(track, rng, 64, { min: 5, max: 44, margin: 4 });
    const far = props.around(track, rng, 170, { rMin: 30, rMax: 360, margin: 18 });
    const trunks = [], canopies = [], roots = [], fruits = [], farTrunks = [], farCanopies = [];
    const addTree = (p, big, T, C) => {
      const y = H(p.x, p.z) - 0.4;
      const r = big ? 1.5 + rng.next() * 1.1 : 1 + rng.next() * 0.9;
      const h = big ? 20 + rng.next() * 12 : 14 + rng.next() * 12;
      const ry = rng.next() * 6;
      T.push({ x: p.x, y, z: p.z, s: [r, h, r], ry });
      const cs = r * (4.2 + rng.next() * 1.8);
      C.push({ x: p.x, y: y + h + cs * 0.15, z: p.z, s: [cs, cs, cs], ry });
      if (big) {
        for (let i = 0; i < 4; i++) {
          const a = ry + (i / 4) * Math.PI * 2 + rng.next() * 0.4;
          roots.push({ x: p.x + Math.cos(a) * r * 1.4, y: y + 0.2, z: p.z + Math.sin(a) * r * 1.4, s: [r * 0.5, r * 0.45, r * 2.1], ry: -a + Math.PI / 2, rx: 0.15 });
        }
        for (let i = 0; i < 5; i++) {
          const a = rng.next() * Math.PI * 2, rr = cs * (0.5 + rng.next() * 0.5);
          fruits.push({ x: p.x + Math.cos(a) * rr, y: y + h - cs * 0.15 + rng.next() * cs * 0.3, z: p.z + Math.sin(a) * rr, s: 0.35 + rng.next() * 0.3, c: props.glowColor(GLOWS[Math.floor(rng.next() * GLOWS.length)], 2.4) });
        }
      }
    };
    for (const p of near) if (p.off > 4) addTree(p, true, trunks, canopies);
    for (const p of far) addTree(p, false, farTrunks, farCanopies);
    add(props.inst(trunkGeo, trunkMat, trunks, { cast: true, receive: true }));
    add(props.inst(canopyGeo, canopyMat, canopies, { cast: true }));
    add(props.inst(rootGeo, trunkMat, roots, { cast: true }));
    add(props.inst(trunkGeo, trunkMat, farTrunks));
    add(props.inst(canopyGeo, canopyMat, farCanopies));
    const fruitMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    add(props.inst(new THREE.SphereGeometry(1, 8, 6), fruitMat, fruits));

    // conifer silhouettes further out
    const coneGeo = merge([
      part(new THREE.ConeGeometry(1, 1.2, 7), '#1b3a3f', [0, 1.6, 0]),
      part(new THREE.ConeGeometry(0.8, 1.0, 7), '#204548', [0, 2.3, 0]),
      part(new THREE.ConeGeometry(0.55, 0.8, 7), '#24504f', [0, 2.9, 0]),
      part(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 5), '#3a2a20', [0, 0.6, 0]),
    ]);
    const pines = props.around(track, rng, 320, { rMin: 60, rMax: 380, margin: 25 }).map((p) => {
      const s = 6 + rng.next() * 6;
      return { x: p.x, y: H(p.x, p.z) - 0.5, z: p.z, s: [s, s * (1.1 + rng.next() * 0.5), s], ry: rng.next() * 6 };
    });
    add(props.inst(coneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), pines));

    // ---- bioluminescent mushrooms: clusters by the road + a few giants
    const stalkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 8);
    stalkGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.SphereGeometry(0.62, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.62, 1);
    const stalkMat = new THREE.MeshStandardMaterial({ color: '#b3a894', roughness: 0.75, emissive: '#2a5a66', emissiveIntensity: 0.3 });
    const capMatA = new THREE.MeshBasicMaterial({ toneMapped: false });
    const capMatB = new THREE.MeshBasicMaterial({ toneMapped: false });
    const stalksA = [], capsA = [], capsB = [];
    const mush = (x, z, size, colorIdx, giant) => {
      const y = H(x, z) - 0.15;
      const hgt = size * (giant ? 1.6 : 1.2 + rng.next() * 0.8);
      const w = size * (giant ? 1.1 : 0.9 + rng.next() * 0.4);
      const tilt = (rng.next() - 0.5) * 0.25;
      stalksA.push({ x, y, z, s: [w, hgt, w], rz: tilt });
      const cap = { x: x - Math.sin(tilt) * hgt, y: y + hgt * Math.cos(tilt) - 0.05 * w, z, s: [w * 1.9, w * 1.6, w * 1.9], rz: tilt, c: props.glowColor(GLOWS[colorIdx], giant ? 1.7 : 2.2) };
      (rng.next() < 0.5 ? capsA : capsB).push(cap);
    };
    for (const p of props.beside(track, rng, 70, { min: 0.6, max: 14, margin: 0.8 })) {
      const n = 2 + Math.floor(rng.next() * 4), col = Math.floor(rng.next() * GLOWS.length);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, r = rng.next() * 2.2;
        mush(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0.5 + rng.next() * 1.1, rng.next() < 0.75 ? col : Math.floor(rng.next() * GLOWS.length), false);
      }
    }
    for (const p of props.beside(track, rng, 18, { min: 9, max: 40, margin: 6 })) mush(p.x, p.z, 4 + rng.next() * 4, Math.floor(rng.next() * 3), true);
    add(props.inst(stalkGeo, stalkMat, stalksA, { cast: true }));
    add(props.inst(capGeo, capMatA, capsA));
    add(props.inst(capGeo, capMatB, capsB));
    onUpdate((dt, t) => {
      capMatA.color.setScalar(0.78 + 0.22 * Math.sin(t * 1.3));
      capMatB.color.setScalar(0.78 + 0.22 * Math.sin(t * 1.3 + 2.1));
    });

    // ---- glowing flowers just outside the fence
    const flowers = props.beside(track, rng, 420, { min: 0.2, max: 9, margin: 0.3 }).map((p) => ({
      x: p.x, y: H(p.x, p.z) + 0.25 + rng.next() * 0.25, z: p.z, s: 0.14 + rng.next() * 0.16,
      c: props.glowColor(['#ff8fe0', '#7dfff0', '#fff3a0', '#b8a0ff'][Math.floor(rng.next() * 4)], 2.6),
    }));
    add(props.inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), flowers));
    const grass = props.beside(track, rng, 360, { min: 0.2, max: 18, margin: 0.3 }).map((p) => {
      const s = 0.5 + rng.next() * 0.7;
      return { x: p.x, y: H(p.x, p.z) - 0.1, z: p.z, s: [s, s * (1.2 + rng.next()), s], ry: rng.next() * 6 };
    });
    add(props.inst(new THREE.ConeGeometry(0.5, 1.4, 4), new THREE.MeshStandardMaterial({ color: '#2f6a46', roughness: 1, emissive: '#0c2a1c' }), grass));

    // ---- lantern arches over the road
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4a33', roughness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: '#b8402e', roughness: 0.7 });
    const lanternGeo = merge([
      part(new THREE.SphereGeometry(1, 12, 10), new THREE.Color('#ffb04d').multiplyScalar(2.3), [0, 0, 0], [0, 0, 0], [0.56, 0.68, 0.56]),
      part(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 10), '#3a1c0c', [0, 0.66, 0]),
      part(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 10), '#3a1c0c', [0, -0.66, 0]),
    ]);
    const lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const swingers = [];
    for (const f of [0.16, 0.3, 0.62, 0.71, 0.92]) {
      const p = f * N, k = Math.round(p) % N;
      const W = track.wallD(k) + 0.9;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 9, 10), red);
        post.position.set(s * W, 4.5, 0); post.castShadow = true; g.add(post);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.8, 10), wood);
        foot.position.set(s * W, 0.3, 0); g.add(foot);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.6, 0.6, 0.7), red);
      beam.position.y = 8; beam.castShadow = true; g.add(beam);
      const top = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 4, 0.7, 1.1), wood);
      top.position.y = 9.2; top.castShadow = true; g.add(top);
      for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.15), wood); tip.position.set(s * (W + 2.3), 9.45, 0); tip.rotation.z = s * 0.25; g.add(tip); }
      const n = 5;
      for (let i = 0; i < n; i++) {
        const piv = new THREE.Group();
        piv.position.set(((i - (n - 1) / 2) / (n - 1)) * W * 1.6, 7.7, 0);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), wood);
        rope.position.y = -0.45; piv.add(rope);
        const l = new THREE.Mesh(lanternGeo, lanternMat); l.position.y = -1.3; piv.add(l);
        g.add(piv);
        swingers.push({ piv, ph: rng.next() * 6 });
      }
      track.placeOn(g, p, 0, 0);
      add(g);
    }
    onUpdate((dt, t) => { for (const s of swingers) s.piv.rotation.z = Math.sin(t * 1.4 + s.ph) * 0.12; });

    // ---- the giant hollow log tunnel
    const f0 = 0.445, f1 = 0.512;
    const logBark = barkTexture();
    const inner = logShell(track, f0, f1, 2.2, 0.82);
    const outer = logShell(track, f0, f1, 3.8, 0.84);
    const logInnerMat = new THREE.MeshStandardMaterial({ map: logBark, color: '#a88a72', roughness: 0.95, side: THREE.DoubleSide, emissive: '#1a2a30', emissiveIntensity: 0.6 });
    const logOuterMat = new THREE.MeshStandardMaterial({ map: logBark, color: '#c8a888', roughness: 0.95, side: THREE.DoubleSide });
    const lin = new THREE.Mesh(inner.geo, logInnerMat), lout = new THREE.Mesh(outer.geo, logOuterMat);
    lout.castShadow = true; lin.receiveShadow = true;
    add(lin); add(lout);
    // end rims (cut wood with rings)
    const ringTex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#c99a6a'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 12; i++) { ctx.strokeStyle = i % 2 ? '#a87a4e' : '#d8b080'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s / 2, s / 2, (i / 12) * s * 0.7, 0, 7); ctx.stroke(); }
    });
    const rimMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.8 });
    for (const f of [f0, f1]) {
      const k = Math.round(f * N) % N;
      const rad = track.wallD(k) + 3.0;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rad, 1.05, 8, 40, Math.PI + 0.28), rimMat);
      rim.rotation.z = -0.14; rim.scale.set(1, 0.83, 1);
      const holder = new THREE.Group(); holder.add(rim);
      rim.position.y = -0.8;
      track.placeOn(holder, f * N, 0, 0);
      add(holder);
    }
    // glowing moss and tiny mushrooms inside the log, moss blobs on top
    const moss = [], topMoss = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < 170; i++) {
      const r = Math.floor(rng.next() * (inner.rows - 1)), k = mod(inner.k0 + r, N);
      const a = 0.15 + rng.next() * (Math.PI - 0.3);
      const rad = track.wallD(k) + 2.0;
      v.copy(track.P[k]).addScaledVector(track.R[k], Math.cos(a) * rad).addScaledVector(UP, Math.sin(a) * rad * 0.82 - 0.8);
      moss.push({ x: v.x, y: v.y, z: v.z, s: 0.1 + rng.next() * 0.2, c: props.glowColor(['#7dff8e', '#3df0ff', '#b8a0ff'][i % 3], 2.4) });
    }
    for (let i = 0; i < 40; i++) {
      const r = Math.floor(rng.next() * (outer.rows - 1)), k = mod(outer.k0 + r, N);
      const a = 0.6 + rng.next() * (Math.PI - 1.2);
      const rad = track.wallD(k) + 3.9;
      v.copy(track.P[k]).addScaledVector(track.R[k], Math.cos(a) * rad).addScaledVector(UP, Math.sin(a) * rad * 0.84 - 0.8);
      const s = 1.5 + rng.next() * 2.5;
      topMoss.push({ x: v.x, y: v.y, z: v.z, s: [s, s * 0.45, s], ry: rng.next() * 6 });
    }
    add(props.inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), moss));
    add(props.inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#2f6a46', roughness: 1, emissive: '#0c2a1c' }), topMoss));
    // a couple of broken branch stubs on the log
    for (const [fr, a, len] of [[0.46, 1.1, 9], [0.49, 2.2, 7]]) {
      const k = Math.round(fr * N) % N, rad = track.wallD(k) + 3.6;
      v.copy(track.P[k]).addScaledVector(track.R[k], Math.cos(a) * rad).addScaledVector(UP, Math.sin(a) * rad * 0.84 - 0.8);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, len, 9), logOuterMat);
      br.position.copy(v);
      const dir = new THREE.Vector3().copy(track.R[k]).multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a) + 0.4).normalize();
      br.quaternion.setFromUnitVectors(UP, dir);
      br.position.addScaledVector(dir, len / 2 - 1);
      br.castShadow = true;
      add(br);
    }

    // ---- moonlit lake in the infield
    const inside = (x, z) => {
      let c2 = false;
      for (let i = 0, j = N - 1; i < N; j = i++) {
        const a = track.P[i], q = track.P[j];
        if ((a.z > z) !== (q.z > z) && x < ((q.x - a.x) * (z - a.z)) / (q.z - a.z) + a.x) c2 = !c2;
      }
      return c2;
    };
    let best = null, bd = 0;
    for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) {
      const x = b.min.x + ((b.max.x - b.min.x) * i) / 30, z = b.min.z + ((b.max.z - b.min.z) * j) / 30;
      if (!inside(x, z)) continue;
      const d = track.distanceToCenter(x, z);
      if (d > bd) { bd = d; best = [x, z]; }
    }
    const lakeR = Math.min(52, bd - wall - 10);
    if (best && lakeR > 12) {
      let sum = 0, cnt = 0;
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; sum += H(best[0] + Math.cos(a) * lakeR * 0.6, best[1] + Math.sin(a) * lakeR * 0.6); cnt++; }
      const ly = Math.min(sum / cnt, H(best[0], best[1])) + 0.2;
      const lake = new THREE.Mesh(new THREE.CircleGeometry(lakeR, 48), new THREE.MeshStandardMaterial({ color: '#0c1846', roughness: 0.06, metalness: 0.85, emissive: '#0a1a50', emissiveIntensity: 0.45 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(best[0], ly, best[1]);
      add(lake);
      // moon glitter on the water
      const glitter = canvasTexture(128, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(220,230,255,0.9)'); g.addColorStop(1, 'rgba(220,230,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      }, { repeat: false });
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(lakeR * 0.5, lakeR * 1.6), new THREE.MeshBasicMaterial({ map: glitter, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.2, 1.3, 1.6) }));
      gl.rotation.x = -Math.PI / 2; gl.rotation.z = Math.atan2(0.28, -0.89);
      gl.position.set(best[0], ly + 0.05, best[1]);
      add(gl);
      const pads = [];
      for (let i = 0; i < 26; i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * lakeR * 0.9;
        pads.push({ x: best[0] + Math.cos(a) * r, y: ly + 0.06, z: best[1] + Math.sin(a) * r, s: [1.2 + rng.next(), 0.08, 1.2 + rng.next()], ry: rng.next() * 6 });
      }
      add(props.inst(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshStandardMaterial({ color: '#2f7a4a', roughness: 0.6 }), pads));
      add(props.inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), pads.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, y: p.y + 0.35, z: p.z, s: 0.45, c: props.glowColor('#ff9ee8', 2.4) }))));
    }

    // ---- paper lanterns drifting up into the sky
    const LN = 70;
    const sky = new THREE.InstancedMesh(lanternGeo, lanternMat, LN);
    sky.frustumCulled = false;
    const floats = props.around(track, rng, LN, { rMin: 0, rMax: 260, margin: 6 }).map((p) => ({ x: p.x, z: p.z, y0: H(p.x, p.z), off: rng.next() * 70, sp: 1.2 + rng.next() * 1.6, ph: rng.next() * 6, s: 1.1 + rng.next() * 0.8 }));
    sky.count = floats.length;
    add(sky);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
    onUpdate((dt, t) => {
      floats.forEach((f, i) => {
        const h = (f.off + t * f.sp) % 70;
        const s = f.s * Math.min(1, h / 4, (70 - h) / 10);
        P.set(f.x + Math.sin(t * 0.3 + f.ph) * 3, f.y0 + 2 + h, f.z + Math.cos(t * 0.25 + f.ph) * 3);
        Q.setFromEuler(E.set(Math.sin(t + f.ph) * 0.1, t * 0.2 + f.ph, 0));
        M.compose(P, Q, S.set(s, s, s));
        sky.setMatrixAt(i, M);
      });
      sky.instanceMatrix.needsUpdate = true;
    });

    // ---- fireflies
    const ff = props.motes(750, { center: c, spread: [620, 26, 620], yBase: b.min.y - 1, size: 0.75, colors: ['#e8ff6e', '#b8ff6e', '#fff3a0', '#9effd8'], speed: 0.55, blink: 1.6 }, rng);
    add(ff);
    onUpdate((dt, t) => ff.userData.update(dt, t));

    // a few denser swarms along the road
    for (let i = 0; i < 8; i++) {
      const k = Math.floor(((i + 0.5) / 8) * N);
      const sw = props.motes(110, { center: track.P[k].clone(), spread: [90, 10, 90], yBase: track.P[k].y - 0.5, size: 0.6, colors: ['#e8ff6e', '#fff3a0', '#9effd8'], speed: 0.7, blink: 1.8 }, rng);
      add(sw);
      onUpdate((dt, t) => sw.userData.update(dt, t));
    }

    // ---- start gate
    add(props.startGate(track, { pillar: '#6b4a33', accent: '#22c9bb', banner: '#2a1b5e', lights: '#ffb84d', glowK: 2.6 }));
  },
};
