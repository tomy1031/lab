// track/props.js — scenery helpers shared by the courses: scattering beside the road, terrain that hugs
// the track, glowing materials, firefly / mote swarms, underwater caustics and the start gate.
import * as THREE from 'three';
import { canvasTexture, mod } from '../engine/util.js';

const glowCache = new Map();
export function glow(color, k = 2) {
  const key = color + '|' + k;
  if (!glowCache.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    m.userData.shared = true;
    glowCache.set(key, m);
  }
  return glowCache.get(key);
}
export const glowColor = (c, k = 2) => new THREE.Color(c).multiplyScalar(k);

// points beside the road: {x,y,z,p,side,off} with off = distance outside the wall
export function beside(track, rng, n, { min = 2, max = 30, side = 0, tries = 8, margin = 1.5 } = {}) {
  const out = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < tries; t++) {
      const p = rng.next() * track.N;
      const s = side || rng.sign();
      const k = mod(Math.round(p), track.N);
      const off = min + rng.next() * (max - min);
      const d = s * (track.wallD(k) + off);
      track.pointAt(p, d, v);
      if (!track.clearOfRoad(v.x, v.z, margin)) continue;
      out.push({ x: v.x, y: track.P[k].y, z: v.z, p, side: s, off });
      break;
    }
  }
  return out;
}

// points spread over a ring around the course (background objects)
export function around(track, rng, n, { rMin = 0, rMax = 400, margin = 10, yMin = 0, yMax = 0 } = {}) {
  const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
  const R = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const a = rng.next() * Math.PI * 2, r = R * 0.2 + rMin + rng.next() * (rMax - rMin);
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (!track.clearOfRoad(x, z, margin)) continue;
    out.push({ x, y: yMin + rng.next() * (yMax - yMin), z });
  }
  return out;
}

// value noise
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, z, o = 4) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * noise2(x, z); x *= 2.03; z *= 2.03; a *= 0.5; } return s; }

// terrain grid that sits just under the road and rolls into hills away from it
export function terrain(track, { size = 900, res = 160, below = 0.35, hills = 18, flat = 6, rise = 60, base = null, noiseScale = 0.012, color = () => '#55aa55', receive = true, material = null } = {}) {
  const b = track.bounds(), c = b.getCenter(new THREE.Vector3());
  const g = new THREE.PlaneGeometry(size, size, res, res);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const baseY = base ?? b.min.y - 1;
  const cc = new THREE.Color();
  // coarse lookup of nearest track sample per vertex (step through samples)
  const P = track.P, N = track.N;
  const wall = track.halfWidth + track.curb + track.shoulder;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + c.x, z = pos.getZ(i) + c.z;
    let bd = Infinity, bk = 0;
    for (let k = 0; k < N; k += 2) {
      const p = P[k]; const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 < bd) { bd = d2; bk = k; }
    }
    const dist = Math.sqrt(bd);
    // surface height of the (banked) road cross-section nearest to this vertex
    const R = track.R[bk], p0 = P[bk];
    const lat = ((x - p0.x) * R.x + (z - p0.z) * R.z) / (R.x * R.x + R.z * R.z);
    const by = p0.y + R.y * Math.max(-wall - 2, Math.min(wall + 2, lat));
    const t = Math.min(1, Math.max(0, (dist - wall - flat) / rise));
    const tt = t * t * (3 - 2 * t);
    const n = fbm2(x * noiseScale, z * noiseScale);
    const nearY = by - below - (dist < wall + 1 ? 0 : 0.6 * Math.min(1, (dist - wall) / 4));
    const farY = baseY + n * hills + (by - baseY) * 0.3;
    const y = nearY * (1 - tt) + farY * tt;
    pos.setXYZ(i, x, y, z);
    cc.set(color(x, y, z, dist, n));
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = receive;
  m.name = 'terrain';
  return m;
}

