import * as THREE from 'three';
import { srgb, mulberry32, GLSL_DITHER } from '../util.js';
import { WATER_Y } from '../config.js';

// Layered mountain silhouettes around the lake, each with a mirrored copy under the water.
// Mist at their feet and aerial perspective toward the horizon colour give depth.

const RINGS = [
  { r: 210, amp: 34, base: 10, seed: 3, shade: 0.0 },
  { r: 330, amp: 70, base: 18, seed: 9, shade: 0.35 },
  { r: 520, amp: 120, base: 30, seed: 21, shade: 0.65 },
];

export class Terrain {
  constructor(moonAzimuth) {
    this.group = new THREE.Group();
    this.uniforms = {
      uHorizon: { value: srgb(0x3a4a8a) },
      uRock: { value: srgb(0x0a0f22) },
      uRim: { value: srgb(0x6a7ab0) },
      uMist: { value: 0.5 },
      uTime: { value: 0 },
    };
    this.mats = [];
    for (const ring of RINGS) {
      const geo = this.ringGeometry(ring, moonAzimuth);
      for (const mirror of [false, true]) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { ...this.uniforms, uShade: { value: ring.shade }, uMirror: { value: mirror ? 1 : 0 } },
          side: THREE.DoubleSide,
          vertexShader: /* glsl */`
            attribute float aH; uniform float uMirror, uTime;
            varying float vH; varying float vY;
            void main(){
              vH = aH;
              vec3 p = position;
              if (uMirror > 0.5) {
                float y = p.y - ${WATER_Y.toFixed(3)};
                p.y = ${WATER_Y.toFixed(3)} - y;
                p.x += sin(y * 0.35 + uTime * 0.6) * 0.6;   // ripples shiver the reflection
              }
              vY = position.y - ${WATER_Y.toFixed(3)};
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
          fragmentShader: /* glsl */`
            uniform vec3 uHorizon, uRock, uRim; uniform float uShade, uMist, uMirror;
            varying float vH; varying float vY;
            ${GLSL_DITHER}
            void main(){
              vec3 c = mix(uRock, uHorizon, uShade * 0.75);
              c += uRim * 0.18 * smoothstep(0.75, 1.0, vH);            // faint skylit ridge
              float mist = exp(-vY * (0.05 + uShade * 0.02)) * uMist;   // mist hugging the water
              c = mix(c, uHorizon * 1.05, clamp(mist, 0.0, 0.85));
              if (uMirror > 0.5) c *= 0.62;
              gl_FragColor = vec4(dither(c), 1.0);
            }`,
        });
        this.mats.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = mirror ? -60 : -50 + ring.shade;
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
    }
  }

  ringGeometry(ring, moonAz) {
    const rnd = mulberry32(ring.seed);
    const N = 512;
    const ph = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
    const pos = new Float32Array((N + 1) * 2 * 3), h = new Float32Array((N + 1) * 2);
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let n = 0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.18 * Math.sin(a * 7 + ph[1]) + 0.12 * Math.sin(a * 13 + ph[2])
        + 0.07 * Math.abs(Math.sin(a * 29 + ph[3])) + 0.04 * Math.abs(Math.sin(a * 61 + ph[4])) + 0.02 * Math.sin(a * 127 + ph[5]);
      // open a gentle valley under the moon so it rises over the water
      let d = Math.atan2(Math.sin(a - moonAz), Math.cos(a - moonAz));
      n *= 1 - 0.55 * Math.exp(-(d * d) / 0.18);
      const top = WATER_Y + ring.base * 0.3 + ring.amp * Math.max(0.05, n);
      const x = Math.sin(a) * ring.r, z = -Math.cos(a) * ring.r;
      pos.set([x, WATER_Y, z, x, top, z], i * 6);
      h.set([0, 1], i * 2);
      if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aH', new THREE.BufferAttribute(h, 1));
    geo.setIndex(idx);
    return geo;
  }

  update(t) { this.uniforms.uTime.value = t; }
}
