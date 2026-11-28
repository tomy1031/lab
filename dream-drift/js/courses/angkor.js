// courses/angkor.js — CAMBODIA 1 「アンコール・ネオン遺跡」
// Angkor at night, reimagined: a stone causeway with fire braziers and seven-headed nagas crosses a glowing
// moat into the temple-fortress, laps the five lotus towers of Angkor Wat (traced in neon), climbs a rainbow-lit
// skyway over the jungle, lands through the face-tower gate of Angkor Thom and runs past the smiling Bayon.
import * as THREE from 'three';
import { part, merge, canvasTexture, hsl } from '../engine/util.js';
import { prangGeometry, nagaGeometry, faceTexture, sugarPalmGeometry, khmerTexture, worldMapped, ElephantWalk, mergeStatic } from './khmer.js';

const CYAN = '#39f0ff', MAGENTA = '#ff3cc8', GOLD = '#ffc94a', ORANGE = '#ff7a2a', VIOLET = '#9a6bff';
const MOAT_IN = 105, MOAT_OUT = 140, WALL = 97;

function neonText(lines, { w = 1024, h = 256, color = CYAN, bg = 'rgba(10,4,30,0.0)', size = 120 } = {}) {
  return canvasTexture(w, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px "M PLUS Rounded 1c", sans-serif`;
    ctx.shadowColor = color; ctx.shadowBlur = 28;
    ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.fillStyle = '#ffffff';
    lines.forEach((l, i) => { const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.05; ctx.strokeText(l, w / 2, y); ctx.fillText(l, w / 2, y); });
  }, { repeat: false, w, h });
}

// a dancer silhouette for the holograms
function apsaraTexture(color) {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // headdress
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.04); ctx.lineTo(s * 0.44, s * 0.17); ctx.lineTo(s * 0.56, s * 0.17); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.21, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = s * 0.05;
    // body with a hip sway
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.26); ctx.quadraticCurveTo(s * 0.47, s * 0.4, s * 0.53, s * 0.5); ctx.stroke();
    // arms: one up with a flexed hand, one out
    ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.33, s * 0.24); ctx.lineTo(s * 0.3, s * 0.12); ctx.lineTo(s * 0.24, s * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.68, s * 0.36); ctx.lineTo(s * 0.8, s * 0.3); ctx.lineTo(s * 0.84, s * 0.24); ctx.stroke();
    // skirt
    ctx.beginPath(); ctx.moveTo(s * 0.42, s * 0.48); ctx.lineTo(s * 0.64, s * 0.48); ctx.lineTo(s * 0.7, s * 0.66); ctx.lineTo(s * 0.38, s * 0.66); ctx.fill();
    // bent legs (the deep plié)
    ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.65); ctx.lineTo(s * 0.32, s * 0.78); ctx.lineTo(s * 0.4, s * 0.93); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.62, s * 0.65); ctx.lineTo(s * 0.74, s * 0.8); ctx.lineTo(s * 0.66, s * 0.94); ctx.stroke();
  }, { repeat: false });
}

// the glowing moat: dark water with slow neon / ember veins (keeps the standard lighting and fog)
function moatMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ color: '#120826', roughness: 0.12, metalness: 0.55 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vMW; uniform float uT;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      float fb(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a*n2(p); p *= 2.07; a *= 0.5; } return v; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 q = vMW.xz * 0.035;
        float n = fb(q + vec2(uT * 0.03, -uT * 0.02));
        float vein = 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5));
        float n2v = fb(q * 1.7 - vec2(uT * 0.05, uT * 0.04));
        float vein2 = 1.0 - smoothstep(0.0, 0.025, abs(n2v - 0.52));
        totalEmissiveRadiance += vec3(1.0, 0.24, 0.72) * vein * 1.1 + vec3(1.0, 0.5, 0.12) * vein2 * 0.6 + vec3(0.08, 0.02, 0.16) * n;`);
  };
  m.customProgramCacheKey = () => 'angkor-moat';
  return m;
}

// a flat ring between two squares (centred at the origin) lying at height y
function squareRing(inner, outer, y) {
  const s = new THREE.Shape([[-outer, -outer], [outer, -outer], [outer, outer], [-outer, outer]].map(([x, z]) => new THREE.Vector2(x, z)));
  s.holes.push(new THREE.Path([[-inner, -inner], [-inner, inner], [inner, inner], [inner, -inner]].map(([x, z]) => new THREE.Vector2(x, z))));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  return g;
}

