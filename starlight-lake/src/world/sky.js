import * as THREE from 'three';
import { srgb, mulberry32, GLSL_DITHER } from '../util.js';
import { WATER_Y } from '../config.js';

// Sky dome (gradient, dusk/dawn glow, moon halo, milky way), star field, moon and aurora.
// The dome's lower half shows the mirrored sky: together with the mirrored geometry under the
// transparent water this gives a calm mirror-lake reflection without any render-to-texture.

export class Sky {
  constructor(noiseTex, ppd) {
    this.group = new THREE.Group();          // follows the head (things at "infinity")
    this.worldGroup = new THREE.Group();     // fixed in the world (aurora is at a finite distance)
    this.moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 21), THREE.MathUtils.degToRad(160)).normalize();
    // setFromSphericalCoords(r, phi from +y, theta around y from +z). theta 160deg -> slightly right of -z.
    this.uniforms = {
      uZenith: { value: srgb(0x0b1335) },
      uHorizon: { value: srgb(0x3a4a8a) },
      uGlowColor: { value: srgb(0xff9a6a) },
      uGlowDir: { value: new THREE.Vector3(-0.9, 0, -0.45).normalize() },
      uGlow: { value: 0.0 },
      uMoonDir: { value: this.moonDir },
      uMoonGlow: { value: 1.0 },
      uMilky: { value: 0.6 },
      uMilkyAxis: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() },
      uWaterTint: { value: srgb(0x8890a8) },
      uNoise: { value: noiseTex },
      uTime: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main(){
            vDir = position;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uZenith, uHorizon, uGlowColor, uGlowDir, uMoonDir, uMilkyAxis, uWaterTint;
          uniform float uGlow, uMoonGlow, uMilky, uTime;
          uniform sampler2D uNoise;
          varying vec3 vDir;
          ${GLSL_DITHER}
          vec3 skyColor(vec3 d){
            float y = max(d.y, 0.0);
            vec3 c = mix(uHorizon, uZenith, pow(y, 0.42));
            vec2 hd = normalize(d.xz + 1e-5);
            float g = max(dot(hd, normalize(uGlowDir.xz)), 0.0);
            c += uGlowColor * uGlow * (pow(g, 2.5) * exp(-y * 5.0) + 0.25 * pow(g, 8.0) * exp(-y * 1.5));
            c += uHorizon * 0.18 * exp(-y * 28.0);
            float m = max(dot(d, uMoonDir), 0.0);
            c += vec3(0.50, 0.58, 0.78) * (pow(m, 24.0) * 0.16 + pow(m, 260.0) * 0.35) * uMoonGlow;
            float band = dot(d, uMilkyAxis);
            float n = texture2D(uNoise, vec2(atan(d.z, d.x) * 0.45, d.y * 0.7 + band)).r;
            float mw = exp(-band * band * 30.0) * smoothstep(0.35, 0.8, n) * smoothstep(0.0, 0.25, y);
            c += vec3(0.30, 0.33, 0.50) * mw * uMilky * 0.35;
            return c;
          }
          void main(){
            vec3 d = normalize(vDir);
            vec3 c = d.y >= 0.0 ? skyColor(d) : skyColor(vec3(d.x, -d.y, d.z)) * uWaterTint;
            gl_FragColor = vec4(dither(c), 1.0);
          }`,
      }),
    );
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    this.group.add(dome);

    this.stars = this.makeStars(ppd);
    this.group.add(this.stars.points, this.stars.mirror);

    this.moon = this.makeMoon();
    this.group.add(this.moon.disc, this.moon.mirror);

    this.aurora = this.makeAurora(noiseTex);
    this.worldGroup.add(this.aurora.group);
  }

  makeStars(ppd) {
    const rnd = mulberry32(11);
    const N = 3200;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3), ph = new Float32Array(N);
    const axis = new THREE.Vector3(0.35, 0.55, 0.75).normalize();
    const v = new THREE.Vector3();
    let i = 0;
    while (i < N) {
      v.set(rnd() * 2 - 1, rnd(), rnd() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
      v.normalize();
      if (v.y < 0.02) continue;
      // concentrate a share of faint stars along the milky way band
      const band = Math.abs(v.dot(axis));
      if (i > N * 0.55 && band > 0.18) continue;
      pos.set([v.x * 800, v.y * 800, v.z * 800], i * 3);
      const mag = Math.pow(rnd(), 3.2);
      size[i] = 0.05 + mag * 0.2;              // degrees
      const t = rnd();
      const c = t < 0.15 ? [1.0, 0.82, 0.68] : t < 0.4 ? [0.78, 0.86, 1.0] : [0.95, 0.96, 1.0];
      const b = 0.35 + mag * 0.65;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      ph[i] = rnd() * 100;
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const make = (mirror) => {
      const uniforms = { uTime: { value: 0 }, uAlpha: { value: 1 }, uPpd: { value: ppd }, uMirror: { value: mirror ? 1 : 0 } };
      const m = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute float aSize; attribute vec3 aColor; attribute float aPhase;
          uniform float uTime, uPpd, uMirror;
          varying vec3 vColor; varying float vTw;
          void main(){
            vec3 p = position; if (uMirror > 0.5) p.y = -p.y;
            float tw = 0.75 + 0.25 * sin(uTime * (1.3 + fract(aPhase) * 2.5) + aPhase);
            vTw = tw * (uMirror > 0.5 ? 0.35 : 1.0);
            vColor = aColor;
            gl_PointSize = max(1.5, aSize * uPpd * (0.8 + 0.4 * tw));
            vec4 q = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            gl_Position = q.xyww;
          }`,
        fragmentShader: /* glsl */`
          uniform float uAlpha; varying vec3 vColor; varying float vTw;
          void main(){
            vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
            float a = exp(-r * r * 4.0);
            gl_FragColor = vec4(vColor * a * vTw * uAlpha, 1.0);
          }`,
      });
      const p = new THREE.Points(geo, m);
      p.renderOrder = -90; p.frustumCulled = false;
      return p;
    };
    const points = make(false), mirror = make(true);
    return { points, mirror, set alpha(a) { points.material.uniforms.uAlpha.value = a; mirror.material.uniforms.uAlpha.value = a; },
      tick(t) { points.material.uniforms.uTime.value = t; mirror.material.uniforms.uTime.value = t; },
      setPpd(p) { points.material.uniforms.uPpd.value = p; mirror.material.uniforms.uPpd.value = p; } };
  }

  makeMoon() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const rnd = mulberry32(5);
    const grad = g.createRadialGradient(118, 112, 10, 128, 128, 120);
    grad.addColorStop(0, '#fffaf0'); grad.addColorStop(0.8, '#ece6d6'); grad.addColorStop(1, '#d9d2c2');
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 26; i++) {
      const r = 6 + rnd() * 22, a = rnd() * Math.PI * 2, d = rnd() * 95;
      g.fillStyle = `rgba(150,145,140,${0.08 + rnd() * 0.12})`;
      g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mk = (mirror) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, fog: false, opacity: mirror ? 0.45 : 1,
        color: mirror ? 0xb8c4dd : 0xffffff,
      }));
      const s = 800 * Math.tan(THREE.MathUtils.degToRad(1.6));
      m.scale.set(s, s, 1);
      const d = this.moonDir.clone(); if (mirror) d.y = -d.y;
      m.position.copy(d.multiplyScalar(800));
      m.lookAt(0, 0, 0);
      m.renderOrder = -80;
      return m;
    };
    return { disc: mk(false), mirror: mk(true) };
  }

  makeAurora(noiseTex) {
    const group = new THREE.Group();
    const uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 }, uNoise: { value: noiseTex } };
    const ribbons = [
      // all ribbons stay behind the farthest mountains (r = 520) so ridges always occlude them
      { a0: -0.95, a1: 0.25, r: 640, y0: 72, h: 280, seed: 1 },
      { a0: -0.55, a1: 0.65, r: 720, y0: 104, h: 310, seed: 2 },
      { a0: -1.35, a1: -0.25, r: 790, y0: 90, h: 230, seed: 3 },
    ];
    const mats = [];
    for (const rb of ribbons) {
      const N = 96;
      const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2);
      const idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = rb.a0 + (rb.a1 - rb.a0) * t;   // angle around y; 0 = straight ahead (-z)
        const r = rb.r + Math.sin(t * 7 + rb.seed) * 40 + Math.sin(t * 17 + rb.seed * 3) * 12;
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        const hh = rb.h * (0.75 + 0.25 * Math.sin(t * 5 + rb.seed));
        pos.set([x, rb.y0, z, x, rb.y0 + hh, z], i * 6);
        uv.set([t, 0, t, 1], i * 4);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      for (const mirror of [false, true]) {
        const m = new THREE.ShaderMaterial({
          uniforms: { ...uniforms, uSeed: { value: rb.seed }, uMirror: { value: mirror ? 1 : 0 } },
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          vertexShader: /* glsl */`
            uniform float uTime, uSeed, uMirror; varying vec2 vUv;
            void main(){
              vUv = uv;
              vec3 p = position;
              float w = sin(uv.x * 9.0 + uTime * 0.11 + uSeed) * 18.0 + sin(uv.x * 23.0 - uTime * 0.07) * 6.0;
              p.x += w * cos(uv.x * 3.0); p.z += w * sin(uv.x * 3.0);
              if (uMirror > 0.5) p.y = 2.0 * ${WATER_Y.toFixed(3)} - p.y;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
          fragmentShader: /* glsl */`
            uniform float uTime, uIntensity, uSeed, uMirror; uniform sampler2D uNoise; varying vec2 vUv;
            void main(){
              float r1 = texture2D(uNoise, vec2(vUv.x * 5.0 + uTime * 0.006 + uSeed, 0.13)).r;
              float r2 = texture2D(uNoise, vec2(vUv.x * 21.0 - uTime * 0.017, 0.57 + uSeed * 0.1)).g;
              float rays = smoothstep(0.3, 0.75, r1) * (0.55 + 0.9 * r2);
              float v = vUv.y;
              float curtain = smoothstep(0.0, 0.12, v) * pow(1.0 - v, 1.6);
              float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
              vec3 col = mix(vec3(0.10, 0.95, 0.55), vec3(0.55, 0.25, 0.95), smoothstep(0.35, 0.95, v));
              col = mix(col, vec3(0.2, 1.0, 0.8), 0.25 * r2);
              float a = curtain * edge * rays * uIntensity * (uMirror > 0.5 ? 0.28 : 0.55);
              gl_FragColor = vec4(col * a, 1.0);
            }`,
        });
        mats.push(m);
        const mesh = new THREE.Mesh(geo, m);
        mesh.frustumCulled = false;
        mesh.renderOrder = -70;
        group.add(mesh);
      }
    }
    return {
      group,
      set intensity(v) { for (const m of mats) m.uniforms.uIntensity.value = v; },
      tick(t) { for (const m of mats) m.uniforms.uTime.value = t; },
    };
  }

  update(t, head) {
    this.group.position.copy(head);
    this.uniforms.uTime.value = t;
    this.stars.tick(t);
    this.aurora.tick(t);
  }
}
