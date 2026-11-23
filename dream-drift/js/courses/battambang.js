// courses/battambang.js — CAMBODIA 4 「バッタンバン 田んぼと 鉄道」
// Hot, bright countryside round Battambang: rice paddies and sugar palms, stilt houses and white cows, the old
// yellow station whose clock stopped long ago, the bamboo train rattling along beside the road — and the real
// train, which now and then thunders across the road at two level crossings. Wait for the barriers, or get flattened.
import * as THREE from 'three';
import { part, merge, canvasTexture } from '../engine/util.js';
import { RailLine, makeLoco, makeCoach, makeNorry } from '../track/rail.js';
import { sugarPalmGeometry, coconutPalmGeometry, shophouseRow, prangGeometry, ElephantWalk } from './khmer.js';

export const RAIL = [[-620, -55], [-300, -78], [0, -98], [300, -108], [620, -96]];
const NORRY = [[25, -235], [175, -228]];
const RIVER = [[-60, -420], [-75, -250], [-82, -150], [-72, -95], [-60, -60]];
const LAKE = [-60, -55, 30];
const GROUND = -0.4;

function stiltHouseGeometry(rng) {
  const wall = ['#a8784a', '#8a5a34', '#b88a5a'][Math.floor(rng.next() * 3)], roof = rng.next() < 0.5 ? '#8a3a2a' : '#6a6a6a';
  const parts = [];
  for (const [x, z] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2], [0, -2], [0, 2]]) parts.push(part(new THREE.CylinderGeometry(0.16, 0.18, 3, 6), '#5a3a22', [x, 1.5, z]));
  parts.push(part(new THREE.BoxGeometry(6, 2.6, 4.6), wall, [0, 4.3, 0]));
  const r = new THREE.CylinderGeometry(0.01, 4.6, 2.6, 4, 1); r.rotateY(Math.PI / 4); r.scale(1.25, 1, 0.85);
  parts.push(part(r, roof, [0, 6.9, 0]));
  parts.push(part(new THREE.BoxGeometry(1.2, 0.1, 3), '#6a4a2a', [3.6, 1.6, 0], [0, 0, -0.5]));
  parts.push(part(new THREE.BoxGeometry(1.0, 1.4, 0.1), '#3a2a1a', [0, 4.0, 2.31]));
  return merge(parts);
}

function cowGeometry() {
  return merge([
    part(new THREE.BoxGeometry(0.9, 0.8, 1.9), '#f0ece2', [0, 1.1, 0]),
    part(new THREE.BoxGeometry(0.5, 0.55, 0.7), '#ece6da', [0, 1.35, 1.15]),
    part(new THREE.SphereGeometry(0.28, 8, 6), '#e4dccc', [0, 1.55, 0.35]),
    ...[[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]].map(([x, z]) => part(new THREE.CylinderGeometry(0.09, 0.08, 0.8, 5), '#e8e2d6', [x, 0.4, z])),
    ...[-0.2, 0.2].map((x) => part(new THREE.ConeGeometry(0.05, 0.25, 5), '#3a3a3a', [x, 1.75, 1.15])),
  ]);
}

