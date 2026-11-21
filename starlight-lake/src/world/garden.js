import * as THREE from 'three';
import { mulberry32, srgb, GLSL_DITHER, easeOutCubic } from '../util.js';
import { WATER_Y } from '../config.js';

// Things that grow with the player's progress: the floating platform, lotus flowers that
// bloom one by one as nights accumulate, and constellations the player builds in the sky.

export class Platform {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uGlow: { value: srgb(0x7fd8ff) }, uPulse: { value: 0 } };
    const geo = new THREE.CylinderGeometry(1.3, 1.36, 0.2, 96, 1);
    geo.translate(0, -0.1, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vP; varying vec3 vN;
        void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uPulse; uniform vec3 uGlow; varying vec3 vP; varying vec3 vN;
        ${GLSL_DITHER}
        void main(){
          float r = length(vP.xz);
          float a = atan(vP.z, vP.x);
          vec3 wood = vec3(0.10, 0.075, 0.07);
          float grain = 0.5 + 0.5 * sin(r * 55.0 + sin(a * 3.0) * 2.0);
          wood *= 0.8 + 0.25 * grain;
          float plank = smoothstep(0.02, 0.0, abs(fract(a * 24.0 / 6.2831853) - 0.5) - 0.48);
          wood *= 1.0 - 0.35 * plank;
          vec3 c = wood;
          if (vN.y > 0.5) {
            float ring = exp(-pow((r - 1.12) * 90.0, 2.0)) + 0.5 * exp(-pow((r - 0.5) * 120.0, 2.0));
            float rune = step(0.75, fract(a * 36.0 / 6.2831853 + 0.1 * sin(uTime * 0.2))) * exp(-pow((r - 1.02) * 60.0, 2.0));
            float breathe = 0.65 + 0.35 * sin(uTime * 0.6) + uPulse;
            c += uGlow * (ring * 0.9 + rune * 0.35) * breathe;
            c += uGlow * 0.06 * exp(-r * r * 3.0);
          } else {
            c *= 0.6;
            c += uGlow * 0.15 * exp(-pow((vP.y + 0.03) * 40.0, 2.0));
          }
          gl_FragColor = vec4(dither(c), 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
  }
  update(t, dt) {
    this.uniforms.uTime.value = t;
    this.uniforms.uPulse.value = Math.max(0, this.uniforms.uPulse.value - dt * 1.5);
  }
  pulse(v = 0.8) { this.uniforms.uPulse.value = Math.min(1.5, this.uniforms.uPulse.value + v); }
}

function petalGeometry(W = 0.07, L = 0.19) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const v = y + 0.5;
    const w = Math.sin(Math.PI * Math.pow(v, 0.8)) * 0.5 + 0.02;
    const X = x * 2 * w * W;
    const Z = -Math.pow(X / W, 2) * 0.35 * W + v * v * 0.12 * L;
    p.setXYZ(i, X, v * L, Z);
  }
  g.computeVertexNormals();
  return g;
}

