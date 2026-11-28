// js/env.js — the space you stand in: "the bulk". A dark sky with a faint nebula and stars, a lattice of
// thin lines that recedes in every direction (it gives your eyes parallax, so the void reads as space and not
// as a black wall) and a round platform under your feet so standing in VR feels safe.
import * as THREE from 'three';

const SKY_V = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_F = /* glsl */ `
uniform float uTime;
uniform vec3 uTint;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 deep = vec3(0.012, 0.016, 0.045);
  vec3 band = vec3(0.05, 0.035, 0.11);
  vec3 col = mix(band, deep, smoothstep(-0.2, 0.7, abs(h)));
  float n = fbm(d * 2.6 + vec3(0.0, uTime * 0.004, 0.0));
  float n2 = fbm(d * 5.0 - vec3(uTime * 0.003));
  col += uTint * pow(n, 3.0) * 0.55;
  col += vec3(0.35, 0.18, 0.08) * pow(n2, 5.0) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Bulk {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color('#3b4fb8') } },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.group.add(sky);
    // stars
    const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 600;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
      const warm = rnd();
      const b = 0.45 + rnd() * 0.55;
      col.set(warm > 0.8 ? [b, b * 0.8, b * 0.6] : warm < 0.25 ? [b * 0.7, b * 0.8, b] : [b, b, b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
    // the lattice: lines every 4 m, fading out with distance
    const lp = [];
    const R = 7, S = 4;
    for (let a = -R; a <= R; a++) {
      for (let b = -R; b <= R; b++) {
        if (Math.abs(a) + Math.abs(b) > R * 1.2) continue;
        lp.push(-R * S, a * S - 0.02, b * S, R * S, a * S - 0.02, b * S); // along x
        lp.push(a * S, -R * S, b * S, a * S, R * S, b * S); // along y
        lp.push(a * S, b * S - 0.02, -R * S, a * S, b * S - 0.02, R * S); // along z
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.latticeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#6f86ff') }, uOpacity: { value: 0.22 } },
      vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vD; void main(){ float a = uOpacity * smoothstep(30.0, 4.0, vD) * smoothstep(0.6, 2.5, vD); gl_FragColor = vec4(uColor, a); }',
    });
    this.lattice = new THREE.LineSegments(lg, this.latticeMat);
    this.lattice.frustumCulled = false;
    this.group.add(this.lattice);
    // the platform
    this.platform = new THREE.Group();
    const discMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vP;
        void main(){
          float r = length(vP);
          float rings = smoothstep(0.012, 0.0, abs(fract(r * 2.0 - uTime * 0.05) - 0.5) - 0.47);
          float edge = smoothstep(0.03, 0.0, abs(r - 1.48));
          float fill = 0.55 * smoothstep(1.5, 0.2, r);
          vec3 c = vec3(0.05, 0.06, 0.12) * fill + vec3(0.35, 0.45, 1.0) * (rings * 0.18 + edge * 0.7);
          gl_FragColor = vec4(c, max(fill * 0.9, edge * 0.8 + rings * 0.2) * smoothstep(1.52, 1.45, r) + edge * 0.6);
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.52, 96), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.001;
    this.discMat = discMat;
    this.platform.add(disc);
    this.group.add(this.platform);
    // light
    this.hemi = new THREE.HemisphereLight('#c9d4ff', '#251a36', 1.1);
    this.sun = new THREE.DirectionalLight('#fff2df', 1.6);
    this.sun.position.set(2, 5, 3);
    this.group.add(this.hemi, this.sun);
  }

  // 'hub' (lattice + platform) or 'tesseract' (the chapter draws its own space)
  setMode(mode) {
    this.lattice.visible = mode !== 'tesseract';
    this.platform.visible = mode !== 'tesseract';
  }

  update(t) {
    this.skyMat.uniforms.uTime.value = t;
    this.discMat.uniforms.uTime.value = t;
  }
}