export default {
  id: 'battambang',
  name: 'バッタンバン 田んぼと 鉄道',
  nameEn: 'Battambang Rails',
  tagline: '田んぼと ヤシの 道。となりを バンブートレインが 走り、ときどき 本物の 列車が 踏切を わたる！',
  seed: 81,
  points: [[0, 0, 0], [80, 0, 0], [150, 0, -15], [198, 0, -60], [205, 0, -130], [172, 0, -185], [100, 0, -200], [30, 0, -188], [-15, 0, -158], [-52, 0.8, -162], [-80, 3.5, -153], [-108, 0.5, -142], [-150, 0, -92], [-152, 0, -25], [-120, 0, 25], [-62, 0, 32]],
  itemRows: [0.18, 0.47, 0.82],
  boosts: [{ at: 0.05, d: 0.3 }, { at: 0.42, d: -0.3 }, { at: 0.87, d: 0 }],
  jumps: [{ at: 0.628 }],
  theme: {
    sky: { top: '#3f86d6', horizon: '#d6ecf4', bottom: '#f2f6ec', sunDir: [0.4, 0.62, -0.68], sunColor: '#fff6d8', sunSize: 0.0045, sunGlow: 0.6, horizonSharp: 0.6 },
    fog: { color: '#d8e6e6', near: 160, far: 720 },
    hemi: { sky: '#d8ecff', ground: '#b8a070', intensity: 1.35 },
    sun: { color: '#fff2d6', intensity: 2.6, dir: [0.45, 0.82, -0.4] },
    envIntensity: 0.75,
    bloom: { strength: 0.3, radius: 0.4, threshold: 2.3 },
    dust: '#c89a6a', mapColor: '#ffb42a',
  },
  road: {
    width: 17, curb: 0.9, shoulder: 5, bank: 5,
    roadColor: '#55565c', roadLine: 'rgba(255,255,255,0.9)', centerDash: 'rgba(255,255,255,0.65)', roadRoughness: 0.85,
    curbColors: ['#ffffff', '#2a6ad8'],
    paintShoulder(ctx, s) { // red laterite dust
      ctx.fillStyle = '#b5683e'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1300; i++) { ctx.fillStyle = ['rgba(150,80,40,0.5)', 'rgba(210,140,90,0.4)', 'rgba(90,60,40,0.3)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    },
    shoulderRoughness: 1,
    wall: {
      color: '#a8784a', height: 0.95, thickness: 0.35, roughness: 0.9,
      gaps: [[0.271, 9.5], [0.7405, 9.5]], // the level crossings
      map(ctx, s) { // wooden fence rails
        ctx.fillStyle = '#7a5434'; ctx.fillRect(0, 0, s, s);
        for (const y of [0.15, 0.55]) { ctx.fillStyle = '#b8895a'; ctx.fillRect(0, s * y, s, s * 0.22); ctx.fillStyle = 'rgba(60,40,20,0.4)'; ctx.fillRect(0, s * (y + 0.2), s, 3); }
        ctx.fillStyle = '#5a3a22'; ctx.fillRect(s * 0.45, 0, s * 0.1, s);
      },
    },
    skirt: { color: '#8a7a6a', depth: 1.4 },
  },
  music: {
    bpm: 152, root: 65, scale: 'major', progression: [0, 3, 4, 4], seed: 13,
    style: { lead: 'square', drums: 'pop', bass: 'octave', arpType: 'triangle', swing: 0.05, rhythm: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0] },
  },
  planShapes: () => [],

  build({ track, props, rng, add, onUpdate, addHazard }) {
    const N = track.N, P = track.P;
    const wallW = track.halfWidth + track.curb + track.shoulder;
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const toy = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...o });
    const nearRail = (x, z, m) => { for (let i = 0; i + 1 < RAIL.length; i++) { const [ax, az] = RAIL[i], [bx, bz] = RAIL[i + 1]; const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); if (Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t) < m) return true; } return false; };
    const nearRiver = (x, z, m) => { for (let i = 0; i + 1 < RIVER.length; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); if (Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t) < m) return true; } return Math.hypot(x - LAKE[0], z - LAKE[1]) < LAKE[2] + m; };
    // places kept clear of trees: the station, the bamboo-train halt, the town and the statue
    const keep = [[40, -82, 34, 18], [NORRY[1][0] + 8, NORRY[1][1] - 6, 18, 14], [40, 30, 130, 22]];
    const free = (x, z, m = 4) => track.clearOfRoad(x, z, m) && !nearRail(x, z, m + 4) && !nearRiver(x, z, m + 2) && !keep.some(([kx, kz, hx, hz]) => Math.abs(x - kx) < hx + m && Math.abs(z - kz) < hz + m);

    // ---- paddies: a patchwork of green and gold fields divided by low dykes, some of them flooded
    const paddyTex = canvasTexture(512, (ctx, s) => {
      const n = 6, cols = ['#7fb04a', '#94c056', '#b8c15a', '#6aa042', '#a8b84e', '#c9b45e'];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        ctx.fillStyle = cols[(x * 7 + y * 3) % cols.length]; ctx.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
        for (let i = 0; i < 70; i++) { ctx.fillStyle = 'rgba(40,80,20,0.25)'; ctx.fillRect((x * s) / n + Math.random() * (s / n), (y * s) / n + Math.random() * (s / n), 2, 5); }
      }
      ctx.strokeStyle = '#9a7a52'; ctx.lineWidth = 6;
      for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo((i * s) / n, 0); ctx.lineTo((i * s) / n, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, (i * s) / n); ctx.lineTo(s, (i * s) / n); ctx.stroke(); }
    });
    paddyTex.repeat.set(28, 28);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: paddyTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, GROUND, c.z); ground.receiveShadow = true; add(ground);
    const floodMat = new THREE.MeshStandardMaterial({ color: '#8fb4c8', roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.85 });
    const floods = [];
    for (let i = 0; i < 90; i++) {
      const x = c.x + (rng.next() - 0.5) * 900, z = c.z + (rng.next() - 0.5) * 800, w = 18 + rng.next() * 22;
      if (!free(x, z, w * 0.8)) continue;
      floods.push({ x, y: GROUND + 0.04, z, s: [w, 1, w * (0.7 + rng.next() * 0.6)], ry: Math.round(rng.next() * 3) * 0.08 });
    }
    const fp = new THREE.PlaneGeometry(1, 1); fp.rotateX(-Math.PI / 2);
    add(props.inst(fp, floodMat, floods));

    // ---- the river (under the road bridge and the railway bridge) and the lotus lake
    const waterMat = new THREE.MeshStandardMaterial({ color: '#6a8a6e', roughness: 0.12, metalness: 0.45 });
    {
      const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)));
      const pos = [], idx = [], n = 80;
      for (let i = 0; i <= n; i++) {
        const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n), w = 7 + i * 0.03;
        pos.push(p.x - t.z * w, GROUND + 0.05, p.z + t.x * w, p.x + t.z * w, GROUND + 0.05, p.z - t.x * w);
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#6a8a6e', roughness: 0.12, metalness: 0.45, side: THREE.DoubleSide })));
      const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE[2], 40), waterMat); lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE[0], GROUND + 0.06, LAKE[1]); add(lake);
      const pads = [], flowers = [];
      for (let i = 0; i < 70; i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * (LAKE[2] - 2);
        const s = 0.8 + rng.next() * 1.2;
        pads.push({ x: LAKE[0] + Math.cos(a) * r, y: GROUND + 0.1, z: LAKE[1] + Math.sin(a) * r, s: [s, 1, s], ry: rng.next() * 6 });
        if (i % 3 === 0) flowers.push({ x: LAKE[0] + Math.cos(a) * r, y: GROUND + 0.5, z: LAKE[1] + Math.sin(a) * r, s: 0.45 });
      }
      const padG = new THREE.CircleGeometry(1, 12, 0.3, Math.PI * 1.8); padG.rotateX(-Math.PI / 2);
      add(props.inst(padG, new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.7, side: THREE.DoubleSide }), pads));
      add(props.inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff8ac4', roughness: 0.5, emissive: '#ff5fa2', emissiveIntensity: 0.25 }), flowers));
    }
    // piers under the road bridge
    const piers = [];
    for (let k = 0; k < N; k += 5) if (P[k].y > 1.2) for (const d of [-6, 6]) { const v = track.pointAt(k, d), h = P[k].y - 1.4 - GROUND; piers.push({ x: v.x, y: GROUND + h / 2, z: v.z, s: [1.6, h, 1.6] }); }
    add(props.inst(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: '#c4beb2', roughness: 0.85 }), piers, { cast: true }));

    // ---- the railway and its train (a race hazard: see track/rail.js)
    const loco = makeLoco({ body: '#2a62b8', stripe: '#ffd23b' });
    const coaches = [makeCoach({ body: '#3a7fc8' }), makeCoach({ body: '#c8a03a', band: '#fff4d8' }), makeCoach({ body: '#3a7fc8' })];
    const rail = new RailLine(track, {
      points: RAIL.map(([x, z]) => [x, GROUND + 0.25, z]), closed: false, solid: true,
      trains: [{ cars: [loco, ...coaches], speed: 18, mode: 'shuttle', dwell: 8, ease: 3.5, phase: 0 }],
      colors: { ballast: '#8a8070', sleeper: '#5a4632' },
    });
    add(rail.group); addHazard(rail);
    // a steel girder bridge where the line crosses the river
    {
      const pts = [];
      for (let i = 0; i <= rail.S; i++) if (nearRiver(rail.P[i].x, rail.P[i].z, 3)) pts.push(i);
      if (pts.length) {
        const i0 = pts[0], i1 = pts[pts.length - 1];
        const girder = new THREE.MeshStandardMaterial({ color: '#4a6a8a', roughness: 0.5, metalness: 0.4 });
        for (const side of [-1, 1]) {
          const a = rail.P[i0], bb = rail.P[i1], T = rail.T[Math.round((i0 + i1) / 2)];
          const m = new THREE.Mesh(unit, girder);
          const len = Math.hypot(bb.x - a.x, bb.z - a.z) + 6;
          m.scale.set(0.4, 2.2, len); m.position.set((a.x + bb.x) / 2 - T.z * side * 2.1, a.y + 1.2, (a.z + bb.z) / 2 + T.x * side * 2.1);
          m.rotation.y = Math.atan2(T.x, T.z); m.castShadow = true; add(m);
        }
      }
    }
    // the bamboo train shuttling along beside the north straight, with its little station
    const norryLine = new RailLine(track, {
      points: NORRY.map(([x, z]) => [x, GROUND + 0.2, z]), closed: false, solid: false, gauge: 1.0, bedWidth: 2.4,
      trains: [{ cars: [makeNorry({ riders: 4, rng: () => rng.next() })], speed: 9, mode: 'shuttle', dwell: 3, ease: 2, phase: 0.2 }],
      colors: { ballast: '#9a7a5a', sleeper: '#6a4a2a', rail: '#8a8a8a' },
    });
    add(norryLine.group); addHazard(norryLine);
    {
      const [x, z] = NORRY[1];
      const deck = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: '#c9a85c', roughness: 0.9 })); deck.scale.set(10, 0.6, 6); deck.position.set(x + 8, GROUND + 0.3, z - 5); deck.receiveShadow = true; add(deck);
      const hut = new THREE.Mesh(stiltHouseGeometry(rng), toy()); hut.scale.setScalar(0.8); hut.position.set(x + 12, GROUND - 1.6, z - 9); add(hut);
      const parked = makeNorry({ riders: 0, rng: () => rng.next() }); parked.position.set(x + 6, GROUND + 0.6, z - 4); parked.rotation.y = 1.4; add(parked);
      const signTex = canvasTexture(512, (ctx, s) => {
        ctx.fillStyle = '#2f6a3a'; ctx.fillRect(0, 0, s, s / 2);
        ctx.fillStyle = '#fff6d0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 62px "M PLUS Rounded 1c", sans-serif'; ctx.fillText('BAMBOO TRAIN', s / 2, s * 0.15);
        ctx.font = '800 40px "M PLUS Rounded 1c", sans-serif'; ctx.fillText('バンブートレイン のりば', s / 2, s * 0.34);
      }, { repeat: false, w: 512, h: 256 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8, side: THREE.DoubleSide }));
      sign.position.set(x - 8, GROUND + 5, z + 8); sign.rotation.y = 0.15; add(sign);
      for (const dx of [-3.6, 3.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), new THREE.MeshStandardMaterial({ color: '#5a3a22' })); p.position.set(x - 8 + dx, GROUND + 2.5, z + 8); add(p); }
    }

    // ---- Battambang station: yellow, colonial, its clock stopped at 8:02
    {
      const x = 40, z = -82;
      const yellow = new THREE.MeshStandardMaterial({ color: '#f0c84a', roughness: 0.7 });
      const trim = new THREE.MeshStandardMaterial({ color: '#f6eedc', roughness: 0.6 });
      const roofM = new THREE.MeshStandardMaterial({ color: '#b04a32', roughness: 0.7 });
      const bx = (m, px, py, pz, sx, sy, sz) => { const o = new THREE.Mesh(unit, m); o.position.set(x + px, GROUND + py, z + pz); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; add(o); return o; };
      bx(yellow, 0, 4, 0, 12, 8, 9);
      bx(yellow, -14, 2.5, 0, 16, 5, 8); bx(yellow, 14, 2.5, 0, 16, 5, 8);
      bx(roofM, -14, 5.3, 0, 17, 0.6, 9); bx(roofM, 14, 5.3, 0, 17, 0.6, 9); bx(trim, 0, 8.3, 0, 12.6, 0.6, 9.6);
      bx(trim, 0, 0.4, -9, 46, 0.8, 8); // platform toward the line
      const canopy = bx(roofM, 0, 4.4, -8.5, 40, 0.3, 6); canopy.rotation.x = -0.08;
      for (let i = -3; i <= 3; i++) bx(trim, i * 6, 2.2, -11, 0.3, 4.4, 0.3);
      // clock face (front, toward the road)
      const clock = canvasTexture(256, (ctx, s) => {
        ctx.fillStyle = '#f6f2e6'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 8; ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = '#2a2a2a'; ctx.fillRect(s / 2 + Math.sin(a) * s * 0.38 - 4, s / 2 - Math.cos(a) * s * 0.38 - 4, 8, 8); }
        ctx.lineCap = 'round';
        const hand = (a, l, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.lineTo(s / 2 + Math.sin(a) * l, s / 2 - Math.cos(a) * l); ctx.stroke(); };
        hand(((8 + 2 / 60) / 12) * Math.PI * 2, s * 0.22, 10); hand((2 / 60) * Math.PI * 2, s * 0.34, 6);
      }, { repeat: false });
      const cf = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshStandardMaterial({ map: clock, roughness: 0.5 }));
      cf.position.set(x, GROUND + 6.2, z + 4.56); add(cf);
      const name = canvasTexture(512, (ctx, s) => { ctx.fillStyle = '#f6eedc'; ctx.fillRect(0, 0, s, s / 4); ctx.fillStyle = '#7a2a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 70px serif'; ctx.fillText('BATTAMBANG', s / 2, s / 8 + 4); }, { repeat: false, w: 512, h: 128 });
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.7), new THREE.MeshStandardMaterial({ map: name, roughness: 0.6 }));
      nm.position.set(x, GROUND + 9.9, z + 4.56); add(nm);
      bx(trim, 0, 9.9, 4.5, 11.4, 2.9, 0.1);
    }

    // ---- the town along the start straight, and the statue of Ta Dambang with his stick
    const houseMat = toy({ roughness: 0.8 });
    for (let k = -30; k < 90; k += 11) {
      // the town is outside the loop: on the right of the start straight, fronts to the road
      const kk = (k + N) % N, v = track.pointAt(kk, wallW + 9);
      if (!track.clearOfRoad(v.x, v.z, 3)) continue;
      const m = new THREE.Mesh(shophouseRow(rng, 3), houseMat);
      m.position.set(v.x, GROUND, v.z); m.rotation.y = Math.atan2(track.T[kk].x, track.T[kk].z) + Math.PI / 2;
      m.castShadow = true; m.receiveShadow = true; add(m);
    }
    {
      const k = N - 22, v = track.pointAt(k, wallW + 6);
      const black = new THREE.MeshStandardMaterial({ color: '#1e1e22', roughness: 0.35, metalness: 0.3 });
      const g = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 3, 16), new THREE.MeshStandardMaterial({ color: '#d8d0c0', roughness: 0.7 })); ped.position.y = 1.5; g.add(ped);
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 1.2, 4, 8), black); legs.rotation.x = Math.PI / 2; legs.position.set(0, 3.9, 0.3); g.add(legs);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.6, 4, 8), black); body.position.set(0, 5.4, -0.2); g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), black); head.position.set(0, 7.1, -0.1); g.add(head);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.6, 4, 6), black); arm.rotation.x = -1.1; arm.position.set(0.6, 5.8, 0.7); g.add(arm);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), black); stick.rotation.x = -0.25; stick.position.set(0.7, 6.3, 1.5); g.add(stick);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.position.set(v.x, GROUND, v.z); g.lookAt(P[k].x, GROUND, P[k].z); add(g);
    }

    // ---- countryside: sugar palms everywhere, stilt houses with coconut palms, white cows
    const palmGeo = sugarPalmGeometry(rng), coco = coconutPalmGeometry(rng, 0.14);
    const palms = [], cocos = [], houses = [], cows = [];
    for (const p of props.around(track, rng, 420, { rMin: 0, rMax: 520, margin: 6 })) {
      if (!free(p.x, p.z, 4)) continue;
      const h = 14 + rng.next() * 10;
      palms.push({ x: p.x, y: GROUND, z: p.z, s: [h, h, h], ry: rng.next() * 6 });
    }
    for (const p of props.beside(track, rng, 90, { min: 3, max: 30, margin: 3 })) {
      if (!free(p.x, p.z, 3)) continue;
      const h = 13 + rng.next() * 8;
      palms.push({ x: p.x, y: GROUND, z: p.z, s: [h, h, h], ry: rng.next() * 6 });
    }
    const houseGeo = stiltHouseGeometry(rng);
    for (const p of props.beside(track, rng, 26, { min: 12, max: 60, margin: 8 })) {
      if (!free(p.x, p.z, 8)) continue;
      houses.push({ x: p.x, y: GROUND, z: p.z, ry: rng.next() * 6, s: 1 + rng.next() * 0.3 });
      for (let i = 0; i < 2; i++) { const h = 10 + rng.next() * 5; cocos.push({ x: p.x + (rng.next() - 0.5) * 12, y: GROUND, z: p.z + (rng.next() - 0.5) * 12, s: [h, h, h], ry: rng.next() * 6 }); }
      if (rng.next() < 0.6) for (let i = 0; i < 2; i++) cows.push({ x: p.x + 8 + rng.next() * 8, y: GROUND, z: p.z + (rng.next() - 0.5) * 10, ry: rng.next() * 6 });
    }
    add(props.inst(palmGeo, toy({ roughness: 0.9 }), palms, { cast: true }));
    add(props.inst(coco, toy({ roughness: 0.9 }), cocos, { cast: true }));
    add(props.inst(houseGeo, toy(), houses, { cast: true }));
    add(props.inst(cowGeometry(), toy({ roughness: 0.8 }), cows, { cast: true }));

    // ---- two working elephants plodding along the paddy dykes
    {
      const herd = new ElephantWalk({ paths: [[[-112, -70], [-108, -22]], [[150, 42], [205, 30], [240, -10]]], ground: () => GROUND, scale: 1.5, speed: 0.9, rng: () => rng.next() });
      add(herd.group); onUpdate((dt) => herd.update(dt));
    }

    // ---- far away: Phnom Sampov and other limestone hills, a temple on top
    const hillG = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    add(props.inst(hillG, new THREE.MeshStandardMaterial({ color: '#5f7a4a', roughness: 1 }), [[-420, 380, 120, 70], [-260, 520, 90, 48], [380, 460, 140, 55], [520, -480, 110, 40]].map(([x, z, r, h]) => ({ x: c.x + x, y: GROUND - 2, z: c.z + z, s: [r, h, r * 0.8] }))));
    const temple = new THREE.Mesh(prangGeometry({ tiers: 5, color: '#e8d8a8', band: '#c89a4a' }), toy({ roughness: 0.6 }));
    temple.scale.set(7, 22, 7); temple.position.set(c.x - 420, GROUND + 66, c.z + 380); add(temple);

    // ---- dust in the warm air, and the start gate
    const dust = props.motes(160, { center: c, spread: [520, 18, 460], yBase: 1, size: 0.4, colors: ['#fff0c8', '#ffe0a0'], speed: 0.5, blink: 0.3, glow: 0.8 }, rng);
    add(dust); onUpdate((dt, t) => dust.userData.update(dt, t));
    add(props.startGate(track, { pillar: '#f0c84a', accent: '#2a62b8', banner: '#2a62b8', lights: '#ffffff', text: 'BATTAMBANG' }));
  },
};
