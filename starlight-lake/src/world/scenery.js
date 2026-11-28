import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, srgb, GLSL_DITHER, sph } from '../util.js';
import { WATER_Y } from '../config.js';

// Depth for the eyes: things at every distance, so the lake reads as deep space and the far
// distance becomes something to look at, not just a backdrop.
//   near   0.7-5 m   drifting motes of light (strong stereo parallax)
//   mid    15-70 m   rocks and pine islands with reflections
//   far    170 m     the lighthouse cape: a far fixation target that pulses slowly
//   path   7-155 m   two rows of floating lanterns converging on the lighthouse (linear perspective)
//   layers 55/120/240 m  bands of mist hugging the water (aerial perspective, overlap)
//   sky    clouds lit by the moon, meteors

const HAZE_VS = /* glsl */`
  uniform float uMirror;
  varying vec3 vWorld; varying vec3 vN;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    if (uMirror > 0.5) w.y = 2.0 * ${WATER_Y.toFixed(3)} - w.y;
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const HAZE_FS = /* glsl */`
  uniform vec3 uBase, uHorizon, uRim, uMoonDir; uniform float uHaze, uMirror;
  varying vec3 vWorld; varying vec3 vN;
  ${GLSL_DITHER}
  void main(){
    float d = length(vWorld.xz - cameraPosition.xz);
    vec3 c = uBase;
    float rim = pow(max(dot(normalize(vN), normalize(vec3(uMoonDir.x, 0.35, uMoonDir.z))), 0.0), 3.0);
    c += uRim * rim * 0.32;
    float haze = 1.0 - exp(-d * uHaze);                              // aerial perspective
    float low = exp(-max(vWorld.y - ${WATER_Y.toFixed(3)}, 0.0) * 0.25) * 0.35;   // mist at the waterline
    c = mix(c, uHorizon, clamp(haze + low * haze, 0.0, 0.92));
    if (uMirror > 0.5) c *= 0.55;
    gl_FragColor = vec4(dither(c), 1.0);
  }`;

function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

function islandGeometry(R, H, rnd, shape = 1.1) {
  const rings = 7, seg = 28;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const pos = [], idx = [];
  const height = (r, a) => {
    const k = 1 - Math.min(1, (r / R) ** 2);
    const wob = 0.72 + 0.18 * Math.sin(a * 3 + ph[0]) + 0.1 * Math.sin(a * 7 + ph[1]);
    return WATER_Y - 0.4 + (H + 0.4) * Math.pow(k, shape) * wob;
  };
  pos.push(0, height(0, 0), 0);
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * R * (1 + 0.08 * Math.sin(i + ph[2]));
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const rr = r * (0.85 + 0.15 * Math.sin(a * 5 + ph[1] + i));
      pos.push(Math.cos(a) * rr, i === rings ? WATER_Y - 0.4 : height(rr, a), Math.sin(a) * rr);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * seg, a1 = 1 + i * seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, height };
}

function pine(h, r, rnd) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(r * 0.08, r * 0.12, h * 0.3, 5);
  trunk.translate(0, h * 0.15, 0);
  parts.push(prep(trunk));
  for (let k = 0; k < 3; k++) {
    const ch = h * (0.45 - k * 0.07), cr = r * (1 - k * 0.27);
    const cone = new THREE.ConeGeometry(cr, ch, 7);
    cone.rotateY(rnd() * 6.28);
    cone.translate(0, h * 0.28 + k * h * 0.22 + ch / 2, 0);
    parts.push(prep(cone));
  }
  return mergeGeometries(parts);
}

/** Two rows of floating lanterns from near to far, lit one pair at a time as the night's goal fills. */
class LanternPath {
  constructor(from, to, ppd) {
    this.N = 30;
    const pos = [], seed = [], idxs = [];
    this.pairs = [];
    const dir = to.clone().sub(from); dir.y = 0;
    const len = dir.length(); dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const raw = (i) => 1 + i * 3 + i * i * 0.075;   // ~3 m apart up close, wider far away
    for (let i = 0; i < this.N; i++) {
      const t = i / (this.N - 1);
      const d = (raw(i) / raw(this.N - 1)) * len;
      const c = from.clone().addScaledVector(dir, d);
      const off = 1.5 + d * 0.035;
      const L = c.clone().addScaledVector(side, -off), Rt = c.clone().addScaledVector(side, off);
      L.y = Rt.y = WATER_Y + 0.22;
      pos.push(L.x, L.y, L.z, Rt.x, Rt.y, Rt.z);
      seed.push(i * 0.37, i * 0.53 + 0.2);
      idxs.push(t, t);
      this.pairs.push({ c: c.setY(WATER_Y + 0.22), L, R: Rt });
    }
    this.lit = new Float32Array(this.N * 2);
    this.target = new Float32Array(this.N * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setAttribute('aIdx', new THREE.Float32BufferAttribute(idxs, 1));
    geo.setAttribute('aLit', new THREE.BufferAttribute(this.lit, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mk = (mirror) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPpd: { value: ppd }, uMirror: { value: mirror ? 1 : 0 }, uWave: { value: -1 }, uBreath: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute float aSeed; attribute float aLit; attribute float aIdx;
          uniform float uTime, uPpd, uMirror, uWave, uBreath;
          varying float vA; varying float vLit;
          void main(){
            vec3 p = position;
            p.y += sin(uTime * 0.8 + aSeed * 9.0) * 0.04;
            float wave = uWave >= 0.0 ? exp(-pow((aIdx - uWave) * 9.0, 2.0)) : 0.0;
            vLit = aLit;
            float flick = 0.88 + 0.12 * sin(uTime * 7.0 + aSeed * 31.0);
            vA = (0.10 + 0.9 * aLit * flick + wave * 0.9 + uBreath * 0.25 * aLit) * (uMirror > 0.5 ? 0.4 : 1.0);
            if (uMirror > 0.5) p.y = 2.0 * ${WATER_Y.toFixed(3)} - p.y;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float dist = max(0.1, -mv.z);
            gl_PointSize = clamp((0.3 + 0.12 * aLit + wave * 0.3) / dist * 57.2958 * uPpd, 1.5, 36.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          varying float vA; varying float vLit;
          void main(){
            vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
            float core = exp(-r * r * 7.0), halo = exp(-r * r * 2.0) * 0.35;
            vec3 warm = mix(vec3(0.45, 0.5, 0.65), vec3(1.0, 0.68, 0.32), clamp(vLit * 1.2, 0.0, 1.0));
            gl_FragColor = vec4(warm * (core + halo) * vA, 1.0);
          }`,
      });
      const p = new THREE.Points(geo, m);
      p.frustumCulled = false;
      p.renderOrder = mirror ? -44 : 6;
      return p;
    };
    this.points = mk(false); this.mirror = mk(true);
    this.count = 0;
    this.waveT = -1;
  }
  /** Light the first n pairs (0..N). */
  setLit(n, instant = false) {
    this.count = Math.max(0, Math.min(this.N, n));
    for (let i = 0; i < this.N; i++) {
      const v = i < this.count ? 1 : 0;
      this.target[i * 2] = this.target[i * 2 + 1] = v;
      if (instant) this.lit[i * 2] = this.lit[i * 2 + 1] = v;
    }
    this.geo.attributes.aLit.needsUpdate = true;
  }
  nextPos() { return this.pairs[Math.min(this.N - 1, this.count)].c; }
  wave() { this.waveT = 0; }
  update(t, dt, ppd, breath) {
    let changed = false;
    for (let i = 0; i < this.lit.length; i++) {
      if (this.lit[i] !== this.target[i]) {
        this.lit[i] += Math.sign(this.target[i] - this.lit[i]) * dt * 2.5;
        if (Math.abs(this.lit[i] - this.target[i]) < 0.03) this.lit[i] = this.target[i];
        changed = true;
      }
    }
    if (changed) this.geo.attributes.aLit.needsUpdate = true;
    if (this.waveT >= 0) { this.waveT += dt / 3.2; if (this.waveT > 1.15) this.waveT = -1; }
    for (const p of [this.points, this.mirror]) {
      const u = p.material.uniforms;
      u.uTime.value = t; u.uPpd.value = ppd; u.uWave.value = this.waveT; u.uBreath.value = breath;
    }
  }
}

