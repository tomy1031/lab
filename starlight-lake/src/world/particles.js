import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { WATER_Y } from '../config.js';

// Fireflies drifting over the water and paper lanterns floating far out on the lake.
// Both are GPU-animated point sprites with mirrored copies for the reflection.

const POINT_VS = /* glsl */`
  attribute vec3 aSeed; attribute float aSize; attribute vec3 aColor;
  uniform float uTime, uPpd, uMirror, uKind, uCount;
  varying vec3 vColor; varying float vA;
  void main(){
    vec3 p = position;
    float t = uTime;
    float id = aSeed.x * 100.0;
    if (uKind < 0.5) {
      // fireflies: lazy 3D lissajous drift and a slow blink
      p += vec3(sin(t * (0.21 + aSeed.y * 0.2) + id) * 1.6, sin(t * (0.33 + aSeed.z * 0.2) + id * 1.7) * 0.45, cos(t * (0.17 + aSeed.x * 0.2) + id * 0.7) * 1.6);
      float blink = pow(0.5 + 0.5 * sin(t * (0.8 + aSeed.z * 1.4) + id * 3.1), 5.0);
      vA = 0.12 + 0.88 * blink;
    } else {
      // lanterns: bob on the water and drift slowly around the lake
      float a = t * 0.004 * (0.5 + aSeed.y) ;
      float c = cos(a), s = sin(a);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p.y += sin(t * 0.7 + id) * 0.05;
      vA = 0.85 + 0.15 * sin(t * 2.3 + id * 5.0);
    }
    if (uMirror > 0.5) { p.y = 2.0 * ${WATER_Y.toFixed(3)} - p.y; vA *= 0.4; }
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(0.1, -mv.z);
    gl_PointSize = clamp(aSize / dist * 57.2958 * uPpd, 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }`;

const POINT_FS = /* glsl */`
  uniform float uAlpha; uniform float uKind; varying vec3 vColor; varying float vA;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float core = exp(-r * r * (uKind < 0.5 ? 9.0 : 5.0));
    float halo = exp(-r * r * 2.2) * 0.35;
    gl_FragColor = vec4(vColor * (core + halo) * vA * uAlpha, 1.0);
  }`;

function makePoints({ count, kind, ppd, place, color, size }) {
  const rnd = mulberry32(kind === 0 ? 31 : 47);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 3), sz = new Float32Array(count), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos.set(place(rnd), i * 3);
    seed.set([rnd(), rnd(), rnd()], i * 3);
    sz[i] = size(rnd);
    col.set(color(rnd), i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mk = (mirror) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPpd: { value: ppd }, uMirror: { value: mirror ? 1 : 0 }, uKind: { value: kind }, uAlpha: { value: 1 } },
      vertexShader: POINT_VS, fragmentShader: POINT_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    p.renderOrder = mirror ? -45 : 5;
    return p;
  };
  return [mk(false), mk(true)];
}

export class Particles {
  constructor(ppd) {
    this.group = new THREE.Group();
    this.fireflies = makePoints({
      count: 320, kind: 0, ppd,
      place: (r) => { const a = r() * Math.PI * 2, d = 3 + Math.pow(r(), 0.8) * 32; return [Math.sin(a) * d, 0.2 + r() * 4.5, -Math.cos(a) * d]; },
      size: (r) => 0.035 + r() * 0.04,
      color: (r) => (r() < 0.8 ? [0.85, 1.0, 0.45] : [1.0, 0.85, 0.45]),
    });
    this.lanterns = makePoints({
      count: 36, kind: 1, ppd,
      place: (r) => { const a = (r() - 0.5) * Math.PI * 1.6, d = 24 + r() * 80; return [Math.sin(a) * d, WATER_Y + 0.25, -Math.cos(a) * d]; },
      size: (r) => 0.45 + r() * 0.25,
      color: (r) => [1.0, 0.62 + r() * 0.15, 0.30],
    });
    this.all = [...this.fireflies, ...this.lanterns];
    for (const p of this.all) this.group.add(p);
  }
  setPpd(ppd) { for (const p of this.all) p.material.uniforms.uPpd.value = ppd; }
  set fireflyAlpha(a) { for (const p of this.fireflies) p.material.uniforms.uAlpha.value = a; }
  update(t) { for (const p of this.all) p.material.uniforms.uTime.value = t; }
}
