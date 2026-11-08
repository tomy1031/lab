import * as THREE from 'three';
import { srgb } from './util.js';

// Visual stimuli. The Gabor shader works in linear luminance and encodes to sRGB itself, so
// Michelson contrast is what the staircase asks for (within display calibration). Temporal
// dithering lets 8-bit panels show contrasts below one grey level, and the grating fades out
// where it would alias instead of turning into moire.

const ENCODE = /* glsl */`
vec3 encodeSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export const MEAN_LUM = 0.3;   // linear luminance of the stimulus pedestal
const TINT = new THREE.Vector3(1.0, 0.975, 0.93);

const gaborVS = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const gaborFS = /* glsl */`
  uniform float uContrast, uCycles, uSigma, uOrient, uPhase, uMean, uOpacity, uDisc, uRim, uHover, uTime;
  uniform vec3 uTint, uRimColor;
  varying vec2 vUv;
  ${ENCODE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p);
    float s = sin(uOrient), c = cos(uOrient);
    float x = c * p.x + s * p.y;
    float ph = 6.2831853 * uCycles * x + uPhase;
    float aa = clamp(1.0 - (fwidth(ph) - 1.0) / 1.2, 0.0, 1.0);
    float env = exp(-(r * r) / (2.0 * uSigma * uSigma));
    float L = uMean * (1.0 + uContrast * aa * env * sin(ph));
    vec3 col = encodeSRGB(vec3(L) * uTint);
    col += (hash12(gl_FragCoord.xy + vec2(fract(uTime * 7.0) * 113.0, fract(uTime * 3.0) * 71.0)) - 0.5) / 255.0;
    float R = 0.5 * uDisc;
    float alpha = smoothstep(R, R - 0.03, r);
    float ring = exp(-pow((r - R) * 40.0, 2.0)) * 0.55 + exp(-pow((r - R) * 12.0, 2.0)) * 0.18;
    vec3 rim = uRimColor * uRim * ring * (1.0 + uHover * 1.6);
    gl_FragColor = vec4(col * alpha + rim, alpha) * uOpacity;
  }`;

/** A Gabor patch on a self-luminous pedestal ("light spirit"). Face it to the viewer each frame. */
export class GaborPatch {
  constructor({ rim = true } = {}) {
    this.uniforms = {
      uContrast: { value: 0.5 }, uCycles: { value: 4 }, uSigma: { value: 0.12 }, uOrient: { value: 0 }, uPhase: { value: 0 },
      uMean: { value: MEAN_LUM }, uOpacity: { value: 1 }, uDisc: { value: rim ? 0.82 : 1.0 }, uRim: { value: rim ? 1 : 0 },
      uHover: { value: 0 }, uTime: { value: 0 }, uTint: { value: TINT }, uRimColor: { value: srgb(0x9fd8ff) },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: gaborVS, fragmentShader: gaborFS,
      transparent: true, depthWrite: false, premultipliedAlpha: true,
    }));
    this.mesh.renderOrder = 20;
    this.discFrac = this.uniforms.uDisc.value;
  }
  /**
   * @param {object} g
   * @param {number} g.sf        spatial frequency, cycles/degree
   * @param {number} g.contrast  Michelson contrast 0..1
   * @param {number} g.ori       stripe orientation in degrees (0 = vertical stripes)
   * @param {number} g.sigmaDeg  Gaussian envelope sigma in degrees
   * @param {number} g.discDeg   pedestal diameter in degrees
   * @param {number} g.dist      viewing distance in metres (sets the physical size)
   */
  set(g) {
    const quadDeg = g.discDeg / this.discFrac;
    this.uniforms.uCycles.value = g.sf * quadDeg;
    this.uniforms.uSigma.value = g.sigmaDeg / quadDeg;
    this.uniforms.uContrast.value = g.contrast;
    this.uniforms.uOrient.value = THREE.MathUtils.degToRad(g.ori);
    this.uniforms.uPhase.value = g.phase ?? Math.random() * Math.PI * 2;
    const size = 2 * g.dist * Math.tan(THREE.MathUtils.degToRad(quadDeg) / 2);
    this.mesh.scale.set(size, size, 1);
    this.quadDeg = quadDeg;
    this.radiusM = size * this.discFrac * 0.5;
  }
  set opacity(v) { this.uniforms.uOpacity.value = v; }
  set hover(v) { this.uniforms.uHover.value = v; }
  set time(t) { this.uniforms.uTime.value = t; }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/**
 * Collinear flanker triplet (lateral masking, Polat & Sagi 1993; Polat et al. 2004): a faint
 * central Gabor between two high-contrast flankers, all computed in one shader so the three
 * envelopes add up exactly. Local frame: stripes run along y, the flankers sit on the y axis;
 * the mesh is rolled to set the orientation. All sizes are in degrees of visual angle.
 */
export class Triplet {
  constructor() {
    this.uniforms = {
      uW: { value: 3 }, uH: { value: 8 }, uSigma: { value: 0.5 }, uSF: { value: 3 }, uSep: { value: 1 },
      uCF: { value: 0.6 }, uCT: { value: 0 }, uMean: { value: MEAN_LUM }, uTint: { value: TINT }, uOpacity: { value: 1 },
      uShow: { value: 1 }, uTime: { value: 0 }, uRimColor: { value: srgb(0x9fd8ff) }, uRim: { value: 0.5 },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform float uW, uH, uSigma, uSF, uSep, uCF, uCT, uMean, uOpacity, uShow, uTime, uRim;
        uniform vec3 uTint, uRimColor; varying vec2 vUv;
        ${ENCODE}
        float gab(vec2 q, float yc){ vec2 d = vec2(q.x, q.y - yc); return exp(-dot(d, d) / (2.0 * uSigma * uSigma)); }
        void main(){
          vec2 q = (vUv - 0.5) * vec2(uW, uH);
          float ph = 6.2831853 * uSF * q.x;
          float aa = clamp(1.0 - (fwidth(ph) - 1.0) / 1.2, 0.0, 1.0);
          float carrier = cos(ph) * aa;
          float m = uCF * (gab(q, uSep) + gab(q, -uSep)) + uCT * gab(q, 0.0);
          float L = uMean * (1.0 + uShow * m * carrier);
          vec3 col = encodeSRGB(vec3(L) * uTint);
          col += (hash12(gl_FragCoord.xy + vec2(fract(uTime * 7.0) * 113.0, fract(uTime * 3.0) * 71.0)) - 0.5) / 255.0;
          float R = uW * 0.5;
          float d = length(vec2(q.x, max(abs(q.y) - (uH * 0.5 - R), 0.0))) - R * 0.94;
          float alpha = smoothstep(0.0, -0.06 * R, d);
          vec3 rim = uRimColor * uRim * exp(-pow(d / (0.05 * R), 2.0)) * 0.5;
          gl_FragColor = vec4(col * alpha + rim, alpha) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 18;
  }
  /** sf cpd, sigma deg, sep deg (centre-to-flanker), dist m. */
  set({ sf, sigma, sep, dist, cf = 0.6, ct = 0 }) {
    const W = sigma * 6, H = 2 * sep + sigma * 6;
    const u = this.uniforms;
    u.uW.value = W; u.uH.value = H; u.uSigma.value = sigma; u.uSF.value = sf; u.uSep.value = sep; u.uCF.value = cf; u.uCT.value = ct;
    const k = 2 * dist * Math.tan(THREE.MathUtils.degToRad(0.5));   // metres per degree at dist
    this.mesh.scale.set(W * k, H * k, 1);
    this.Hdeg = H; this.Wdeg = W;
  }
}

/** Lantern face with a Landolt C: the gap direction is the answer. */
export class LandoltLantern {
  constructor() {
    this.uniforms = {
      uGap: { value: 0 }, uInk: { value: 0.12 }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uFlashColor: { value: srgb(0x9fffd0) },
      uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uHover: { value: 0 }, uGold: { value: 0 },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform float uGap, uInk, uOpacity, uFlash, uTime, uSeed, uHover, uGold; uniform vec3 uFlashColor; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float px = fwidth(r);
          // paper face
          float faceR = 0.33;
          float face = smoothstep(faceR + px, faceR - px, r);
          float flick = 0.94 + 0.06 * sin(uTime * 9.0 + uSeed) * sin(uTime * 5.3 + uSeed * 2.0);
          vec3 paper = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.78, 0.52), smoothstep(0.0, faceR, r)) * flick;
          paper *= 0.94 + 0.06 * sin(atan(p.y, p.x) * 12.0);
          // Landolt C: outer diameter 5 units, stroke 1, gap 1
          float Ro = 0.2, g = Ro * 2.0 / 5.0, Ri = Ro - g;
          float ring = smoothstep(Ro + px, Ro - px, r) * smoothstep(Ri - px, Ri + px, r);
          float a = uGap * 1.5707963;
          vec2 d = vec2(cos(a), sin(a));
          float along = dot(p, d), across = dot(p, vec2(-d.y, d.x));
          float gap = smoothstep(g * 0.5 + px, g * 0.5 - px, abs(across)) * step(0.0, along);
          float ink = ring * (1.0 - gap);
          vec3 col = mix(paper, paper * uInk, ink);
          col = mix(col, uFlashColor, uFlash * 0.55);
          // halo
          float halo = exp(-pow(max(r - faceR, 0.0) * 9.0, 2.0)) * (1.0 - face);
          vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.42), uGold);
          float sparkle = uGold * pow(0.5 + 0.5 * sin(atan(p.y, p.x) * 8.0 + uTime * 3.0), 8.0) * exp(-pow((r - faceR * 1.25) * 30.0, 2.0));
          vec3 glow = warm * halo * (0.55 + 0.6 * uHover + 0.5 * uGold) + uFlashColor * halo * uFlash + vec3(1.0, 0.9, 0.6) * sparkle;
          gl_FragColor = vec4(col * face + glow, face) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 15;
  }
  /** Gap direction index: 0 right, 1 up, 2 left, 3 down. */
  set gap(i) { this.uniforms.uGap.value = i; }
}

/** Random-dot orb for stereo: no shading, no size cue, only binocular disparity tells depth. */
export class DotOrb {
  constructor(seed) {
    this.uniforms = { uSeed: { value: seed }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uHover: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform float uSeed, uOpacity, uFlash, uHover; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.0) * 43758.5453); }
        void main(){
          vec2 p = vUv - 0.5; float r = length(p); float px = fwidth(r);
          float disc = smoothstep(0.42 + px, 0.42 - px, r);
          vec2 cell = floor(vUv * 18.0);
          float v = step(0.5, h(cell));
          vec3 a = vec3(0.95, 0.88, 1.0), b = vec3(0.32, 0.36, 0.62);
          vec3 col = mix(b, a, v);
          col = mix(col, vec3(0.7, 1.0, 0.85), uFlash * 0.6);
          float halo = exp(-pow(max(r - 0.42, 0.0) * 14.0, 2.0)) * (1.0 - disc) * (0.25 + uHover * 0.5);
          gl_FragColor = vec4(col * disc + vec3(0.6, 0.7, 1.0) * halo, disc) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 16;
  }
}

/** Soft additive glow sprite (breathing orb, beacons, comets, fixation star). */
export class Glow {
  constructor(color = 0xbfe6ff, { core = 9, halo = 0.35, star = 0 } = {}) {
    this.uniforms = { uColor: { value: srgb(color) }, uOpacity: { value: 1 }, uCore: { value: core }, uHalo: { value: halo }, uStar: { value: star } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity, uCore, uHalo, uStar; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
          float v = exp(-r * r * uCore) + uHalo * exp(-r * r * 2.5);
          float spikes = uStar * (exp(-abs(p.x) * 40.0) + exp(-abs(p.y) * 40.0)) * exp(-r * 2.2);
          gl_FragColor = vec4(uColor * (v + spikes) * uOpacity, 1.0);
        }`,
    }));
    this.mesh.renderOrder = 25;
  }
  set opacity(v) { this.uniforms.uOpacity.value = v; }
}

