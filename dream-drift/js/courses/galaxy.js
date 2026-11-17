// courses/galaxy.js — COURSE 4 「星海ギャラクシーハイウェイ」
// A glass highway floating through deep space, tied in a figure-8 with an overpass. Neon-cyan grid road,
// energy-barrier rails, portal rings to fly through, crystal asteroids, a ringed gas giant, an ice planet,
// a cratered moon, comets, a spiral galaxy and golden constellations (a kart, a cat and a whale).
import * as THREE from 'three';
import { part, merge, canvasTexture } from '../engine/util.js';

const CYAN = '#4fe3ff', VIOLET = '#8a5cff', GOLD = '#ffd36b';

// thin cylinder from a to b (constellation lines)
function beam(a, b, r, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 6, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return part(g, color);
}

// faceted crystal rock: an icosahedron with every corner pushed in or out
function crystalGeometry(seed, detail = 1, rough = 0.45) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.13) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 - rough / 2 + rough * h(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    pos.setXYZ(i, x * k, y * k * 1.25, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function gasGiantTexture() {
  return canvasTexture(512, (ctx, w, h) => {
    const bands = ['#f6d58a', '#d99a52', '#f3e2b8', '#b56b3c', '#e8c27a', '#8a5cff', '#f0d9a4', '#c4824a', '#fbe8c0', '#9a6ad8', '#e2b06a'];
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const i = Math.floor(t * bands.length * 1.6) % bands.length;
      ctx.fillStyle = bands[i];
      for (let x = 0; x < w; x += 8) {
        const off = Math.sin(x * 0.03 + y * 0.2) * 3 + Math.sin(x * 0.011 - y * 0.05) * 5;
        ctx.fillRect(x, y + off, 8, 2);
      }
    }
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 400; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#6b3a2a'; ctx.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 1.5); }
    ctx.globalAlpha = 1;
    // great storm
    const g = ctx.createRadialGradient(w * 0.62, h * 0.64, 2, w * 0.62, h * 0.64, 28);
    g.addColorStop(0, '#fff2d0'); g.addColorStop(0.5, '#e07a4a'); g.addColorStop(1, 'rgba(224,122,74,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.64, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
  }, { w: 512, h: 256 });
}

function ringTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    for (let r = 0.6; r <= 1.0; r += 0.004) {
      const t = (r - 0.6) / 0.4;
      const a = (0.25 + 0.6 * Math.abs(Math.sin(t * 37) * Math.sin(t * 11 + 1))) * (1 - Math.pow(Math.abs(t - 0.5) * 2, 4));
      ctx.strokeStyle = `rgba(${Math.round(240 - t * 60)}, ${Math.round(210 - t * 40)}, ${Math.round(160 + t * 80)}, ${a})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(c, c, r * c - 1, 0, Math.PI * 2); ctx.stroke();
    }
  }, { repeat: false });
}

function iceTexture() {
  return canvasTexture(512, (ctx, w, h) => {
    ctx.fillStyle = '#bff4ff'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.55)' : 'rgba(60,170,220,0.45)';
      ctx.lineWidth = 2 + Math.random() * 6;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += 20 + Math.random() * 30; y += (Math.random() - 0.5) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.12, 'rgba(255,255,255,0)'); g.addColorStop(0.88, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { w: 512, h: 256 });
}

function galaxyTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    const core = ctx.createRadialGradient(c, c, 0, c, c, s * 0.2);
    core.addColorStop(0, 'rgba(255,248,220,1)'); core.addColorStop(0.3, 'rgba(255,210,120,0.7)'); core.addColorStop(1, 'rgba(140,90,255,0)');
    ctx.fillStyle = core; ctx.fillRect(0, 0, s, s);
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 1400; i++) {
        const t = Math.random();
        const ang = arm * (Math.PI * 2 / 3) + t * 5.2 + (Math.random() - 0.5) * 0.5 * (1 - t * 0.5);
        const r = (0.05 + t * 0.43) * s * (1 + (Math.random() - 0.5) * 0.12);
        const x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
        const col = t < 0.3 ? '255,220,150' : Math.random() < 0.5 ? '140,110,255' : '90,220,255';
        ctx.fillStyle = `rgba(${col},${(1 - t) * 0.6 + 0.1})`;
        const sz = Math.random() * 2.4 + 0.6;
        ctx.fillRect(x, y, sz, sz);
      }
    }
  }, { repeat: false });
}

function wispTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.55, y = s / 2 + (Math.random() - 0.5) * s * 0.55, r = s * (0.08 + Math.random() * 0.18);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  }, { repeat: false });
}

function chevronTexture(dir) {
  return canvasTexture(256, (ctx, w, h) => {
    ctx.fillStyle = '#120a30'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 3; i++) {
      const x0 = w * (0.18 + i * 0.25);
      ctx.beginPath();
      if (dir > 0) { ctx.moveTo(x0, h * 0.18); ctx.lineTo(x0 + w * 0.16, h * 0.5); ctx.lineTo(x0, h * 0.82); ctx.lineTo(x0 + w * 0.08, h * 0.82); ctx.lineTo(x0 + w * 0.24, h * 0.5); ctx.lineTo(x0 + w * 0.08, h * 0.18); }
      else { const xr = w - x0; ctx.moveTo(xr, h * 0.18); ctx.lineTo(xr - w * 0.16, h * 0.5); ctx.lineTo(xr, h * 0.82); ctx.lineTo(xr - w * 0.08, h * 0.82); ctx.lineTo(xr - w * 0.24, h * 0.5); ctx.lineTo(xr - w * 0.08, h * 0.18); }
      ctx.fill();
    }
  }, { repeat: false, w: 256, h: 128 });
}

// soft fresnel glow shell (planet atmospheres)
function atmosphere(color, power = 3, strength = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, p: { value: power }, k: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float p, k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), p); gl_FragColor = vec4(c * f * k, f); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
}

// comet tail: cone from the head (z=0) backwards (−z), fading toward the end
function tailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, len: { value: 1 } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; uniform float len;
      void main(){ vT = clamp(-position.z / len, 0.0, 1.0); vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = abs(dot(vN, vV)); float a = pow(1.0 - vT, 2.2) * (0.35 + 0.65 * edge); gl_FragColor = vec4(c * 2.2 * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

// constellation figures on a 2D grid: stars + line pairs
const FIGURES = [
  { name: 'kart', stars: [[-5, 1], [-3, 3], [0, 3], [1.5, 5.2], [3, 3], [5, 2], [5.2, 0.4], [-5, 0.4], [-3, -0.9], [3, -0.9]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 4], [4, 5], [5, 6], [6, 9], [9, 8], [8, 7], [7, 0]] },
  { name: 'cat', stars: [[-3, -4], [3, -4], [3, 0], [2, 3], [2.6, 5.2], [1, 3.6], [-1, 3.6], [-2.6, 5.2], [-2, 3], [-3, 0], [4.5, -3.2], [6, -1], [5.4, 1.2]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [1, 10], [10, 11], [11, 12]] },
  { name: 'whale', stars: [[-6, 0], [-4, 2], [0, 3], [4, 2], [6, 0], [4, -1.6], [0, -2.2], [-4, -1.2], [-7.4, 1.8], [-7.8, -1.6], [3, 4.2], [2.2, 5.8], [3.9, 5.8], [3.4, 0.6]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [0, 8], [0, 9], [8, 9], [10, 11], [10, 12]] },
];

export default {
  id: 'galaxy',
  name: '星海 ギャラクシー・ハイウェイ',
  nameEn: 'Starsea Galaxy Highway',
  tagline: '星の 海に かかる ガラスの ハイウェイ。8の字の 立体交差と ポータルリングを 駆けぬけよう',
  seed: 44,
  points: [[-32.8, -1.1, 26.9], [42.7, 1.7, -35.1], [98.2, 4.9, -92.9], [107.8, 7.3, -139.4], [67.0, 8.5, -169.2], [-5.2, 9.0, -178.4], [-75.0, 9.6, -166.3], [-109.6, 11.0, -134.0], [-93.0, 13.5, -85.6], [-32.8, 16.7, -26.9], [42.7, 19.4, 35.1], [98.2, 20.2, 92.9], [107.8, 18.5, 139.4], [67.0, 14.3, 169.2], [-5.2, 8.6, 178.4], [-75.0, 3.0, 166.3], [-109.6, -0.9, 134.0], [-93.0, -2.3, 85.6]],
  itemRows: [0.15, 0.4, 0.73],
  boosts: [{ at: 0.07, d: -0.38 }, { at: 0.56, d: 0.38 }, { at: 0.94, d: 0 }],
  jumps: [{ at: 0.5 }],
  theme: {
    sky: { top: '#05021a', horizon: '#1d0d4f', bottom: '#04011a', sunDir: [0.55, 0.22, -0.8], sunColor: '#ffe2a0', sunSize: 0.0028, sunGlow: 0.55,
      stars: 1.7, nebula: 1.25, nebA: '#6a2cff', nebB: '#1fc8ff', horizonSharp: 0.45 },
    fog: { color: '#120838', near: 280, far: 1150 },
    hemi: { sky: '#9a8aff', ground: '#2a1a5a', intensity: 1.0 },
    sun: { color: '#fff2d8', intensity: 1.9, dir: [0.5, 0.8, -0.4] },
    envIntensity: 0.5,
    bloom: { strength: 0.95, radius: 0.6, threshold: 0.7 },
    dust: '#9fd8ff', mapColor: CYAN,
  },
  road: {
    width: 16, curb: 0.9, shoulder: 4.5, bank: 5,
    paintRoad(ctx, s) {
      ctx.fillStyle = '#0b1030'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = i % 9 === 0 ? 'rgba(127,240,255,0.7)' : i % 13 === 0 ? 'rgba(255,211,107,0.6)' : 'rgba(255,255,255,0.22)';
        const r = Math.random() < 0.08 ? 2.5 : 1.2;
        ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
      }
      // grid
      ctx.fillStyle = 'rgba(79, 227, 255, 0.38)';
      for (const u of [0.25, 0.75]) ctx.fillRect(s * u - 1.5, 0, 3, s);
      for (const v of [0, 0.5]) ctx.fillRect(0, s * v, s, 3);
      // bright edges
      ctx.fillStyle = '#7ff0ff';
      ctx.fillRect(s * 0.022, 0, s * 0.02, s);
      ctx.fillRect(s * 0.958, 0, s * 0.02, s);
      // gold centre dashes
      ctx.fillStyle = GOLD;
      ctx.fillRect(s * 0.494, s * 0.08, s * 0.012, s * 0.34);
      ctx.fillRect(s * 0.494, s * 0.58, s * 0.012, s * 0.34);
    },
    roadRoughness: 0.3, roadMetalness: 0.25,
    roadEmissive: '#ffffff', roadEmissiveIntensity: 1.25,
    curbColors: [CYAN, '#ffffff'], curbEmissive: 0.7, curbLength: 3,
    paintShoulder(ctx, s) {
      ctx.fillStyle = '#1a0f3d'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 520; i++) {
        ctx.fillStyle = ['#ffffff', '#7ff0ff', '#b9a0ff', GOLD][i % 4];
        ctx.globalAlpha = 0.25 + Math.random() * 0.6;
        const r = Math.random() * 2 + 0.6;
        ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    shoulderEmissive: '#1c0f48', shoulderRoughness: 0.6,
    wall: { color: '#4fe3ff', height: 1.15, thickness: 0.3, opacity: 0.22, emissive: '#2ab8ff', emissiveIntensity: 0.7, glow: '#7ff0ff', glowIntensity: 3 },
    skirt: { color: '#120a30', depth: 2.4, emissive: '#1a0b45', emissiveIntensity: 0.5, trim: CYAN, trimIntensity: 2.6 },
  },
  music: {
    bpm: 160, root: 57, scale: 'harmonicMinor', progression: [0, 5, 3, 4], seed: 9,
    style: { lead: 'sawtooth', drums: 'drive', bass: 'pulse', arpType: 'square', arpRate: 1, rhythm: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0] },
  },

  build({ track, props, rng, add, onUpdate }) {
    const N = track.N;
    const b = track.bounds(), center = b.getCenter(new THREE.Vector3());
    const dummy = new THREE.Object3D();
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3();

    // ---- planets (beyond the fog, so they ignore it)
    const giant = new THREE.Group();
    const gtex = gasGiantTexture();
    const gmesh = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.MeshStandardMaterial({ map: gtex, emissive: '#ffffff', emissiveMap: gtex, emissiveIntensity: 0.22, roughness: 0.9, fog: false }));
    giant.add(gmesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(190, 330, 128, 1), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, color: new THREE.Color(1.2, 1.1, 1.0) }));
    ring.rotation.x = -Math.PI / 2 + 0.32; ring.rotation.y = 0.25;
    giant.add(ring);
    giant.add(new THREE.Mesh(new THREE.SphereGeometry(162, 48, 32), atmosphere('#ffb86b', 3.2, 1.2)));
    giant.position.set(center.x - 620, 170, center.z - 640);
    giant.rotation.z = 0.18;
    add(giant);

    const ice = new THREE.Group();
    ice.add(new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.4, metalness: 0.1, emissive: '#3fb8ff', emissiveIntensity: 0.18, fog: false })));
    ice.add(new THREE.Mesh(new THREE.SphereGeometry(80, 48, 32), atmosphere('#5fe8ff', 2.6, 1.8)));
    ice.position.set(center.x + 720, 130, center.z - 280);
    add(ice);

    // cratered moon (vertex-displaced, vertex-coloured)
    const moonG = new THREE.IcosahedronGeometry(1, 6);
    {
      const pos = moonG.attributes.position, col = new Float32Array(pos.count * 3);
      const craters = Array.from({ length: 34 }, () => ({ d: new THREE.Vector3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5).normalize(), r: 0.08 + rng.next() * 0.22 }));
      const v = new THREE.Vector3(), cA = new THREE.Color('#d9d2f0'), cB = new THREE.Color('#8a7fb0'), cc = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        let h = 1, dark = 0;
        for (const c of craters) {
          const a = Math.acos(Math.min(1, v.dot(c.d))) / c.r;
          if (a < 1) { h -= 0.06 * c.r * 4 * (1 - a * a); dark = Math.max(dark, 1 - a); }
          else if (a < 1.25) h += 0.02 * c.r * 4 * (1.25 - a) * 4;
        }
        pos.setXYZ(i, v.x * h, v.y * h, v.z * h);
        cc.copy(cA).lerp(cB, dark * 0.8);
        col.set([cc.r, cc.g, cc.b], i * 3);
      }
      moonG.setAttribute('color', new THREE.BufferAttribute(col, 3));
      moonG.computeVertexNormals();
    }
    const moon = new THREE.Mesh(moonG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, emissive: '#2a2050', emissiveIntensity: 0.4, fog: false }));
    moon.scale.setScalar(52);
    moon.position.set(center.x + 360, 240, center.z + 720);
    add(moon);

    // ---- spiral galaxy far away
    const gal = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), new THREE.MeshBasicMaterial({ map: galaxyTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, color: new THREE.Color(1.4, 1.3, 1.5) }));
    gal.position.set(center.x - 300, 330, center.z + 860);
    gal.lookAt(center.x, 0, center.z);
    gal.rotateZ(0.6);
    add(gal);

    // ---- glowing nebula wisps far below the road
    const wispMat = new THREE.MeshBasicMaterial({ map: wispTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const wispGeo = new THREE.PlaneGeometry(1, 1); wispGeo.rotateX(-Math.PI / 2);
    const wisps = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2, r = 80 + rng.next() * 520, s = 260 + rng.next() * 260;
      wisps.push({ x: center.x + Math.cos(a) * r, y: -70 - rng.next() * 60, z: center.z + Math.sin(a) * r, ry: rng.next() * 6, s: [s, 1, s],
        c: new THREE.Color(i % 2 ? '#7a4cff' : '#2fb8ff').multiplyScalar(0.9) });
    }
    add(props.inst(wispGeo, wispMat, wisps));

    // ---- crystal asteroids drifting around the track (instanced, spinning)
    const astMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.25, flatShading: true, emissive: '#2a1068', emissiveIntensity: 0.6 });
    const astCols = ['#a98bff', '#6fdcff', '#c9b6ff', '#5aa8ff', '#e0d4ff'];
    const asteroidSets = [];
    for (let v = 0; v < 3; v++) {
      const geo = crystalGeometry(v + 1, 1, 0.55);
      const list = [];
      for (const p of props.beside(track, rng, 38, { min: 18, max: 170, margin: 10 })) {
        // small near the road, big far away
        const s = (1.2 + p.off * 0.075) * (0.55 + rng.next() * rng.next() * 1.6);
        list.push({ x: p.x, y: p.y - 22 + rng.next() * 55, z: p.z, s, rx: rng.next() * 6, ry: rng.next() * 6, rz: rng.next() * 6,
          sp: (rng.next() - 0.5) * 0.6, c: new THREE.Color(astCols[Math.floor(rng.next() * astCols.length)]) });
      }
      const mesh = props.inst(geo, astMat, list, { cast: false });
      add(mesh);
      asteroidSets.push({ mesh, list });
    }
    // small glowing crystal shards close to the road
    const shardGeo = new THREE.OctahedronGeometry(1, 0);
    const shardMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const shardList = props.beside(track, rng, 80, { min: 1.5, max: 16, margin: 1.5 }).map((p) => ({
      x: p.x, y: p.y + 2 + rng.next() * 7, z: p.z, s: 0.35 + rng.next() * 0.6, rx: 0, ry: rng.next() * 6, rz: 0, sp: 0.8 + rng.next() * 1.4, ph: rng.next() * 6,
      c: new THREE.Color([CYAN, VIOLET, GOLD][Math.floor(rng.next() * 3)]).multiplyScalar(2.4),
    }));
    const shards = props.inst(shardGeo, shardMat, shardList);
    add(shards);
    onUpdate((dt, t) => {
      for (const set of asteroidSets) {
        set.list.forEach((a, i) => {
          a.ry += a.sp * dt; a.rx += a.sp * 0.4 * dt;
          M.compose(Pv.set(a.x, a.y + Math.sin(t * 0.2 + i) * 1.5, a.z), Q.setFromEuler(E.set(a.rx, a.ry, a.rz)), Sv.setScalar(a.s));
          set.mesh.setMatrixAt(i, M);
        });
        set.mesh.instanceMatrix.needsUpdate = true;
      }
      shardList.forEach((a, i) => {
        a.ry += a.sp * dt;
        M.compose(Pv.set(a.x, a.y + Math.sin(t * 1.3 + a.ph) * 0.6, a.z), Q.setFromEuler(E.set(0.3, a.ry, 0)), Sv.set(a.s, a.s * 1.7, a.s));
        shards.setMatrixAt(i, M);
      });
      shards.instanceMatrix.needsUpdate = true;
    });

    // ---- portal rings the road flies through
    const portals = [];
    const ringMetal = new THREE.MeshStandardMaterial({ color: '#2a2370', roughness: 0.25, metalness: 0.7, emissive: '#160c40', emissiveIntensity: 0.6 });
    const beadMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.6, emissive: '#ffb02e', emissiveIntensity: 0.9 });
    for (const [i, f] of [0.09, 0.21, 0.31, 0.45, 0.62, 0.8, 0.9].entries()) {
      const p = f * N, k = Math.floor(p) % N;
      const R = track.wallD(k) + 2.2;
      const holder = new THREE.Group();
      const core = new THREE.Mesh(new THREE.TorusGeometry(R, 0.32, 8, 72), props.glow(i % 2 ? CYAN : VIOLET, 2.6));
      const shell = new THREE.Mesh(new THREE.TorusGeometry(R + 0.9, 0.55, 10, 72), ringMetal);
      const beads = new THREE.Group();
      const beadGeo = new THREE.BoxGeometry(1.1, 1.1, 1.6);
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        const bd = new THREE.Mesh(beadGeo, beadMat);
        bd.position.set(Math.cos(a) * (R + 0.9), Math.sin(a) * (R + 0.9), 0);
        bd.rotation.z = a;
        beads.add(bd);
      }
      holder.add(core, shell, beads);
      track.placeOn(holder, p, 0, R * 0.42);
      add(holder);
      portals.push({ beads, core, dir: i % 2 ? 1 : -1 });
    }
    onUpdate((dt, t) => {
      for (const pt of portals) {
        pt.beads.rotation.z += pt.dir * dt * 0.6;
        pt.core.scale.setScalar(1 + Math.sin(t * 3 + pt.dir) * 0.012);
      }
    });

    // ---- guide lights on top of the energy rails
    const lightList = [];
    const wt = 0.3, wh = 1.15;
    for (let k = 0; k < N; k += 3) {
      for (const s of [-1, 1]) {
        const v = track.pointAt(k, s * (track.wallD(k) + wt * 0.5));
        const gold = (k / 3) % 6 === 0;
        lightList.push({ x: v.x, y: v.y + wh + 0.2, z: v.z, s: gold ? 0.26 : 0.17, c: new THREE.Color(gold ? GOLD : s < 0 ? CYAN : '#b49bff').multiplyScalar(gold ? 3 : 2.4) });
      }
    }
    add(props.inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), lightList));

    // ---- golden chevron boards on the outside of the corners
    const boards = { [-1]: [], [1]: [] };
    for (let k = 0; k < N; k += 11) {
      const c = track.curv[k];
      if (Math.abs(c) < 0.017) continue;
      const turn = Math.sign(c); // +1 = right turn
      const outer = -turn;
      dummy.position.set(0, 0, 0); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1);
      track.placeOn(dummy, k, outer * (track.wallD(k) + 1.6), 1.8);
      dummy.rotateY(Math.PI);
      dummy.updateMatrix();
      boards[turn].push(dummy.matrix.clone());
    }
    for (const turn of [-1, 1]) {
      const list = boards[turn];
      if (!list.length) continue;
      const tex = chevronTexture(turn);
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false, side: THREE.DoubleSide }), list.length);
      list.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      add(m);
      // posts
      const posts = list.map((mx) => {
        const p = new THREE.Vector3().setFromMatrixPosition(mx);
        return { x: p.x, y: p.y - 1.4, z: p.z, s: [0.12, 2.6, 0.12] };
      });
      add(props.inst(new THREE.CylinderGeometry(1, 1, 1, 6), ringMetal, posts));
    }

    // ---- golden constellations in the sky
    const figs = props.around(track, rng, 3, { rMin: 170, rMax: 260, margin: 0, yMin: 55, yMax: 85 });
    FIGURES.forEach((fig, i) => {
      const at = figs[i] || { x: center.x + 200, y: 70, z: center.z };
      const unit = 5.5;
      const parts = [];
      for (const [a, bb] of fig.lines) {
        const A = fig.stars[a], B = fig.stars[bb];
        parts.push(beam([A[0] * unit, A[1] * unit, 0], [B[0] * unit, B[1] * unit, 0], 0.22, new THREE.Color(GOLD).multiplyScalar(1.3)));
      }
      const sph = new THREE.IcosahedronGeometry(1, 1);
      fig.stars.forEach(([x, y], j) => parts.push(part(sph, new THREE.Color(j % 3 ? '#fff6d8' : '#bff4ff').multiplyScalar(3), [x * unit, y * unit, 0], [0, 0, 0], j % 4 === 0 ? 1.2 : 0.8)));
      const m = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
      m.position.set(at.x, at.y, at.z);
      m.lookAt(center.x, at.y - 10, center.z);
      add(m);
    });

    // ---- comets crossing the sky
    const comets = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), props.glow(i === 1 ? GOLD : '#dffbff', 3));
      const len = 110 + i * 25;
      const tg = new THREE.ConeGeometry(5.5, len, 20, 1, true);
      tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -len / 2);
      const tm = tailMaterial(i === 1 ? '#ffc86b' : i === 2 ? '#b49bff' : '#6fe8ff');
      tm.uniforms.len.value = len;
      g.add(head, new THREE.Mesh(tg, tm));
      add(g);
      const tilt = new THREE.Euler(0.35 + i * 0.25, i * 2.1, 0.2 - i * 0.15);
      const u = new THREE.Vector3(1, 0, 0).applyEuler(tilt), w = new THREE.Vector3(0, 0, 1).applyEuler(tilt);
      comets.push({ g, u, w, R: 560 + i * 90, h: 160 + i * 50, a: rng.next() * 6, sp: 0.045 + i * 0.012 });
    }
    const nxt = new THREE.Vector3();
    onUpdate((dt) => {
      for (const cm of comets) {
        cm.a += cm.sp * dt;
        const set = (a, out) => out.set(center.x, cm.h, center.z).addScaledVector(cm.u, Math.cos(a) * cm.R).addScaledVector(cm.w, Math.sin(a) * cm.R);
        set(cm.a, cm.g.position);
        set(cm.a + 0.01, nxt);
        cm.g.lookAt(nxt);
      }
    });

    // ---- star dust around the road
    const dust = props.motes(700, { center, spread: [560, 70, 560], yBase: b.min.y - 25, size: 0.55, colors: ['#bff4ff', '#b49bff', '#ffffff', '#ffd36b'], speed: 0.35, blink: 1.4 }, rng);
    add(dust);
    onUpdate((dt, t) => dust.userData.update(dt, t));

    // ---- start gate
    add(props.startGate(track, { pillar: '#2a2370', accent: CYAN, banner: '#120a30', lights: GOLD, glowK: 3 }));
  },
};