// drifting, twinkling glow motes (fireflies, plankton, star dust)
// glow: brightness (above the course's bloom threshold the motes get a halo)
export function motes(n, { center = new THREE.Vector3(), spread = [300, 30, 300], yBase = 0, size = 0.6, colors = ['#e8ff6e'], speed = 1, blink = 1, rise = 0, glow = 2.2 } = {}, rng) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const cc = new THREE.Color();
  const R = rng ? () => rng.next() : Math.random;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = center.x + (R() - 0.5) * spread[0];
    pos[i * 3 + 1] = yBase + R() * spread[1];
    pos[i * 3 + 2] = center.z + (R() - 0.5) * spread[2];
    cc.set(colors[i % colors.length]);
    col.set([cc.r, cc.g, cc.b], i * 3);
    ph[i] = R() * 100;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const uniforms = { t: { value: 0 }, size: { value: size }, scale: { value: 500 }, speed: { value: speed }, blink: { value: blink }, rise: { value: rise }, height: { value: spread[1] }, yBase: { value: yBase }, glow: { value: glow } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float phase; attribute vec3 color; varying vec3 vC; varying float vA;
      uniform float t, size, scale, speed, blink, rise, height, yBase;
      void main(){ vec3 p = position; float tt = t*speed + phase;
        p.x += sin(tt*0.7)*2.0; p.z += cos(tt*0.6)*2.0; p.y += sin(tt*1.3)*0.8;
        if (rise > 0.0) p.y = yBase + mod(p.y - yBase + t*rise*(0.6+0.4*fract(phase)), height);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        vA = mix(1.0, 0.5+0.5*sin(t*3.0*blink + phase*7.0), blink > 0.0 ? 1.0 : 0.0);
        vC = color;
        float ps = size*scale/max(1.0,-mv.z)*(0.6+0.4*vA);
        // a mote drifting right past the camera would flash as a huge blob: fade it out near the lens,
        // cap its size, and fade sub-pixel motes instead of letting them flicker
        vA *= smoothstep(3.0, 9.0, -mv.z) * clamp(ps / 2.0, 0.0, 1.0);
        gl_PointSize = min(ps, 40.0);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; uniform float glow;
      void main(){ vec2 c = gl_PointCoord-0.5; float r = length(c)*2.0; if (r>1.0) discard;
        float a = pow(1.0-r, 1.6); gl_FragColor = vec4(vC*glow*a*vA, a*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.update = (dt, t) => { uniforms.t.value = t; };
  return pts;
}

// underwater caustics on any MeshStandardMaterial (adds moving light ripples in world space)
export function addCaustics(mat, shared) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.cTime = shared.time;
    sh.uniforms.cStrength = shared.strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCWorld; uniform float cTime; uniform float cStrength;
        float cau(vec2 p, float t){ vec2 i = p; float c = 1.0; float inten = 0.005;
          for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n+1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0/length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten))); }
          c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0); }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float cs = cau(mod(vCWorld.xz * 0.09, 6.2831) , cTime * 0.6);
        gl_FragColor.rgb += vec3(0.55, 0.9, 1.0) * cs * cStrength;`);
  };
  mat.customProgramCacheKey = () => 'caustics';
  mat.needsUpdate = true;
  return mat;
}

// text on a canvas (banners, signs)
export function textTexture(text, { w = 1024, h = 256, bg = '#2a1b5e', fg = '#ffffff', stroke = '#000000', font = '900 150px "M PLUS Rounded 1c", sans-serif', border = null } = {}) {
  return canvasTexture(w, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) {
      const n = 14;
      for (let i = 0; i < n; i++) for (const y of [0, h - h / 10]) { ctx.fillStyle = (i + (y ? 1 : 0)) % 2 ? border[0] : border[1]; ctx.fillRect((i * w) / n, y, w / n, h / 10); }
    }
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 16; ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
    ctx.strokeText(text, w / 2, h / 2 + 6);
    ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2 + 6);
  }, { repeat: false, w, h });
}

// start gate: two pillars and a banner across the road at the start line
export function startGate(track, { pillar = '#ffffff', accent = '#ff4fa8', banner = '#2a1b5e', text = 'DREAM DRIFT', lights = '#ffd93b', height = 9, glowK = 2.5 } = {}) {
  const g = new THREE.Group();
  const W = track.wallD(0) + 1.4;
  const pm = new THREE.MeshStandardMaterial({ color: pillar, roughness: 0.4, metalness: 0.1 });
  const am = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, height, 16), pm);
    p.position.set(s * W, height / 2, 0); p.castShadow = true; g.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), am);
    cap.position.set(s * W, height + 0.6, 0); g.add(cap);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.18, 8, 20), am);
      ring.rotation.x = Math.PI / 2; ring.position.set(s * W, 1 + i * (height / 4), 0); g.add(ring);
    }
  }
  const tex = textTexture(text, { bg: banner, border: ['#ffffff', '#111111'] });
  const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 });
  const ban = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 3.2, 0.5), [pm, pm, pm, pm, bm, bm]);
  ban.position.set(0, height - 1.2, 0); ban.castShadow = true;
  g.add(ban);
  const lm = glow(lights, glowK);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lm);
    l.position.set((i - 2) * (W * 0.38), height + 0.75, 0); g.add(l);
  }
  track.placeOn(g, 0, 0, 0);
  g.name = 'gate';
  return g;
}

// instanced mesh helper that takes plain arrays
export function inst(geo, mat, list, { cast = false, receive = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  m.count = list.length;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), C = new THREE.Color();
  list.forEach((it, i) => {
    const s = it.s ?? 1;
    S.set(...(Array.isArray(s) ? s : [s, s, s]));
    Q.setFromEuler(E.set(it.rx || 0, it.ry || 0, it.rz || 0));
    M.compose(Pv.set(it.x, it.y, it.z), Q, S);
    m.setMatrixAt(i, M);
    if (it.c !== undefined) m.setColorAt(i, it.c.isColor ? it.c : C.set(it.c));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = cast; m.receiveShadow = receive;
  m.computeBoundingSphere();
  return m;
}