export default {
  id: 'angkor',
  name: 'アンコール・ネオン遺跡',
  nameEn: 'Neon Angkor',
  tagline: '夜の アンコールワットと バイヨン。炎と 光る堀の 遺跡を ぬけ、虹色ネオンの 空中ハイウェイへ',
  seed: 51,
  points: [[-185, 0, 0], [-130, 0, 0], [-86, 0, 2], [-67, 0, 34], [-38, 0, 64], [25, 0, 67], [61, 0, 40], [67, 0, -10], [64, 1, -62], [62, 3, -110], [58, 10, -160], [35, 18, -205], [-15, 24, -228], [-80, 25, -230], [-140, 23, -218], [-185, 18, -195], [-215, 12, -165], [-232, 6, -120], [-250, 1.5, -75], [-248, 0, -35], [-225, 0, -8]],
  itemRows: [0.2, 0.5, 0.82],
  boosts: [{ at: 0.06, d: 0 }, { at: 0.58, d: -0.35 }, { at: 0.93, d: 0.3 }],
  jumps: [{ at: 0.735 }],
  theme: {
    sky: { top: '#07021a', horizon: '#5c1666', bottom: '#14052a', sunDir: [-0.55, 0.32, 0.77], sunColor: '#c2b4d6', sunSize: 0.004, sunGlow: 0.05,
      stars: 1.1, nebula: 0.55, nebA: '#ff2fb5', nebB: '#3a2cff', horizonSharp: 0.5 },
    fog: { color: '#2b0d3e', near: 120, far: 820 },
    hemi: { sky: '#8a7cff', ground: '#3a1a2c', intensity: 0.95 },
    sun: { color: '#cdbcff', intensity: 1.25, dir: [-0.45, 0.8, 0.45] },
    envIntensity: 0.35,
    bloom: { strength: 0.7, radius: 0.45, threshold: 1.45 },
    dust: '#5a4a52', mapColor: MAGENTA,
  },
  road: {
    width: 17, curb: 0.9, shoulder: 5, bank: 5,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#211c2a'; ctx.fillRect(0, 0, s, s);
      // big worn stone slabs
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const h = s / rows, off = (r % 2) * 0.5;
        for (let c = -1; c < 4; c++) {
          const w = s / 3, x = (c + off) * w + 3, y = r * h + 3;
          ctx.fillStyle = `hsl(${262 + Math.random() * 16}, ${10 + Math.random() * 8}%, ${14 + Math.random() * 6}%)`;
          ctx.fillRect(x, y, w - 6, h - 6);
        }
      }
      for (let i = 0; i < 1200; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
      // circuit traces in the stone
      ctx.strokeStyle = 'rgba(57, 240, 255, 0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        let x = s * (0.15 + Math.random() * 0.7), y = Math.random() * s;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) { if (j % 2) x += (Math.random() - 0.5) * s * 0.2; else y += s * 0.12; ctx.lineTo(x, y); }
        ctx.stroke(); ctx.fillStyle = 'rgba(57,240,255,0.6)'; ctx.fillRect(x - 3, y - 3, 6, 6);
      }
      // neon edge lines and magenta centre dashes
      ctx.fillStyle = CYAN;
      ctx.fillRect(s * 0.024, 0, s * 0.018, s); ctx.fillRect(s * 0.958, 0, s * 0.018, s);
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(s * 0.494, s * 0.06, s * 0.012, s * 0.36); ctx.fillRect(s * 0.494, s * 0.56, s * 0.012, s * 0.36);
    },
    roadRoughness: 0.75, roadEmissive: '#ffffff', roadEmissiveIntensity: 0.95,
    curbColors: [MAGENTA, '#1d1026'], curbEmissive: 0.8, curbLength: 3,
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#1f2420'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1100; i++) { ctx.fillStyle = ['rgba(60,80,60,0.5)', 'rgba(0,0,0,0.4)', 'rgba(120,110,100,0.25)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
      for (let i = 0; i < 26; i++) { ctx.fillStyle = [CYAN, MAGENTA, GOLD][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4); }
    },
    shoulderEmissive: '#0c0812', shoulderRoughness: 0.9,
    wall: {
      color: '#8a8070', height: 1.2, thickness: 0.8, roughness: 0.85, glow: CYAN, glowIntensity: 2.4,
      map(ctx, s) { // naga scales
        ctx.fillStyle = '#6a6252'; ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s + 16; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < s + 16; x += 16) {
          ctx.fillStyle = 'rgba(30,25,15,0.35)'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(x, y - 2, 6, Math.PI, Math.PI * 2); ctx.fill();
        }
      },
    },
    skirt: { color: '#3a3240', depth: 2.4, trim: MAGENTA, trimIntensity: 2.2 },
  },
  music: {
    bpm: 148, root: 57, scale: 'harmonicMinor', progression: [0, 5, 6, 4], seed: 77,
    style: { lead: 'sawtooth', leadVoice: 'bell', drums: 'drive', bass: 'pulse', arpType: 'triangle', arpRate: 1, rhythm: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1] },
  },
  planShapes: () => [],

  build({ track, props, rng, add: addToScene, onUpdate }) {
    const N = track.N, P = track.P;
    // everything that never moves goes into `statics` and is merged by material at the end (few draw calls)
    const statics = new THREE.Group();
    const add = (o) => { statics.add(o); return o; };
    const addLive = addToScene;
    const wallW = track.halfWidth + track.curb + track.shoulder;
    const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
    const time = { value: 0 };
    onUpdate((dt, t) => { time.value = t; });
    // ground height at (x, z): jungle outside the moat, the temple island inside, water between
    const groundY = (x, z) => {
      const m = Math.max(Math.abs(x), Math.abs(z));
      return m < MOAT_IN ? -0.35 : m < MOAT_OUT ? null : -0.5;
    };
    // Khmer sandstone (from NEXMAX CHRONICLE), tiled in world space so big and small blocks match
    const sand = khmerTexture('sandstone');
    const stoneTex = khmerTexture('sandstone', [3, 2]);
    const stone = worldMapped(new THREE.MeshStandardMaterial({ map: sand, color: '#c4bad4', roughness: 0.9 }), 6);
    const stoneDark = worldMapped(new THREE.MeshStandardMaterial({ map: sand, color: '#8a809e', roughness: 0.95 }), 6);
    const neonC = props.glow(CYAN, 2.2), neonM = props.glow(MAGENTA, 2.2), neonG = props.glow(GOLD, 2.0);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const box = (mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(unit, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; add(m); return m; };
    // glowing edge outline around the top of a box (x, top y, z, size)
    const outline = (mat, x, y, z, sx, sz, t = 0.25) => {
      box(mat, x, y, z - sz / 2, sx + t, t, t).castShadow = false; box(mat, x, y, z + sz / 2, sx + t, t, t).castShadow = false;
      box(mat, x - sx / 2, y, z, t, t, sz).castShadow = false; box(mat, x + sx / 2, y, z, t, t, sz).castShadow = false;
    };

    // ---- ground: jungle floor, the temple island and the moat between them
    const jungleTex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#18201a'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = ['rgba(40,70,40,0.5)', 'rgba(0,0,0,0.35)', 'rgba(70,60,50,0.3)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4); }
    });
    jungleTex.repeat.set(60, 60);
    const outer = new THREE.Shape([[-900, -900], [900, -900], [900, 900], [-900, 900]].map(([x, z]) => new THREE.Vector2(x, z)));
    outer.holes.push(new THREE.Path([[-MOAT_OUT, -MOAT_OUT], [-MOAT_OUT, MOAT_OUT], [MOAT_OUT, MOAT_OUT], [MOAT_OUT, -MOAT_OUT]].map(([x, z]) => new THREE.Vector2(x, z))));
    const og = new THREE.ShapeGeometry(outer); og.rotateX(Math.PI / 2); og.translate(0, -0.5, 0);
    { const uv = og.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1800 + 0.5, uv.getY(i) / 1800 + 0.5); }
    const ground = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ map: jungleTex, roughness: 1, side: THREE.DoubleSide }));
    ground.receiveShadow = true; add(ground);
    const islandTex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#2a3326'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1200; i++) { ctx.fillStyle = ['rgba(80,110,70,0.4)', 'rgba(0,0,0,0.3)', 'rgba(150,140,120,0.2)'][i % 3]; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    });
    islandTex.repeat.set(16, 16);
    const island = new THREE.Mesh(new THREE.BoxGeometry(MOAT_IN * 2, 1.6, MOAT_IN * 2), [stoneDark, stoneDark, new THREE.MeshStandardMaterial({ map: islandTex, roughness: 1 }), stoneDark, stoneDark, stoneDark]);
    island.position.y = -1.15; island.receiveShadow = true; add(island);
    const moat = new THREE.Mesh(squareRing(MOAT_IN, MOAT_OUT, -1.3), moatMaterial(time));
    moat.material.side = THREE.DoubleSide; addLive(moat);
    // the outer banks of the moat
    for (const [x, z, sx, sz] of [[0, -MOAT_OUT - 0.5, MOAT_OUT * 2 + 2, 1], [0, MOAT_OUT + 0.5, MOAT_OUT * 2 + 2, 1], [-MOAT_OUT - 0.5, 0, 1, MOAT_OUT * 2], [MOAT_OUT + 0.5, 0, 1, MOAT_OUT * 2]]) box(stoneDark, x, -1.0, z, sx, 1.2, sz);
    // neon trim along the island's edge
    outline(neonC, 0, -0.32, 0, MOAT_IN * 2, MOAT_IN * 2, 0.3);

    // ---- where the road passes the enclosure wall: the west gate and the north gate
    const near = (pred, f0, f1) => { let best = 0, bd = Infinity; for (let k = Math.floor(f0 * N); k < f1 * N; k++) { const v = pred(P[k]); if (v < bd) { bd = v; best = k; } } return best; };
    const westK = near((p) => Math.abs(p.x + WALL), 0, 0.15);
    const northK = near((p) => Math.abs(p.z + WALL), 0.3, 0.5);
    const gapW = wallW + 9;
    // enclosure walls (laterite), with gaps for the road
    const wallMat = worldMapped(new THREE.MeshStandardMaterial({ map: sand, color: '#b88a7a', roughness: 0.95 }), 5);
    const wallRun = (fixed, along, from, to, horiz) => {
      if (to - from < 1) return;
      const mid = (from + to) / 2, len = to - from;
      if (horiz) box(wallMat, mid, 2, fixed, len, 4.6, 2.2); else box(wallMat, fixed, 2, mid, 2.2, 4.6, len);
      if (horiz) box(neonM, mid, 4.35, fixed, len, 0.18, 0.18).castShadow = false; else box(neonM, fixed, 4.35, mid, 0.18, 0.18, len).castShadow = false;
    };
    const zr = P[westK].z, xr = P[northK].x;
    wallRun(-WALL, 0, -WALL, zr - gapW, false); wallRun(-WALL, 0, zr + gapW, WALL, false);
    wallRun(-WALL, 0, -WALL, xr - gapW, true); wallRun(-WALL, 0, xr + gapW, WALL, true);
    wallRun(WALL, 0, -WALL, WALL, true); wallRun(WALL, 0, -WALL, WALL, false);

    const prangMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex, roughness: 0.85 });
    const prangGeo = prangGeometry({ tiers: 6, color: '#bdb3c8', band: '#e9d9a8' });
    // neon rings on a prang's tier lips
    const prangRings = (g, r, h, mat) => {
      for (let i = 0; i < 6; i++) {
        const y0 = 0.27 + (0.68 * i) / 6, rr = 0.86 * (1 - Math.pow(i / 6, 1.25) * 0.82) * 1.07;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr * r, Math.max(0.08, r * 0.025), 4, 8), mat);
        ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 8; ring.position.y = (y0 + 0.68 / 6 * 0.2) * h;
        g.add(ring);
      }
    };
    const makePrang = (r, h, ringMat = neonM) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(prangGeo, prangMat); m.scale.set(r, h, r); m.castShadow = true; g.add(m);
      prangRings(g, r, h, ringMat);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.25, r * 0.08), 8, 6), neonG); tip.position.y = h * 1.01; g.add(tip);
      return g;
    };
    const prang = (x, y, z, r, h, ringMat = neonM) => { const g = makePrang(r, h, ringMat); g.position.set(x, y, z); add(g); return g; };
    const gate = (k, label) => {
      const g = new THREE.Group();
      const W = wallW + 5.5;
      for (const s of [-1, 1]) {
        // the towers reach down below the road, to the ground
        const t = new THREE.Mesh(unit, stone); t.scale.set(8, 18, 9); t.position.set(s * W, 4, 0); t.castShadow = true; g.add(t);
        const p = makePrang(4.2, 11, neonC); p.position.set(s * W, 13, 0); g.add(p);
        const e = new THREE.Mesh(unit, neonC); e.scale.set(8.3, 0.25, 9.3); e.position.set(s * W, 13, 0); g.add(e);
      }
      const lintel = new THREE.Mesh(unit, stone); lintel.scale.set(2 * W, 3.2, 7); lintel.position.y = 12.4; lintel.castShadow = true; g.add(lintel);
      const lp = makePrang(3.4, 9, neonM); lp.position.y = 14; g.add(lp);
      for (const z of [-3.6, 3.6]) { const e = new THREE.Mesh(unit, neonM); e.scale.set(2 * W, 0.22, 0.22); e.position.set(0, 10.8, z); g.add(e); }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: neonText([label], { color: CYAN }), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
      sign.position.set(0, 12.4, -3.6); sign.rotation.y = Math.PI; g.add(sign);
      track.placeOn(g, k, 0, -0.2);
      add(g);
    };
    gate(westK, 'ANGKOR WAT');
    gate(northK, 'NEON SKYWAY');

    // ---- Angkor Wat: three stepped galleries, four corner towers and the central tower
    const terraces = [[86, 3.2, 76, -0.35], [62, 6, 58, 2.85], [44, 7, 44, 8.85]];
    const relief = khmerTexture('relief-band'); // apsaras and nagas carved in sandstone (NEXMAX CHRONICLE)
    const reliefMat = new THREE.MeshStandardMaterial({ map: relief, color: '#d8cfe6', emissive: '#6a4a86', emissiveMap: relief, emissiveIntensity: 0.55, roughness: 0.9 });
    terraces.forEach(([sx, sy, sz, y0], i) => {
      box(stone, 0, y0 + sy / 2, 0, sx, sy, sz);
      outline(i % 2 ? neonC : neonM, 0, y0 + sy, 0, sx, sz, 0.22);
      // colonnaded gallery walls on the edge of each terrace, with a roof
      const gh = 3.4, gy = y0 + sy + gh / 2;
      for (const [x, z, lx, lz] of [[0, -sz / 2 + 1.5, sx - 2, 3], [0, sz / 2 - 1.5, sx - 2, 3], [-sx / 2 + 1.5, 0, 3, sz - 2], [sx / 2 - 1.5, 0, 3, sz - 2]]) {
        // the band repeats along the wall at its own proportions (2 : 1)
        const g = new THREE.BoxGeometry(lx, gh, lz), uv = g.attributes.uv, rep = Math.max(lx, lz) / (gh * 2);
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
        const m = new THREE.Mesh(g, lx > lz ? [stoneDark, stoneDark, stoneDark, stoneDark, reliefMat, reliefMat] : [reliefMat, reliefMat, stoneDark, stoneDark, stoneDark, stoneDark]);
        m.position.set(x, gy, z); m.castShadow = true; m.receiveShadow = true; add(m);
        const roof = box(stoneDark, x, gy + gh / 2 + 0.6, z, lx + 0.6, 1.2, lz + 0.6);
        roof.castShadow = true;
      }
      // west stairs up each level, lit gold
      const st = box(stoneDark, -sx / 2 - 3, y0 + sy / 2, 0, 6, sy, 8);
      st.rotation.z = 0;
      box(neonG, -sx / 2 - 6.05, y0 + sy * 0.5, 0, 0.12, sy * 0.9, 8).castShadow = false;
    });
    const top = terraces[2][3] + terraces[2][1];
    for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) prang(x, top, z, 4.2, 22, neonM);
    prang(0, top, 0, 6.4, 33, neonC);
    // four lesser towers over the outer gallery's gates
    for (const [x, z] of [[-43, 0], [43, 0], [0, -38], [0, 38]]) prang(x, 2.85 + 3.4, z, 2.6, 10, neonC);

    // holographic apsaras dancing slowly round the temple
    const holoGeo = new THREE.PlaneGeometry(14, 14);
    const holos = [];
    [MAGENTA, CYAN, GOLD, VIOLET].forEach((col, i) => {
      const m = new THREE.Mesh(holoGeo, new THREE.MeshBasicMaterial({ map: apsaraTexture(col), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
      addLive(m); holos.push({ m, a: (i / 4) * Math.PI * 2 });
    });
    onUpdate((dt, t) => {
      holos.forEach((h, i) => {
        const a = h.a + t * 0.08;
        h.m.position.set(Math.cos(a) * 34, 34 + Math.sin(t * 0.6 + i) * 1.5, Math.sin(a) * 34);
        h.m.lookAt(0, 34, 0); h.m.rotateY(Math.PI);
        h.m.material.opacity = 0.65 + 0.25 * Math.sin(t * 1.3 + i * 2);
      });
    });

    // sweeping searchlight beams from the temple corners
    const beamTex = canvasTexture(64, (ctx, s) => { const g = ctx.createLinearGradient(0, 0, 0, s); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); }, { repeat: false });
    const beamGeo = new THREE.CylinderGeometry(5, 0.6, 130, 16, 1, true); beamGeo.translate(0, 65, 0);
    const beams = [];
    [[-40, -36, MAGENTA], [40, -36, CYAN], [-40, 36, CYAN], [40, 36, MAGENTA]].forEach(([x, z, col], i) => {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(col).multiplyScalar(0.22), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.position.set(x, 3, z); addLive(m); beams.push({ m, ph: i * 1.7 });
    });
    onUpdate((dt, t) => { for (const bm of beams) { bm.m.rotation.x = Math.sin(t * 0.25 + bm.ph) * 0.35; bm.m.rotation.z = Math.cos(t * 0.21 + bm.ph) * 0.35; } });

    // ---- the causeway: seven-headed nagas at both ends, fire braziers along it
    const nagaGeo = nagaGeometry('#7a7262', '#8f866f');
    const nagaMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex, roughness: 0.85 });
    for (const x of [-MOAT_OUT - 2, -MOAT_IN + 2]) {
      const k = near((p) => Math.abs(p.x - x), 0, 0.12);
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        const m = new THREE.Mesh(nagaGeo, nagaMat); m.scale.setScalar(1.7); m.castShadow = true;
        m.rotation.y = x < -MOAT_IN - 10 ? Math.PI : 0;
        g.add(m);
        for (let i = -3; i <= 3; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), neonC); const a = i * 0.32; e.position.set(Math.sin(a) * 1.25 * 1.7, (2.5 + Math.cos(a) - 0.4) * 1.7, (x < -MOAT_IN - 10 ? -0.75 : 0.75) * 1.7); g.add(e); }
        track.placeOn(g, k, s * (wallW + 1.2), 0);
        add(g);
      }
    }
    const brazierBowl = merge([part(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 8), '#5a5248', [0, 1.2, 0]), part(new THREE.CylinderGeometry(1.0, 0.45, 0.8, 10), '#6e6050', [0, 2.7, 0])]);
    const flameTex = canvasTexture(128, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const g = ctx.createRadialGradient(s / 2, s * 0.72, 2, s / 2, s * 0.62, s * 0.42);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.04); ctx.bezierCurveTo(s * 0.62, s * 0.35, s * 0.86, s * 0.6, s * 0.74, s * 0.86); ctx.quadraticCurveTo(s / 2, s * 1.02, s * 0.26, s * 0.86);
      ctx.bezierCurveTo(s * 0.14, s * 0.6, s * 0.38, s * 0.35, s / 2, s * 0.04); ctx.fill();
    }, { repeat: false });
    const flameGeo = merge([0, 1, 2].map((i) => { const pl = new THREE.PlaneGeometry(1.6, 2.6); pl.translate(0, 1.2, 0); pl.rotateY((i * Math.PI) / 3); return part(pl, '#ffffff'); }));
    const flameMat = new THREE.MeshBasicMaterial({ map: flameTex, color: new THREE.Color(ORANGE).multiplyScalar(1.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    const flameMat2 = new THREE.MeshBasicMaterial({ map: flameTex, color: new THREE.Color('#ffe08a').multiplyScalar(1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    const flames = [], braziers = [], bowlMat = toyMat();
    const kA = near((p) => Math.abs(p.x + 182), 0, 0.1), kB = westK;
    for (let k = kA - 18; k < kB - 2; k += 8) {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        track.placeOn(g, (k + N) % N, s * (wallW + 2.2), 0);
        const bowl = new THREE.Mesh(brazierBowl, bowlMat); bowl.position.copy(g.position); bowl.quaternion.copy(g.quaternion); add(bowl);
        const fl = new THREE.Group(); fl.position.copy(g.position); fl.quaternion.copy(g.quaternion); addLive(fl);
        const f = new THREE.Mesh(flameGeo, flameMat); f.position.y = 2.9; fl.add(f);
        const f2 = new THREE.Mesh(flameGeo, flameMat2); f2.position.y = 2.9; f2.scale.set(0.5, 0.6, 0.5); fl.add(f2);
        braziers.push(g.position.clone()); flames.push({ f, f2, ph: rng.next() * 6 });
      }
    }
    // flames sway smoothly (no flicker)
    onUpdate((dt, t) => { for (const fl of flames) { const v = 1 + 0.12 * Math.sin(t * 5 + fl.ph) + 0.06 * Math.sin(t * 8.3 + fl.ph * 2); fl.f.scale.set(1, v, 1); fl.f2.scale.set(0.5, 0.6 * (2 - v), 0.5); } });
    const embers = props.motes(160, { center: new THREE.Vector3(-140, 0, 0), spread: [110, 14, 46], yBase: 2.5, size: 0.35, colors: ['#ffb24a', '#ff6a2a', '#ffe08a'], speed: 0.6, blink: 0.3, rise: 1.6, glow: 1.6 }, rng);
    addLive(embers); onUpdate((dt, t) => embers.userData.update(dt, t));

    // ---- palms and jungle
    const palmGeo = sugarPalmGeometry(rng);
    const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#06140a', emissiveIntensity: 1 });
    const palms = [];
    const ok = (x, z, m = 4) => { const gy = groundY(x, z); return gy !== null && track.clearOfRoad(x, z, m) && Math.max(Math.abs(x), Math.abs(z)) > 50; };
    for (let i = 0; i < 260 && palms.length < 90; i++) {
      const a = rng.next() * Math.PI * 2, r = MOAT_OUT + 6 + rng.next() * 160;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z)) continue;
      const h = 13 + rng.next() * 8;
      palms.push({ x, y: groundY(x, z), z, s: [h, h, h], ry: rng.next() * 6 });
    }
    for (let i = 0; i < 200 && palms.length < 120; i++) { // a few inside the enclosure
      const x = (rng.next() - 0.5) * 190, z = (rng.next() - 0.5) * 190;
      if (!ok(x, z, 3) || (Math.abs(x) < 48 && Math.abs(z) < 44)) continue;
      const h = 12 + rng.next() * 6; palms.push({ x, y: -0.35, z, s: [h, h, h], ry: rng.next() * 6 });
    }
    addLive(props.inst(palmGeo, palmMat, palms, { cast: true }));
    // huge silk-cotton trees and jungle canopy further out
    const canopy = merge([part(new THREE.SphereGeometry(1, 9, 7), '#173a26', [0, 0, 0], [0, 0, 0], [1, 0.55, 1]), part(new THREE.SphereGeometry(1, 9, 7), '#1d4a30', [0.6, 0.2, 0.3], [0, 0, 0], [0.7, 0.45, 0.7]), part(new THREE.SphereGeometry(1, 9, 7), '#12301f', [-0.5, 0.15, -0.4], [0, 0, 0], [0.7, 0.5, 0.7])]);
    const trunk = merge([part(new THREE.CylinderGeometry(0.035, 0.07, 1, 7), '#4a443c', [0, 0.5, 0]), ...[0, 1, 2, 3].map((i) => part(new THREE.BoxGeometry(0.012, 0.16, 0.13), '#3e3932', [Math.cos(i * 1.57) * 0.07, 0.07, Math.sin(i * 1.57) * 0.07], [0, -i * 1.57, 0]))]);
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#04100a', emissiveIntensity: 1 });
    const trunks = [], crowns = [];
    for (const p of props.around(track, rng, 220, { rMin: 20, rMax: 420, margin: 16 })) {
      const gy = groundY(p.x, p.z); if (gy === null || Math.max(Math.abs(p.x), Math.abs(p.z)) < MOAT_OUT + 4) continue;
      const h = 18 + rng.next() * 16, s = 7 + rng.next() * 6;
      trunks.push({ x: p.x, y: gy, z: p.z, s: [h * 0.9, h, h * 0.9], ry: rng.next() * 6 });
      crowns.push({ x: p.x, y: gy + h, z: p.z, s: [s, s, s], ry: rng.next() * 6 });
    }
    addLive(props.inst(trunk, treeMat, trunks, { cast: true }));
    addLive(props.inst(canopy, treeMat, crowns, { cast: true }));

    // ---- the skyway: pylons, rainbow light bands on the road edges, rainbow portal rings, holo signs, fire jets
    const isSky = (k) => P[k].y > 2.5;
    const pylonGeo = new THREE.CylinderGeometry(1.1, 1.4, 1, 10);
    const pylons = [], rings = [];
    for (let k = 0; k < N; k += 9) {
      if (!isSky(k)) continue;
      const p = P[k], gy = groundY(p.x, p.z) ?? -1.3, h = p.y - 2.4 - gy;
      if (h < 0.5) continue;
      pylons.push({ x: p.x, y: gy + h / 2, z: p.z, s: [1, h, 1] });
      for (let y = gy + 3; y < p.y - 3; y += 5) rings.push({ x: p.x, y, z: p.z, s: [1.5, 0.18, 1.5] });
    }
    addLive(props.inst(pylonGeo, stoneDark, pylons, { cast: true }));
    addLive(props.inst(new THREE.CylinderGeometry(1, 1, 1, 10), neonC, rings));
    // rainbow bands just inside both road edges (skyway only), hue running along the course
    const bandMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    for (const s of [-1, 1]) {
      const g = track.strip(s < 0 ? (k) => -track.HW[k] + 0.25 : (k) => track.HW[k] - 0.95, s < 0 ? (k) => -track.HW[k] + 0.95 : (k) => track.HW[k] - 0.25, 0.035, 0.035, 4, { skip: (k) => !isSky(k) || !isSky((k + 1) % N) });
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const k = Math.floor(i / 2); const cc = hsl(k * 0.012, 1, 0.55).multiplyScalar(1.5); col.set([cc.r, cc.g, cc.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      add(new THREE.Mesh(g, bandMat));
    }
    const ringMats = [];
    for (const f of [0.5, 0.56, 0.62, 0.68, 0.74]) {
      const k = Math.round(f * N), R = track.wallD(k) + 1.5;
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
      const arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.32, 8, 64, Math.PI), mat);
      const g = new THREE.Group(); g.add(arch); track.placeOn(g, k, 0, -0.3); addLive(g);
      ringMats.push({ mat, h: f * 3 });
    }
    onUpdate((dt, t) => { for (const r of ringMats) r.mat.color.copy(hsl(r.h + t * 0.05, 1, 0.55)).multiplyScalar(1.5); });
    // holographic signs beside the skyway
    const signs = [['ANGKOR', '2099'], ['ネオン', 'クメール'], ['SKYWAY', '↓ BAYON']];
    [0.53, 0.64, 0.71].forEach((f, i) => {
      const k = Math.round(f * N), s = i % 2 ? 1 : -1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: neonText(signs[i], { color: [MAGENTA, CYAN, GOLD][i], w: 1024, h: 512, size: 150 }), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(1.5, 1.5, 1.5) }));
      const g = new THREE.Group(); g.add(m); m.position.y = 6; m.rotation.y = Math.PI;
      track.placeOn(g, k, s * (wallW + 6), 0); g.rotateY(-s * 0.45);
      add(g);
    });
    // fire jets off the skyway's edges, bursting now and then (a smooth swell, not a flash)
    const jets = [];
    for (const f of [0.55, 0.6, 0.66, 0.7]) {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        const f1 = new THREE.Mesh(flameGeo, flameMat); f1.scale.set(1.3, 0.1, 1.3); g.add(f1);
        track.placeOn(g, Math.round(f * N), s * (wallW + 0.9), 1.2);
        addLive(g); jets.push({ f1, ph: f * 40 + s });
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 8), stoneDark); nozzle.position.copy(g.position).addScaledVector(track.U[Math.round(f * N) % N], -0.4); add(nozzle);
      }
    }
    onUpdate((dt, t) => { for (const j of jets) { const e = Math.pow(Math.max(0, Math.sin(t * 0.9 + j.ph)), 6); j.f1.scale.set(1.3, 0.1 + e * 2.6, 1.3); j.f1.visible = e > 0.02; } });

    // ---- the gate of Angkor Thom where the skyway lands: a face tower over the road, statues holding a naga.
    // The road comes down onto a raised stone causeway with sloping sides
    const kGate = near((p) => Math.abs(p.z + 150) + Math.abs(p.x + 224), 0.76, 0.86);
    {
      const k0 = kGate - 26, k1 = Math.round(0.9 * N), half = wallW + 9;
      const pos = [], idx = [];
      for (let k = k0; k <= k1; k++) {
        const kk = (k + N) % N, p = P[kk], R = track.R[kk], top = p.y - 0.45, gy = -0.5;
        const run = Math.max(0, top - gy) * 1.4 + 1;
        for (const d of [-half - run, -half, half, half + run]) {
          const y = Math.abs(d) > half ? gy - 0.2 : top + R.y * d;
          pos.push(p.x + R.x * d, y, p.z + R.z * d);
        }
        if (k > k0) { const a = (k - k0 - 1) * 4, b2 = a + 4; for (let j = 0; j < 3; j++) idx.push(a + j, a + j + 1, b2 + j, a + j + 1, b2 + j + 1, b2 + j); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#6e6658', roughness: 0.95, side: THREE.DoubleSide }));
      m.receiveShadow = true; add(m);
    }
    const faceTex = faceTexture({ stone: '#8f8670', dark: '#4e463a' });
    const faceGlow = faceTexture({ stone: '#000000', dark: '#000000', neon: CYAN });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, emissive: '#ffffff', emissiveMap: faceGlow, emissiveIntensity: 1.4, roughness: 0.9 });
    const faceBlock = (s) => { const m = new THREE.Mesh(unit, [faceMat, faceMat, stoneDark, stoneDark, faceMat, faceMat]); m.scale.set(s, s * 1.1, s); m.castShadow = true; return m; };
    {
      const g = new THREE.Group(), W = wallW + 4;
      for (const s of [-1, 1]) { const t = new THREE.Mesh(unit, stone); t.scale.set(6, 14, 8); t.position.set(s * W, 7, 0); t.castShadow = true; g.add(t); }
      const lintel = new THREE.Mesh(unit, stone); lintel.scale.set(2 * W + 6, 3, 8); lintel.position.y = 13.5; g.add(lintel);
      const fb = faceBlock(8); fb.position.y = 19.4; g.add(fb);
      const crown = makePrang(4.2, 10, neonM); crown.position.y = 23.8; g.add(crown);
      for (const z of [-4.05, 4.05]) { const e = new THREE.Mesh(unit, neonM); e.scale.set(2 * W + 6, 0.22, 0.22); e.position.set(0, 12, z); g.add(e); }
      track.placeOn(g, kGate, 0, -0.2); add(g);
      // statues (devas on one side, demons on the other) pulling a long naga
      const body = new THREE.CapsuleGeometry(0.7, 1.4, 4, 8), head = new THREE.SphereGeometry(0.62, 10, 8);
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 2; i < 16; i++) {
          const k = (kGate - i * 1.6 + N) % N;
          const v = track.pointAt(k, s * (wallW + 2.4));
          const fig = new THREE.Group();
          const bm = new THREE.Mesh(body, s < 0 ? stone : stoneDark); bm.position.y = 1.5; fig.add(bm);
          const hm = new THREE.Mesh(head, s < 0 ? stone : stoneDark); hm.position.y = 3.0; fig.add(hm);
          const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), s < 0 ? stone : stoneDark); hat.position.y = 3.9; fig.add(hat);
          for (const ex of [-0.22, 0.22]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), s < 0 ? neonC : neonM); e.position.set(ex, 3.05, 0.55); fig.add(e); }
          fig.position.copy(v); fig.position.y = P[Math.round(k) % N].y - 0.45; fig.lookAt(track.pointAt(k, 0));
          add(fig);
          pts.push(new THREE.Vector3(v.x, fig.position.y + 2.1, v.z));
        }
        const naga = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.32, 8), new THREE.MeshStandardMaterial({ color: s < 0 ? '#7f9a72' : '#8a6a8a', roughness: 0.7, emissive: s < 0 ? CYAN : MAGENTA, emissiveIntensity: 0.25 }));
        add(naga);
      }
    }

    // ---- the Bayon: a terrace crowded with towers, each with four smiling faces
    const BX = -318, BZ = -100;
    box(stoneDark, BX, 1.2, BZ, 76, 3.4, 80);
    outline(neonM, BX, 2.9, BZ, 76, 80, 0.22);
    box(stone, BX, 5, BZ, 50, 4.4, 54);
    outline(neonC, BX, 7.2, BZ, 50, 54, 0.22);
    { // the central tower
      const base = box(stone, BX, 11.5, BZ, 24, 8.6, 24);
      base.castShadow = true;
      const fb = faceBlock(18); fb.position.set(BX, 25.7, BZ); add(fb);
      prang(BX, 35.6, BZ, 9.5, 26, neonC);
    }
    const faceTower = (x, z, y0, s = 1) => {
      box(stone, x, y0 + 4 * s, z, 6 * s, 8 * s, 6 * s);
      const fb = faceBlock(6.6 * s); fb.position.set(x, y0 + 8 * s + 3.6 * s, z); add(fb);
      prang(x, y0 + 8 * s + 7.3 * s, z, 2.9 * s, 8 * s, neonM);
    };
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; faceTower(BX + Math.cos(a) * 27, BZ + Math.sin(a) * 27, 7.2, 0.9); }
    // and face towers standing guard beside the road near the Bayon
    for (const f of [0.86, 0.885, 0.91, 0.935]) {
      const k = Math.round(f * N);
      for (const s of [-1, 1]) {
        const v = track.pointAt(k, s * (wallW + 7));
        if (Math.hypot(v.x - BX, v.z - BZ) < 46) continue;
        faceTower(v.x, v.z, -0.5, 1);
      }
    }

    // ---- elephants with red saddles, plodding near the temple, by the Bayon and outside the moat
    const herd = new ElephantWalk({
      paths: [[[-50, -64], [30, -64]], [[-212, -145], [-210, -100], [-214, -55]], [[-232, 42], [-160, 46]]],
      ground: (x, z) => { const g = groundY(x, z); return g === null ? -0.5 : g; }, scale: 1.5, rng: () => rng.next(),
    });
    addLive(herd.group); onUpdate((dt) => herd.update(dt));

    // ---- floating light-drones over the ruins
    const drones = props.motes(320, { center: c, spread: [560, 50, 520], yBase: 10, size: 0.7, colors: [CYAN, MAGENTA, GOLD, VIOLET], speed: 0.35, blink: 0.4, glow: 1.7 }, rng);
    addLive(drones); onUpdate((dt, t) => drones.userData.update(dt, t));

    // ---- start gate
    addLive(props.startGate(track, { pillar: '#3a3248', accent: MAGENTA, banner: '#1a0b2e', lights: CYAN, text: 'ANGKOR NEON' }));

    for (const m of mergeStatic([statics])) addToScene(m);

    function toyMat() { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }); }
  },
};
