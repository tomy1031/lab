// coach.js — a hologram trainer standing 2.4 m in front of the player, like a mirror image.
// It demonstrates what to do next: it reaches where the player should reach, traces the comet,
// holds the pose, steps toward the open lane and bends its knees under the bar.
//
// The body is built from lathed, tapered limbs (so it reads as an athlete, not a stick figure):
// a V-shaped torso, helmet with a glowing visor, light lines down the suit in your hand colours
// (its left side cyan, its right side pink — it is your mirror image), standing on a projector.
import * as THREE from 'three';
import { energyMaterial, rimMaterial, uTime } from './gfx.js';
import { HAND_COLORS } from './palette.js';
import { clamp, lerp } from './util.js';

const CS = '\n#include <colorspace_fragment>\n';
const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

// two-bone IK: elbow/knee position for a limb from root to target with segment lengths a, b
function solve(root, target, a, b, pole, outMid, outEnd) {
  const d = tmp.subVectors(target, root);
  let L = d.length();
  const dir = L > 1e-5 ? d.multiplyScalar(1 / L) : d.set(0, -1, 0);
  L = Math.min(Math.max(L, Math.abs(a - b) + 0.01), a + b - 0.002);
  outEnd.copy(root).addScaledVector(dir, L);
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = tmp2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
  p.normalize();
  outMid.copy(root).addScaledVector(dir, x).addScaledVector(p, h);
}

// ---------- geometry ----------
// lathe a profile [[radius, y], …] around +y; aGlow marks the light lines (front and back seams)
// and any rows listed in `rows` (cuffs, belt, chest line)
function lathe(profile, { segs = 24, rows = [], lines = 'front', flatten = 1 } = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, segs);
  const n = pts.length, glow = new Float32Array((segs + 1) * n);
  // 'front': seams at the front and back of a limb; 'side': down both flanks of the torso
  const onLine = (i) => (lines === 'front' ? i % (segs / 2) === 0 : lines === 'side' ? i % (segs / 2) === segs / 4 : false);
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j < n; j++) {
      let v = 0;
      if (onLine(i) && j > 1 && j < n - 2) v = 1;
      if (rows.includes(j)) v = 1;
      glow[i * n + j] = v;
    }
  }
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  if (flatten !== 1) g.scale(1, 1, flatten);
  g.computeVertexNormals();
  return g;
}
// a capsule from a joint (y = 0, radius r0) to the next joint (y = len, radius r1), with a muscle bulge
function limb(len, r0, r1, bulge = 0, cuffAt = -1, lines = 'front') {
  const p = [];
  for (let k = 0; k <= 4; k++) { const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2); p.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }
  const steps = 8;
  for (let k = 1; k < steps; k++) { const t = k / steps; p.push([lerp(r0, r1, t) + bulge * Math.sin(Math.PI * Math.pow(t, 0.8)), len * t]); }
  for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); p.push([r1 * Math.cos(a), len + r1 * Math.sin(a)]); }
  const rows = cuffAt > 0 ? [4 + Math.round(cuffAt * steps)] : [];
  return lathe(p, { rows, segs: 20, lines });
}
function ellipsoid(rx, ry, rz, glowFront = false) {
  const g = new THREE.SphereGeometry(1, 24, 16);
  g.scale(rx, ry, rz);
  const n = g.attributes.position.count, glow = new Float32Array(n);
  if (glowFront) for (let i = 0; i < n; i++) glow[i] = 0;
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}

