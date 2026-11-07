// world.js — the night-sky arena: gradient sky, twinkling stars, a planet, aurora curtains, distant
// mountains, a lake-like floor with beat ripples, and the round platform the player stands on.
// Everything is cheap to draw (a dozen draw calls) so it holds 72–90 fps on Quest 2.
import * as THREE from 'three';
import { glowTexture } from './text.js';
import { clamp, lerp, makeRng, TAU } from './util.js';

const PALETTES = {
  dawn: { top: '#1b2456', mid: '#5b3f8e', hor: '#ff9a7a', acc: '#ffd38a', aur1: '#ff9ad5', aur2: '#ffd38a' },
  lake: { top: '#050a22', mid: '#16286a', hor: '#3a76d0', acc: '#66e0ff', aur1: '#55f0ff', aur2: '#6a7bff' },
  river: { top: '#08031e', mid: '#2a1160', hor: '#b0468c', acc: '#ff7ad9', aur1: '#ff6ad5', aur2: '#8a6bff' },
  meteor: { top: '#020210', mid: '#0b1a3e', hor: '#1d6a8a', acc: '#7affc8', aur1: '#5affc8', aur2: '#4a8bff' },
  aurora: { top: '#01030c', mid: '#06262a', hor: '#169e78', acc: '#c6ff6a', aur1: '#6affb0', aur2: '#d36bff' },
  cool: { top: '#050818', mid: '#1a1f4a', hor: '#4b5fa8', acc: '#c3b5ff', aur1: '#9f8cff', aur2: '#6ad0ff' },
};
const toCol = (h) => new THREE.Color(h);

const COLORSPACE = '\n#include <colorspace_fragment>\n';
const WHITE = new THREE.Color(1, 1, 1);