export class Scenery {
  constructor(noiseTex, moonDir, ppd) {
    this.group = new THREE.Group();
    this.sky = new THREE.Group();          // follows the head (clouds, meteors are "at infinity")
    const rnd = mulberry32(2024);
    this.uniforms = {
      uBase: { value: srgb(0x0b1024) }, uHorizon: { value: srgb(0x3a4a8a) }, uRim: { value: srgb(0x8a9ad0) },
      uMoonDir: { value: moonDir }, uHaze: { value: 0.0065 }, uMirror: { value: 0 },
    };

    // --- islands, pines, rocks ---------------------------------------------------------
    const at = (azDeg, d) => sph(azDeg, 0, d);
    const islands = [
      { az: -36, d: 70, R: 15, H: 5, trees: 9 },
      { az: 31, d: 46, R: 8, H: 3.2, trees: 5 },
      { az: 62, d: 115, R: 18, H: 6, trees: 8 },
      { az: -70, d: 135, R: 22, H: 7, trees: 10 },
      { az: -6, d: 170, R: 17, H: 9, trees: 4, lighthouse: true, shape: 0.75 },
      { az: 14, d: 240, R: 26, H: 4, trees: 7 },
    ];
    const parts = [];
    for (const is of islands) {
      const c = at(is.az, is.d);
      const { geo, height } = islandGeometry(is.R, is.H, rnd, is.shape);
      geo.translate(c.x, 0, c.z);
      parts.push(prep(geo));
      for (let k = 0; k < is.trees; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * is.R * 0.62;
        if (is.lighthouse && r < is.R * 0.35) continue;
        const h = (3.5 + rnd() * 5.5) * (is.d > 150 ? 1.3 : 1);
        const tree = pine(h, h * 0.24, rnd);
        tree.translate(c.x + Math.cos(a) * r, height(r, a) - 0.4, c.z + Math.sin(a) * r);
        parts.push(tree);
      }
      if (is.lighthouse) {
        const top = height(0, 0);
        const tower = new THREE.CylinderGeometry(0.85, 1.35, 12, 10); tower.translate(c.x, top + 6, c.z);
        const room = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 10); room.translate(c.x, top + 12.9, c.z);
        const roof = new THREE.ConeGeometry(1.35, 1.6, 10); roof.translate(c.x, top + 14.5, c.z);
        parts.push(prep(tower), prep(room), prep(roof));
        this.lighthousePos = new THREE.Vector3(c.x, top + 12.9, c.z);
        this.lighthouseBase = new THREE.Vector3(c.x, WATER_Y, c.z);
      }
    }
    for (const [az, d, s] of [[-58, 17, 1.4], [-50, 21, 0.9], [-63, 22, 0.7], [44, 26, 1.1], [52, 29, 0.6]]) {
      const g = new THREE.IcosahedronGeometry(s, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + rnd() * 0.3), p.getY(i) * (0.6 + rnd() * 0.25), p.getZ(i) * (0.9 + rnd() * 0.3));
      g.computeVertexNormals();
      const c = at(az, d);
      g.translate(c.x, WATER_Y + s * 0.15, c.z);
      parts.push(prep(g));
    }
    const merged = mergeGeometries(parts);
    for (const mirror of [false, true]) {
      const m = new THREE.Mesh(merged, new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uMirror: { value: mirror ? 1 : 0 } },
        vertexShader: HAZE_VS, fragmentShader: HAZE_FS, side: THREE.DoubleSide,
      }));
      m.frustumCulled = false;
      m.renderOrder = mirror ? -58 : -48;
      this.group.add(m);
    }

    // --- lighthouse lamp, beam and its reflection ----------------------------------------
    this.lamp = this.glowSprite(0xfff1c8, 12);
    this.lamp.position.copy(this.lighthousePos);
    this.lampMirror = this.glowSprite(0xffe2a8, 7.5);
    this.lampMirror.position.copy(this.lighthousePos).setY(2 * WATER_Y - this.lighthousePos.y);
    this.lampMirror.scale.set(7.5, 22, 1);
    this.group.add(this.lamp, this.lampMirror);
    this.beam = this.makeBeam();
    this.beam.position.copy(this.lighthousePos);
    this.group.add(this.beam);
    this.lit = 0;            // 0..1, lighthouse brightness from the night's goal
    this.beamOn = 0;

    // --- the lantern path toward the lighthouse -------------------------------------------
    const from = at(-6, 7).setY(WATER_Y);
    const to = this.lighthouseBase.clone().addScaledVector(this.lighthouseBase.clone().setY(0).normalize(), -16);
    this.path = new LanternPath(from, to, ppd);
    this.group.add(this.path.points, this.path.mirror);

    // --- mist bands -------------------------------------------------------------------------
    this.mists = [];
    for (const [R, H, a, sp] of [[55, 5, 0.22, 1], [120, 9, 0.26, -0.7], [240, 16, 0.3, 0.5]]) {
      const geo = new THREE.CylinderGeometry(R, R, H * 1.5, 96, 1, true);
      geo.translate(0, WATER_Y + H * 0.25, 0);
      const m = new THREE.ShaderMaterial({
        uniforms: { uNoise: { value: noiseTex }, uTime: { value: 0 }, uColor: { value: srgb(0x3a4a8a) }, uAlpha: { value: a }, uSpeed: { value: sp }, uH: { value: H } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: /* glsl */`
          varying vec2 vUv; varying float vY;
          void main(){ vUv = uv; vY = position.y - ${WATER_Y.toFixed(3)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`
          uniform sampler2D uNoise; uniform float uTime, uAlpha, uSpeed, uH; uniform vec3 uColor;
          varying vec2 vUv; varying float vY;
          void main(){
            float y = vY / uH;                                  // 0 at the water, 1 at the band top
            float shape = y >= 0.0 ? exp(-y * y * 3.0) : exp(-y * y * 30.0) * 0.6;   // thin mirrored skirt
            float n = texture2D(uNoise, vec2(vUv.x * 7.0 + uTime * 0.003 * uSpeed, y * 0.35 + uTime * 0.002)).r;
            float a = uAlpha * shape * smoothstep(0.25, 0.75, n) * 1.4;
            gl_FragColor = vec4(uColor * 1.08, a);
          }`,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = -36;
      mesh.frustumCulled = false;
      this.mists.push(mesh);
      this.group.add(mesh);
    }

    // --- motes of light close to the player -------------------------------------------------
    {
      const N = 150;
      const pos = new Float32Array(N * 3), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = rnd() * Math.PI * 2, d = 0.8 + Math.pow(rnd(), 0.7) * 4.2;
        pos.set([Math.sin(a) * d, 0.15 + rnd() * 2.6, -Math.cos(a) * d], i * 3);
        seed[i] = rnd() * 100;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.motes = new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPpd: { value: ppd }, uBreath: { value: 0 }, uAlpha: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute float aSeed; uniform float uTime, uPpd, uBreath; varying float vA;
          void main(){
            vec3 p = position;
            p += vec3(sin(uTime * 0.13 + aSeed), sin(uTime * 0.09 + aSeed * 1.7) * 0.5, cos(uTime * 0.11 + aSeed * 0.7)) * 0.35;
            p.xz *= 1.0 - uBreath * 0.12;          // the air gathers in as you breathe in
            vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.6 + fract(aSeed) * 0.8) + aSeed), 3.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp(0.012 / max(0.2, -mv.z) * 57.3 * uPpd, 1.0, 12.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform float uAlpha; varying float vA;
          void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vec3(0.75, 0.92, 1.0) * exp(-r * r * 4.0) * vA * uAlpha * 0.55, 1.0); }`,
      }));
      this.motes.frustumCulled = false;
      this.motes.renderOrder = 7;
    }

    // --- clouds -----------------------------------------------------------------------------
    this.cloudUniforms = { uNoise: { value: noiseTex }, uTime: { value: 0 }, uTint: { value: srgb(0x6a78a8) }, uMoonDir: { value: moonDir }, uAlpha: { value: 0.5 } };
    for (let i = 0; i < 8; i++) {
      const az = -110 + i * 30 + rnd() * 14, el = 8 + rnd() * 16, d = 620;
      const w = 170 + rnd() * 170;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: { ...this.cloudUniforms, uSeed: { value: rnd() * 10 } },
        transparent: true, depthWrite: false,
        vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; vec4 q = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = q.xyww; }`,
        fragmentShader: /* glsl */`
          uniform sampler2D uNoise; uniform float uTime, uSeed, uAlpha; uniform vec3 uTint, uMoonDir;
          varying vec2 vUv; varying vec3 vW;
          void main(){
            vec2 p = vUv - 0.5;
            float n = texture2D(uNoise, vUv * vec2(1.6, 0.6) + vec2(uSeed + uTime * 0.0015, uSeed * 0.3)).r;
            float n2 = texture2D(uNoise, vUv * vec2(4.0, 1.5) + vec2(-uTime * 0.002, uSeed)).g;
            float shape = smoothstep(0.5, 0.15, length(p * vec2(1.0, 2.3)));
            float d = smoothstep(0.42, 0.7, n * 0.75 + n2 * 0.35) * shape;
            vec3 dir = normalize(vW);
            float moon = pow(max(dot(dir, uMoonDir), 0.0), 6.0);
            vec3 c = uTint * (0.8 + 0.5 * n2) + vec3(0.6, 0.65, 0.8) * moon * 0.8;
            gl_FragColor = vec4(c, d * uAlpha);
          }`,
      }));
      const p = sph(az, el, d);
      m.position.copy(p);
      m.scale.set(w, w * 0.32, 1);
      m.lookAt(0, 0, 0);
      m.renderOrder = -88;
      m.frustumCulled = false;
      this.sky.add(m);
    }

    // --- meteors ------------------------------------------------------------------------------
    this.METEORS = 6; this.TAIL = 18;
    const mpos = new Float32Array(this.METEORS * this.TAIL * 3), ma = new Float32Array(this.METEORS * this.TAIL);
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3).setUsage(THREE.DynamicDrawUsage));
    mgeo.setAttribute('aA', new THREE.BufferAttribute(ma, 1).setUsage(THREE.DynamicDrawUsage));
    this.meteorGeo = mgeo;
    this.meteorPts = new THREE.Points(mgeo, new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: ppd } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aA; uniform float uPpd; varying float vA; void main(){ vA = aA; gl_PointSize = max(1.0, uPpd * 0.22 * (0.4 + aA)); vec4 q = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = q.xyww; }',
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * exp(-r * r * 4.0) * vA, 1.0); }',
    }));
    this.meteorPts.frustumCulled = false;
    this.meteorPts.renderOrder = -84;
    this.sky.add(this.meteorPts);
    this.meteors = [];
    this.nextMeteor = 4;
    this.fever = false;
  }

  glowSprite(color, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: srgb(color) }, uI: { value: 0.6 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p); float v = exp(-r * r * 22.0) + 0.35 * exp(-r * r * 4.0) + 0.6 * (exp(-abs(p.x) * 30.0) + exp(-abs(p.y) * 30.0)) * exp(-r * 3.0); gl_FragColor = vec4(uColor * v * uI, 1.0); }',
    }));
    m.scale.setScalar(size);
    m.renderOrder = 8;
    m.frustumCulled = false;
    return m;
  }

  makeBeam() {
    const L = 260, R = 22;
    const geo = new THREE.ConeGeometry(R, L, 24, 1, true);
    geo.translate(0, -L / 2, 0);
    geo.rotateZ(Math.PI / 2);          // apex at the lamp, opening along +x
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.x / 260.0; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      // a soft shaft: fades along its length and toward its silhouette, so it reads as lit haze
      fragmentShader: 'uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float facing = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = pow(1.0 - vT, 2.2) * smoothstep(0.0, 0.04, vT) * facing * 0.2 * uI; gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * a, 1.0); }',
    }));
    const g = new THREE.Group();
    g.add(m);
    g.renderOrder = 9;
    m.renderOrder = 9;
    m.frustumCulled = false;
    return g;
  }

  setPalette(horizon, rock, rim, sky) {
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uBase.value.copy(rock).lerp(horizon, 0.08);
    this.uniforms.uRim.value.copy(rim);
    for (const m of this.mists) m.material.uniforms.uColor.value.copy(horizon);
    this.cloudUniforms.uTint.value.copy(horizon).lerp(sky, 0.4);
  }

  /** 0..1 how far the night's goal has come; at 1 the lighthouse beam turns on. */
  setLighthouse(level, beam) { this.lit = level; this.beamTarget = beam ? 1 : 0; }
  setFever(on) { this.fever = on; if (on) this.nextMeteor = Math.min(this.nextMeteor, 0.2); }

  spawnMeteor(head) {
    const free = this.meteors.length < this.METEORS ? this.meteors.length : -1;
    if (free < 0) return;
    const az = (Math.random() - 0.5) * 150, el = 28 + Math.random() * 35;
    const start = sph(az, el, 600);
    const dir = new THREE.Vector3(Math.random() - 0.5, -0.55 - Math.random() * 0.3, Math.random() - 0.5).normalize();
    this.meteors.push({ start, dir, t: 0, life: 0.7 + Math.random() * 0.6, speed: 160 + Math.random() * 120 });
  }

  update(t, dt, head, ppd, breath = 0) {
    this.sky.position.copy(head);
    // lighthouse: a slow pulse always (something far to look at), brighter as the goal fills
    const pulse = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.4), 2.0);
    const I = (0.35 + 0.65 * this.lit) * pulse + breath * 0.3;
    this.lamp.material.uniforms.uI.value = I;
    this.lampMirror.material.uniforms.uI.value = I * 0.45;
    this.lamp.lookAt(head); this.lampMirror.lookAt(head.x, this.lampMirror.position.y, head.z);
    this.beamOn += ((this.beamTarget || 0) - this.beamOn) * Math.min(1, dt * 0.8);
    this.beam.children[0].material.uniforms.uI.value = this.beamOn;
    this.beam.rotation.y = t * 0.35;
    this.beam.visible = this.beamOn > 0.01;
    this.path.update(t, dt, ppd, breath);
    for (const m of this.mists) m.material.uniforms.uTime.value = t;
    this.cloudUniforms.uTime.value = t;
    this.motes.material.uniforms.uTime.value = t;
    this.motes.material.uniforms.uPpd.value = ppd;
    this.motes.material.uniforms.uBreath.value = breath;
    this.meteorPts.material.uniforms.uPpd.value = ppd;
    // meteors
    this.nextMeteor -= dt;
    if (this.nextMeteor <= 0) {
      this.spawnMeteor(head);
      this.nextMeteor = this.fever ? 0.35 + Math.random() * 0.6 : 7 + Math.random() * 10;
    }
    const pos = this.meteorGeo.attributes.position.array, aa = this.meteorGeo.attributes.aA.array;
    aa.fill(0);
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      if (m.t > m.life) { this.meteors.splice(i, 1); continue; }
    }
    this.meteors.forEach((m, i) => {
      const fade = Math.sin(Math.PI * Math.min(1, m.t / m.life));
      for (let k = 0; k < this.TAIL; k++) {
        const tt = Math.max(0, m.t - k * 0.012);
        const p = m.start.clone().addScaledVector(m.dir, tt * m.speed);
        pos.set([p.x, p.y, p.z], (i * this.TAIL + k) * 3);
        aa[i * this.TAIL + k] = fade * (1 - k / this.TAIL);
      }
    });
    this.meteorGeo.attributes.position.needsUpdate = true;
    this.meteorGeo.attributes.aA.needsUpdate = true;
  }
}