// ---------- materials ----------
// dark glass suit with a bright rim, a slow scan band and accent light lines
function suitMaterial(accent) {
  return new THREE.ShaderMaterial({
    uniforms: {
      base: { value: new THREE.Color('#0a1130') }, rim: { value: new THREE.Color('#9fe6ff') }, accent: { value: new THREE.Color(accent) },
      time: uTime, opacity: { value: 0 }, scanY: { value: 0 },
    },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float aGlow; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vGlow;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz); vGlow = aGlow; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 base, rim, accent; uniform float time, opacity, scanY;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vGlow;
      void main(){
        vec3 n = normalize(vN);
        float ndv = abs(dot(n, normalize(vV)));
        float fres = pow(1.0 - ndv, 2.2);
        float key = 0.5 + 0.5 * max(dot(n, normalize(vec3(0.25, 0.9, 0.5))), 0.0);
        vec3 c = base * (0.55 + 0.9 * key) + rim * fres * 1.25;
        float band = exp(-pow((vW.y - scanY) * 9.0, 2.0));
        c += rim * band * 0.35;
        float g = smoothstep(0.15, 0.95, vGlow);
        c = mix(c, accent * (1.25 + 0.3 * sin(time * 3.0)), g * 0.85);
        c *= 0.95 + 0.05 * sin(vW.y * 300.0 + time * 5.0);
        float a = opacity * clamp(0.86 + 0.14 * fres + 0.2 * g + band * 0.1, 0.0, 1.0);
        gl_FragColor = vec4(c, a);${CS}}`,
  });
}
function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

export class Coach {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.mats = { C: suitMaterial('#ffffff'), T: suitMaterial('#8fe3ff'), L: suitMaterial(HAND_COLORS.L), R: suitMaterial(HAND_COLORS.R) };
    this.parts = {};
    this.glows = [];
    // hands: energy orbs in your hand colours (the coach's −x hand mirrors your left)
    this.hands = {};
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    for (const k of ['L', 'R']) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(sphere, energyMaterial(HAND_COLORS[k])); core.scale.setScalar(0.03);
      const shell = new THREE.Mesh(sphere, rimMaterial(HAND_COLORS[k], 1.6)); shell.scale.setScalar(0.055);
      g.add(core, shell);
      core.renderOrder = shell.renderOrder = -1;
      this.root.add(g);
      this.hands[k] = { g, cur: new THREE.Vector3(), target: new THREE.Vector3(), elbow: new THREE.Vector3() };
    }
    this._projector();
    this.opacity = 0;
    this.distance = 2.4;
    this.laneX = 0; this.curX = 0;
    this.drop = 0; this.curDrop = 0;
    this.targets = { L: null, R: null };
    this.t = 0;
    this.root.visible = false;
  }

  // ---------- the hologram projector under the coach ----------
  _projector() {
    const g = new THREE.Group();
    const ringTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const c = cv.getContext('2d'), m = 128;
      c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 8;
      c.lineWidth = 5; c.beginPath(); c.arc(m, m, 118, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 3; c.setLineDash([14, 10]); c.beginPath(); c.arc(m, m, 100, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]); c.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(m + Math.cos(a) * 60, m + Math.sin(a) * 60); c.lineTo(m + Math.cos(a) * 92, m + Math.sin(a) * 92); c.stroke(); }
      const grd = c.createRadialGradient(m, m, 0, m, m, 118);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grd; c.beginPath(); c.arc(m, m, 118, 0, Math.PI * 2); c.fill();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: ringTex, color: '#8fe3ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012;
    // a soft column of light the figure stands in
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 2.1, 32, 1, true), new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color('#7fdcff') }, opacity: { value: 0 }, time: uTime },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 col; uniform float opacity, time; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.y, 2.2) * 0.22 * opacity * (0.8 + 0.2 * sin(vUv.x * 60.0 + time * 2.0)); gl_FragColor = vec4(col * a, a);${CS}}`,
    }));
    cone.position.y = 1.05;
    // motes drifting up through the light
    const N = 40, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.25; pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3); seed[i] = Math.random(); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const motes = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { time: uTime, opacity: { value: 0 }, col: { value: new THREE.Color('#bff2ff') }, px: { value: 1000 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float time, px; varying float vA;
        void main(){ float k = fract(aSeed + time * (0.12 + aSeed * 0.1)); vec3 p = position; p.y = k * 2.0; vA = sin(3.14159 * k);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 0.012 * px / max(-mv.z, 0.1); }`,
      fragmentShader: `uniform vec3 col; uniform float opacity; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float a = exp(-dot(q, q) * 4.0) * vA * opacity; gl_FragColor = vec4(col * a, a);${CS}}`,
    }));
    motes.frustumCulled = false;
    g.add(disc, cone, motes);
    this.root.add(g);
    this.projector = { g, disc, cone, motes };
  }

  // ---------- body ----------
  setBody(b) {
    this.b = b;
    const H = b.stature, k = H / 1.7;
    const sh = b.standEyeY - 0.118 * H;
    const d = this.dim = {
      H, eye: b.standEyeY, sh, S: b.shoulderHalf, hip: 0.53 * H, hipHalf: 0.055 * H,
      knee: 0.285 * H, ankle: 0.045 * H, upper: b.reach * 0.47, fore: b.reach * 0.53,
    };
    this.seatedDrop = b.seated ? Math.max(0, b.standEyeY - b.eyeY) : 0;
    const key = [H, d.eye, d.S, d.upper, d.fore].map((v) => v.toFixed(3)).join();
    if (key !== this.bodyKey) { this.bodyKey = key; this._build(k); }
    for (const s of ['L', 'R']) this.hands[s].cur.copy(this.rest(s === 'L' ? -1 : 1));
  }

  _build(k) {
    for (const m of Object.values(this.parts)) { m.removeFromParent(); m.traverse((o) => o.geometry && o.geometry.dispose()); }
    this.parts = {};
    const d = this.dim, M = this.mats;
    const add = (name, geo, mat, order = -2) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; this.root.add(m); this.parts[name] = m; return m; };
    // torso: hips → waist → broad chest → shoulder slope, flattened front-to-back
    const L = d.sh + 0.02 - d.hip;
    const s = L / 0.51;
    const tp = [[0, -0.05], [0.09, -0.035], [0.135, 0.01], [0.14, 0.07], [0.112, 0.15], [0.106, 0.2], [0.13, 0.27], [0.162, 0.34], [0.176, 0.39], [0.17, 0.44], [0.125, 0.49], [0.06, 0.515], [0, 0.52]]
      .map(([r, y]) => [r * k, y * s]);
    const torso = add('torso', lathe(tp, { lines: 'side', flatten: 0.6, segs: 28 }), M.T);
    // light lines that draw the anatomy: chest V, centre line, belt — tubes hugging the torso surface
    const rAt = (y) => {
      for (let i = 1; i < tp.length; i++) if (y <= tp[i][1]) { const [r0, y0] = tp[i - 1], [r1, y1] = tp[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
      return 0;
    };
    const onFront = (x, y) => { const r = rAt(y); return new THREE.Vector3(x, y, 0.6 * r * Math.sqrt(Math.max(0, 1 - (x / r) ** 2)) + 0.003 * k); };
    const line = (pts, color, w = 0.0045) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 4, w * k, 6, false), glowMaterial(color, 0.9));
      m.renderOrder = -1; torso.add(m); return m;
    };
    const sternum = 0.33 * s, chestTop = 0.465 * s;
    const vL = [], vR = [], center = [], belt = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; vL.push(onFront(-0.125 * k * (1 - t), chestTop + (sternum - chestTop) * t)); vR.push(onFront(0.125 * k * t, sternum + (chestTop - sternum) * t)); }
    for (let i = 0; i <= 8; i++) center.push(onFront(0, sternum - (sternum - 0.11 * s) * (i / 8)));
    for (let i = 0; i <= 16; i++) { const y = 0.15 * s, r = rAt(y) * 0.97; belt.push(onFront(-r + (2 * r * i) / 16, y)); }
    this.suitLines = [line([...vL, ...vR.slice(1)], '#bff3ff'), line(center, '#8fe3ff', 0.0035), line(belt, '#ffd166', 0.004)];
    // abdomen panel lines are the seam lines; chest emblem on top
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022 * k), glowMaterial('#ffd166', 0.95));
    emblem.renderOrder = -1; this.root.add(emblem); this.parts.emblem = emblem;
    // head: helmet + visor + neck
    const hr = 0.098 * k;
    const head = add('head', ellipsoid(hr * 0.84, hr * 1.04, hr * 0.94), M.C);
    // helmet crest: a light line from the brow over the top to the back of the head
    const crest = [];
    for (let i = 0; i <= 16; i++) { const a = -0.15 + (i / 16) * 2.3; crest.push(new THREE.Vector3(0, Math.sin(a) * hr * 1.06, Math.cos(a) * hr * 0.96)); }
    const crestMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crest), 48, 0.005 * k, 6, false), glowMaterial('#bff3ff', 0.9));
    crestMesh.renderOrder = -1; head.add(crestMesh);
    this.suitLines.push(crestMesh);
    const visorGeo = new THREE.SphereGeometry(hr * 0.99, 32, 12, Math.PI / 2 - 1.0, 2.0, 1.25, 0.42);
    visorGeo.scale(0.86, 1.04, 0.97);
    const visor = new THREE.Mesh(visorGeo, new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 }, time: uTime },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float opacity, time; varying vec2 vUv;
        void main(){ float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float sweep = exp(-pow((vUv.x - fract(time * 0.35)) * 8.0, 2.0));
          vec3 c = mix(vec3(0.35, 0.85, 1.0), vec3(1.0), 0.35 + 0.65 * sweep);
          float a = edge * opacity * (0.75 + 0.6 * sweep); gl_FragColor = vec4(c * a, a);${CS}}`,
    }));
    visor.renderOrder = -1; this.root.add(visor); this.parts.visor = visor;
    add('neck', limb(0.11 * k, 0.042 * k, 0.036 * k, 0, -1, false), M.C);
    // shoulders, arms (side colours on the light lines), legs, feet
    for (const [side, mat] of [['L', M.L], ['R', M.R]]) {
      add(`delt${side}`, ellipsoid(0.066 * k, 0.058 * k, 0.062 * k), mat);
      add(`upper${side}`, limb(d.upper, 0.05 * k, 0.037 * k, 0.013 * k, 0.9), mat);
      add(`fore${side}`, limb(Math.max(0.1, d.fore - 0.04), 0.038 * k, 0.025 * k, 0.01 * k, 0.86), mat);
      add(`thigh${side}`, limb(d.hip - d.knee, 0.078 * k, 0.05 * k, 0.016 * k, 0.9), mat);
      add(`shin${side}`, limb(d.knee - d.ankle, 0.05 * k, 0.032 * k, 0.014 * k, 0.88), mat);
      add(`foot${side}`, ellipsoid(0.048 * k, 0.034 * k, 0.118 * k), mat);
      // glowing joint rings at the elbow and knee
      for (const j of ['elbow', 'knee']) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry((j === 'knee' ? 0.052 : 0.04) * k, 0.006 * k, 8, 32), glowMaterial(HAND_COLORS[side], 0.9));
        ring.renderOrder = -1; this.root.add(ring); this.parts[`${j}Ring${side}`] = ring;
      }
    }
  }

  rest(side) {
    const d = this.dim;
    return new THREE.Vector3(side * (d.S + 0.06), d.hip - this.curDrop + 0.02, 0.07);
  }
  // player-space target (stage coordinates) → coach-local mirrored position
  mirror(p, out = new THREE.Vector3()) { return out.set(p.x - this.curX, p.y, -p.z); }

  // what to demonstrate this frame: hand targets in the player's stage space (or null to relax)
  demo({ L = null, R = null, laneX = null, drop = 0 } = {}) {
    this.targets.L = L; this.targets.R = R;
    if (laneX !== null) this.laneX = laneX;
    this.drop = drop;
  }

  // place a lathed limb (built along +y from its root joint) between two points
  orient(mesh, a, b) {
    mesh.position.copy(a);
    tmp.subVectors(b, a);
    if (tmp.lengthSq() > 1e-10) mesh.quaternion.setFromUnitVectors(up, tmp.normalize());
  }

  // a ring around a joint, facing along the next bone
  ring(mesh, at, next) {
    mesh.position.copy(at);
    tmp.subVectors(next, at);
    if (tmp.lengthSq() > 1e-10) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmp.normalize());
  }

  update(dt, { visible }) {
    if (!this.b) return;
    this.t += dt;
    this.opacity += ((visible ? 1 : 0) - this.opacity) * Math.min(1, dt * 4);
    this.root.visible = this.opacity > 0.01;
    if (!this.root.visible) return;
    const d = this.dim, k = Math.min(1, dt * 9), op = this.opacity;
    // fade everything together; a scan band sweeps up the suit every few seconds
    const scanY = ((this.t * 0.45) % 1.4) * (d.H + 0.3) - 0.2;
    for (const m of Object.values(this.mats)) { m.uniforms.opacity.value = op * 0.92; m.uniforms.scanY.value = scanY; }
    this.parts.visor.material.uniforms.opacity.value = op;
    this.parts.emblem.material.opacity = op * 0.95;
    for (const m of this.suitLines) m.material.opacity = op * 0.9;
    for (const s of ['L', 'R']) for (const j of ['elbow', 'knee']) this.parts[`${j}Ring${s}`].material.opacity = op * 0.85;
    this.projector.disc.material.opacity = op * 0.75;
    this.projector.cone.material.uniforms.opacity.value = op;
    this.projector.motes.material.uniforms.opacity.value = op;
    this.projector.disc.rotation.z = this.t * 0.4;
    for (const s of ['L', 'R']) this.hands[s].g.visible = op > 0.05;

    this.curX += (this.laneX - this.curX) * Math.min(1, dt * 6);
    this.curDrop += (this.drop + this.seatedDrop - this.curDrop) * Math.min(1, dt * 7);
    this.root.position.set(this.curX, 0, -this.distance);
    const drop = this.curDrop, breath = Math.sin(this.t * 1.6) * 0.006;
    // hip hinge: when squatting the chest leans forward a little (toward the player)
    const lean = clamp(drop * 1.3, 0, 0.42) - (this.targets.L || this.targets.R ? 0 : Math.sin(this.t * 0.8) * 0.01);
    const P = new THREE.Vector3(0, d.hip - drop, 0);
    const body = (x, y, z = 0) => new THREE.Vector3(x, P.y + y * Math.cos(lean) - z * Math.sin(lean), P.z + y * Math.sin(lean) + z * Math.cos(lean));

    // legs: knees bend forward when dropping
    const thigh = d.hip - d.knee, shin = d.knee - d.ankle, pole = new THREE.Vector3(0, 0.2, 1);
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      const hip = new THREE.Vector3(s * d.hipHalf, P.y, 0);
      const ankle = new THREE.Vector3(s * (d.hipHalf + 0.025), d.ankle, 0.0);
      const knee = new THREE.Vector3(), end = new THREE.Vector3();
      solve(hip, ankle, thigh, shin, pole, knee, end);
      this.orient(this.parts[`thigh${side}`], hip, knee);
      this.orient(this.parts[`shin${side}`], knee, end);
      this.ring(this.parts[`kneeRing${side}`], knee, end);
      const foot = this.parts[`foot${side}`];
      foot.position.set(end.x, 0.035, end.z + 0.055);
      foot.rotation.set(0, s * 0.12, 0);
    }
    // torso, neck, head
    this.parts.torso.position.copy(P);
    this.parts.torso.rotation.set(lean, 0, 0);
    this.parts.torso.scale.set(1, 1 + breath * 2, 1);
    const relSh = d.sh - d.hip + breath;
    const neckBase = body(0, relSh + 0.03), headC = body(0, d.eye - d.hip + 0.025);
    this.orient(this.parts.neck, neckBase, headC);
    this.parts.head.position.copy(headC);
    this.parts.head.rotation.set(lean * 0.6, 0, 0);
    this.parts.visor.position.copy(headC);
    this.parts.visor.rotation.copy(this.parts.head.rotation);
    this.parts.emblem.position.copy(body(0, relSh - 0.1, 0.1 * (d.H / 1.7)));
    this.parts.emblem.rotation.set(0, this.t * 1.2, 0);
    // arms
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      const shoulder = body(s * d.S, relSh, 0);
      this.parts[`delt${side}`].position.copy(shoulder).add(new THREE.Vector3(s * 0.008, 0.01, 0));
      const h = this.hands[side];
      const tgt = this.targets[side];
      if (tgt) this.mirror(tgt, h.target); else h.target.copy(this.rest(s)).add(new THREE.Vector3(0, breath * 2, 0));
      h.cur.lerp(h.target, k);
      const end = new THREE.Vector3();
      solve(shoulder, h.cur, d.upper, d.fore, new THREE.Vector3(s * 0.5, -1, -0.5), h.elbow, end);
      this.orient(this.parts[`upper${side}`], shoulder, h.elbow);
      this.orient(this.parts[`fore${side}`], h.elbow, end);
      this.ring(this.parts[`elbowRing${side}`], h.elbow, end);
      h.g.position.copy(end);
    }
  }
}
