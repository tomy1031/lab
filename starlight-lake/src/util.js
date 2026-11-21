import * as THREE from 'three';
import { DEG } from './config.js';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A color written straight to the framebuffer by our own shaders (they do their own
 * encoding). THREE.Color would convert sRGB hex to linear; these shaders want display values.
 */
export function srgb(hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/** Head-relative spherical placement: az > 0 is to the right, el > 0 is up, distance in metres. */
export function sph(az, el, d, out = new THREE.Vector3()) {
  const a = az * DEG, e = el * DEG;
  return out.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, -Math.cos(a) * Math.cos(e) * d);
}

/** Physical size (m) that subtends `deg` degrees at distance d. */
export const sizeForAngle = (deg, d) => 2 * d * Math.tan((deg * DEG) / 2);

/** Tileable value-noise texture, 3 independent fbm channels. Sampled by sky, water and aurora. */
export function makeNoiseTexture(size = 256, seed = 7) {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  const ch = [];
  for (let c = 0; c < 3; c++) {
    const out = new Float32Array(size * size);
    let amp = 1, total = 0;
    for (let oct = 0; oct < 5; oct++) {
      const cells = 4 << oct;
      const grid = new Float32Array(cells * cells);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells, fy = (y / size) * cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = smooth(fx - x0), ty = smooth(fy - y0);
          const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
          const v00 = grid[y0 * cells + x0], v10 = grid[y0 * cells + x1];
          const v01 = grid[y1 * cells + x0], v11 = grid[y1 * cells + x1];
          out[y * size + x] += amp * lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
        }
      }
      total += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    ch.push(out);
  }
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = ch[0][i] * 255;
    data[i * 4 + 1] = ch[1][i] * 255;
    data[i * 4 + 2] = ch[2][i] * 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// GLSL snippets shared by our shaders.
export const GLSL_DITHER = /* glsl */`
float ditherNoise(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 dither(vec3 c){ return c + (ditherNoise(gl_FragCoord.xy) - 0.5) / 255.0; }
`;
