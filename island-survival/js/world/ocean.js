// world/ocean.js — the sea (a camera-following wave plane with depth tint and shore foam taken from the
// terrain height texture), and the material for fresh water (stream / pond) sharing the same uniforms.
import * as THREE from 'three';
import { WORLD } from './terrain.js';

const common = /* glsl */`
uniform float uTime;
uniform sampler2D uHeight;
uniform float uWorldSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uWave;     // wave height scale (wind)
uniform float uRain;     // 0…1 rain ripples
uniform float uNight;    // 0 day … 1 night
uniform float uFresh;    // 0 sea, 1 fresh water
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float groundAt(vec2 xz){ vec2 uv = xz / uWorldSize + 0.5; return texture2D(uHeight, uv).r; }
`;

const vert = /* glsl */`
${common}
varying vec3 vW;
varying vec2 vUv;
#include <fog_pars_vertex>
// a few directional sine waves; returns height and accumulates slope
float waves(vec2 p, out vec2 slope){
  float h = 0.0; slope = vec2(0.0);
  vec4 dirs[4];
  dirs[0] = vec4(normalize(vec2(1.0, 0.35)), 0.045, 1.0);
  dirs[1] = vec4(normalize(vec2(-0.4, 1.0)), 0.07, 1.3);
  dirs[2] = vec4(normalize(vec2(0.8, -0.7)), 0.12, 1.9);
  dirs[3] = vec4(normalize(vec2(-1.0, -0.2)), 0.21, 2.6);
  float amp[4]; amp[0] = 0.32; amp[1] = 0.2; amp[2] = 0.09; amp[3] = 0.045;
  for (int i = 0; i < 4; i++) {
    float k = dirs[i].z; float w = dirs[i].w;
    float ph = dot(dirs[i].xy, p) * k + uTime * w;
    h += amp[i] * sin(ph);
    slope += amp[i] * k * cos(ph) * dirs[i].xy;
  }
  return h;
}
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 sl;
  float depth = wp.y - groundAt(wp.xz);
  // waves calm down in very shallow water and on fresh water
  float k = uWave * (1.0 - uFresh) * smoothstep(0.0, 3.0, depth);
  wp.y += waves(wp.xz, sl) * k;
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const frag = /* glsl */`
${common}
uniform float uLevel;    // water surface height (sea: tide; fresh: set per mesh through vW.y)
varying vec3 vW;
varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec2 p = vW.xz;
  float ground = groundAt(p);
  float depth = max(0.0, vW.y - ground);
  // normal: analytic-ish wave normal + small moving detail
  vec2 flow = uFresh > 0.5 ? vec2(0.0, uTime * 0.6) : vec2(uTime * 0.05, uTime * 0.03);
  vec2 q = (uFresh > 0.5 ? vUv * vec2(3.0, 1.0) : p * 0.35) + flow;
  float n1 = vnoise(q * 2.0), n2 = vnoise(q * 5.3 - flow * 1.7), n3 = vnoise(p * 7.0 + uTime * 2.0);
  vec3 N = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.35 - (n1 - 0.5) * 0.2));
  // rain ripples: dots of expanding rings
  if (uRain > 0.01) {
    vec2 cell = floor(p * 1.5); vec2 f = fract(p * 1.5) - 0.5;
    float t = fract(uTime * 0.9 + hash12(cell));
    float r = length(f + (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5);
    float ring = smoothstep(0.05, 0.0, abs(r - t * 0.45)) * (1.0 - t);
    N.xz += (f / max(r, 0.01)) * ring * 0.6 * uRain;
    N = normalize(N);
  }
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.85 + 0.05;
  vec3 deep = uFresh > 0.5 ? vec3(0.06, 0.16, 0.12) : uDeep;
  vec3 shallow = uFresh > 0.5 ? vec3(0.22, 0.36, 0.28) : uShallow;
  float dk = smoothstep(0.0, uFresh > 0.5 ? 2.0 : 7.0, depth);
  vec3 water = mix(shallow, deep, dk);
  // sky reflection
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uSky, clamp(R.y * 1.6, 0.0, 1.0));
  vec3 col = mix(water, sky, fres);
  // sun glint
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 3.0 + pow(max(dot(N, H), 0.0), 30.0) * 0.12;
  col += uSunColor * spec * (1.0 - uNight * 0.85) * step(0.0, uSunDir.y + 0.05);
  // shore foam on the sea
  if (uFresh < 0.5) {
    float edge = 1.0 - smoothstep(0.0, 0.9, depth);
    float swash = 0.5 + 0.5 * sin(uTime * 1.4 + p.x * 0.07 + p.y * 0.05);
    float foam = edge * smoothstep(0.35, 0.75, n3 * 0.7 + n1 * 0.6 * swash);
    foam += (1.0 - smoothstep(0.0, 0.25, depth)) * 0.6;
    col = mix(col, vec3(0.95, 0.97, 0.98) * (1.0 - uNight * 0.7), clamp(foam, 0.0, 1.0) * 0.85);
  }
  // night: darker
  col *= mix(1.0, 0.28, uNight);
  // transparency at the shore so the sand shows through
  float a = uFresh > 0.5 ? mix(0.55, 0.92, dk) : mix(0.35, 0.96, smoothstep(0.0, 2.5, depth));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Ocean {
  constructor(terrain) {
    this.terrain = terrain;
    const heightTex = terrain.heightTexture();
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uHeight: { value: null }, uWorldSize: { value: WORLD.size },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() }, uSunColor: { value: new THREE.Color('#fff3d6') },
      uSky: { value: new THREE.Color('#5aa7e0') }, uHorizon: { value: new THREE.Color('#bfe3f2') },
      uDeep: { value: new THREE.Color('#0b4f6c') }, uShallow: { value: new THREE.Color('#3fc6c0') },
      uWave: { value: 1 }, uRain: { value: 0 }, uNight: { value: 0 }, uFresh: { value: 0 }, uLevel: { value: 0 },
    }]);
    this.uniforms.uHeight.value = heightTex;
    const make = (fresh) => {
      const u = { ...this.uniforms, uFresh: { value: fresh ? 1 : 0 } };
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, fog: true, depthWrite: !!fresh, side: fresh ? THREE.DoubleSide : THREE.FrontSide });
      return m;
    };
    this.material = make(false);
    this.freshMaterial = make(true);
    const geo = new THREE.PlaneGeometry(1400, 1400, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'ocean';
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.fresh = terrain.buildFreshWater(this.freshMaterial);
    this.fresh.renderOrder = 1;
  }

  addTo(scene) { scene.add(this.mesh); scene.add(this.fresh); }

  /** env: { time (s), tide (m), sunDir, sunColor, sky, horizon, wave, rain, night } */
  update(env, camera) {
    const u = this.uniforms;
    u.uTime.value = env.time;
    u.uWave.value = env.wave ?? 1;
    u.uRain.value = env.rain ?? 0;
    u.uNight.value = env.night ?? 0;
    if (env.sunDir) u.uSunDir.value.copy(env.sunDir);
    if (env.sunColor) u.uSunColor.value.copy(env.sunColor);
    if (env.sky) u.uSky.value.copy(env.sky);
    if (env.horizon) u.uHorizon.value.copy(env.horizon);
    // the plane follows the camera in whole grid steps so waves do not swim
    const step = 1400 / 220;
    this.mesh.position.set(Math.round(camera.position.x / step) * step, env.tide ?? 0, Math.round(camera.position.z / step) * step);
  }
}