export class World {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.t = 0;
    this.pulse = 0;
    this.fever = 0;
    this.feverTarget = 0;
    this.pal = {};
    this.palFrom = {};
    this.palTo = {};
    this.palMix = 1;
    for (const k of ['top', 'mid', 'hor', 'acc', 'aur1', 'aur2']) {
      this.pal[k] = toCol(PALETTES.lake[k]);
      this.palFrom[k] = this.pal[k].clone();
      this.palTo[k] = this.pal[k].clone();
    }
    this.glow = glowTexture(128);
    this._sky();
    this._stars();
    this._planet();
    this._mountains();
    this._aurora();
    this._floor();
    this._platform();
    this._dust();
    this._meteors();
  }

  setPalette(name, seconds = 3) {
    const p = PALETTES[name] || PALETTES.lake;
    for (const k in this.pal) { this.palFrom[k].copy(this.pal[k]); this.palTo[k].set(p[k]); }
    this.palMix = seconds > 0 ? 0 : 1;
    this.palDur = Math.max(0.01, seconds);
    if (seconds <= 0) for (const k in this.pal) this.pal[k].copy(this.palTo[k]);
  }

  // ---------- sky ----------
  _sky() {
    const u = this.skyU = { top: { value: this.pal.top }, mid: { value: this.pal.mid }, hor: { value: this.pal.hor }, acc: { value: this.pal.acc }, time: { value: 0 }, pulse: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top, mid, hor, acc; uniform float time, pulse; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          float h = vDir.y;
          vec3 c = mix(hor, mid, smoothstep(-0.02, 0.28, h));
          c = mix(c, top, smoothstep(0.22, 0.95, h));
          float n = noise(vDir * 3.0 + vec3(time * 0.01, 0.0, 0.0)) * 0.6 + noise(vDir * 7.0 - vec3(0.0, time * 0.013, 0.0)) * 0.4;
          float band = exp(-pow((vDir.y - 0.35 + 0.25 * vDir.x) * 2.6, 2.0));
          c += acc * pow(n, 3.0) * band * 0.28;
          c += hor * 0.06 * pulse * smoothstep(0.4, 0.0, abs(h));
          c = mix(c, hor * 0.22, smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(c, 1.0);
          ${COLORSPACE}
        }`,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), m);
    s.renderOrder = -10;
    this.group.add(s);
  }

  _stars() {
    const N = 2600, rng = makeRng(7);
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
    const tint = [new THREE.Color('#ffffff'), new THREE.Color('#bfe3ff'), new THREE.Color('#ffe2c4'), new THREE.Color('#d9c8ff')];
    for (let i = 0; i < N; i++) {
      const y = rng.range(0.02, 1), th = rng.range(0, TAU), r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 80, y * 80, Math.sin(th) * r * 80], i * 3);
      size[i] = Math.pow(rng(), 6) * 7 + 1.5;
      phase[i] = rng() * 10;
      const c = rng.pick(tint);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.starU = { time: { value: 0 }, pulse: { value: 0 }, px: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float time, pulse, px; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(time * (0.7 + aPhase * 0.25) + aPhase * 6.2831);
          vA = tw * (0.75 + 0.35 * pulse) * smoothstep(0.0, 6.0, position.y);
          gl_PointSize = aSize * px * (1.0 + 0.25 * pulse); vC = aColor; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); float a = exp(-d * 5.0) * vA; gl_FragColor = vec4(vC * a, a); ${COLORSPACE} }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -9;
    this.group.add(pts);
  }

  _planet() {
    this.planetU = { acc: { value: this.pal.acc }, hor: { value: this.pal.hor } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.planetU,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 acc, hor; varying vec3 vN; varying vec3 vV;
        void main(){ float l = clamp(dot(vN, normalize(vec3(0.6, 0.5, 0.6))), 0.0, 1.0); float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
          vec3 c = mix(hor * 0.12, acc * 0.9, l * 0.8) + acc * rim * 0.9; gl_FragColor = vec4(c, 1.0); ${COLORSPACE} }`,
    });
    const p = new THREE.Mesh(new THREE.SphereGeometry(5, 40, 20), m);
    p.position.set(-38, 24, -66);
    this.group.add(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.8, 10, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(p.position);
    ring.rotation.set(1.25, 0.25, 0.35);
    this.planetRing = ring;
    this.group.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: this.pal.acc, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(p.position);
    halo.scale.setScalar(26);
    this.planetHalo = halo;
    this.group.add(halo);
  }

  _mountains() {
    const seg = 220, R = 62, rng = makeRng(11);
    const pos = [], hgt = [];
    const h = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg;
      h.push(3 + 5 * Math.pow(Math.abs(Math.sin(a * 7.3 + 1.1)), 2) + 3.5 * Math.pow(Math.abs(Math.sin(a * 17.1 + 0.3)), 3) + rng() * 1.2);
    }
    h[seg] = h[0];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * TAU;
      const x = Math.cos(th) * R, z = Math.sin(th) * R;
      pos.push(x, -0.5, z, x, h[i], z);
      hgt.push(0, 1);
    }
    const idx = [];
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
    g.setIndex(idx);
    this.mtnU = { mid: { value: this.pal.mid }, hor: { value: this.pal.hor }, acc: { value: this.pal.acc } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.mtnU, side: THREE.DoubleSide,
      vertexShader: `attribute float aH; varying float vH; void main(){ vH = aH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 mid, hor, acc; varying float vH; void main(){ vec3 c = mix(mid * 0.08, mix(mid * 0.25, hor * 0.5, 0.4), pow(vH, 2.0)); c += acc * pow(vH, 18.0) * 0.5; gl_FragColor = vec4(c, 1.0); ${COLORSPACE} }`,
    });
    this.group.add(new THREE.Mesh(g, m));
  }

  _aurora() {
    this.aurU = { time: { value: 0 }, c1: { value: this.pal.aur1 }, c2: { value: this.pal.aur2 }, amp: { value: 0.6 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.aurU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; uniform float time; void main(){ vUv = uv; vec3 p = position; p.y += sin(uv.x * 9.0 + time * 0.25) * 1.2; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float time, amp; uniform vec3 c1, c2; varying vec2 vUv;
        void main(){ float x = vUv.x;
          float rays = 0.55 + 0.45 * sin(x * 70.0 + sin(x * 9.0 + time * 0.4) * 4.0);
          float n = (0.5 + 0.5 * sin(x * 13.0 + time * 0.3)) * (0.5 + 0.5 * sin(x * 29.0 - time * 0.45 + sin(x * 4.0) * 2.0));
          float v = smoothstep(0.0, 0.18, vUv.y) * pow(1.0 - vUv.y, 1.6);
          float edge = smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x);
          vec3 c = mix(c1, c2, smoothstep(0.1, 0.9, vUv.y));
          gl_FragColor = vec4(c * n * rays * v * edge * amp, 1.0); ${COLORSPACE} }`,
    });
    this.auroras = [];
    const make = (r, a0, a1, y0, hgt) => {
      const segs = 80, pos = [], uv = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs, a = lerp(a0, a1, u);
        const rr = r + Math.sin(u * 7) * 3;
        const x = Math.sin(a) * rr, z = -Math.cos(a) * rr;
        pos.push(x, y0, z, x, y0 + hgt, z);
        uv.push(u, 0, u, 1);
      }
      for (let i = 0; i < segs; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -5;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.auroras.push(mesh);
    };
    make(44, -1.2, 0.9, 9, 16);
    make(52, -0.4, 1.5, 13, 18);
  }

  _floor() {
    this.floorU = { mid: { value: this.pal.mid }, hor: { value: this.pal.hor }, acc: { value: this.pal.acc }, time: { value: 0 }, beat: { value: 0 }, pulse: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.floorU, transparent: false,
      extensions: {},
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 mid, hor, acc; uniform float time, beat, pulse; varying vec2 vP;
        float gridLine(float v, float w){ float d = abs(fract(v - 0.5) - 0.5); float fw = fwidth(v) * 1.2; return 1.0 - smoothstep(w, w + fw, d); }
        void main(){
          float r = length(vP);
          if (r > 60.0) discard;
          float fade = exp(-r * 0.09);
          float g = max(gridLine(vP.x * 0.5, 0.006), gridLine(vP.y * 0.5, 0.006)) * fade * smoothstep(0.8, 3.0, r);
          float ripR = beat * 14.0;
          float rip = exp(-pow((r - ripR) * 3.0, 2.0)) * (1.0 - beat) * smoothstep(1.2, 2.5, r) * 0.6;
          vec3 base = mix(mid * 0.025, hor * 0.02, smoothstep(10.0, 40.0, r));
          float horizonGlow = smoothstep(25.0, 60.0, r);
          vec3 c = base + acc * (g * 0.1 + rip * (0.12 + 0.18 * pulse)) + hor * horizonGlow * 0.035;
          gl_FragColor = vec4(c, 1.0); ${COLORSPACE} }`,
    });
    // a grid of small triangles (not one big fan): a fan's centre vertex sits right under the
    // player's eyes, and near-plane clipping of such long triangles can corrupt depth on some GPUs
    const f = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 60, 60), m);
    f.rotation.x = -Math.PI / 2;
    f.position.y = -0.002;
    this.group.add(f);
  }

  _platform() {
    // the disc you stand on, with three lane markers for side steps
    this.platU = { acc: { value: this.pal.acc }, pulse: { value: 0 }, time: { value: 0 }, width: { value: 0.45 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.platU, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 acc; uniform float pulse, time, width; varying vec2 vP;
        void main(){ float r = length(vP / vec2(1.0 + width, 1.0));
          float edge = exp(-pow((r - 0.98) * 26.0, 2.0));
          float rings = (0.5 + 0.5 * sin(r * 60.0 - time * 1.5)) * smoothstep(0.98, 0.3, r) * 0.08;
          float inner = smoothstep(1.0, 0.0, r) * 0.12;
          float a = edge * (0.6 + 0.4 * pulse) + rings + inner;
          gl_FragColor = vec4(acc * a, a * 0.9); ${COLORSPACE} }`,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4, 18, 12), m);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.004;
    this.platform = disc;
    this.group.add(disc);

    this.laneMarks = [];
    for (let i = -1; i <= 1; i++) {
      const mk = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.17, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }));
      mk.rotation.x = -Math.PI / 2;
      mk.position.set(i * 0.45, 0.008, 0);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(i * 0.45, 0.009, 0);
      this.group.add(mk, dot);
      this.laneMarks.push({ ring: mk, dot, lane: i });
    }
    this.laneTarget = 0;
    this.laneFlash = 0;
  }

  setLaneWidth(w, enabled) {
    this.laneW = w;
    this.platU.width.value = enabled ? w * 1.1 : 0;
    for (const m of this.laneMarks) {
      m.ring.position.x = m.dot.position.x = m.lane * w;
      m.ring.visible = m.dot.visible = enabled;
    }
  }
  // highlight where the player should stand next
  showLane(lane) { this.laneTarget = lane; this.laneFlash = 1; }

  _dust() {
    const N = 260, rng = makeRng(3);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([rng.range(-5, 5), rng.range(0.2, 4), rng.range(-16, 1)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustU = { col: { value: this.pal.acc }, px: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float px; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z; vA = smoothstep(16.0, 8.0, d) * smoothstep(0.4, 2.0, d); gl_PointSize = clamp(0.03 * px / max(d, 0.1), 1.0, 12.0); }`,
      fragmentShader: `uniform vec3 col; varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float a = exp(-dot(p,p) * 4.0) * vA * 0.7; gl_FragColor = vec4(col * a, a); ${COLORSPACE} }`,
    });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.dustSpeed = 1;
  }

  _meteors() {
    this.meteors = [];
    const tex = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 16;
      const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g; c.fillRect(0, 4, 256, 8);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.18), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false;
      this.group.add(m);
      this.meteors.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }
    this.meteorRate = 0;
  }
  _launchMeteor() {
    const m = this.meteors.find((x) => x.life <= 0);
    if (!m) return;
    const x = (Math.random() - 0.5) * 70, y = 18 + Math.random() * 22, z = -40 - Math.random() * 20;
    m.mesh.position.set(x, y, z);
    m.vel.set(-(8 + Math.random() * 10) * Math.sign(x || 1), -(6 + Math.random() * 6), 0);
    m.mesh.rotation.set(0, 0, Math.atan2(m.vel.y, m.vel.x));
    m.life = 1.2;
    m.mesh.visible = true;
  }

  // beat: 0..1 phase within the current beat; level 0..4 music intensity
  update(dt, { beat = 0, level = 0, px = 1, approachSpeed = 5 } = {}) {
    this.t += dt;
    if (this.palMix < 1) {
      this.palMix = Math.min(1, this.palMix + dt / this.palDur);
      const k = this.palMix * this.palMix * (3 - 2 * this.palMix);
      for (const c in this.pal) this.pal[c].copy(this.palFrom[c]).lerp(this.palTo[c], k);
    }
    const pulse = Math.pow(1 - beat, 3);
    this.fever += (this.feverTarget - this.fever) * Math.min(1, dt * 1.5);
    const kick = level >= 0 ? pulse * (0.4 + 0.15 * level) : pulse * 0.15;
    this.skyU.time.value = this.t; this.skyU.pulse.value = kick;
    this.starU.time.value = this.t; this.starU.pulse.value = kick; this.starU.px.value = px / 1000;
    this.aurU.time.value = this.t * (1 + this.fever * 1.5);
    this.aurU.amp.value = 0.45 + 0.25 * Math.max(0, level) / 4 + this.fever * 0.9;
    this.floorU.time.value = this.t; this.floorU.beat.value = beat; this.floorU.pulse.value = kick;
    this.platU.time.value = this.t; this.platU.pulse.value = kick;
    this.planetHalo.material.color.copy(this.pal.acc);
    this.planetRing.rotation.z += dt * 0.01;
    this.dustU.px.value = px;
    // drifting dust moves toward the player with the music, never fast enough to feel like you are moving
    const sp = Math.min(3, approachSpeed * 0.35) * (1 + this.fever * 0.6);
    const a = this.dust.geometry.attributes.position, arr = a.array;
    for (let i = 2; i < arr.length; i += 3) { arr[i] += sp * dt; if (arr[i] > 1) arr[i] -= 17; }
    a.needsUpdate = true;
    // meteors
    this.meteorRate = (level >= 2 ? 0.25 : 0.05) + this.fever * 0.8;
    if (Math.random() < this.meteorRate * dt) this._launchMeteor();
    for (const m of this.meteors) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.mesh.position.addScaledVector(m.vel, dt);
      m.mesh.material.opacity = clamp(m.life, 0, 1) * 0.9;
      if (m.life <= 0) m.mesh.visible = false;
    }
    // lane markers
    this.laneFlash = Math.max(0, this.laneFlash - dt * 0.35);
    for (const m of this.laneMarks) {
      const on = m.lane === this.laneTarget;
      m.ring.material.opacity = on ? 0.55 + 0.4 * pulse : 0.16;
      m.ring.material.color.copy(on ? this.pal.acc : WHITE);
      m.dot.material.opacity = on ? 0.25 + 0.35 * this.laneFlash : 0;
      m.dot.material.color.copy(this.pal.acc);
    }
  }
}
