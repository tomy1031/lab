// js/sky.js — the sky is painted once at start-up into an equirectangular texture (gradient, sun glow,
// a bank of cumulus along the horizon, thin cirrus higher up) and then drawn on a sphere that follows the
// head. Painting it once keeps the per-frame cost on Quest to one texture lookup per pixel.
// The same texture is also what the lake reflects.
import * as THREE from 'three';

const bakeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const bakeFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uSun;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  float az = (vUv.x - 0.5) * 6.2831853;
  float el = (vUv.y - 0.5) * 3.14159265;
  vec3 d = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  float h = max(d.y, 0.0);
  vec3 zenith = lin(vec3(0.20, 0.42, 0.80));
  vec3 mid = lin(vec3(0.45, 0.66, 0.90));
  vec3 horizon = lin(vec3(0.80, 0.87, 0.92));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.16, h));
  col = mix(col, zenith, smoothstep(0.14, 0.8, h));
  float sd = max(dot(d, uSun), 0.0);
  col += lin(vec3(1.0, 0.86, 0.62)) * (pow(sd, 5.0) * 0.28 + pow(sd, 48.0) * 0.6);
  col = mix(col, lin(vec3(0.96, 0.92, 0.84)), (1.0 - smoothstep(0.0, 0.07, h)) * 0.4);
  if (d.y < 0.0) col = mix(horizon, lin(vec3(0.64, 0.72, 0.70)), smoothstep(0.0, -0.25, d.y));
  if (d.y > -0.03) {
    vec2 cp = d.xz / (d.y + 0.11) * 1.5;
    float n = fbm(cp * 0.85 + vec2(3.0, 1.0));
    float band = smoothstep(-0.01, 0.06, d.y) * (1.0 - smoothstep(0.22, 0.55, d.y));
    float cov = smoothstep(0.5, 0.74, n) * band;
    float ci = fbm(vec2(cp.x * 0.45, cp.y * 2.2) * 0.55 + 7.0);
    float cir = smoothstep(0.56, 0.82, ci) * smoothstep(0.1, 0.35, d.y) * (1.0 - smoothstep(0.7, 1.0, d.y)) * 0.5;
    float shade = fbm(cp * 0.85 + vec2(3.0, 1.0) + uSun.xz * 0.35);
    vec3 lit = lin(vec3(1.0, 0.98, 0.95)) * (0.85 + 0.45 * pow(sd, 3.0));
    vec3 dark = lin(vec3(0.60, 0.66, 0.77));
    vec3 cc = mix(dark, lit, smoothstep(0.38, 0.72, n - (shade - n) * 1.6));
    col = mix(col, cc, cov * 0.95);
    col = mix(col, lit, cir);
  }
  col += vec3(1.0, 0.96, 0.88) * 6.0 * smoothstep(0.99935, 0.99965, sd);
  gl_FragColor = vec4(col, 1.0);
}`;

export function bakeSky(renderer, sunDir, width = 4096) {
  const rt = new THREE.WebGLRenderTarget(width, width / 2, {
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
  });
  const mat = new THREE.ShaderMaterial({ vertexShader: bakeVert, fragmentShader: bakeFrag, uniforms: { uSun: { value: sunDir.clone() } }, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const xr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  renderer.xr.enabled = xr;
  mat.dispose();
  quad.geometry.dispose();
  rt.texture.wrapS = THREE.RepeatWrapping;
  return rt;
}

// shared GLSL: direction -> uv of the baked sky
export const SKY_UV = /* glsl */ `
vec2 skyUv(vec3 d) { return vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5); }`;

export function skyDome(tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tSky: { value: tex } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSky;
      varying vec3 vDir;
      ${SKY_UV}
      void main() {
        gl_FragColor = texture2D(tSky, skyUv(normalize(vDir)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}