export class Lotus {
  constructor(maxCount = 64) {
    this.max = maxCount;
    this.rnd = mulberry32(77);
    this.flowers = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < maxCount; i++) {
      const r = 2.4 + Math.sqrt(i) * 1.55 + this.rnd() * 0.5;
      const a = i * golden + 0.6;
      this.flowers.push({ x: Math.sin(a) * r, z: -Math.cos(a) * r, rot: this.rnd() * 6.28, scale: 0.8 + this.rnd() * 0.5, bloom: 0, target: 0, tint: this.rnd() });
    }
    this.petalsPer = 16;
    this.petals = new THREE.InstancedMesh(petalGeometry(), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        uniform float uTime; varying float vV; varying vec3 vTint;
        void main(){
          vV = position.y / 0.19;
          vTint = instanceColor;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float ph = dot(instanceMatrix[3].xz, vec2(1.3, 0.7));
          w.y += sin(uTime * 0.9 + ph) * 0.012;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        varying float vV; varying vec3 vTint;
        ${GLSL_DITHER}
        void main(){
          vec3 base = vec3(1.0, 0.86, 0.62);
          vec3 tip = mix(vec3(0.98, 0.55, 0.72), vec3(0.85, 0.75, 1.0), vTint.r);
          vec3 c = mix(base, tip, smoothstep(0.15, 1.0, vV));
          c *= 0.42 + 0.35 * (1.0 - vV);     // glow from the heart of the flower
          c *= vTint.g;                       // fade in while blooming
          gl_FragColor = vec4(dither(c), 1.0);
        }`,
    }), maxCount * this.petalsPer);
    this.petals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * this.petalsPer * 3), 3);
    this.petals.frustumCulled = false;

    const pad = new THREE.CircleGeometry(0.34, 28, 0.25, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    this.pads = new THREE.InstancedMesh(pad, new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying vec2 vL;
        void main(){ vL = position.xz / 0.34; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vL;
        ${GLSL_DITHER}
        void main(){
          float r = length(vL); float a = atan(vL.y, vL.x);
          vec3 c = vec3(0.025, 0.07, 0.05);
          c += vec3(0.02, 0.06, 0.04) * smoothstep(0.0, 0.03, abs(sin(a * 7.0)) - 0.97);
          c += vec3(0.05, 0.12, 0.10) * smoothstep(0.85, 1.0, r);
          gl_FragColor = vec4(dither(c), 1.0);
        }`,
    }), maxCount);
    this.pads.frustumCulled = false;

    const gpos = new Float32Array(maxCount * 3), gcol = new Float32Array(maxCount * 3), gseed = new Float32Array(maxCount * 3), gsize = new Float32Array(maxCount);
    this.flowers.forEach((f, i) => { gpos.set([f.x, WATER_Y + 0.1, f.z], i * 3); gseed.set([i * 0.37 % 1, 0.5, 0.5], i * 3); });
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    ggeo.setAttribute('aColor', new THREE.BufferAttribute(gcol, 3));
    ggeo.setAttribute('aSize', new THREE.BufferAttribute(gsize, 1));
    ggeo.setAttribute('aSeed', new THREE.BufferAttribute(gseed, 3));
    this.glowGeo = ggeo;
    this.glow = new THREE.Points(ggeo, new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: 14 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; attribute vec3 aSeed; uniform float uPpd, uTime; varying vec3 vC;
        void main(){
          vC = aColor * (0.8 + 0.2 * sin(uTime * 1.3 + aSeed.x * 40.0));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize / max(0.1, -mv.z) * 57.3 * uPpd, 0.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; gl_FragColor = vec4(vC * exp(-r * r * 3.5), 1.0); }`,
    }));
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 4;

    this.group = new THREE.Group();
    this.group.add(this.pads, this.petals, this.glow);
    this.count = 0;
    this.layout();
  }

  /** Show `n` flowers; the ones above `animateFrom` open slowly. */
  setCount(n, animateFrom = n) {
    this.count = Math.min(this.max, n);
    this.flowers.forEach((f, i) => {
      f.target = i < this.count ? 1 : 0;
      if (i < Math.min(animateFrom, this.count)) f.bloom = f.target;
    });
    this.layout();
  }

  layout() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = this.petals.instanceColor;
    let k = 0;
    const gcol = this.glowGeo.attributes.aColor, gsize = this.glowGeo.attributes.aSize;
    this.flowers.forEach((f, i) => {
      const b = easeOutCubic(f.bloom);
      const vis = f.target > 0 || f.bloom > 0.001 ? 1 : 0;
      for (let j = 0; j < this.petalsPer; j++) {
        const inner = j >= 9;
        const nIn = inner ? 7 : 9;
        const jj = inner ? j - 9 : j;
        const theta = f.rot + (jj / nIn) * Math.PI * 2 + (inner ? 0.35 : 0);
        const tilt = (inner ? 0.25 + b * 0.45 : 0.35 + b * 0.95);
        e.set(tilt, theta, 0, 'YXZ');
        q.setFromEuler(e);
        const sc = f.scale * (inner ? 0.78 : 1) * (0.5 + 0.5 * b) * vis;
        s.set(sc, sc, sc);
        p.set(f.x, WATER_Y + 0.02, f.z);
        m.compose(p, q, s);
        this.petals.setMatrixAt(k, m);
        col.setXYZ(k, f.tint, 0.25 + 0.75 * b * vis, 0);
        k++;
      }
      m.compose(p.set(f.x, WATER_Y + 0.005, f.z), q.setFromEuler(e.set(0, f.rot, 0)), s.setScalar(f.scale * vis));
      this.pads.setMatrixAt(i, m);
      const g = b * vis;
      gcol.setXYZ(i, 1.0 * g, 0.78 * g, 0.5 * g);
      gsize.setX(i, 0.5 * f.scale * (0.3 + 0.7 * g));
    });
    // draw only flowers that exist (instances past `count` cost nothing)
    let shown = 0;
    this.flowers.forEach((f, i) => { if (f.target > 0 || f.bloom > 0.001) shown = i + 1; });
    this.petals.count = shown * this.petalsPer;
    this.pads.count = shown;
    this.petals.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
    this.pads.instanceMatrix.needsUpdate = true;
    gcol.needsUpdate = true; gsize.needsUpdate = true;
  }

  update(t, dt, ppd) {
    this.petals.material.uniforms.uTime.value = t;
    this.glow.material.uniforms.uTime.value = t;
    this.glow.material.uniforms.uPpd.value = ppd;
    let changed = false;
    for (const f of this.flowers) {
      if (f.bloom !== f.target) {
        f.bloom += Math.sign(f.target - f.bloom) * dt / 6;   // a slow, six-second bloom
        if (Math.abs(f.bloom - f.target) < 0.01) f.bloom = f.target;
        f.bloom = Math.max(0, Math.min(1, f.bloom));
        changed = true;
      }
    }
    if (changed) this.layout();
  }
}

/** Constellations: each one is earned with correct answers at the star gates and stays in the sky. */
export class Constellations {
  constructor() {
    this.group = new THREE.Group();
    this.N_STARS = 9;
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.current = null;
  }

  layoutFor(seed) {
    const r = mulberry32(seed);
    const az = r() * Math.PI * 2, el = (25 + r() * 40) * Math.PI / 180;
    const stars = [];
    for (let i = 0; i < this.N_STARS; i++) {
      const da = (r() - 0.5) * 0.32, de = (r() - 0.5) * 0.22;
      const a = az + da / Math.cos(el), e = el + de;
      stars.push(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(760));
    }
    // a simple chain through nearest unvisited stars, which looks like a hand-drawn figure
    const order = [0]; const used = new Set([0]);
    while (order.length < stars.length) {
      const last = stars[order[order.length - 1]];
      let best = -1, bd = Infinity;
      stars.forEach((s, i) => { if (!used.has(i)) { const d = s.distanceToSquared(last); if (d < bd) { bd = d; best = i; } } });
      order.push(best); used.add(best);
    }
    return order.map((i) => stars[i]);
  }

  makeFigure(seed, shown) {
    const pts = this.layoutFor(seed);
    const g = new THREE.Group();
    const pgeo = new THREE.BufferGeometry().setFromPoints(pts);
    const sizes = new Float32Array(pts.length).fill(0);
    pgeo.setAttribute('aOn', new THREE.BufferAttribute(sizes, 1));
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uPpd: { value: 14 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aOn; uniform float uPpd, uTime; varying float vOn;
        void main(){
          vOn = aOn;
          gl_PointSize = aOn * uPpd * (0.55 + 0.08 * sin(uTime * 2.0 + position.x));
          vec4 q = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = q.xyww;
        }`,
      fragmentShader: /* glsl */`
        varying float vOn;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * (exp(-r * r * 6.0) + 0.3 * exp(-r * r * 1.5)) * min(1.0, vOn), 1.0); }`,
    });
    const points = new THREE.Points(pgeo, pmat);
    points.frustumCulled = false; points.renderOrder = -85;
    const lgeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(lgeo, this.lineMat);
    line.frustumCulled = false; line.renderOrder = -86;
    lgeo.setDrawRange(0, 0);
    g.add(line, points);
    const fig = { seed, g, points, line, pts, shown: 0 };
    for (let i = 0; i < shown; i++) this.reveal(fig);
    if (shown >= this.N_STARS) lgeo.setDrawRange(0, pts.length);
    this.group.add(g);
    return fig;
  }

  reveal(fig) {
    if (fig.shown >= fig.pts.length) return;
    fig.points.geometry.attributes.aOn.setX(fig.shown, 1);
    fig.points.geometry.attributes.aOn.needsUpdate = true;
    fig.shown++;
    fig.line.geometry.setDrawRange(0, fig.shown);
  }

  load(list) {
    for (const c of list) this.makeFigure(c.seed, this.N_STARS);
  }

  /** Adds one star to the constellation in progress. Returns the seed when one is completed. */
  addStar() {
    if (!this.current) this.current = this.makeFigure(Math.floor(Math.random() * 1e9), 0);
    this.reveal(this.current);
    if (this.current.shown >= this.N_STARS) {
      const seed = this.current.seed;
      this.current = null;
      return seed;
    }
    return null;
  }

  /** World-space direction of the newest star (for the flying-star effect). */
  nextStarDir() {
    if (!this.current) return null;
    const p = this.current.pts[Math.min(this.current.shown, this.current.pts.length - 1)];
    return p.clone().normalize();
  }

  update(t, ppd, head) {
    this.group.position.copy(head);
    for (const c of this.group.children) {
      const pts = c.children[1];
      pts.material.uniforms.uTime.value = t;
      pts.material.uniforms.uPpd.value = ppd;
    }
  }
}
