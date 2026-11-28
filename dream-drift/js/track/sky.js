// track/sky.js — gradient sky dome with sun glow, twinkling stars, a nebula and an aurora, all in one shader
import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */`
uniform vec3 topColor, horizonColor, bottomColor, sunColor, nebA, nebB, auroraColor;
uniform vec3 sunDir;
uniform float sunSize, sunGlow, starAmt, nebulaAmt, auroraAmt, time, horizonSharp;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), horizonSharp))
                     : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.45));
  // nebula
  if (nebulaAmt > 0.0) {
    float n = fbm(d * 2.2 + vec3(0.0, time * 0.003, 0.0));
    float m = fbm(d * 4.5 + vec3(5.2, 1.3, 2.7));
    vec3 neb = mix(nebA, nebB, smoothstep(0.3, 0.75, m));
    col += neb * smoothstep(0.42, 0.85, n) * nebulaAmt * (0.6 + 0.4 * m);
  }
  // aurora: wavy curtains above the horizon
  if (auroraAmt > 0.0 && h > 0.0) {
    float ang = atan(d.z, d.x);
    float wave = sin(ang * 3.0 + time * 0.15 + sin(ang * 7.0 + time * 0.3) * 0.6);
    float band = smoothstep(0.0, 0.25, h) * smoothstep(0.65, 0.25, h);
    float curtain = pow(0.5 + 0.5 * wave, 3.0) * (0.5 + 0.5 * noise(vec3(ang * 12.0, h * 3.0, time * 0.2)));
    col += auroraColor * band * curtain * auroraAmt;
  }
  // stars
  if (starAmt > 0.0) {
    vec3 p = d * 260.0;
    vec3 c = floor(p);
    float r = hash(c);
    if (r > 0.985) {
      vec3 f = fract(p) - 0.5;
      float s = smoothstep(0.32, 0.0, length(f)) * (0.55 + 0.45 * sin(time * (1.5 + r * 3.0) + r * 60.0));
      col += mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.85, 0.7), fract(r * 37.0)) * s * starAmt * smoothstep(-0.1, 0.15, h);
    }
  }
  // sun / moon
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, sd) * 2.2 + pow(sd, 10.0) * sunGlow);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSky(theme) {
  const s = theme.sky;
  const uniforms = {
    topColor: { value: new THREE.Color(s.top) },
    horizonColor: { value: new THREE.Color(s.horizon) },
    bottomColor: { value: new THREE.Color(s.bottom ?? s.horizon) },
    sunColor: { value: new THREE.Color(s.sunColor ?? '#fff6d0') },
    sunDir: { value: new THREE.Vector3(...(s.sunDir ?? [0.4, 0.5, -0.6])).normalize() },
    sunSize: { value: s.sunSize ?? 0.0025 },
    sunGlow: { value: s.sunGlow ?? 0.5 },
    starAmt: { value: s.stars ?? 0 },
    nebulaAmt: { value: s.nebula ?? 0 },
    nebA: { value: new THREE.Color(s.nebA ?? '#7a3cff') },
    nebB: { value: new THREE.Color(s.nebB ?? '#ff4fa8') },
    auroraAmt: { value: s.aurora ?? 0 },
    auroraColor: { value: new THREE.Color(s.auroraColor ?? '#3dffb0') },
    horizonSharp: { value: s.horizonSharp ?? 0.6 },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  mesh.userData.update = (dt, t) => { uniforms.time.value = t; };
  return mesh;
}
