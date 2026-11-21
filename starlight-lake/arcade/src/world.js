import * as THREE from 'three';
import { makeNoiseTexture, mulberry32, sph } from '../../src/util.js';

// A bright sky playground: a floating stage above a sea of clouds, islands with round trees,
// hot-air balloons and a rainbow. Things sit at many distances (3 m to 600 m) so depth is easy
// to feel, and the daylight keeps everything easy to see.

const raw = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

export class ArcadeWorld {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.sky = new THREE.Group();
    const noise = makeNoiseTexture(256, 3);
    this.noise = noise;
    const rnd = mulberry32(99);
    this.sunDir = sph(35, 28, 1).normalize();

    // sky dome
    this.skyU = { uSun: { value: this.sunDir }, uTime: { value: 0 }, uNoise: { value: noise }, uMood: { value: 0 } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */`
        uniform vec3 uSun; uniform float uTime, uMood; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD); float y = d.y;
          vec3 zen = mix(vec3(0.22, 0.55, 0.98), vec3(0.45, 0.32, 0.85), uMood);
          vec3 mid = mix(vec3(0.55, 0.8, 1.0), vec3(0.95, 0.6, 0.85), uMood);
          vec3 hor = mix(vec3(1.0, 0.9, 0.82), vec3(1.0, 0.82, 0.7), uMood);
          vec3 c = y > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.25, y)), zen, smoothstep(0.2, 0.9, y)) : mix(hor, vec3(0.93, 0.9, 1.0), smoothstep(0.0, -0.3, y));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 1.5 + pow(s, 30.0) * 0.25 + pow(s, 6.0) * 0.08);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    dome.renderOrder = -100; dome.frustumCulled = false;
    this.sky.add(dome);

    // sea of clouds far below
    const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: noise }, uTime: this.skyU.uTime },
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`
        uniform sampler2D uNoise; uniform float uTime; varying vec3 vW;
        void main(){
          vec2 q = vW.xz * 0.004 + vec2(uTime * 0.002, 0.0);
          float n = texture2D(uNoise, q).r * 0.6 + texture2D(uNoise, q * 3.1 + 0.3).g * 0.4;
          float puff = smoothstep(0.35, 0.75, n);
          vec3 c = mix(vec3(0.78, 0.8, 0.95), vec3(1.0, 0.99, 0.97), puff);
          float d = length(vW.xz - cameraPosition.xz);
          c = mix(c, vec3(1.0, 0.92, 0.86), smoothstep(150.0, 800.0, d));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sea.position.y = -18;
    sea.renderOrder = -60; sea.frustumCulled = false;
    this.group.add(sea);

    // lights for the low-poly props
    this.group.add(new THREE.HemisphereLight(0xdff0ff, 0xffe8d6, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.copy(this.sunDir).multiplyScalar(100);
    this.group.add(sun);

    // puffy clouds: soft sprites at many distances
    const cloudTex = this.cloudTexture();
    this.clouds = [];
    for (let i = 0; i < 26; i++) {
      const az = rnd() * 360, d = 30 + Math.pow(rnd(), 1.3) * 520, el = -6 + rnd() * 22;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.95, color: 0xffffff }));
      const p = sph(az, el, d);
      m.position.copy(p);
      const s = (0.18 + rnd() * 0.22) * d;
      m.scale.set(s * 1.8, s, 1);
      m.renderOrder = -40;
      this.clouds.push({ m, speed: 0.4 + rnd() * 0.8 });
      this.group.add(m);
    }

    // floating islands with round trees, near to far
    this.islands = [];
    const isl = [[-35, 14, -2.5, 1.0], [40, 22, -1.5, 1.4], [-70, 45, 2, 2.5], [75, 70, 6, 3.5], [10, 120, 10, 5], [-15, 260, 18, 9], [140, 90, 0, 4], [-140, 60, 4, 3]];
    for (const [az, d, y, s] of isl) {
      const g = this.island(rnd, s);
      const p = sph(az, 0, d); g.position.set(p.x, y, p.z);
      this.islands.push({ g, y, ph: rnd() * 6.28 });
      this.group.add(g);
    }
    // hot-air balloons
    this.balloons = [];
    const cols = [0xff6fa8, 0x3fb8ff, 0xffb52e, 0x4fcf6f, 0x9a7bff];
    for (let i = 0; i < 6; i++) {
      const g = this.balloon(cols[i % cols.length], rnd);
      const az = -80 + i * 32 + rnd() * 10, d = 40 + rnd() * 220;
      const p = sph(az, 0, d); g.position.set(p.x, 6 + rnd() * 30, p.z);
      g.scale.setScalar(1 + d / 60);
      this.balloons.push({ g, ph: rnd() * 6.28, base: g.position.clone() });
      this.group.add(g);
    }
    // rainbow far away
    const rainbow = new THREE.Mesh(new THREE.TorusGeometry(380, 22, 8, 96, Math.PI), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        varying vec3 vP;
        void main(){
          float r = (length(vP.xy) - 358.0) / 44.0;
          vec3 c = 0.5 + 0.5 * cos(6.2831 * (r * 0.8 + vec3(0.0, 0.33, 0.67)));
          float a = smoothstep(0.0, 0.15, r) * smoothstep(1.0, 0.85, r) * 0.32;
          gl_FragColor = vec4(c, a);
        }`,
    }));
    const rp = sph(-25, 0, 620);
    rainbow.position.set(rp.x, -40, rp.z);
    rainbow.lookAt(0, -40, 0);
    rainbow.renderOrder = -50;
    this.group.add(rainbow);

    // the stage under the player
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.3, 64, 1), new THREE.ShaderMaterial({
      uniforms: { uTime: this.skyU.uTime, uPulse: { value: 0 }, uColor: { value: raw(0xff6fa8) } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime, uPulse; uniform vec3 uColor; varying vec3 vP; varying vec3 vN;
        void main(){
          float r = length(vP.xz);
          vec3 c = vec3(0.96, 0.97, 1.0);
          if (vN.y > 0.5) {
            float rings = smoothstep(0.035, 0.0, abs(fract(r * 2.0 - uTime * 0.3) - 0.5) - 0.44);
            vec3 hue = 0.6 + 0.4 * cos(6.2831 * (r * 0.4 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
            c = mix(c, hue, rings * (0.5 + uPulse));
            c = mix(c, uColor, smoothstep(1.42, 1.48, r) * 0.9);
          } else c = mix(vec3(0.75, 0.8, 0.95), uColor, 0.3);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    stage.position.y = -0.15;
    this.stage = stage;
    this.group.add(stage);
  }

  cloudTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 144;
    const g = c.getContext('2d');
    const rnd = mulberry32(7);
    for (let i = 0; i < 16; i++) {
      const x = 50 + rnd() * 156, y = 60 + rnd() * 40 - Math.abs(x - 128) * 0.15, r = 22 + rnd() * 30;
      const grad = g.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.7, 'rgba(250,248,255,0.95)'); grad.addColorStop(1, 'rgba(235,235,255,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  island(rnd, s) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(2.2 * s, 3.2 * s, 7), new THREE.MeshLambertMaterial({ color: 0xc9a27e, flatShading: true }));
    rock.rotation.x = Math.PI; rock.position.y = -1.6 * s;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(2.25 * s, 2.2 * s, 0.4 * s, 9), new THREE.MeshLambertMaterial({ color: 0x7ee08a, flatShading: true }));
    g.add(rock, grass);
    const leafCols = [0x4fcf6f, 0xffa0c8, 0x8be07c, 0xffd06a];
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, r = rnd() * 1.4 * s;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 1.0 * s, 6), new THREE.MeshLambertMaterial({ color: 0x9a6b4f }));
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry((0.55 + rnd() * 0.3) * s, 0), new THREE.MeshLambertMaterial({ color: leafCols[Math.floor(rnd() * leafCols.length)], flatShading: true }));
      trunk.position.set(Math.cos(a) * r, 0.65 * s, Math.sin(a) * r);
      top.position.set(Math.cos(a) * r, 1.4 * s, Math.sin(a) * r);
      g.add(trunk, top);
    }
    return g;
  }

  balloon(color, rnd) {
    const g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshLambertMaterial({ color, flatShading: true }));
    env.scale.set(1, 1.15, 1);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.01, 12, 10, 0, Math.PI * 2, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    stripe.scale.set(1, 1.15, 1);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshLambertMaterial({ color: 0x9a6b4f }));
    basket.position.y = -1.6;
    g.add(env, stripe, basket);
    return g;
  }

  /** Brief celebration light on the stage. */
  pulse(v = 0.8) { this.stage.material.uniforms.uPulse.value = Math.min(1.5, this.stage.material.uniforms.uPulse.value + v); }
  setAccent(hex) { this.stage.material.uniforms.uColor.value.setHex(hex, THREE.LinearSRGBColorSpace); }

  update(t, dt, head) {
    this.skyU.uTime.value = t;
    this.sky.position.copy(head);
    const su = this.stage.material.uniforms;
    su.uPulse.value = Math.max(0, su.uPulse.value - dt * 1.5);
    for (const c of this.clouds) {
      const p = c.m.position;
      const a = c.speed * dt * 0.002;
      const x = p.x * Math.cos(a) - p.z * Math.sin(a), z = p.x * Math.sin(a) + p.z * Math.cos(a);
      p.x = x; p.z = z;
    }
    for (const i of this.islands) { i.g.position.y = i.y + Math.sin(t * 0.5 + i.ph) * 0.3; i.g.rotation.y += dt * 0.02; }
    for (const b of this.balloons) { b.g.position.y = b.base.y + Math.sin(t * 0.3 + b.ph) * 1.5; }
  }
}
