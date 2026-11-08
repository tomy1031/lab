import * as THREE from 'three';
import { srgb, GLSL_DITHER } from '../util.js';
import { WATER_Y } from '../config.js';

// The lake: a transparent surface over the mirrored world. Fresnel decides how much of the
// reflection shows; two scrolling noise layers make slow ripples and a glittering moon path.

/**
 * Polar grid with geometrically growing rings. A plain circle fan has 800 m long slivers that
 * interpolate poorly on some GPUs (visible as radial bands); small near triangles avoid that.
 */
function lakeGeometry() {
  const radii = [0];
  for (let r = 0.4; r < 800; r *= 1.16) radii.push(r);
  radii.push(800);
  const seg = 128;
  const pos = [], idx = [];
  for (let i = 0; i < radii.length; i++) {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * radii[i], 0, -Math.cos(a) * radii[i]);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);   // counter-clockwise seen from above
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Water {
  constructor(noiseTex, moonDir) {
    this.uniforms = {
      uNoise: { value: noiseTex },
      uTime: { value: 0 },
      uDeep: { value: srgb(0x050a18) },
      uMoonDir: { value: moonDir },
      uMoonColor: { value: srgb(0xfff2d8) },
      uSpec: { value: 1.0 },
      uHorizon: { value: srgb(0x3a4a8a) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uNoise; uniform float uTime, uSpec;
        uniform vec3 uDeep, uMoonDir, uMoonColor, uHorizon;
        varying vec3 vWorld;
        ${GLSL_DITHER}
        void main(){
          vec2 p = vWorld.xz;
          float dist = length(vWorld - cameraPosition);
          vec2 n1 = texture2D(uNoise, p * 0.035 + vec2(uTime * 0.010, uTime * 0.006)).gb - 0.5;
          vec2 n2 = texture2D(uNoise, p * 0.12 + vec2(-uTime * 0.016, uTime * 0.011)).gb - 0.5;
          vec2 n3 = texture2D(uNoise, p * 0.5 + vec2(uTime * 0.03, -uTime * 0.02)).gb - 0.5;
          float fade = 1.0 / (1.0 + dist * 0.025);
          vec2 n = (n1 * 0.9 + n2 * 0.6 + n3 * 0.35 * fade) * (0.16 + 0.12 * fade);
          vec3 N = normalize(vec3(n.x, 1.0, n.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float ndv = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          float body = mix(0.72, 0.04, fres);
          vec3 R = reflect(-V, N);
          float md = max(dot(R, uMoonDir), 0.0);
          vec3 spec = uMoonColor * (pow(md, 2200.0) * 1.3 + pow(md, 220.0) * 0.1) * uSpec;
          vec3 col = uDeep * body + spec + uHorizon * 0.05 * fres;
          gl_FragColor = vec4(dither(col), body);
        }`,
    });
    this.mesh = new THREE.Mesh(lakeGeometry(), mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.renderOrder = -40;
    this.mesh.frustumCulled = false;
  }
  update(t) { this.uniforms.uTime.value = t; }
}