/**
 * Decoration around a Gabor "wisp": a corona, six slowly turning petals of light and three
 * orbiting sparks. It is drawn only outside the stimulus disc (and the disc, drawn after it,
 * is opaque), so it never changes the grating's contrast. Targets and blanks get the same
 * halo, so it carries no hint about which is which.
 */
export class WispHalo {
  constructor(golden = false) {
    this.uniforms = {
      uTime: { value: 0 }, uA: { value: 0 }, uSeed: { value: Math.random() * 6.28 }, uInner: { value: 0.5 / 2.4 },
      uColor: { value: golden ? srgb(0xffd27a) : srgb(0x9fd8ff) }, uColor2: { value: golden ? srgb(0xffa860) : srgb(0xc6a8ff) },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform float uTime, uA, uSeed, uInner; uniform vec3 uColor, uColor2; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
          float rin = uInner;
          float corona = exp(-pow((r - rin) / (rin * 0.16), 2.0)) * 0.55 + exp(-pow((r - rin) / (rin * 0.55), 2.0)) * 0.22;
          float pet = pow(0.5 + 0.5 * cos(6.0 * a + uTime * 0.7 + uSeed), 5.0) * exp(-pow((r - rin * 1.55) / (rin * 0.4), 2.0));
          float sp = 0.0;
          for (int k = 0; k < 3; k++) {
            float ang = uTime * 1.5 + float(k) * 2.0944 + uSeed;
            vec2 c = vec2(cos(ang), sin(ang)) * rin * 1.32;
            vec2 d = p - c;
            sp += exp(-dot(d, d) / (rin * rin * 0.008));
          }
          float outside = smoothstep(rin * 1.0, rin * 1.06, r) * smoothstep(0.5, 0.4, r);
          vec3 col = mix(uColor, uColor2, 0.5 + 0.5 * sin(a * 3.0 + uTime * 0.5 + uSeed));
          gl_FragColor = vec4(col * (corona + pet * 0.6 + sp) * outside * uA, 1.0);
        }`,
    }));
    this.mesh.renderOrder = 19;
  }
  /** discRadiusM: physical radius of the stimulus disc. */
  fit(discRadiusM) { this.mesh.scale.setScalar(discRadiusM * 2 * 2.4); }
}

/** Ornamented ring for the Star Gates: turning rune dashes around a fine double circle. */
export class RuneRing {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uA: { value: 0.3 }, uColor: { value: new THREE.Vector3(0.62, 0.85, 1.0) } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: gaborVS,
      fragmentShader: /* glsl */`
        uniform float uTime, uA; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.6; float r = length(p); float a = atan(p.y, p.x);
          float ring = exp(-pow((r - 1.0) / 0.012, 2.0)) + exp(-pow((r - 1.1) / 0.008, 2.0)) * 0.6;
          float dash = step(0.62, fract((a + uTime * 0.12) * 24.0 / 6.2831853)) * exp(-pow((r - 1.05) / 0.018, 2.0));
          float mark = step(0.93, fract((a - uTime * 0.07) * 6.0 / 6.2831853)) * exp(-pow((r - 1.17) / 0.03, 2.0));
          float glow = exp(-pow((r - 1.0) / 0.08, 2.0)) * 0.22;
          gl_FragColor = vec4(uColor * (ring + dash * 0.7 + mark * 0.8 + glow) * uA, 1.0);
        }`,
    }));
    this.mesh.renderOrder = 17;
  }
}
